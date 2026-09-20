import { internalMutation, type MutationCtx } from "./_generated/server";
import { v } from "convex/values";

// A fixed-window counter, deliberately simple.
//
// This is a spend guard, not a security boundary: the two public endpoints have no auth,
// so the budget is global rather than per-caller. It is enough to stop a loop from
// draining an OpenAI or Firecrawl balance during a demo.
export async function takeLimit(
  ctx: MutationCtx,
  key: string,
  limit: number,
  windowMs: number,
): Promise<{ ok: boolean; remaining: number; retryInMs?: number }> {
  const now = Date.now();
  const row = await ctx.db
    .query("rateLimits")
    .withIndex("by_key", (q) => q.eq("key", key))
    .first();

  if (!row) {
    await ctx.db.insert("rateLimits", { key, count: 1, windowStart: now });
    return { ok: true, remaining: limit - 1 };
  }

  if (now - row.windowStart > windowMs) {
    await ctx.db.patch(row._id, { count: 1, windowStart: now });
    return { ok: true, remaining: limit - 1 };
  }

  if (row.count >= limit) {
    const retryInMs = windowMs - (now - row.windowStart);
    console.warn(`[meanwhile] rate limit hit for "${key}" (${limit}/${Math.round(windowMs / 1000)}s)`);
    return { ok: false, remaining: 0, retryInMs };
  }

  await ctx.db.patch(row._id, { count: row.count + 1 });
  return { ok: true, remaining: limit - row.count - 1 };
}

export const take = internalMutation({
  args: { key: v.string(), limit: v.number(), windowMs: v.number() },
  handler: async (ctx, { key, limit, windowMs }) => await takeLimit(ctx, key, limit, windowMs),
});

/** Clears a counter. For running a benchmark twice in one day against dev — never scheduled.
 *  `npx convex run limits:reset '{"key":"fetchCountry:daily"}'` */
export const reset = internalMutation({
  args: { key: v.optional(v.string()) },
  handler: async (ctx, { key }) => {
    const rows = key
      ? await ctx.db
          .query("rateLimits")
          .withIndex("by_key", (q) => q.eq("key", key))
          .collect()
      : await ctx.db.query("rateLimits").collect();
    for (const r of rows) await ctx.db.delete(r._id);
    return { cleared: rows.length };
  },
});
