import { action, internalAction, internalQuery, mutation, query, type ActionCtx, type MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { getWeather, localTimeFor, isNight, envOrNull, fetchOk } from "./lib";
import { takeLimit } from "./limits";
import { geoFor, polygonName } from "./geo";
import { markCountryVerified } from "./coverage";
import { toDataUri, describe } from "./providers";
import { visionComplete, parseJson, type ModelStateStore, type ModelMark } from "./vision";
import { SCORE_SCHEMA, SCORE_SYSTEM } from "./score";
import { lookupHeadline, type Headline } from "./news";
import {
  imageCandidates,
  imageSize,
  isCameraFrame,
  frameAgeMs,
  MAX_FRAME_AGE_MS,
  isVideoHost,
  cameraLinks,
  contradictsSun,
  windyFrameUrl,
  placeName,
} from "./frames.js";

// Click a country -> find a live view of it now.
//
// A ladder, cheapest rung first, because 14 of 15 random countries used to dead-end:
//   0. the channel's own cache — a pool camera in that country, or a story we already fetched
//   1. live search — three query formulations, five candidate pages, directory pages followed
//      one level down to the single-camera pages where the real frame lives
//   2. a frame we already hold, shown with its true age ("Not live · 6 h old")
//   3. an empty state that says which check failed, and offers the nearest countries that are
//      verified this minute
//
// Every rung writes its stage into the `fetches` row (C-08), and the counts reconcile:
// stale + misplaced = rejected, rejected + kept = n.
//
// PUBLIC and unauthenticated, and rung 1 spends Firecrawl credits and vision calls, so it sits
// behind two global ceilings. Worst case per click: 3 searches + 5 scrapes.
const BURST_LIMIT = 10;
const BURST_WINDOW_MS = 10 * 60 * 1000;
const DAILY_LIMIT = 50;
const DAILY_WINDOW_MS = 24 * 60 * 60 * 1000;

const PAGES_TO_SCRAPE = 5; // the paid ceiling: one credit each
const DOWNLOADS_PER_PAGE = 12;
const LINKS_PER_DIRECTORY = 3;
const MAX_CANDIDATES = 8; // frames actually worked through, each costing a vision call
const INDEX_CAMERAS = 5; // how many of a country's listed cameras we try before paying for search
const PAGES_PER_LAP = 2; // scrape a little, judge a little, go round again
/** However much is left to try, we stop opening pages after this and answer with what we have.
 *  Waiting out two rate limits took one search to 101 s, which is not a wait anyone should be
 *  asked to sit through with a globe spinning. */
const LADDER_DEADLINE_MS = 45_000;
const CANDIDATES_PER_LAP = 3;
const PER_PAGE_IN_BATCH = 2; // no single page may own a batch
const MAX_IMAGE_BYTES = 3_000_000;
const SCRAPE_MAX_AGE_MS = 10 * 60 * 1000;
/** Reuse a story this fresh instead of searching again. */
const REUSE_VERIFIED_MS = 30 * 60 * 1000;
const REUSE_UNDATED_MS = 10 * 60 * 1000;
/** The oldest a held frame may be and still be worth showing, labelled "Not live". */
const CACHED_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const VERIFIED_MS = MAX_FRAME_AGE_MS; // 3 h: the freshness window the whole product runs on

const NOT_A_VIEW = "NOT_A_VIEW";
const NOT_HERE = "NOT_HERE";

function narrator(country: string): string {
  return (
    `You narrate single frames from live public webcams in ${country}. Describe the real-world ` +
    "scene in ONE vivid sentence, no preamble. If this image is NOT a photograph of a real " +
    "place — a web page, a logo, a map, a chart, mostly text, an advert, or a blank or test " +
    `image — reply with exactly: ${NOT_A_VIEW}. If it clearly shows somewhere other than ` +
    `${country} — a recognisable landmark or city elsewhere — reply with ${NOT_HERE} followed by ` +
    `the place you recognise, like "${NOT_HERE}: Times Square". If you cannot name where it is, ` +
    `reply with exactly: ${NOT_HERE}.`
  );
}

/** The place a narrator named when it rejected a frame as somewhere else. Null when it only
 *  said NOT_HERE, which is the honest answer when it recognises nothing — the empty state then
 *  claims no location rather than naming one. */
export function elsewhereNamed(text: string): string | null {
  const m = /NOT_HERE\s*[:\-\u2014]\s*(.+)/i.exec(text);
  if (!m) return null;
  const place = m[1].split(/[.\n]/)[0].trim().replace(/^["'\u201c]+|["'\u201d]+$/g, "").slice(0, 48);
  return place || null;
}

function fold(s: string): string {
  return String(s ?? "").normalize("NFKD").replace(new RegExp("[\\u0300-\\u036f]", "g"), "").toLowerCase();
}

const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
  Accept: "image/avif,image/webp,image/jpeg,image/png,*/*",
};

type Cand = {
  url: string;
  page: string;
  cameraName: string | null;
  bytes: ArrayBuffer;
  type: string;
  width: number;
  height: number;
  /** The source's own timestamp. null = it sent none, so the age can never be claimed. */
  capturedAt: number | null;
  onTopic: boolean;
  /** The page's own view (its og:image), as opposed to a thumbnail of somewhere else. */
  primary: boolean;
};

/** Downloads one candidate; keeps it only if the file header says camera frame. */
async function download(url: string, page: string, cameraName: string | null, onTopic: boolean, primary = false): Promise<Cand | null> {
  try {
    const r = await fetch(url, { headers: { ...BROWSER_HEADERS, Referer: page } });
    if (!r.ok) return null;
    const type = r.headers.get("content-type") ?? "";
    if (!type.startsWith("image/")) return null;
    if (Number(r.headers.get("content-length") ?? 0) > MAX_IMAGE_BYTES) return null;
    const bytes = await r.arrayBuffer();
    if (bytes.byteLength > MAX_IMAGE_BYTES) return null;
    const info = imageSize(new Uint8Array(bytes));
    if (!info || !isCameraFrame(info, bytes.byteLength)) return null;
    const ageMs = frameAgeMs(r.headers.get("last-modified"), r.headers.get("date"));
    return {
      url,
      page,
      cameraName,
      bytes,
      type,
      width: info.width,
      height: info.height,
      capturedAt: ageMs === null ? null : Date.now() - ageMs,
      onTopic,
      primary,
    };
  } catch {
    return null;
  }
}

/** Rung 1: the public camera index. One page fetch, no key, no credits — and unlike the open
 *  web's aggregators, the frames it points at carry a Last-Modified we have checked against
 *  the timestamps cameras burn into their own pictures. `camera: false` countries never get
 *  here, and a country the index doesn't list simply returns nothing and falls to rung 2. */
async function fromPublicIndex(ctx: ActionCtx, country: string): Promise<Cand[]> {
  // Straight from our own table. Nothing here touches the index over the network: if it is
  // down or has dropped a page mid-demo, a row we already hold still answers.
  const row: Doc<"coverage"> | null = await ctx.runQuery(internal.coverage.forCountry, { country });
  if (!row || !row.cameras.length) return [];

  const page = `https://opencctv.org/cameras/${row.slug}`;
  const frames = await Promise.all(
    row.cameras
      .slice(0, INDEX_CAMERAS * 2)
      .map((cam) => download(cam.url ?? windyFrameUrl(cam.id), page, cam.name ?? null, true, true)),
  );
  const found = frames.filter((f): f is Cand => f !== null);
  if (!found.length) return [];

  // Freshest first, so the vision calls are spent on the frames most likely to air. Cameras
  // legitimately stop sending after dark, which is why a country lists six and has one awake.
  const fresh = (c: Cand) => c.capturedAt != null && Date.now() - c.capturedAt <= VERIFIED_MS;
  found.sort((a, b) => Number(fresh(b)) - Number(fresh(a)) || (b.capturedAt ?? 0) - (a.capturedAt ?? 0));
  const shortlist = found.slice(0, INDEX_CAMERAS);
  console.log(
    `[meanwhile] ${country}: coverage holds ${row.cameras.length} camera(s) — ${found.length} answered, ${found.filter(fresh).length} fresh, judging ${shortlist.length}`,
  );
  return shortlist;
}

type Scraped = { frames: Cand[]; links: string[]; title: string | null; ok: boolean };

/** One page: its camera frames, and — if it turns out to be a directory — the camera pages it
 *  links to. Directories are most of what a web search returns; the live frame is one deeper. */
async function scrapePage(key: string, page: string, country: string, city: string): Promise<Scraped> {
  const r = await fetchOk(`firecrawl scrape ${page}`, "https://api.firecrawl.dev/v2/scrape", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ url: page, formats: ["html"], onlyMainContent: false, maxAge: SCRAPE_MAX_AGE_MS }),
  });
  if (!r) return { frames: [], links: [], title: null, ok: false };
  const j: any = await r.json().catch(() => null);
  if (j?.success === false) {
    console.error(`[meanwhile] firecrawl refused to scrape ${page}: ${JSON.stringify(j)?.slice(0, 200)}`);
    return { frames: [], links: [], title: null, ok: false };
  }
  const meta = j?.data?.metadata ?? {};
  const html: string = j?.data?.html ?? "";
  const pageUrl: string = meta.sourceURL ?? meta.url ?? page;
  // A page title becomes the place name under --ff-place, where "Webcams in Nairobi" reads as
  // a directory listing rather than a city. Strip the wrapper and keep the place.
  const title: string | null =
    typeof meta.title === "string"
      ? meta.title
          .split(/[|–—]/)[0]
          .trim()
          .replace(/^(live\s+)?web\s?cams?\s+(in|of|from)\s+/i, "")
          .trim()
          .slice(0, 60) || null
      : null;

  // An aggregator's page is usually a video player surrounded by thumbnails of other
  // countries' cameras; the only still of THIS camera is the card image. It is the one frame
  // on the page we can trust to be about the place we asked for.
  const og = [meta.ogImage, meta["og:image"], meta.twitterImage, meta["twitter:image"]]
    .flat()
    .filter((u: unknown): u is string => typeof u === "string");
  const isOwnView = new Set(og);
  const labels = new Map<string, string>();
  const urls = [...new Set([...og, ...imageCandidates(html, pageUrl, 24, labels)])];
  const onTopic = (u: string) => {
    const hay = fold(`${labels.get(u) ?? ""} ${u}`);
    return hay.includes(fold(country)) || hay.includes(fold(city));
  };
  const isPhoto = (u: string) => /\.(jpe?g|webp)(\?|$)/i.test(u);
  const ranked = urls
    .map((u, i) => ({ u, i }))
    .sort(
      (a, b) =>
        (isOwnView.has(b.u) ? 1 : 0) - (isOwnView.has(a.u) ? 1 : 0) ||
        (onTopic(b.u) ? 1 : 0) - (onTopic(a.u) ? 1 : 0) ||
        (isPhoto(b.u) ? 1 : 0) - (isPhoto(a.u) ? 1 : 0) ||
        a.i - b.i,
    )
    .slice(0, DOWNLOADS_PER_PAGE)
    .map((x) => x.u);

  const frames = (await Promise.all(ranked.map((u) => download(u, pageUrl, title, onTopic(u), isOwnView.has(u))))).filter(
    (f): f is Cand => f !== null,
  );
  const links = cameraLinks(html, pageUrl, [country, city], LINKS_PER_DIRECTORY);
  console.log(
    `[meanwhile] ${pageUrl}: ${urls.length} images, checked ${ranked.length} — ${frames.length} camera frames, ${links.length} camera links`,
  );
  return { frames, links, title, ok: true };
}

