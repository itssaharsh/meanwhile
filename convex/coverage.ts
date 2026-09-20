import { internalAction, internalMutation, internalQuery, query, type MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { publicIndexCameras, publicIndexCards, windyId, originImage, countrySlug } from "./frames.js";
import { geoFor, COUNTRY_NAMES } from "./geo";
import { centroidFor } from "./centroids.js";

// The country -> camera map, cached.
//
// The public index (opencctv.org) is the rung that actually answers: on the fifteen-country
// benchmark it found live frames where the paid web search found none. That makes it a single
// point of failure held by someone else, so nothing reads it over the network at click time.
// A daily-ish cron walks the list a few countries at a time and writes what it finds here;
// clicks read this table. Images still come live from Windy's CDN, because a cached image
// would be a cached age, and an age is the one thing this product will not fake.

/** How long before a row is worth reading again. */
const STALE_AFTER_MS = 24 * 60 * 60 * 1000;
/** Countries refreshed per cron tick. 177 names at 10 an hour is a full sweep every 18 h. */
const PER_TICK = 10;
/** A country counts as covered for this long after a frame from it proved current. */
export const COVERED_FOR_MS = 60 * 60 * 1000;
/** Index pages fetched at once. Gentle on a free service that is doing us a favour. */
const FETCH_CONCURRENCY = 3;

export type IndexCamera = { id: string; name?: string; url?: string };

/** Detail pages read per country when its cameras are not Windy's. One request each, on the
 *  cron only, and the answer is cached — which is what makes the United States answerable at
 *  all: every card there points at the index's restamping proxy, and the camera's own host is
 *  named one page down. */
const DETAIL_FOLLOW = 8;

const BROWSER = {
  "User-Agent":
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
  Accept: "text/html",
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** One page of HTML, with a single patient retry. A free service we are leaning on deserves
 *  backing off rather than hammering; the first sweep fired 350 requests as fast as it could
 *  and was throttled down to 15 countries out of 177. */
async function html(url: string): Promise<string | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await fetch(url, { headers: BROWSER });
      if (r.status === 404) return "";
      if (r.ok) return await r.text();
      await sleep(1500);
    } catch {
      await sleep(1500);
    }
  }
  return null;
}

/** The index's own list of country pages — 165 of them, in one request. Knowing the list up
 *  front is the difference between 110 requests and 350 blind probes, and it is the polite
 *  way to ask. */
async function indexSlugs(): Promise<Set<string> | null> {
  const page = await html("https://opencctv.org/cameras");
  if (!page) return null;
  const found = new Set([...page.matchAll(/href="\/cameras\/([a-z0-9-]+)"/g)].map((m) => m[1]));
  return found.size ? found : null;
}

/** Countries the index spells differently from our polygons. Verified against its own list;
 *  a guess here would put another country's camera under this country's name. */
const SLUG_ALIASES: Record<string, string> = {
  "dr-congo": "congo-kinshasa",
  "czech-republic": "czechia",
};

async function readIndexPage(slug: string): Promise<IndexCamera[] | null> {
  const url = `https://opencctv.org/cameras/${slug}`;
  const page = await html(url);
  if (page === null) return null; // transient: leave whatever we already hold alone
  if (page === "") return [];
  const found: IndexCamera[] = publicIndexCameras(page, 12).map((c) => ({ id: c.id, name: c.name ?? undefined }));
  // A country with few cameras often has more one page down, and after dark the difference
  // between one camera and six is the difference between an answer and an empty state.
  if (found.length && found.length < 6) {
    const second = await html(`${url}?page=2`);
    if (second) {
      const have = new Set(found.map((c) => c.id));
      for (const c of publicIndexCameras(second, 12)) if (!have.has(c.id)) found.push({ id: c.id, name: c.name ?? undefined });
    }
  }
  if (found.length) return found;

  // No Windy cameras here, which is not the same as no cameras: follow the cards to the pages
  // that name each camera's own host.
  const cards = publicIndexCards(page, DETAIL_FOLLOW).filter((c) => !windyId(c.id));
  const resolved: IndexCamera[] = [];
  for (const card of cards) {
    const detail = await html(`https://opencctv.org${card.detail}`);
    if (!detail) continue;
    const origin = originImage(detail);
    if (origin) resolved.push({ id: card.id, name: card.name ?? undefined, url: origin });
    await sleep(120);
  }
  return resolved;
}

