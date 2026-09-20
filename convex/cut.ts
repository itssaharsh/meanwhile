import { internalMutation, internalQuery } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { pickCut } from "./rank.js";

// The director's write side, kept out of score.ts so neither module has to reference its
// own generated API (which is what makes TypeScript give up and infer `any`).

export const save = internalMutation({
  args: {
    cameraId: v.id("cameras"),
    storageId: v.optional(v.id("_storage")),
    imageUrl: v.optional(v.string()),
    score: v.number(),
    caption: v.string(),
    tags: v.array(v.string()),
    weather: v.optional(v.string()),
    localTime: v.optional(v.string()),
    isDay: v.optional(v.boolean()),
    headline: v.optional(v.string()),
    headlineUrl: v.optional(v.string()),
    imageHash: v.optional(v.string()),
    reusedScore: v.optional(v.boolean()),
    servedBy: v.optional(v.string()),
    capturedAt: v.optional(v.number()),
  },
  handler: async (ctx, a) => {
    return await ctx.db.insert("snapshots", { ...a, at: Date.now() });
  },
});

// An unchanged frame updates the EXISTING snapshot instead of inserting a new one.
//
// Inserting carried the old score under `at: Date.now()`, which manufactured freshness:
// rank.js's recency window is the only thing stopping a stale high score from owning the
// channel, so a camera serving a frozen file (exactly the dead-camera case the seed
// documents) would have held the cut forever and never been re-scored. It also minted a
// new snapshot id every pass, defeating reselect's no-change short-circuit and re-flying
// the globe to the same frozen image every 20 minutes.
//
// Only the reuse flag is written. It must NOT touch `headline`: patching a field to
// undefined deletes it in Convex, so this would wipe the on-air headline every time a
// frame came back unchanged.
export const touch = internalMutation({
  args: { snapshotId: v.id("snapshots"), capturedAt: v.optional(v.number()) },
  handler: async (ctx, { snapshotId, capturedAt }) => {
    const snap = await ctx.db.get(snapshotId);
    if (!snap) return;
    // The frame is unchanged, so its own timestamp is re-read rather than assumed: a camera
    // serving the same bytes is getting older, and the source says by how much.
    await ctx.db.patch(snapshotId, { reusedScore: true, ...(capturedAt != null ? { capturedAt } : {}) });
  },
});

// The newest snapshot for a camera — what the frame-hash check compares against.
export const latestForCamera = internalQuery({
  args: { cameraId: v.id("cameras") },
  handler: async (ctx, { cameraId }) =>
    (
      await ctx.db
        .query("snapshots")
        .withIndex("by_camera", (q) => q.eq("cameraId", cameraId))
        .order("desc")
        .take(1)
    )[0] ?? null,
});

// Is this stored frame still referenced by a saved snapshot?
//
// scoreSnapshot drops the frame it was handed whenever it fails — which is right for a
// frame ingest just stored, but wrong when the call was a re-score of a frame an existing
// snapshot already owns (a BYOK probe against a live storageId, say). Without this check a
// failed experiment silently deletes the image the channel is currently showing.
export const storageInUse = internalQuery({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, { storageId }) =>
    (await ctx.db
      .query("snapshots")
      .withIndex("by_storage", (q) => q.eq("storageId", storageId))
      .take(1)).length > 0,
});

// Pick the current cut: the highest-scored FRESH snapshot across active cameras.
//
// A plain helper, shared by reselect and removeSnapshot, rather than one mutation calling
// the other through `internal` — a same-module call like that is the TypeScript
// circular-inference trap the Convex guidelines warn about.
async function pickCut_(ctx: MutationCtx): Promise<void> {
  const cams = await ctx.db
    .query("cameras")
    .withIndex("by_active", (q) => q.eq("active", true))
    .collect();

  const latest = [];
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

  const best = pickCut(latest);
  if (!best) {
    console.warn("[meanwhile] reselect: no fresh snapshot to cut to");
    return;
  }

  const current = (await ctx.db.query("cut").order("desc").take(1))[0];
  if (current && current.snapshotId === best._id) return; // no change

  await ctx.db.insert("cut", { snapshotId: best._id, cameraId: best.cameraId, at: Date.now() });
  console.log(`[meanwhile] cutting to ${best.caption?.slice(0, 60)} (${best.score})`);

  // The ONE Firecrawl touchpoint on the cron path: a headline for the snapshot now on air.
  // Only on an actual cut change (the no-change case returned above), and cached per
  // place — so at most one lookup per cut, never one per camera per refresh.
  if (!best.headline) {
    await ctx.scheduler.runAfter(0, internal.news.attachToCut, { snapshotId: best._id });
  }
}

