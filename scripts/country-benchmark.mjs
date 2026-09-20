// Country-click benchmark: the same 15 "random" countries every run, so a before number and an
// after number are comparable. Calls the PUBLIC action exactly as the browser does (Convex HTTP
// client, polygon centroid as lat/lng), one at a time, paced under the action's own burst
// limit — a rate-limit refusal is retried, never counted as a dead end.
//
//   node scripts/country-benchmark.mjs --out after.json [--mode start] [--seed meanwhile/block1] [--n 15]
//
// --mode start (default) drives the ladder exactly as the UI does — countries:start, then
// fetches:watch until the row finishes — so the rung, the outcome and the reconciling counts
// are recorded. --mode action calls the legacy countries:fetchCountry, which is how the
// before number was taken.
//
// Spends real Firecrawl credits and vision calls on whichever deployment VITE_CONVEX_URL
// (from .env.local) points at. Run it against dev.
import { readFileSync, writeFileSync } from "node:fs";
import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";

const arg = (name, dflt) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : dflt;
};
const MODE = arg("mode", "start");
const FN = arg("fn", "countries:fetchCountry");
const SEED = arg("seed", "meanwhile/block1");
const N = Number(arg("n", 15));
const OUT = arg("out", "benchmark.json");
const PACE_MS = Number(arg("pace", 65_000)); // 10 calls per 10 minutes is the action's burst limit

const env = readFileSync(".env.local", "utf8");
const url = env.match(/^VITE_CONVEX_URL=(.+)$/m)?.[1]?.trim();
if (!url) throw new Error("VITE_CONVEX_URL not found in .env.local");

// mulberry32, seeded from a string — deterministic across runs and machines.
function rng(seed) {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 3432918353), (h = (h << 13) | (h >>> 19));
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const countries = JSON.parse(readFileSync("src/data/countries.json", "utf8"));
const rand = rng(SEED);
const pool = [...countries];
for (let i = pool.length - 1; i > 0; i--) {
  const j = Math.floor(rand() * (i + 1));
  [pool[i], pool[j]] = [pool[j], pool[i]];
}
const picked = pool.slice(0, N).map((c) => ({ country: c.n, lng: c.c[0], lat: c.c[1] }));

const client = new ConvexHttpClient(url);
const ref = makeFunctionReference(FN);
const startRef = makeFunctionReference("countries:start");
const watchRef = makeFunctionReference("fetches:watch");
const storyRef = makeFunctionReference("stories:byId");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const RATE_LIMITED = /rate-limited|budget is spent/;

// One click through the ladder, polled the way the subscription pushes it.
async function runStart(p) {
  const t0 = Date.now();
  const { fetchId, cached } = await client.mutation(startRef, { country: p.country, lat: p.lat, lng: p.lng });
  let row;
  for (let i = 0; i < 300; i++) {
    row = await client.query(watchRef, { fetchId });
    if (row.stage === "done" || row.stage === "failed") break;
    await sleep(400);
  }
  const ms = Date.now() - t0;
  const story = row.storyId ? await client.query(storyRef, { storyId: row.storyId }) : null;
  const rejected = row.stale + row.misplaced;
  return {
    country: p.country,
    // A frame on screen is a frame on screen: live and undated are both answers, cached is an
    // answer with an honest age. Only "empty" is the dead end the before number counted.
    outcome: row.error ? "error" : row.outcome,
    rung: cached ? "own-cache" : row.outcome === "cached" ? "held-frame" : "search",
    ageLabel: row.outcome === "live" ? "verified live" : row.outcome === "stale" ? "not live, age shown" : row.outcome === "undated" ? "age not verifiable" : null,
    seconds: Math.round(ms / 100) / 10,
    stage: row.stage,
    counts: { n: row.n, stale: row.stale, misplaced: row.misplaced, kept: row.kept, pages: row.pages },
    reconciles: rejected + row.kept === row.n,
    frameAgeMinutes: story?.capturedAt == null ? null : Math.round((Date.now() - story.capturedAt) / 60000),
    place: story?.place ?? null,
    sourcePage: story?.sourcePage ?? story?.sourceImageUrl ?? null,
    caption: story?.caption ?? null,
    headline: story?.headline ?? null,
    error: row.error ?? null,
  };
}