/** The cameras we hold for a country. Never goes to the network. */
export const forCountry = internalQuery({
  args: { country: v.string() },
  handler: async (ctx, { country }): Promise<Doc<"coverage"> | null> =>
    (await ctx.db
      .query("coverage")
      .withIndex("by_country", (q) => q.eq("country", country))
      .take(1))[0] ?? null,
});

export const put = internalMutation({
  args: {
    country: v.string(),
    slug: v.string(),
    listed: v.boolean(),
    cameras: v.array(v.object({ id: v.string(), name: v.optional(v.string()), url: v.optional(v.string()) })),
  },
  handler: async (ctx, { country, slug, listed, cameras }): Promise<void> => {
    const row = (
      await ctx.db
        .query("coverage")
        .withIndex("by_country", (q) => q.eq("country", country))
        .take(1)
    )[0];
    const patch = { slug, listed, cameras, refreshedAt: Date.now() };
    if (row) await ctx.db.patch(row._id, patch);
    else await ctx.db.insert("coverage", { country, ...patch });
  },
});

/** A frame from this country just proved it was current. That is what the globe tints.
 *  A plain helper as well as a mutation, because the own-cache rung marks coverage from
 *  inside a mutation and cannot call one. */
export async function markCountryVerified(ctx: MutationCtx, country: string): Promise<void> {
  const row = (
    await ctx.db
      .query("coverage")
      .withIndex("by_country", (q) => q.eq("country", country))
      .take(1)
  )[0];
  if (row) await ctx.db.patch(row._id, { verifiedAt: Date.now() });
  else
    await ctx.db.insert("coverage", {
      country,
      slug: countrySlug(country),
      listed: true,
      cameras: [],
      refreshedAt: 0, // never read the index for this one; the cron will pick it up
      verifiedAt: Date.now(),
    });
}

export const markVerified = internalMutation({
  args: { country: v.string() },
  handler: async (ctx, { country }): Promise<void> => await markCountryVerified(ctx, country),
});

/** Countries to read next: never-seen first, then the stalest. */
export const dueForRefresh = internalQuery({
  args: { limit: v.number() },
  handler: async (ctx, { limit }): Promise<string[]> => {
    const rows = await ctx.db.query("coverage").withIndex("by_refreshedAt").order("asc").take(limit * 2);
    const known = new Set(rows.map((r) => r.country));
    const unseen = COUNTRY_NAMES.filter((n) => !known.has(n));
    const stale = rows.filter((r) => Date.now() - r.refreshedAt > STALE_AFTER_MS).map((r) => r.country);
    return [...unseen, ...stale].slice(0, limit);
  },
});

/** Read the index for these countries and write what it says. */
export const refresh = internalAction({
  args: { countries: v.array(v.string()) },
  handler: async (ctx, { countries }): Promise<{ read: number; listed: number; cameras: number }> => {
    const slugs = await indexSlugs();
    let listed = 0;
    let cameras = 0;
    let read = 0;

    for (let i = 0; i < countries.length; i += FETCH_CONCURRENCY) {
      await Promise.all(
        countries.slice(i, i + FETCH_CONCURRENCY).map(async (country) => {
          const { common, camera } = geoFor(country);
          if (camera === false) return;
          const candidates = [countrySlug(common), countrySlug(country)];
          for (const c of [...candidates]) if (SLUG_ALIASES[c]) candidates.push(SLUG_ALIASES[c]);

          // With the index's own list in hand, a country it doesn't carry costs no request.
          const slug = slugs ? candidates.find((c) => slugs.has(c)) : candidates[0];
          read++;
          if (!slug) {
            await ctx.runMutation(internal.coverage.put, { country, slug: candidates[0], listed: false, cameras: [] });
            return;
          }
          const found = await readIndexPage(slug);
          if (found === null) return; // couldn't read it; keep what we have rather than blank it
          if (found.length) {
            listed++;
            cameras += found.length;
          }
          await ctx.runMutation(internal.coverage.put, { country, slug, listed: found.length > 0, cameras: found });
        }),
      );
      await sleep(250);
    }
    console.log(`[meanwhile] coverage: ${read} countries — ${listed} listed, ${cameras} cameras`);
    return { read, listed, cameras };
  },
});

