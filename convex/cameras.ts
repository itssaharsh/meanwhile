import { query, internalQuery, internalMutation } from "./_generated/server";
import { v } from "convex/values";

// Public: list active cameras (for debugging / admin).
export const list = query({
  args: {},
  handler: async (ctx) =>
    ctx.db.query("cameras").withIndex("by_active", (q) => q.eq("active", true)).collect(),
});

export const get = internalQuery({
  args: { id: v.id("cameras") },
  handler: async (ctx, { id }) => ctx.db.get(id),
});

export const listActive = internalQuery({
  args: {},
  handler: async (ctx) =>
    ctx.db.query("cameras").withIndex("by_active", (q) => q.eq("active", true)).collect(),
});

// Admin: swap one camera's feed without a reseed, e.g. when a cam goes dark mid-demo.
// INTERNAL: `npx convex run` reaches internal functions with an admin key, so the CLI
// still works — but a public mutation here would let anyone with the deployment URL point
// a camera at any URL they liked and have the backend fetch it.
//   npx convex run cameras:setRef '{"name":"Venice","ref":"https://…/current.jpg","source":"image"}'
export const setRef = internalMutation({
  args: {
    name: v.string(),
    ref: v.optional(v.string()),
    source: v.optional(v.string()),
    active: v.optional(v.boolean()),
  },
  handler: async (ctx, { name, ref, source, active }) => {
    const cam = await ctx.db
      .query("cameras")
      .withIndex("by_name", (q) => q.eq("name", name))
      .first();
    if (!cam) return { ok: false, error: `no camera named "${name}"` };

    const patch: Record<string, unknown> = {};
    if (ref !== undefined) patch.ref = ref;
    if (source !== undefined) patch.source = source;
    if (active !== undefined) patch.active = active;
    else if (ref !== undefined) patch.active = ref.length > 0;

    await ctx.db.patch(cam._id, patch);
    return { ok: true, ...patch };
  },
});