type Counts = { n: number; stale: number; misplaced: number; kept: number; pages: number; oldestAt?: number; elsewhere?: string };
type Kept = { cand: Cand; caption: string; score?: number; tags?: string[] };
export type LadderResult =
  | { outcome: "live" | "stale" | "undated" | "cached"; storyId: Id<"stories">; counts: Counts }
  | { outcome: "empty"; counts: Counts };

type Report = (patch: Record<string, unknown>) => Promise<void>;

function modelState(ctx: ActionCtx): ModelStateStore {
  return {
    blocked: async (prov, keyTag): Promise<ModelMark[]> => await ctx.runQuery(internal.modelState.blocked, { provider: prov, keyTag }),
    mark: async (prov, keyTag, m): Promise<void> => {
      await ctx.runMutation(internal.modelState.mark, { provider: prov, keyTag, ...m });
    },
  };
}

/** Rung 1–3. Rung 0 (the channel's own cache) is answered in `start`, before any of this runs. */
async function runLadder(
  ctx: ActionCtx,
  { country, lat, lng, report }: { country: string; lat: number; lng: number; report: Report },
): Promise<LadderResult> {
  const { common, city, camera } = geoFor(country);
  const startedAt = Date.now();
  const counts: Counts = { n: 0, stale: 0, misplaced: 0, kept: 0, pages: 0 };
  const key = envOrNull("FIRECRAWL_KEY");
  const searchable = key && envOrNull("DEMO_MODE") !== "1" && camera !== false;

  const kept: Kept[] = [];
  const judged = new Set<string>();
  let shown = 0;
  // A box rather than a `let`: it is written inside `judge` and read after it, which plain
  // control-flow narrowing would otherwise decide is always null.
  const newestStale: { frame: Cand | null } = { frame: null };

  /** Work through frames in order: pull each again, reject what is too old or somewhere else,
   *  and keep what survives. Shared by both rungs, so the counts on screen mean the same thing
   *  wherever the frame came from. */
  const judge = async (batch: Cand[]): Promise<void> => {
    for (const c of batch) {
      judged.add(c.url);
      // Counted separately from `judged`, because a frame that turns out not to be a view
      // leaves n — and "checking 2 of 1" is not a sentence we are willing to put on screen.
      shown++;
      const i = shown;
      await report({ stage: "pulling", i, n: counts.n, cameraName: c.cameraName });
      // Pull it again: a camera moves on, and the second copy carries a fresher timestamp.
      const again = await download(c.url, c.page, c.cameraName, c.onTopic, c.primary);
      const frame = again ?? c;
      const ageMs = frame.capturedAt == null ? null : Date.now() - frame.capturedAt;
      await report({ stage: "checking", i, frameAgeMs: ageMs });

      if (ageMs != null && ageMs > MAX_FRAME_AGE_MS) {
        counts.stale++;
        counts.oldestAt = Math.min(counts.oldestAt ?? Infinity, frame.capturedAt!);
        // Keep the freshest of them to one side. If nothing live turns up, a real view of the
        // place with its true age on it beats an empty screen — that is what COPY's
        // "Not live · 6 h old" is for. Older than a day and it is history, not a view.
        if (ageMs <= CACHED_MAX_AGE_MS && (!newestStale.frame || frame.capturedAt! > newestStale.frame.capturedAt!)) newestStale.frame = frame;
        await report({ stage: "checking", i, stale: counts.stale, oldestAt: counts.oldestAt });
        continue;
      }

      const said = await visionComplete({
        label: `narrate ${common}`,
        system: narrator(common),
        text: `${common}, local time ${localTimeFor(Math.round(lng / 15))}.`,
        dataUri: toDataUri(frame.bytes, frame.type),
        maxTokens: 1024,
        state: modelState(ctx),
      });
      const text = said?.text.trim() ?? "";
      if (text.toUpperCase().includes(NOT_HERE)) {
        counts.misplaced++;
        // Keep the first place a narrator could actually name, so the empty state can say where
        // the frame was filmed instead of naming Times Square for every country in the world.
        const named = elsewhereNamed(text);
        if (named && !counts.elsewhere) counts.elsewhere = named;
        await report({
          stage: "checking",
          i,
          misplaced: counts.misplaced,
          ...(counts.elsewhere ? { elsewhere: counts.elsewhere } : {}),
        });
        console.warn(`[meanwhile] ${country}: ${frame.url} is somewhere else${named ? ` (${named})` : ""}`);
        continue;
      }
      if (text.toUpperCase().includes(NOT_A_VIEW)) {
        // Not a camera frame after all — the size filter let a map or a poster through. It
        // never was a candidate, so it leaves n rather than becoming a rejection it isn't.
        counts.n--;
        shown--;
        await report({ stage: "checking", i, n: counts.n });
        console.warn(`[meanwhile] ${country}: ${frame.url} is not a view`);
        continue;
      }
      counts.kept++;
      kept.push({ cand: frame, caption: text });
      await report({ stage: "checking", i, kept: counts.kept });
    }
  };

  // --- rung 1: the public camera index — free, and its timestamps hold up ----------------
  if (camera !== false && envOrNull("DEMO_MODE") !== "1") {
    await report({ stage: "searching" });
    const listed = await fromPublicIndex(ctx, country);
    if (listed.length) {
      counts.n += listed.length;
      await report({ stage: "candidates", n: counts.n });
      await judge(listed);
    }
  }

  // --- rung 2: the open web, which costs credits and is mostly aggregators ---------------
  if (!kept.length && searchable) {
    await report({ stage: "searching" });

    // --- three formulations, because one phrasing finds one kind of page ------------------
    const queries = [`${common} live webcam`, `${city} live webcam`, `${common} traffic camera live`];
    const results = await Promise.all(
      queries.map(async (query) => {
        const s = await fetchOk(`firecrawl search ${query}`, "https://api.firecrawl.dev/v2/search", {
          method: "POST",
          headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
          body: JSON.stringify({ query, limit: 5, sources: [{ type: "web" }] }),
        });
        const j: any = s ? await s.json().catch(() => null) : null;
        const rows: any[] = j?.data?.web ?? (Array.isArray(j?.data) ? j.data : []);
        return rows.map((x) => x?.url).filter((u): u is string => typeof u === "string" && /^https?:/.test(u));
      }),
    );

    // Round-robin so one query can't own the whole queue; deep URLs look like a single camera
    // rather than a country index, so they go first.
    const queue: string[] = [];
    for (let i = 0; i < 5; i++) for (const list of results) if (list[i] && !queue.includes(list[i])) queue.push(list[i]);
    const depth = (u: string) => {
      try {
        return new URL(u).pathname.split("/").filter(Boolean).length;
      } catch {
        return 0;
      }
    };
    const pages = queue.filter((u) => !isVideoHost(u)).sort((a, b) => depth(b) - depth(a));
    if (pages.length < queue.length) console.log(`[meanwhile] ${country}: skipped ${queue.length - pages.length} video page(s)`);

    // --- scrape and judge in laps --------------------------------------------------------
    // A lap scrapes a couple of pages, judges a page-diverse handful of frames, and goes round
    // again if nothing cleared. The first cut of this searched once and judged once, so a
    // single aggregator's grid of thumbnails — every one of them a camera somewhere else —
    // spent the whole budget on the first page and the other four were never opened.
    const cands: Cand[] = [];
    const seenUrl = new Set<string>();
    const visited = new Set<string>();

    let misses = 0;
    const scrapeLap = async () => {
      let opened = 0;
      while (opened < PAGES_PER_LAP && pages.length && counts.pages < PAGES_TO_SCRAPE && Date.now() - startedAt < LADDER_DEADLINE_MS) {
        const page = pages.shift()!;
        if (visited.has(page)) continue;
        visited.add(page);
        const { frames, links, ok } = await scrapePage(key!, page, common, city);
        // "5 pages" has to mean five pages we read. A page we never got is not one of them.
        if (!ok) {
          misses++;
          if (misses >= 2) return;
          continue;
        }
        counts.pages++;
        opened++;
        for (const f of frames) {
          if (seenUrl.has(f.url)) continue;
          seenUrl.add(f.url);
          cands.push(f);
        }
        // Camera links are followed whether or not the page had frames of its own. A page that
        // gave us nothing on topic is a directory, so its links go to the front of the queue;
        // one that did goes to the back, behind the other search results.
        const links2 = links.filter((l) => !visited.has(l) && !pages.includes(l));
        if (frames.some((f) => f.onTopic || f.primary)) pages.push(...links2);
        else pages.unshift(...links2);
        await report({ stage: "searching", pages: counts.pages });
      }
    };

    // The page's own view first, then what's on topic, then what carries a knowable age. The
    // age bonus sits below the first two on purpose: a thumbnail of a camera in another country
    // is genuinely live, and ranking on freshness alone hands it the whole batch.
    const rank = (c: Cand) =>
      (c.primary ? 6 : 0) +
      (c.onTopic ? 8 : 0) +
      (c.capturedAt != null && Date.now() - c.capturedAt <= VERIFIED_MS ? 4 : 0) +
      (c.capturedAt != null ? 2 : 0);

    /** The next few frames to judge: best first, at most two from any one page. */
    const nextBatch = (): Cand[] => {
      const lanes = new Map<string, Cand[]>();
      for (const c of [...cands].sort((a, b) => rank(b) - rank(a) || b.width * b.height - a.width * a.height)) {
        if (judged.has(c.url)) continue;
        const lane = lanes.get(c.page) ?? [];
        if (lane.length < PER_PAGE_IN_BATCH) lane.push(c);
        lanes.set(c.page, lane);
      }
      const batch: Cand[] = [];
      for (let i = 0; i < PER_PAGE_IN_BATCH; i++)
        for (const lane of lanes.values()) {
          if (lane[i] && batch.length < Math.min(CANDIDATES_PER_LAP, MAX_CANDIDATES - judged.size)) batch.push(lane[i]);
        }
      return batch;
    };

    while (counts.kept === 0 && judged.size < MAX_CANDIDATES && Date.now() - startedAt < LADDER_DEADLINE_MS) {
      const pagesBefore = counts.pages;
      await scrapeLap();
      const batch = nextBatch();
      if (!batch.length) {
        if (counts.pages === pagesBefore) break; // nothing left to open and nothing left to judge
        continue;
      }
      counts.n += batch.length;
      await report({ stage: "candidates", n: counts.n, pages: counts.pages });
      await judge(batch);
    }

    // Nothing live cleared, but something real was on the wire today: check it is a view of
    // this place, then show it with its age. It moves out of the rejected count as it does,
    // so the arithmetic on screen still adds up.
    if (!kept.length && newestStale.frame) {
      const i = shown + 1;
      await report({ stage: "pulling", i, n: counts.n, cameraName: newestStale.frame.cameraName });
      const said = await visionComplete({
        label: `narrate ${common}`,
        system: narrator(common),
        text: `${common}, local time ${localTimeFor(Math.round(lng / 15))}.`,
        dataUri: toDataUri(newestStale.frame.bytes, newestStale.frame.type),
        maxTokens: 1024,
        state: modelState(ctx),
      });
      const text = said?.text.trim() ?? "";
      const up = text.toUpperCase();
      if (text && !up.includes(NOT_HERE) && !up.includes(NOT_A_VIEW)) {
        counts.stale--;
        counts.kept++;
        kept.push({ cand: newestStale.frame, caption: text });
        console.log(`[meanwhile] ${country}: nothing live — showing a frame ${Math.round((Date.now() - newestStale.frame.capturedAt!) / 60000)} min old with its age`);
        await report({ stage: "checking", i, stale: counts.stale, kept: counts.kept });
      }
    }

    // We never got a page open. That is our failure, not the country's — say so, so the panel
    // offers a retry instead of reporting that the place has no cameras.
    if (!kept.length && counts.pages === 0 && misses > 0) throw new Error("couldn't reach the search");

    const rejected = counts.stale + counts.misplaced;
    if (rejected > 0)
      await report({
        stage: "rejected",
        stale: counts.stale,
        misplaced: counts.misplaced,
        kept: counts.kept,
        n: counts.n,
        ...(counts.elsewhere ? { elsewhere: counts.elsewhere } : {}),
      });
  }

  // --- score what cleared, and keep the best -------------------------------------------
  if (kept.length) {
    await report({ stage: "scoring", kept: counts.kept });
    await Promise.all(
      kept.map(async (k) => {
        const r = await visionComplete({
          label: `score ${common}`,
          system: SCORE_SYSTEM,
          text: `${common}, local time ${localTimeFor(Math.round(lng / 15))}.`,
          dataUri: toDataUri(k.cand.bytes, k.cand.type),
          jsonSchema: SCORE_SCHEMA,
          maxTokens: 1536,
          state: modelState(ctx),
        });
        const j = r ? parseJson(r.text) : null;
        k.score = typeof j?.beauty === "number" ? Math.max(0, Math.min(10, j.beauty)) : undefined;
        k.tags = Array.isArray(j?.tags) ? j.tags.slice(0, 6).map(String) : [];
        if (r) console.log(`[meanwhile] ${country}: scored ${k.cand.url} ${k.score} (${describe(r.provider, r.model)})`);

        // A Last-Modified header is a claim by the server, not by the camera. Image CDNs
        // restamp old frames as they re-serve them: the Nairobi frame that started this check
        // arrived "1 min old" and showed an overcast afternoon at 02:00 local, with January
        // burned into its own corner. When the picture and the clock disagree this plainly,
        // the timestamp has not earned teal — the frame stays, its age does not.
        if (typeof j?.daylight === "boolean" && k.cand.capturedAt != null && contradictsSun(j.daylight, lat, lng)) {
          console.warn(`[meanwhile] ${country}: ${k.cand.url} says ${j.daylight ? "day" : "night"} at ${localTimeFor(Math.round(lng / 15))} local — age not trusted`);
          k.cand = { ...k.cand, capturedAt: null };
        }
      }),
    );
    const verified = (k: Kept) => k.cand.capturedAt != null && Date.now() - k.cand.capturedAt <= VERIFIED_MS;
    kept.sort((a, b) => Number(verified(b)) - Number(verified(a)) || (b.score ?? 0) - (a.score ?? 0));
    const best = kept[0];
    // Every country story gets a headline, whichever rung found the frame — the index owns
    // finding pictures, Firecrawl owns the sentence underneath them. Asked for the place the
    // camera actually shows, falling back to the country, because "Bogotá today" returns
    // Bogotá's news and "Colombia today" returns the wire.
    const place = placeName(best.cand.cameraName) ?? common;
    // Ask for the town, fall back to the country. "Bogotá today" returns Bogotá's news, but a
    // camera is often in somewhere like Thuwal or Cha-am, where "today" returns nothing at all
    // — and a story with no headline was the result. Both lookups are cached, including the
    // miss, so the second one costs a search once per place and never again that hour.
    const news: Headline | null =
      (await lookupHeadline(ctx, { place, country: common, budget: "firecrawlSearch:public" })) ??
      (place !== common
        ? await lookupHeadline(ctx, { place: common, country: common, budget: "firecrawlSearch:public" })
        : null);
    const storageId = await ctx.storage.store(new Blob([best.cand.bytes], { type: best.cand.type }));
    const storyId: Id<"stories"> = await ctx.runMutation(internal.stories.put, {
      country,
      place,
      lat,
      lng,
      storageId,
      sourceImageUrl: best.cand.url,
      sourcePage: best.cand.page,
      cameraName: best.cand.cameraName ?? undefined,
      capturedAt: best.cand.capturedAt,
      score: best.score,
      caption: best.caption,
      tags: best.tags ?? [],
      headline: news?.title,
      headlineUrl: news?.url,
      via: "search",
    });
    // live = fresh from the source's own clock; stale = real, older, and labelled with its age;
    // undated = the source never said when, so the age is never claimed.
    const outcome = verified(best) ? "live" : best.cand.capturedAt != null ? "stale" : "undated";
    console.log(
      `[meanwhile] ${country}: ${outcome} frame ${best.cand.url} from ${best.cand.page}` +
        (best.cand.capturedAt ? `, ${Math.round((Date.now() - best.cand.capturedAt) / 60000)} min old` : ", no source timestamp"),
    );
    // The globe's tint is a record of frames that proved current, so only "live" writes it.
    if (outcome === "live") await ctx.runMutation(internal.coverage.markVerified, { country });
    await report({ stage: "done", outcome, storyId, n: counts.n, kept: counts.kept });
    return { outcome, storyId, counts };
  }

  // --- a frame we already hold, with its true age --------------------------------------
  const held = await ctx.runQuery(internal.stories.latestForCountry, { country });
  if (held && held.capturedAt != null && Date.now() - held.capturedAt <= CACHED_MAX_AGE_MS) {
    console.log(`[meanwhile] ${country}: nothing live — showing a held frame from ${new Date(held.capturedAt).toISOString()}`);
    await report({ stage: "done", outcome: "cached", storyId: held._id, n: counts.n });
    return { outcome: "cached", storyId: held._id, counts };
  }

  await report({
    stage: "done",
    outcome: "empty",
    n: counts.n,
    stale: counts.stale,
    misplaced: counts.misplaced,
    kept: 0,
    pages: counts.pages,
    ...(counts.oldestAt ? { oldestAt: counts.oldestAt } : {}),
  });
  console.warn(`[meanwhile] ${country}: nothing to show — ${counts.n} candidates, ${counts.stale} stale, ${counts.misplaced} elsewhere, ${counts.pages} pages`);
  return { outcome: "empty", counts };
}