export const cronRefresh = internalAction({
  args: {},
  handler: async (ctx): Promise<void> => {
    const countries: string[] = await ctx.runQuery(internal.coverage.dueForRefresh, { limit: PER_TICK });
    if (!countries.length) return;
    await ctx.runAction(internal.coverage.refresh, { countries });
  },
});

/** Every country, read in one pass. For the pre-warm before a demo. */
export const refreshAll = internalAction({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }): Promise<{ read: number; listed: number; cameras: number }> => {
    const names = COUNTRY_NAMES.slice(0, limit ?? COUNTRY_NAMES.length);
    return await ctx.runAction(internal.coverage.refresh, { countries: names });
  },
});

/** The countries a first-time visitor actually clicks. Warmed before a demo so the first
 *  click of the day is instant rather than a fifteen-second search — the stories land in the
 *  cache the click's rung 0 reads, and the headline lookups fill the headline cache with them,
 *  so the clicks that follow spend nothing at all. */
const PREWARM = [
  "United States of America", "Canada", "Mexico", "Brazil", "Argentina", "Chile", "Peru", "Colombia",
  "United Kingdom", "Ireland", "France", "Germany", "Italy", "Spain", "Portugal", "Netherlands",
  "Switzerland", "Austria", "Norway", "Sweden", "Denmark", "Finland", "Iceland", "Greece",
  "Poland", "Czech Republic", "Türkiye", "Russian Federation", "Ukraine", "Japan",
  "South Korea", "People's Republic of China", "India", "Thailand", "Vietnam", "Indonesia",
  "Australia", "New Zealand", "South Africa", "Egypt",
];

/** Run the country fetch for the likely clicks. Skips anything already answered from a fresh
 *  story, and anything the index holds no camera for — pre-warming an empty state buys
 *  nothing. Staggered, because forty at once is forty vision calls at once. */
export const prewarm = internalAction({
  args: { countries: v.optional(v.array(v.string())), spacingMs: v.optional(v.number()) },
  handler: async (
    ctx,
    { countries, spacingMs },
  ): Promise<{ started: string[]; alreadyWarm: string[]; noCameras: string[] }> => {
    const list = countries ?? PREWARM;
    const gap = spacingMs ?? 3000;
    const started: string[] = [];
    const alreadyWarm: string[] = [];
    const noCameras: string[] = [];

    for (const country of list) {
      const row: Doc<"coverage"> | null = await ctx.runQuery(internal.coverage.forCountry, { country });
      if (!row || !row.cameras.length) {
        noCameras.push(country);
        continue;
      }
      const warm: boolean = await ctx.runQuery(internal.stories.isWarm, { country });
      if (warm) {
        alreadyWarm.push(country);
        continue;
      }
      await ctx.runMutation(internal.coverage.startFetch, { country, after: started.length * gap });
      started.push(country);
    }
    console.log(
      `[meanwhile] prewarm: ${started.length} started, ${alreadyWarm.length} already warm, ${noCameras.length} with no camera`,
    );
    return { started, alreadyWarm, noCameras };
  },
});

/** A fetch started by us rather than by a click: same ladder, same row the UI would watch,
 *  but it does not spend the public click budget, which exists to stop strangers burning
 *  credits and not to stop us warming our own cache. */
export const startFetch = internalMutation({
  args: { country: v.string(), after: v.number() },
  handler: async (ctx, { country, after }): Promise<void> => {
    const at = centroidFor(country);
    if (!at) return;
    const fetchId = await ctx.db.insert("fetches", {
      country,
      lat: at.lat,
      lng: at.lng,
      n: 0,
      i: 0,
      stale: 0,
      misplaced: 0,
      kept: 0,
      pages: 0,
      stage: "searching",
      startedAt: Date.now(),
      stageStartedAt: Date.now(),
    });
    await ctx.scheduler.runAfter(after, internal.countries.run, { fetchId });
  },
});

