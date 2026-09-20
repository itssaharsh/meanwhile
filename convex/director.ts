import { mutation, query } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { v } from "convex/values";
import { rankFeed } from "./rank.js";
import { takeLimit } from "./limits";
import { CHAIR_HOLD_MS, handBack } from "./cut";
import { trimHeadline } from "./text.js";

// The frontend subscribes to these two. Because they're reactive Convex queries,
// every open browser repaints the instant a new snapshot is scored — zero polling.

async function hydrate(ctx: QueryCtx, snap: Doc<"snapshots">) {
  const camera = await ctx.db.get(snap.cameraId);
  // The stored copy is the stable one; imageUrl is the (often expiring) source URL.
  const url = snap.storageId ? await ctx.storage.getUrl(snap.storageId) : (snap.imageUrl ?? null);
  return { ...snap, camera, url };
}

// The current "now showing" cut.
export const getCut = query({
  args: {},
  handler: async (ctx) => {
    const cut = (await ctx.db.query("cut").order("desc").take(1))[0];
    if (!cut) return null;
    const snap = await ctx.db.get(cut.snapshotId);
    if (!snap) return null;
    return await hydrate(ctx, snap);
  },
});

// The ranked feed: latest snapshot per active camera, sorted by score.
export const getFeed = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => {
    const cams = await ctx.db
      .query("cameras")
      .withIndex("by_active", (q) => q.eq("active", true))
      .collect();

    const latest: Doc<"snapshots">[] = [];
    for (const cam of cams) {
      const snap = (
        await ctx.db
          .query("snapshots")
          .withIndex("by_camera", (q) => q.eq("cameraId", cam._id))
          .order("desc")
          .take(1)
      )[0];
      if (snap) latest.push(snap);
    }

    // Same ordering rule the smoke test checks.
    const ranked = rankFeed(latest, limit ?? 12);
    return await Promise.all(ranked.map((snap: Doc<"snapshots">) => hydrate(ctx, snap)));
  },
});

// ---------------------------------------------------------------------------
// The director's chair
// ---------------------------------------------------------------------------
// Meanwhile's premise is that you watch rather than query, and that holds: the channel runs
// itself, and left alone it always will. But a viewer who wants to see somewhere else should
// not have to wait twenty minutes for the director to agree, so they can take the chair for
// five minutes. The cut records who chose it, the bar says so, and the director takes over
// again on its own.

/** Put a frame on air by hand. Public, so it carries a ceiling like every other public write. */
export const takeChair = mutation({
  args: { snapshotId: v.id("snapshots") },
  handler: async (ctx, { snapshotId }): Promise<{ ok: boolean; error?: string }> => {
    const gate = await takeLimit(ctx, "takeChair", 30, 10 * 60 * 1000);
    if (!gate.ok) return { ok: false, error: "too many changes right now — try again shortly" };

    const snap = await ctx.db.get(snapshotId);
    if (!snap) return { ok: false, error: "that frame is gone" };

    const current = (await ctx.db.query("cut").order("desc").take(1))[0];
    if (current?.snapshotId === snapshotId && current.by === "viewer") return { ok: true };

    await ctx.db.insert("cut", { snapshotId, cameraId: snap.cameraId, by: "viewer", at: Date.now() });
    return { ok: true };
  },
});

/** Hand it back. The director re-picks immediately rather than waiting for the next refresh. */
export const releaseChair = mutation({
  args: {},
  handler: async (ctx): Promise<{ ok: boolean }> => {
    const current = (await ctx.db.query("cut").order("desc").take(1))[0];
    if (!current || current.by !== "viewer") return { ok: true };
    // A director cut written now ends the hold, and the director chooses what goes on air.
    await handBack(ctx);
    return { ok: true };
  },
});

/** Who is choosing, and until when — so the bar can say it. */
export const chair = query({
  args: {},
  handler: async (ctx): Promise<{ by: "director" | "viewer"; until: number | null }> => {
    const latest = (await ctx.db.query("cut").order("desc").take(1))[0];
    const held = Boolean(latest && latest.by === "viewer" && Date.now() - latest.at < CHAIR_HOLD_MS);
    return { by: held ? "viewer" : "director", until: held ? latest!.at + CHAIR_HOLD_MS : null };
  },
});

/** Today's headlines for the places the channel is watching.
 *
 *  Read from the `headlines` cache rather than from snapshots: a snapshot only ever carries a
 *  headline if it happened to be the frame the director cut to, so reading those gave a news
 *  tab with one item in it. The cache is keyed by place and is filled by the cut, by country
 *  clicks, and by `news:fillForChannel` when someone actually opens this tab. */
export const getNews = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => {
    const out: {
      key: string;
      place: string;
      country: string;
      headline: string;
      headlineUrl: string | null;
      at: number;
      snapshotId: string | null;
      onAir: boolean;
    }[] = [];

    const cut = (await ctx.db.query("cut").order("desc").take(1))[0];

    const cams = await ctx.db
      .query("cameras")
      .withIndex("by_active", (q) => q.eq("active", true))
      .collect();
    for (const cam of cams) {
      const row = await ctx.db
        .query("headlines")
        .withIndex("by_place", (q) => q.eq("place", cam.name))
        .first();
      if (!row?.title) continue; // an empty title is a remembered miss, not a headline
      // Stored titles go back through the trimmer on the way out, so rows cached before a
      // trimming rule existed get the benefit of it without a re-search.
      const title = trimHeadline(row.title);
      if (!title) continue;
      const snap = (
        await ctx.db
          .query("snapshots")
          .withIndex("by_camera", (q) => q.eq("cameraId", cam._id))
          .order("desc")
          .take(1)
      )[0];
      out.push({
        key: `cam:${cam._id}`,
        place: cam.name,
        country: cam.country,
        headline: title,
        headlineUrl: row.url ?? null,
        at: row.at,
        snapshotId: snap?._id ?? null,
        onAir: Boolean(snap && cut && cut.snapshotId === snap._id),
      });
    }

    // Countries someone pulled up recently carry their own headline.
    const since = Date.now() - 6 * 60 * 60 * 1000;
    for (const story of await ctx.db.query("stories").withIndex("by_at").order("desc").take(20)) {
      if (story.at < since || !story.headline) continue;
      const storyTitle = trimHeadline(story.headline);
      if (!storyTitle || out.some((o) => o.headline === storyTitle)) continue;
      out.push({
        key: `story:${story._id}`,
        place: story.place,
        country: story.country,
        headline: storyTitle,
        headlineUrl: story.headlineUrl ?? null,
        at: story.at,
        snapshotId: null,
        onAir: false,
      });
    }

    out.sort((a, b) => b.at - a.at);
    return out.slice(0, limit ?? 12);
  },
});
