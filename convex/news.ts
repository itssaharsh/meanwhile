import { internalAction, internalQuery, internalMutation } from "./_generated/server";
import type { ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { envOrNull, fetchOk, missingKey } from "./lib";
import { trimHeadline } from "./text.js";

// Today's local headline — what is actually happening in a place.
//
// Firecrawl is DEMAND-DRIVEN in this app. It is never called per camera on the cron.
// It runs in exactly two places:
//   1. The country click (countries.ts): search + screenshot + this headline, on demand.
//   2. The current cut: when the director cuts to a NEW snapshot, attachToCut looks up one
//      headline for that one place. That is at most one lookup per cut change — cached per
//      place — never one per camera per refresh.
//
// Billing discipline: Firecrawl bills per search and the free tier is ~500 credits TOTAL.
// Headlines move far slower than webcam frames, so each place's lookup is cached.
const DEFAULT_TTL_HOURS = 6;

// Misses are cached too, on a shorter clock. Without this a place whose query returns
// nothing (or a Firecrawl outage) re-searches on EVERY cron pass — 72 searches/day for one
// place instead of ~4 — and burns the budget below on attempts that never produce anything.
const MISS_TTL_MS = 60 * 60 * 1000;

// A headline older than this is not "today" any more, so it is dropped rather than shown.
const MAX_STALE_MS = 36 * 60 * 60 * 1000;

// A second, independent ceiling: even if the cache misbehaves, this caps the spend.
// The cut headline and the public country click use SEPARATE budgets, so globe clicks
// can't starve the on-air headline (and vice versa).
const SEARCH_LIMIT = 60;
const SEARCH_WINDOW_MS = 6 * 60 * 60 * 1000;

export const cached = internalQuery({
  args: { place: v.string() },
  handler: async (ctx, { place }) =>
    ctx.db
      .query("headlines")
      .withIndex("by_place", (q) => q.eq("place", place))
      .first(),
});

// An empty title is a cached MISS, not a headline.
export const put = internalMutation({
  args: {
    place: v.string(),
    title: v.string(),
    url: v.optional(v.string()),
    source: v.optional(v.string()),
  },
  handler: async (ctx, { place, title, url, source }) => {
    const existing = await ctx.db
      .query("headlines")
      .withIndex("by_place", (q) => q.eq("place", place))
      .first();
    const row = { place, title, url, source, at: Date.now() };
    if (existing) await ctx.db.patch(existing._id, row);
    else await ctx.db.insert("headlines", row);
  },
});

function ttlMs(): number {
  const h = Number(envOrNull("HEADLINE_TTL_HOURS") ?? DEFAULT_TTL_HOURS);
  return (Number.isFinite(h) && h > 0 ? h : DEFAULT_TTL_HOURS) * 60 * 60 * 1000;
}

// See text.js: split a styled title run off a social post, fold "math bold" to plain
// letters, cut at the first sentence break, cap at a word boundary.
function clean(title: unknown): string | null {
  return trimHeadline(title);
}

export type Headline = { title: string; url?: string; cached: boolean };

// Today's headline for a place, from cache when it's fresh enough.
//
// A plain helper rather than an action other actions call through ctx.runAction: the
// Convex guidelines reserve action-to-action calls for crossing runtimes, and both callers
// (the country click and attachToCut) are already actions in the same runtime.
export async function lookupHeadline(
  ctx: ActionCtx,
  { place, country, budget }: { place: string; country?: string; budget: string },
): Promise<Headline | null> {
  // A cached row with an empty title is a remembered miss.
  const usable = (row: { title: string; url?: string; at: number } | null | undefined) =>
    row && row.title && Date.now() - row.at < MAX_STALE_MS
      ? { title: trimHeadline(row.title) ?? row.title, url: row.url, cached: true }
      : null;

  const hit = await ctx.runQuery(internal.news.cached, { place });
  if (hit) {
    const ttl = hit.title ? ttlMs() : MISS_TTL_MS;
    if (Date.now() - hit.at < ttl) return usable(hit);
  }

  if (envOrNull("DEMO_MODE") === "1") {
    console.log(`[meanwhile] DEMO_MODE=1 — not calling Firecrawl for ${place}`);
    return usable(hit);
  }

  const key = envOrNull("FIRECRAWL_KEY");
  if (!key) {
    missingKey("FIRECRAWL_KEY", `headline for ${place}`);
    return usable(hit);
  }

  const gate = await ctx.runMutation(internal.limits.take, {
    key: budget,
    limit: SEARCH_LIMIT,
    windowMs: SEARCH_WINDOW_MS,
  });
  if (!gate.ok) {
    console.warn(`[meanwhile] headline search budget spent — reusing cache for ${place}`);
    return usable(hit);
  }

  const r = await fetchOk(`firecrawl news ${place}`, "https://api.firecrawl.dev/v2/search", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      query: `${place} today`,
      limit: 1,
      // News only. A web fallback put "Santorini vacation highlights and stunning views -
      // Facebook" on air as today's headline: a web result is a page title, not news.
      sources: [{ type: "news" }],
      tbs: "qdr:d", // past 24 hours
      ...(country ? { location: country } : {}),
    }),
  });
  if (!r) {
    // Remember the failure briefly so an outage doesn't re-search every 20 minutes.
    await ctx.runMutation(internal.news.put, { place, title: "" });
    return usable(hit);
  }

  const j: any = await r.json().catch(() => null);
  if (j?.success === false) {
    console.error(`[meanwhile] firecrawl search refused for ${place}: ${JSON.stringify(j)?.slice(0, 200)}`);
    await ctx.runMutation(internal.news.put, { place, title: "" });
    return usable(hit);
  }

  // v2 keys `data` by source. No news in the past day means no headline — never a web
  // page title passed off as one.
  const top = j?.data?.news?.[0] ?? null;
  const title = clean(top?.title);
  if (!title) {
    console.warn(`[meanwhile] no headline found for ${place} — caching the miss for 1h`);
    await ctx.runMutation(internal.news.put, { place, title: "" });
    return usable(hit);
  }

  const url = typeof top?.url === "string" ? top.url : undefined;
  await ctx.runMutation(internal.news.put, {
    place,
    title,
    url,
    source: "news",
  });
  console.log(`[meanwhile] headline ${place}: ${title}`);
  return { title, url, cached: false };
}

