import { internalQuery, internalMutation } from "./_generated/server";
import { v } from "convex/values";

// Which vision models are unusable right now, and until when.
//
// Only the DEPLOYMENT key's state is recorded. A caller's BYOK key has its own quota, so
// its exhaustion is tracked for the duration of that one call and never persisted — and
// marking a model dead because someone else's key ran dry would wrongly skip it for us.
//
// Rows are keyed by a short fingerprint of the deployment key, not the key itself, so a
// rotated key (or a key from a different Google project, with its own quotas) starts
// clean instead of inheriting yesterday's exhaustion.

export const blocked = internalQuery({
  args: { provider: v.string(), keyTag: v.string() },
  handler: async (ctx, { provider, keyTag }) => {
    const rows = await ctx.db
      .query("modelState")
      .withIndex("by_provider_key", (q) => q.eq("provider", provider).eq("keyTag", keyTag))
      .collect();
    // The caller filters against its own clock; queries shouldn't depend on Date.now().
    return rows.map((r) => ({ model: r.model, until: r.until, reason: r.reason }));
  },
});

export const mark = internalMutation({
  args: {
    provider: v.string(),
    keyTag: v.string(),
    model: v.string(),
    until: v.number(),
    reason: v.string(),
  },
  handler: async (ctx, a) => {
    const existing = await ctx.db
      .query("modelState")
      .withIndex("by_provider_key_model", (q) =>
        q.eq("provider", a.provider).eq("keyTag", a.keyTag).eq("model", a.model),
      )
      .first();
    const row = { ...a, at: Date.now() };
    if (existing) await ctx.db.patch(existing._id, row);
    else await ctx.db.insert("modelState", row);
  },
});

// Admin: forget all exhaustion marks (e.g. after upgrading to a paid tier mid-day).
//   npx convex run modelState:reset
export const reset = internalMutation({
  args: { provider: v.optional(v.string()) },
  handler: async (ctx, { provider }) => {
    const rows = await ctx.db.query("modelState").collect();
    let n = 0;
    for (const r of rows) {
      if (provider && r.provider !== provider) continue;
      await ctx.db.delete(r._id);
      n++;
    }
    return { cleared: n };
  },
});
