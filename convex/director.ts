import { query } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { v } from "convex/values";
import { rankFeed } from "./rank.js";

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