// ---------------------------------------------------------------------------------------
// Public surface
// ---------------------------------------------------------------------------------------

/** Rung 0, answered without spending anything: a pool camera in that country, or a story we
 *  fetched recently. Returns the story to show, or null. */
async function fromOwnCache(
  ctx: MutationCtx,
  country: string,
): Promise<{ storyId: Id<"stories">; outcome: "live" | "undated" } | null> {
  const now = Date.now();
  const story: Doc<"stories"> | null = (
    await ctx.db
      .query("stories")
      .withIndex("by_country_at", (q) => q.eq("country", country))
      .order("desc")
      .take(1)
  )[0] ?? null;
  if (story) {
    const verified = story.capturedAt != null && now - story.capturedAt <= VERIFIED_MS;
    if (verified && now - story.at <= REUSE_VERIFIED_MS) {
      await markCountryVerified(ctx, country);
      return { storyId: story._id, outcome: "live" };
    }
    if (story.capturedAt == null && now - story.at <= REUSE_UNDATED_MS) return { storyId: story._id, outcome: "undated" };
  }

  // A camera the channel already watches in that country, whose frame is verified fresh.
  const cameras: Doc<"cameras">[] = await ctx.db
    .query("cameras")
    .withIndex("by_active", (q) => q.eq("active", true))
    .collect();
  let best: { snap: Doc<"snapshots">; cam: Doc<"cameras"> } | null = null;
  for (const cam of cameras) {
    if (polygonName(cam.country) !== country) continue;
    const snap: Doc<"snapshots"> | undefined = (
      await ctx.db
        .query("snapshots")
        .withIndex("by_camera", (q) => q.eq("cameraId", cam._id))
        .order("desc")
        .take(1)
    )[0];
    if (!snap?.storageId || snap.capturedAt == null || now - snap.capturedAt > VERIFIED_MS) continue;
    if (!best || snap.score > best.snap.score) best = { snap, cam };
  }
  if (!best) return null;
  const storyId: Id<"stories"> = await ctx.db.insert("stories", {
    country,
    place: best.cam.name,
    lat: best.cam.lat,
    lng: best.cam.lng,
    storageId: best.snap.storageId!,
    sourceImageUrl: best.snap.imageUrl ?? best.cam.ref,
    cameraName: best.cam.name,
    capturedAt: best.snap.capturedAt!,
    score: best.snap.score,
    caption: best.snap.caption,
    tags: best.snap.tags,
    headline: best.snap.headline,
    headlineUrl: best.snap.headlineUrl,
    via: "pool",
    at: now,
  });
  await markCountryVerified(ctx, country);
  // A pool camera only carries a headline if it happened to be the cut at the time. Every
  // country story gets one, so look it up for this story rather than leaving the card bare.
  if (!best.snap.headline) {
    await ctx.scheduler.runAfter(0, internal.news.attachToStory, {
      storyId,
      place: best.cam.name,
      country: geoFor(country).common,
    });
  }
  return { storyId, outcome: "live" };
}