console.log(`${MODE === "start" ? "countries:start" : FN} on ${url.replace(/^https:\/\//, "")} · seed "${SEED}" · ${N} countries`);
console.log(picked.map((p) => p.country).join(", "));

const results = [];
let lastStart = 0;
for (const p of picked) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const wait = lastStart + PACE_MS - Date.now();
    if (lastStart && wait > 0) await sleep(wait);
    lastStart = Date.now();

    if (MODE === "start") {
      const row = await runStart(p);
      if (row.error === "rate-limited") {
        console.log(`  ${p.country}: rate-limited by the ladder itself — retrying (not counted)`);
        await sleep(PACE_MS);
        continue;
      }
      results.push(row);
      const c = row.counts;
      const tail =
        row.outcome === "empty" || row.outcome === "error"
          ? `${c.pages} pages · n=${c.n} stale=${c.stale} misplaced=${c.misplaced}${row.reconciles ? "" : " · COUNTS DO NOT RECONCILE"}`
          : `${row.place} · ${row.frameAgeMinutes == null ? "no source time" : `${row.frameAgeMinutes} min old`} · ${row.rung}`;
      console.log(`  ${String(row.outcome).padEnd(10)} ${p.country.padEnd(28)} ${String(row.seconds).padStart(5)}s  ${tail}`);
      break;
    }

    const t0 = Date.now();
    let card = null;
    let error = null;
    try {
      card = await client.action(ref, { country: p.country, lat: p.lat, lng: p.lng });
    } catch (e) {
      error = String(e?.message ?? e).slice(0, 300);
    }
    const ms = Date.now() - t0;
    if (card && RATE_LIMITED.test(card.caption ?? "")) {
      console.log(`  ${p.country}: rate-limited by the action itself — retrying (not counted)`);
      await sleep(PACE_MS);
      continue;
    }
    const live = card?.imageSource === "camera-frame";
    const row = {
      country: p.country,
      outcome: error ? "error" : live ? "live-frame" : "dead-end",
      seconds: Math.round(ms / 100) / 10,
      frameAgeMinutes: card?.frameAgeMinutes ?? null,
      sourcePage: card?.sourcePage ?? null,
      caption: card?.caption ?? null,
      error,
    };
    results.push(row);
    console.log(`  ${row.outcome.padEnd(10)} ${p.country.padEnd(28)} ${String(row.seconds).padStart(5)}s  ${live ? `${row.frameAgeMinutes} min old · ${row.sourcePage}` : (row.caption ?? row.error ?? "").slice(0, 90)}`);
    break;
  }
}

const count = (o) => results.filter((r) => r.outcome === o).length;
if (MODE === "start") {
  const answered = results.filter((r) => r.outcome && r.outcome !== "empty" && r.outcome !== "error");
  const summary = {
    mode: "start",
    seed: SEED,
    n: results.length,
    answered: answered.length,
    live: count("live"),
    stale: count("stale"),
    undated: count("undated"),
    cached: count("cached"),
    empty: count("empty"),
    error: count("error"),
    ownCache: results.filter((r) => r.rung === "own-cache").length,
    countsReconcile: results.every((r) => r.reconciles),
    withHeadline: results.filter((r) => r.headline).length,
    medianSeconds: [...results].sort((a, b) => a.seconds - b.seconds)[Math.floor(results.length / 2)]?.seconds ?? null,
  };
  writeFileSync(OUT, JSON.stringify({ summary, results }, null, 1));
  console.log(
    `\n${summary.empty + summary.error} of ${summary.n} dead-ended; ${summary.answered} put a frame on screen ` +
      `(${summary.live} verified live, ${summary.stale} real but not live, ${summary.undated} undated, ${summary.cached} from our own store).`,
  );
  console.log(`counts reconcile on every row: ${summary.countsReconcile} · median ${summary.medianSeconds}s · ${summary.ownCache} answered from our own cache`);
  console.log(`headline attached: ${summary.withHeadline} of ${summary.answered} stories`);
} else {
  const summary = { fn: FN, seed: SEED, n: results.length, liveFrame: count("live-frame"), deadEnd: count("dead-end"), error: count("error") };
  writeFileSync(OUT, JSON.stringify({ summary, results }, null, 1));
  console.log(`\n${summary.deadEnd + summary.error} of ${summary.n} dead-ended (${summary.deadEnd} no usable frame, ${summary.error} errors); ${summary.liveFrame} returned a live frame.`);
}
