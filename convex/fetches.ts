import { internalMutation, query } from "./_generated/server";
import { v } from "convex/values";
import { progressKey } from "./stages.js";

// One country fetch, written stage by stage. The story panel subscribes to `watch`, so the
// wait shows what is actually happening rather than a spinner (C-08).

export const watch = query({
  args: { fetchId: v.id("fetches") },
  handler: async (ctx, { fetchId }) => await ctx.db.get(fetchId),
});

/** The row for a country, if one is running or finished recently — lets a second click on the
 *  same country join the fetch already in flight instead of paying for another. */
export const latestForCountry = query({
  args: { country: v.string() },
  handler: async (ctx, { country }) =>
    (await ctx.db
      .query("fetches")
      .withIndex("by_country", (q) => q.eq("country", country))
      .order("desc")
      .take(1))[0] ?? null,
});

export const advance = internalMutation({
  args: {
    fetchId: v.id("fetches"),
    stage: v.string(),
    n: v.optional(v.number()),
    i: v.optional(v.number()),
    cameraName: v.optional(v.union(v.string(), v.null())),
    frameAgeMs: v.optional(v.union(v.number(), v.null())),
    stale: v.optional(v.number()),
    misplaced: v.optional(v.number()),
    kept: v.optional(v.number()),
    pages: v.optional(v.number()),
    oldestAt: v.optional(v.number()),
    elsewhere: v.optional(v.string()),
    outcome: v.optional(v.string()),
    storyId: v.optional(v.id("stories")),
    error: v.optional(v.string()),
  },
  handler: async (ctx, { fetchId, ...patch }) => {
    const row = await ctx.db.get(fetchId);
    if (!row) return;
    // Stages may be skipped, never repeated backwards: a late write from a slower step must
    // not drag the line back to an earlier one.
    const next = { ...row, ...patch };
    if (progressKey(next) < progressKey(row)) return;
    await ctx.db.patch(fetchId, {
      ...patch,
      cameraName: patch.cameraName ?? undefined,
      stageStartedAt: patch.stage !== row.stage || patch.i !== row.i ? Date.now() : row.stageStartedAt,
      ...(patch.stage === "done" || patch.stage === "failed" ? { finishedAt: Date.now() } : {}),
    });
  },
});