/** Start a country fetch. Returns the row to subscribe to (C-08 reads it stage by stage). */
export const start = mutation({
  args: { country: v.string(), lat: v.number(), lng: v.number() },
  handler: async (ctx, { country, lat, lng }): Promise<{ fetchId: Id<"fetches">; cached: boolean }> => {
    const base = {
      country,
      lat,
      lng,
      n: 0,
      i: 0,
      stale: 0,
      misplaced: 0,
      kept: 0,
      pages: 0,
      startedAt: Date.now(),
      stageStartedAt: Date.now(),
    };

    // Rung 0: free, instant, and it spends no one's credits.
    const own = await fromOwnCache(ctx, country);
    if (own) {
      const fetchId = await ctx.db.insert("fetches", {
        ...base,
        stage: "done",
        outcome: own.outcome,
        storyId: own.storyId,
        finishedAt: Date.now(),
      });
      return { fetchId, cached: true };
    }

    const burst = await takeLimit(ctx, "fetchCountry:burst", BURST_LIMIT, BURST_WINDOW_MS);
    const daily = burst.ok ? await takeLimit(ctx, "fetchCountry:daily", DAILY_LIMIT, DAILY_WINDOW_MS) : { ok: false };
    if (!burst.ok || !daily.ok) {
      const fetchId = await ctx.db.insert("fetches", {
        ...base,
        stage: "failed",
        error: "rate-limited",
        finishedAt: Date.now(),
      });
      return { fetchId, cached: false };
    }

    const fetchId = await ctx.db.insert("fetches", { ...base, stage: "searching" });
    await ctx.scheduler.runAfter(0, internal.countries.run, { fetchId });
    return { fetchId, cached: false };
  },
});