// CLI probe: npx convex run news:headlineFor '{"place":"Reykjavík","country":"Iceland"}'
export const headlineFor = internalAction({
  args: { place: v.string(), country: v.optional(v.string()) },
  handler: async (ctx, { place, country }): Promise<Headline | null> =>
    await lookupHeadline(ctx, { place, country, budget: "firecrawlSearch:probe" }),
});

// ---------------------------------------------------------------------------
// The one headline the cron path is allowed: the snapshot currently on air.
// ---------------------------------------------------------------------------
export const cutTarget = internalQuery({
  args: { snapshotId: v.id("snapshots") },
  handler: async (ctx, { snapshotId }) => {
    const snap = await ctx.db.get(snapshotId);
    if (!snap) return null;
    const cam = await ctx.db.get(snap.cameraId);
    if (!cam) return null;
    return { place: cam.name, country: cam.country, hasHeadline: Boolean(snap.headline) };
  },
});

export const setHeadline = internalMutation({
  args: { snapshotId: v.id("snapshots"), headline: v.string(), headlineUrl: v.optional(v.string()) },
  handler: async (ctx, { snapshotId, headline, headlineUrl }) => {
    if (!(await ctx.db.get(snapshotId))) return;
    await ctx.db.patch(snapshotId, { headline, headlineUrl });
  },
});

// Admin: take a headline off a snapshot (a bad one made it on air).
//   npx convex run news:clearHeadline '{"snapshotId":"…"}'
export const clearHeadline = internalMutation({
  args: { snapshotId: v.id("snapshots") },
  handler: async (ctx, { snapshotId }) => {
    const snap = await ctx.db.get(snapshotId);
    if (!snap) return { cleared: false };
    // Patching a field to undefined removes it.
    await ctx.db.patch(snapshotId, { headline: undefined, headlineUrl: undefined });
    return { cleared: true, was: snap.headline ?? null };
  },
});

// Admin: forget cached headlines — all of them, one place, or only those that came from
// a given source (the retired "web" fallback, say) — so they are looked up afresh.
//   npx convex run news:forget '{"source":"web"}'
export const forget = internalMutation({
  args: { place: v.optional(v.string()), source: v.optional(v.string()) },
  handler: async (ctx, { place, source }) => {
    const rows = place
      ? await ctx.db.query("headlines").withIndex("by_place", (q) => q.eq("place", place)).collect()
      : await ctx.db.query("headlines").collect();
    const doomed = rows.filter((r) => !source || r.source === source);
    for (const r of doomed) await ctx.db.delete(r._id);
    return { forgotten: doomed.map((r) => `${r.place}: ${r.title || "(cached miss)"}`) };
  },
});

// Scheduled by cut.ts when the director cuts to a NEW snapshot. One place, one lookup,
// served from the per-place cache whenever it is fresh.
/** A country story's headline. The country click owns its own budget, so a globe click can
 *  never starve the on-air headline. Scheduled rather than awaited when the story came out of
 *  our own cache, because that path runs inside a mutation and must stay instant. */
export const attachToStory = internalAction({
  args: { storyId: v.id("stories"), place: v.string(), country: v.string() },
  handler: async (ctx, { storyId, place, country }): Promise<void> => {
    const story = await ctx.runQuery(internal.stories.get, { storyId });
    if (!story || story.headline) return;
    // Same two-step as the ladder: the camera's town first, the country when the town has no
    // news of its own.
    const h =
      (await lookupHeadline(ctx, { place, country, budget: "firecrawlSearch:public" })) ??
      (place !== country ? await lookupHeadline(ctx, { place: country, country, budget: "firecrawlSearch:public" }) : null);
    if (h) await ctx.runMutation(internal.stories.setHeadline, { storyId, headline: h.title, headlineUrl: h.url });
  },
});

export const attachToCut = internalAction({
  args: { snapshotId: v.id("snapshots") },
  handler: async (ctx, { snapshotId }): Promise<void> => {
    const t = await ctx.runQuery(internal.news.cutTarget, { snapshotId });
    if (!t || t.hasHeadline) return;
    const h = await lookupHeadline(ctx, { place: t.place, country: t.country, budget: "firecrawlSearch:cut" });
    if (h) await ctx.runMutation(internal.news.setHeadline, { snapshotId, headline: h.title, headlineUrl: h.url });
  },
});