/** The camera map, for copying between deployments. Deliberately does NOT carry `verifiedAt`:
 *  that is a record of a frame this deployment actually checked, and importing another
 *  deployment's would make the globe claim coverage prod had never confirmed. */
export const dump = internalQuery({
  args: { from: v.optional(v.number()), limit: v.optional(v.number()) },
  handler: async (
    ctx,
    { from, limit },
  ): Promise<{ country: string; slug: string; listed: boolean; cameras: IndexCamera[] }[]> => {
    const rows = await ctx.db.query("coverage").collect();
    return rows
      .slice(from ?? 0, (from ?? 0) + (limit ?? rows.length))
      .filter((r) => r.cameras.length > 0)
      .map((r) => ({ country: r.country, slug: r.slug, listed: r.listed, cameras: r.cameras }));
  },
});

/** Take a dump from another deployment. Seeds a cold table in one pass instead of waiting
 *  ~18 hours for the hourly cron to walk it; the cron then takes over the refreshing. */
export const seed = internalMutation({
  args: {
    rows: v.array(
      v.object({
        country: v.string(),
        slug: v.string(),
        listed: v.boolean(),
        cameras: v.array(v.object({ id: v.string(), name: v.optional(v.string()), url: v.optional(v.string()) })),
      }),
    ),
  },
  handler: async (ctx, { rows }): Promise<{ inserted: number; updated: number }> => {
    let inserted = 0;
    let updated = 0;
    for (const r of rows) {
      const existing = (
        await ctx.db
          .query("coverage")
          .withIndex("by_country", (q) => q.eq("country", r.country))
          .take(1)
      )[0];
      // refreshedAt is set to now: these rows were read from the index minutes ago, and the
      // cron should not immediately re-read all 103 of them.
      const patch = { slug: r.slug, listed: r.listed, cameras: r.cameras, refreshedAt: Date.now() };
      if (existing) {
        await ctx.db.patch(existing._id, patch);
        updated++;
      } else {
        await ctx.db.insert("coverage", { country: r.country, ...patch });
        inserted++;
      }
    }
    return { inserted, updated };
  },
});

/** Ops: what the table holds right now. `npx convex run coverage:status '{}'` */
export const status = internalQuery({
  args: {},
  handler: async (ctx): Promise<{ rows: number; listed: number; cameras: number; verifiedNow: number; empty: string[] }> => {
    const rows = await ctx.db.query("coverage").collect();
    const listed = rows.filter((r) => r.cameras.length > 0);
    const since = Date.now() - COVERED_FOR_MS;
    return {
      rows: rows.length,
      listed: listed.length,
      cameras: listed.reduce((n, r) => n + r.cameras.length, 0),
      verifiedNow: rows.filter((r) => (r.verifiedAt ?? 0) > since).length,
      // Slugs we believe exist but that gave us no cameras — worth a look when it is long.
      empty: rows.filter((r) => r.listed === false && r.slug).map((r) => `${r.country}:${r.slug}`).slice(0, 200),
    };
  },
});

/** Countries we hold a camera for, verified or not. The globe's second tier: we know where to
 *  look, but nothing from there has proved itself current in the last hour. Public for the
 *  same reason as `covered` — it is a list of country names. */
export const indexed = query({
  args: {},
  handler: async (ctx): Promise<string[]> =>
    (await ctx.db.query("coverage").collect()).filter((r) => r.cameras.length > 0).map((r) => r.country),
});

/** The countries the globe tints: a frame from each proved current within the hour. Public,
 *  because the globe asks for it directly, and it is nothing but a list of country names. */
export const covered = query({
  args: {},
  handler: async (ctx): Promise<string[]> => {
    const since = Date.now() - COVERED_FOR_MS;
    const rows = await ctx.db
      .query("coverage")
      .withIndex("by_verifiedAt", (q) => q.gt("verifiedAt", since))
      .collect();
    return rows.map((r) => r.country);
  },
});