export const run = internalAction({
  args: { fetchId: v.id("fetches") },
  handler: async (ctx, { fetchId }): Promise<void> => {
    const row: Doc<"fetches"> | null = await ctx.runQuery(internal.countries.row, { fetchId });
    if (!row) return;
    const report: Report = async (patch) => {
      await ctx.runMutation(internal.fetches.advance, { fetchId, ...(patch as { stage: string }) });
    };
    try {
      await runLadder(ctx, { country: row.country, lat: row.lat, lng: row.lng, report });
    } catch (e) {
      console.error(`[meanwhile] ${row.country}: fetch threw`, e);
      await report({ stage: "failed", error: String((e as Error)?.message ?? e).slice(0, 200) });
    }
  },
});

export const row = internalQuery({
  args: { fetchId: v.id("fetches") },
  handler: async (ctx, { fetchId }) => await ctx.db.get(fetchId),
});

/** The window a chip may call "verified live". The freshness ladder reserves that phrase for
 *  under an hour — 60 min to 3 h is "Verified", which is a weaker claim — and the chip's own
 *  label says live, so the offer has to mean it. An empty state offering a camera last seen
 *  two hours and fifty-eight minutes ago is not offering something working this minute. */
const CHIP_LIVE_MS = 60 * 60 * 1000;

