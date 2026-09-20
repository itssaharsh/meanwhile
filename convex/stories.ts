import { internalMutation, internalQuery, query } from "./_generated/server";
import { v } from "convex/values";

// Frames a country click found and kept. Two jobs beyond showing the story: the cache the
// ladder falls back to (a frame we already hold, labelled honestly), and the evidence behind
// "three countries verified working this minute".

export const byId = query({
  args: { storyId: v.id("stories") },
  handler: async (ctx, { storyId }) => {
    const s = await ctx.db.get(storyId);
    if (!s) return null;
    return { ...s, frameUrl: await ctx.storage.getUrl(s.storageId) };
  },
});

export const put = internalMutation({
  args: {
    country: v.string(),
    place: v.string(),
    lat: v.number(),
    lng: v.number(),
    storageId: v.id("_storage"),
    sourceImageUrl: v.string(),
    sourcePage: v.optional(v.string()),
    cameraName: v.optional(v.string()),
    capturedAt: v.union(v.number(), v.null()),
    score: v.optional(v.number()),
    caption: v.string(),
    tags: v.array(v.string()),
    headline: v.optional(v.string()),
    headlineUrl: v.optional(v.string()),
    via: v.string(),
  },
  handler: async (ctx, a) => await ctx.db.insert("stories", { ...a, at: Date.now() }),
});

export const get = internalQuery({
  args: { storyId: v.id("stories") },
  handler: async (ctx, { storyId }) => {
    const s = await ctx.db.get(storyId);
    return s ? { ...s, frameUrl: await ctx.storage.getUrl(s.storageId) } : null;
  },
});

export const latestForCountry = internalQuery({
  args: { country: v.string() },
  handler: async (ctx, { country }) =>
    (await ctx.db
      .query("stories")
      .withIndex("by_country_at", (q) => q.eq("country", country))
      .order("desc")
      .take(1))[0] ?? null,
});

/** Is this country already answered by a story fresh enough to serve a click? What the
 *  pre-warm checks so it doesn't refetch what is already hot. */
export const isWarm = internalQuery({
  args: { country: v.string(), withinMs: v.optional(v.number()) },
  handler: async (ctx, { country, withinMs }): Promise<boolean> => {
    const story = (
      await ctx.db
        .query("stories")
        .withIndex("by_country_at", (q) => q.eq("country", country))
        .order("desc")
        .take(1)
    )[0];
    if (!story) return false;
    const within = withinMs ?? 25 * 60 * 1000; // just inside the click's own 30-minute reuse
    return story.capturedAt != null && Date.now() - story.at <= within;
  },
});

/** Filled in after the fact when a story came out of our own cache, where the headline lookup
 *  can't be awaited. */
export const setHeadline = internalMutation({
  args: { storyId: v.id("stories"), headline: v.string(), headlineUrl: v.optional(v.string()) },
  handler: async (ctx, { storyId, headline, headlineUrl }): Promise<void> => {
    await ctx.db.patch(storyId, { headline, headlineUrl });
  },
});

/** Drop stories for a country — the operator's lever when a source turns out to have been
 *  lying about a frame's age, and the one that cleared the two CDN-restamped frames that
 *  taught us to check the light against the clock. Their blobs go with them. */
export const forget = internalMutation({
  args: { country: v.optional(v.string()), host: v.optional(v.string()) },
  handler: async (ctx, { country, host }) => {
    const rows = country
      ? await ctx.db
          .query("stories")
          .withIndex("by_country_at", (q) => q.eq("country", country))
          .collect()
      : await ctx.db.query("stories").collect();
    const doomed = rows.filter((r) => !host || r.sourceImageUrl.includes(host));
    for (const r of doomed) {
      await ctx.storage.delete(r.storageId);
      await ctx.db.delete(r._id);
    }
    return { forgotten: doomed.map((r) => `${r.country}: ${r.place}`) };
  },
});