// Called once per refresh batch (see pool.ts). The scaffold called this from `save`, so a
// 12-camera refresh ran the whole selection scan 12 times — ~320 document reads — and
// appended roughly one `cut` row per camera per run.
export const reselect = internalMutation({
  args: {},
  handler: async (ctx) => {
    await pickCut_(ctx);
  },
});

// Moderation: pull one snapshot off the air — a bad caption, a wrong frame — and re-pick
// the cut in the same transaction, so viewers never see a cut pointing at nothing.
// The stored image is left to prune's reference-counted sweep: an unchanged frame can be
// shared by several snapshots, so deleting it here could take a live image with it.
//   npx convex run cut:removeSnapshot '{"snapshotId":"…"}'
export const removeSnapshot = internalMutation({
  args: { snapshotId: v.id("snapshots") },
  handler: async (ctx, { snapshotId }) => {
    const snap = await ctx.db.get(snapshotId);
    if (!snap) return { removed: false };
    await ctx.db.delete(snapshotId);
    // Drop any cut rows that pointed at it, then choose again from what's left.
    for (const c of await ctx.db.query("cut").order("desc").take(100)) {
      if (c.snapshotId === snapshotId) await ctx.db.delete(c._id);
    }
    await pickCut_(ctx);
    return { removed: true };
  },
});

// Retention: nothing in the scaffold ever deleted a snapshot or a stored image, so both
// grew forever. Keeps the newest frame per camera regardless of age, so the feed never
// empties out.
export const prune = internalMutation({
  args: { olderThanMs: v.optional(v.number()) },
  handler: async (ctx, { olderThanMs }) => {
    // 3 hours by default: at a 20-minute refresh that keeps ~9 frames per camera, and the
    // Santoríni camera alone is ~580 KB a frame, so a day of history is half a gigabyte.
    const cutoff = Date.now() - (olderThanMs ?? 3 * 60 * 60 * 1000);
    const cams = await ctx.db.query("cameras").collect();

    let deleted = 0;
    for (const cam of cams) {
      const snaps = await ctx.db
        .query("snapshots")
        .withIndex("by_camera", (q) => q.eq("cameraId", cam._id))
        .order("desc")
        .collect();

      for (const snap of snaps.slice(1)) {
        if (snap.at >= cutoff) continue;
        // Delete the ROW only, never the blob directly: an unchanged frame is reused, so
        // several snapshots can point at the same storageId — including the newest one
        // that is currently on air. Blobs are reclaimed by the unreferenced sweep below,
        // which is the only place that knows whether anything still points at them.
        await ctx.db.delete(snap._id);
        deleted++;
      }
    }

    // `cut` rows are tiny but unbounded too; keep a day of history.
    const cuts = await ctx.db.query("cut").order("desc").collect();
    for (const c of cuts.slice(1)) {
      if (c.at < cutoff) await ctx.db.delete(c._id);
    }

    // The ONLY place blobs are deleted. Two kinds get reclaimed here:
    //   - frames whose snapshot rows were just pruned above,
    //   - orphans: a frame is stored before it is scored, so anything that stopped the
    //     scoring used to leak one (score.ts now discards its own, but this catches any
    //     left by an earlier build or a crash mid-action).
    // Reference-counting across ALL remaining snapshots is what makes reuse safe: an
    // unchanged frame is shared by several snapshots, and the newest may be on air.
    // The one-hour grace keeps it from deleting a frame that is still in flight.
    const referenced = new Set<string>();
    for (const snap of await ctx.db.query("snapshots").collect()) {
      if (snap.storageId) referenced.add(snap.storageId);
    }
    // Country-click frames share this storage (and a pool frame can be referenced by both).
    for (const story of await ctx.db.query("stories").collect()) referenced.add(story.storageId);
    const grace = Date.now() - 60 * 60 * 1000;
    let orphans = 0;
    for (const file of await ctx.db.system.query("_storage").collect()) {
      if (referenced.has(file._id)) continue;
      if (file._creationTime >= grace) continue;
      await ctx.storage.delete(file._id);
      orphans++;
    }

    if (deleted || orphans) {
      console.log(`[meanwhile] pruned ${deleted} snapshots, ${orphans} orphaned frames`);
    }
    return { deleted, orphans };
  },
});