/** Three countries whose latest frame proved itself within the hour, nearest to the click
 *  first — the offer an empty state makes. Never padded with anything older, and never with
 *  anything unverified: fewer chips is honest, a stale chip is not. */
export const verifiedNow = query({
  args: { exclude: v.optional(v.string()), lat: v.optional(v.number()), lng: v.optional(v.number()) },
  handler: async (ctx, { exclude, lat, lng }) => {
    const now = Date.now();
    const best = new Map<string, { country: string; capturedAt: number; lat: number; lng: number }>();
    const offer = (country: string, capturedAt: number, la: number, ln: number) => {
      if (country === exclude) return;
      const prev = best.get(country);
      if (!prev || prev.capturedAt < capturedAt) best.set(country, { country, capturedAt, lat: la, lng: ln });
    };

    for (const cam of await ctx.db
      .query("cameras")
      .withIndex("by_active", (q) => q.eq("active", true))
      .collect()) {
      const snap = (
        await ctx.db
          .query("snapshots")
          .withIndex("by_camera", (q) => q.eq("cameraId", cam._id))
          .order("desc")
          .take(1)
      )[0];
      if (snap?.capturedAt != null && now - snap.capturedAt <= CHIP_LIVE_MS) {
        offer(polygonName(cam.country), snap.capturedAt, cam.lat, cam.lng);
      }
    }
    for (const s of await ctx.db.query("stories").withIndex("by_at").order("desc").take(60)) {
      if (s.capturedAt != null && now - s.capturedAt <= CHIP_LIVE_MS) offer(s.country, s.capturedAt, s.lat, s.lng);
    }

    const rows = [...best.values()];
    if (lat != null && lng != null) {
      const d2 = (r: { lat: number; lng: number }) => (r.lat - lat) ** 2 + ((r.lng - lng) * Math.cos((lat * Math.PI) / 180)) ** 2;
      rows.sort((a, b) => d2(a) - d2(b));
    } else {
      rows.sort((a, b) => b.capturedAt - a.capturedAt);
    }
    return rows.slice(0, 3).map(({ country, capturedAt }) => ({ country, capturedAt }));
  },
});

