import { action, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { takeLimit } from "./limits";
import { localTimeFor } from "./lib";
import { toDataUri, describe } from "./providers";
import { visionComplete, type ModelStateStore, type ModelMark } from "./vision";
import type { ActionCtx } from "./_generated/server";

// "Ask about what's on air" — an actual model, looking at the actual frame.
//
// This was local pattern-matching over the feed until 2026-09-20: a regex behind a label that
// said "ask about what's on air", which is a claim the product could not keep. It now goes
// through the same provider layer as the director's own scoring — same failover chain, same
// BYOK path — and the model is shown the frame itself, not a description of it, so "what am I
// looking at?" is answered from the picture rather than from its caption.
//
// PUBLIC and unauthenticated, so it sits behind the same kind of ceiling as the country click.
const BURST_LIMIT = 20;
const BURST_WINDOW_MS = 10 * 60 * 1000;
const DAILY_LIMIT = 300;
const DAILY_WINDOW_MS = 24 * 60 * 60 * 1000;

/** COPY §6. The steps are named before the work starts and reported as the work happens, so
 *  the line on screen is a description of something that actually took place. */
const STEPS = ["Reading the frame…", "Locating the camera…", "Working out the sun angle there…", "Writing…"] as const;

function system(
  f: {
    place: string;
    country: string;
    score: number | null;
    caption: string;
    tags: string[];
    ageText: string;
    localTime: string;
    headline?: string | null;
    onAir: boolean;
  },
  elsewhere: ChannelRow[],
): string {
  return (
    "You are the director of Meanwhile, a live channel whose only programming is the planet. " +
    `The attached frame is ${f.place}${f.onAir ? ", which is on air right now" : ", which the viewer is looking at (it is not the frame currently on air)"}. ` +
    "Answer the viewer's question in one to three sentences, plainly, in the present tense. Never " +
    "invent a detail you cannot see in the frame or read in the facts below. If neither the frame " +
    "nor the facts can answer the question, say so in one sentence and say what you do know.\n\n" +
    "Facts about the attached frame:\n" +
    `- Place: ${f.place}, ${f.country}\n` +
    `- Local time there: ${f.localTime}\n` +
    `- Age of the frame: ${f.ageText}\n` +
    `- The director scored it ${f.score == null ? "not yet scored" : `${f.score.toFixed(1)} out of 10`}\n` +
    `- Its own caption: ${f.caption}\n` +
    `- Tags: ${f.tags.join(", ") || "none"}\n` +
    (f.headline ? `- Today's local headline: ${f.headline}\n` : "") +
    // The running order is the difference between "answer about this picture" and "answer about
    // the channel". Without it the model could not say where the sun is, what else is running, or
    // why this frame beat the others — all of which a viewer asks within about thirty seconds.
    (elsewhere.length
      ? "\nEverywhere else the channel is watching right now (you cannot see these frames, only " +
        "these facts — describe them from the facts and never from imagination):\n" +
        elsewhere.map((r) => `- ${r.line}\n`).join("")
      : "") +
    "\nNever claim a frame is live if its age says otherwise, and never state an age or a score " +
    "that is not given above. When you name a place, write it exactly as it is spelled above."
  );
}

function modelState(ctx: ActionCtx): ModelStateStore {
  return {
    blocked: async (prov, keyTag): Promise<ModelMark[]> => await ctx.runQuery(internal.modelState.blocked, { provider: prov, keyTag }),
    mark: async (prov, keyTag, m): Promise<void> => {
      await ctx.runMutation(internal.modelState.mark, { provider: prov, keyTag, ...m });
    },
  };
}

export type ChannelRow = { snapshotId: string; line: string };

/** The subject when the viewer pulled a country up off the globe.
 *
 *  A country story is a `stories` row, not a frame from the camera pool, so it cannot be passed
 *  as a snapshot id — which is why this used to fall back to the cut and answer confidently
 *  about somewhere else entirely. Click China, ask "where is the sun", get told about Reykjavík.
 *  A story carries its own frame bytes, place, age and caption, so it can be the subject on
 *  exactly the same terms as a pool frame. The only thing it has no camera record for is the
 *  timezone, derived here from longitude the same way the country click itself derives it. */
export const storyFor = internalQuery({
  args: { storyId: v.id("stories") },
  handler: async (ctx, { storyId }) => {
    const story = await ctx.db.get(storyId);
    if (!story?.storageId) return null;
    return {
      storageId: story.storageId,
      place: story.place,
      country: story.country,
      tz: Math.round(story.lng / 15),
      score: story.score ?? null,
      caption: story.caption,
      tags: story.tags,
      capturedAt: story.capturedAt ?? null,
      headline: story.headline ?? null,
      // A country click is never the cut: the director only ever airs the camera pool.
      onAir: false,
    };
  },
});

/** The frame a question is about, with the bytes.
 *
 *  `snapshotId` is what the viewer is actually looking at — the story they opened, which is not
 *  always the cut. Asking "what is the weather here?" while reading about Kyoto and being
 *  answered about Tromsø is not a quirk, it is a wrong answer, and it was the behaviour until
 *  this argument existed. With no id, the cut is the subject, which is the right default for the
 *  bar's own "Ask about this". */
export const frameFor = internalQuery({
  args: { snapshotId: v.optional(v.id("snapshots")) },
  handler: async (ctx, { snapshotId }) => {
    const cut = (await ctx.db.query("cut").order("desc").take(1))[0];
    const id = snapshotId ?? cut?.snapshotId;
    if (!id) return null;
    const snap = await ctx.db.get(id);
    if (!snap?.storageId) return null;
    const cam = await ctx.db.get(snap.cameraId);
    if (!cam) return null;
    return {
      storageId: snap.storageId,
      place: cam.name,
      country: cam.country,
      tz: cam.tz,
      score: snap.score,
      caption: snap.caption,
      tags: snap.tags,
      capturedAt: snap.capturedAt ?? null,
      headline: snap.headline ?? null,
      onAir: cut?.snapshotId === snap._id,
    };
  },
});

/** Every other place the channel is watching, one line each. Facts only — no frame bytes, since
 *  a dozen images would cost more than the answer is worth and most providers would refuse it. */
export const channelNow = internalQuery({
  args: { exceptSnapshotId: v.optional(v.id("snapshots")) },
  handler: async (ctx, { exceptSnapshotId }): Promise<ChannelRow[]> => {
    const cams = await ctx.db
      .query("cameras")
      .withIndex("by_active", (q) => q.eq("active", true))
      .collect();
    const cut = (await ctx.db.query("cut").order("desc").take(1))[0];
    const out: ChannelRow[] = [];
    for (const cam of cams) {
      const snap = (
        await ctx.db
          .query("snapshots")
          .withIndex("by_camera", (q) => q.eq("cameraId", cam._id))
          .order("desc")
          .take(1)
      )[0];
      if (!snap || snap._id === exceptSnapshotId) continue;
      const headline = (await ctx.db.query("headlines").withIndex("by_place", (q) => q.eq("place", cam.name)).first())?.title;
      const ageMs = snap.capturedAt == null ? null : Date.now() - snap.capturedAt;
      out.push({
        snapshotId: snap._id,
        line: [
          `${cam.name}, ${cam.country}`,
          `local time ${localTimeFor(cam.tz)}`,
          snap.score == null ? "not yet scored" : `scored ${snap.score.toFixed(1)}`,
          ageMs == null ? "age not verifiable" : `frame ${Math.max(1, Math.round(ageMs / 60000))} min old`,
          cut?.snapshotId === snap._id ? "ON AIR" : null,
          snap.caption ? `shows: ${snap.caption}` : null,
          headline ? `today's headline: ${headline}` : null,
        ]
          .filter(Boolean)
          .join(" · "),
      });
    }
    // Best first, so a truncated list still carries the frames the director likes.
    return out.sort((a, b) => a.line.localeCompare(b.line)).slice(0, 14);
  },
});

export const ask = action({
  args: {
    question: v.string(),
    /** The frame the viewer has open. Omitted means the cut. */
    snapshotId: v.optional(v.id("snapshots")),
    /** A country the viewer pulled up off the globe. Wins over snapshotId when both are sent. */
    storyId: v.optional(v.id("stories")),
    // BYOK, exactly as the scoring path takes it: the caller's key is used for their request
    // and dropped, and it never falls through to ours.
    provider: v.optional(v.string()),
    apiKey: v.optional(v.string()),
    model: v.optional(v.string()),
  },
  handler: async (
    ctx,
    { question, snapshotId, storyId, provider, apiKey, model },
  ): Promise<{ text: string; steps: string[]; servedBy: string | null; place: string | null; error?: string }> => {
    const q = question.trim().slice(0, 500);
    if (!q) return { text: "", steps: [], servedBy: null, place: null, error: "empty" };

    // A caller spending their own key is not spending ours, so it is not rate limited here.
    if (!apiKey) {
      const burst = await ctx.runMutation(internal.limits.take, { key: "chat:burst", limit: BURST_LIMIT, windowMs: BURST_WINDOW_MS });
      const daily = burst.ok ? await ctx.runMutation(internal.limits.take, { key: "chat:daily", limit: DAILY_LIMIT, windowMs: DAILY_WINDOW_MS }) : { ok: false };
      if (!burst.ok || !daily.ok) {
        return {
          text: "The chat is busy right now — ask again in a minute.",
          steps: [],
          servedBy: null,
          place: null,
          error: "rate-limited",
        };
      }
    }

    const frame = storyId
      ? await ctx.runQuery(internal.chat.storyFor, { storyId })
      : await ctx.runQuery(internal.chat.frameFor, snapshotId ? { snapshotId } : {});
    if (!frame) {
      return { text: "Nothing on air yet.", steps: [STEPS[0]], servedBy: null, place: null, error: "nothing-on-air" };
    }

    const blob = await ctx.storage.get(frame.storageId);
    if (!blob) {
      return { text: "Nothing on air yet.", steps: [STEPS[0]], servedBy: null, place: null, error: "no-frame" };
    }
    const bytes = await blob.arrayBuffer();

    const ageMs = frame.capturedAt == null ? null : Date.now() - frame.capturedAt;
    const ageText =
      ageMs == null
        ? "not verifiable — the source sent no timestamp"
        : ageMs < 60 * 60 * 1000
          ? `${Math.max(1, Math.round(ageMs / 60000))} minutes old, verified from the source`
          : `${Math.round(ageMs / 3600000)} hours old`;

    const elsewhere = await ctx.runQuery(
      internal.chat.channelNow,
      !storyId && snapshotId ? { exceptSnapshotId: snapshotId } : {},
    );

    const said = await visionComplete({
      label: `chat ${frame.place}`,
      system: system(
        {
          place: frame.place,
          country: frame.country,
          score: frame.score,
          caption: frame.caption,
          tags: frame.tags,
          ageText,
          localTime: localTimeFor(frame.tz),
          headline: frame.headline,
          onAir: frame.onAir,
        },
        elsewhere,
      ),
      text: q,
      dataUri: toDataUri(bytes, blob.type || "image/jpeg"),
      maxTokens: 800,
      override: { provider, apiKey, model },
      state: apiKey ? undefined : modelState(ctx),
    });

    if (!said) {
      // COPY §8: the chat lost its line to the director. The question stays in the box.
      return { text: "The chat lost its line to the director.", steps: STEPS.slice(0, 3), servedBy: null, place: frame.place, error: "no-model" };
    }

    return {
      text: said.text.trim(),
      steps: [...STEPS],
      servedBy: describe(said.provider, said.model),
      place: frame.place,
    };
  },
});
