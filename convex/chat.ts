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

function system(f: {
  place: string;
  country: string;
  score: number | null;
  caption: string;
  tags: string[];
  ageText: string;
  localTime: string;
  headline?: string | null;
}): string {
  return (
    "You are the director of Meanwhile, a live channel whose only programming is the planet. " +
    "You are answering a viewer's question about the frame that is on air right now, which is " +
    "attached. Answer in one to three sentences, plainly, in the present tense. Never invent a " +
    "detail you cannot see in the frame or read in the facts below. If the frame cannot answer " +
    "the question, say so in one sentence and say what it does show.\n\n" +
    "Facts about this frame:\n" +
    `- Place: ${f.place}, ${f.country}\n` +
    `- Local time there: ${f.localTime}\n` +
    `- Age of the frame: ${f.ageText}\n` +
    `- The director scored it ${f.score == null ? "not yet scored" : `${f.score.toFixed(1)} out of 10`}\n` +
    `- Its own caption: ${f.caption}\n` +
    `- Tags: ${f.tags.join(", ") || "none"}\n` +
    (f.headline ? `- Today's local headline: ${f.headline}\n` : "") +
    "\nNever claim the frame is live if its age says otherwise, and never state an age that is " +
    "not given above."
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

/** The frame on air, with the bytes, for a question to be asked about. */
export const onAirFrame = internalQuery({
  args: {},
  handler: async (ctx) => {
    const cut = (await ctx.db.query("cut").order("desc").take(1))[0];
    if (!cut) return null;
    const snap = await ctx.db.get(cut.snapshotId);
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
    };
  },
});

export const ask = action({
  args: {
    question: v.string(),
    // BYOK, exactly as the scoring path takes it: the caller's key is used for their request
    // and dropped, and it never falls through to ours.
    provider: v.optional(v.string()),
    apiKey: v.optional(v.string()),
    model: v.optional(v.string()),
  },
  handler: async (
    ctx,
    { question, provider, apiKey, model },
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

    const frame = await ctx.runQuery(internal.chat.onAirFrame, {});
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

    const said = await visionComplete({
      label: `chat ${frame.place}`,
      system: system({
        place: frame.place,
        country: frame.country,
        score: frame.score,
        caption: frame.caption,
        tags: frame.tags,
        ageText,
        localTime: localTimeFor(frame.tz),
        headline: frame.headline,
      }),
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