// ---------------------------------------------------------------------------------------
// The previous page's entry point, kept working until the new shell replaces it: the same
// ladder, returning the card shape it renders.
// ---------------------------------------------------------------------------------------
export type CountryCard = {
  place: string;
  country: string;
  tz: number;
  lat: number;
  lng: number;
  localTime: string;
  weather: string | null;
  isDay: boolean;
  imageUrl: string | null;
  tags: string[];
  headline: string | null;
  headlineUrl: string | null;
  caption: string;
  imageSource: "camera-frame" | "none";
  sourceImageUrl: string | null;
  sourcePage: string | null;
  frameAgeMinutes: number | null;
};

export const fetchCountry = action({
  args: { country: v.string(), lat: v.number(), lng: v.number() },
  handler: async (ctx, { country, lat, lng }): Promise<CountryCard> => {
    const tz = Math.round(lng / 15);
    const weather = await getWeather(lat, lng);
    const base: CountryCard = {
      place: country,
      country,
      tz,
      lat,
      lng,
      localTime: localTimeFor(tz),
      weather: weather?.text ?? null,
      isDay: weather?.isDay ?? !isNight(tz),
      imageUrl: null,
      tags: [],
      headline: null,
      headlineUrl: null,
      imageSource: "none",
      sourceImageUrl: null,
      sourcePage: null,
      frameAgeMinutes: null,
      caption: isNight(tz)
        ? `It's night in ${country} right now — city lights and quiet streets.`
        : `Daylight over ${country} right now.`,
    };

    const gate = await ctx.runMutation(internal.limits.take, { key: "fetchCountry:burst", limit: BURST_LIMIT, windowMs: BURST_WINDOW_MS });
    if (!gate.ok) return { ...base, caption: `${base.caption} (live pull rate-limited — try again shortly)` };
    const daily = await ctx.runMutation(internal.limits.take, { key: "fetchCountry:daily", limit: DAILY_LIMIT, windowMs: DAILY_WINDOW_MS });
    if (!daily.ok) return { ...base, caption: `${base.caption} (today's live-pull budget is spent)` };

    const result = await runLadder(ctx, { country, lat, lng, report: async () => {} });
    if (result.outcome === "empty") {
      return { ...base, caption: `No live camera frame for ${country} right now — here's the time and weather there.` };
    }
    const story = await ctx.runQuery(internal.stories.get, { storyId: result.storyId });
    if (!story) return base;
    return {
      ...base,
      place: story.place,
      imageUrl: story.frameUrl ?? story.sourceImageUrl,
      tags: story.tags,
      headline: story.headline ?? null,
      headlineUrl: story.headlineUrl ?? null,
      caption: story.caption,
      imageSource: "camera-frame",
      sourceImageUrl: story.sourceImageUrl,
      sourcePage: story.sourcePage ?? null,
      frameAgeMinutes: story.capturedAt == null ? null : Math.round((Date.now() - story.capturedAt) / 60000),
    };
  },
});

