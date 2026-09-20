// Finding a real camera frame on a scraped web page.
//
// The country click used to screenshot the whole page Firecrawl found — which, for a
// "live webcam" search, is usually a webcam DIRECTORY: logo, navbar, LOGIN / PREMIUM
// buttons and a grid of thumbnails. The narrator then honestly described "a web page".
// Some of those thumbnails are current camera frames — and some are years-old stills with
// "live" in the filename. This module picks the largest image that is both a photograph of
// a place (not chrome) and provably fresh (see frameAgeMs).
//
// Plain .js on purpose (like rank.js): countries.ts imports it inside Convex, and
// scripts/verify.mjs unit-tests the very same file under plain `node`.

// Anything whose URL, alt or class says it is site furniture rather than a view.
const NOT_A_VIEW =
  /logo|icon|sprite|banner|avatar|flag|badge|button|btn|advert|ads[-_/.]|doubleclick|pixel|tracking|spacer|blank|placeholder|loading|spinner|favicon|social|share|facebook|twitter|instagram|youtube|tiktok|whatsapp|app-?store|google-?play|premium|promo|thumb-?play|play-?button|arrow|chevron|close|menu|search|cart|profile|author|gravatar|emoji|captcha|qr-?code|map-?tile|staticmap/i;

const IMAGE_ATTRS = ["src", "data-src", "data-lazy-src", "data-original", "data-url", "data-full", "data-large"];
const SRCSET_ATTRS = ["srcset", "data-srcset"];

function attr(tag, name) {
  const re = new RegExp("[\\s\"']" + name + "\\s*=\\s*(\"([^\"]*)\"|'([^']*)'|([^\\s>]+))", "i");
  const m = re.exec(tag);
  if (!m) return null;
  return (m[2] ?? m[3] ?? m[4] ?? "").trim() || null;
}

// The biggest entry of a srcset ("a.jpg 320w, b.jpg 1280w" or "a.jpg 1x, b.jpg 2x").
function largestFromSrcset(srcset) {
  let best = null;
  let bestScore = -1;
  for (const part of srcset.split(",")) {
    const bits = part.trim().split(/\s+/);
    if (!bits[0]) continue;
    const d = bits[1] ?? "1x";
    const n = parseFloat(d);
    const score = Number.isFinite(n) ? (d.endsWith("w") ? n : n * 1000) : 0;
    if (score > bestScore) {
      bestScore = score;
      best = bits[0];
    }
  }
  return best;
}

function resolve(u, base) {
  try {
    const url = new URL(u, base);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

// Candidate image URLs from a page's HTML, in page order, site furniture removed.
// `labels` (optional) receives each kept URL's alt/title text — camera pages carry
// "popular cams elsewhere" sidebars, and the label is the cheapest way to tell them apart.
/**
 * @param {string} html
 * @param {string} pageUrl
 * @param {number} [max]
 * @param {Map<string, string> | null} [labels]
 * @returns {string[]}
 */
export function imageCandidates(html, pageUrl, max = 12, labels = null) {
  const out = [];
  const seen = new Set();
  const tags = String(html ?? "").match(/<(img|source)[^>]*>/gi) ?? [];
  for (const tag of tags) {
    const hint = [attr(tag, "alt"), attr(tag, "class"), attr(tag, "id"), attr(tag, "title")].join(" ");
    if (NOT_A_VIEW.test(hint)) continue;

    // Declared sizes that are clearly too small to be a camera frame.
    const w = parseInt(attr(tag, "width") ?? "", 10);
    const h = parseInt(attr(tag, "height") ?? "", 10);
    if ((Number.isFinite(w) && w < 200) || (Number.isFinite(h) && h < 120)) continue;

    const raw = [];
    for (const a of SRCSET_ATTRS) {
      const s = attr(tag, a);
      if (s) raw.push(largestFromSrcset(s));
    }
    for (const a of IMAGE_ATTRS) raw.push(attr(tag, a));

    for (const r of raw) {
      if (!r || r.startsWith("data:")) continue;
      const url = resolve(r, pageUrl);
      if (!url || seen.has(url)) continue;
      const path = url.split("?")[0].toLowerCase();
      if (/\.(svg|gif|ico)$/.test(path)) continue;
      if (NOT_A_VIEW.test(url)) continue;
      seen.add(url);
      out.push(url);
      if (labels) labels.set(url, [attr(tag, "alt"), attr(tag, "title")].filter(Boolean).join(" "));
      break; // one URL per tag: the best one it offers
    }
    if (out.length >= max) break;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Real pixel dimensions, read from the file header rather than trusted from markup.
// ---------------------------------------------------------------------------
function jpegSize(b) {
  if (b[0] !== 0xff || b[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) {
      i++;
      continue;
    }
    const marker = b[i + 1];
    if (marker === 0xff) {
      i++;
      continue;
    }
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2;
      continue;
    }
    const len = (b[i + 2] << 8) | b[i + 3];
    // SOF0..SOF15, except DHT (C4), JPG (C8) and DAC (CC), carry the frame size.
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { type: "jpeg", height: (b[i + 5] << 8) | b[i + 6], width: (b[i + 7] << 8) | b[i + 8] };
    }
    if (len < 2) return null;
    i += 2 + len;
  }
  return null;
}

function pngSize(b) {
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (b.length < 24 || !sig.every((v, k) => b[k] === v)) return null;
  const u32 = (o) => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
  return { type: "png", width: u32(16), height: u32(20) };
}

function webpSize(b) {
  const s = (o, n) => String.fromCharCode(...b.slice(o, o + n));
  if (b.length < 30 || s(0, 4) !== "RIFF" || s(8, 4) !== "WEBP") return null;
  const chunk = s(12, 4);
  if (chunk === "VP8 ") {
    return { type: "webp", width: (b[26] | (b[27] << 8)) & 0x3fff, height: (b[28] | (b[29] << 8)) & 0x3fff };
  }
  if (chunk === "VP8L") {
    return {
      type: "webp",
      width: 1 + (((b[22] & 0x3f) << 8) | b[21]),
      height: 1 + (((b[24] & 0x0f) << 10) | (b[23] << 2) | ((b[22] & 0xc0) >> 6)),
    };
  }
  if (chunk === "VP8X") {
    return {
      type: "webp",
      width: 1 + (b[24] | (b[25] << 8) | (b[26] << 16)),
      height: 1 + (b[27] | (b[28] << 8) | (b[29] << 16)),
    };
  }
  return null;
}

export function imageSize(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  return jpegSize(b) ?? pngSize(b) ?? webpSize(b);
}

// Does this look like a camera frame — a landscape photograph of a real place?
// Logos and icons are small; banners are extreme letterboxes; photos are JPEG/WebP. Size alone
// is not trust, though: see frameAgeMs — a perfectly sized photo can be years old.
//
// The floor was 320x180 and let directory thumbnails through. Measured on the pages the country
// search actually returns: aggregator sites (SkylineWebcams, worldcam) surround a video player
// with a grid of 344x193 previews of cameras in OTHER countries, indistinguishable by URL from
// the page's own preview. Judging them cost a vision call each and came back "somewhere else"
// every time, so the floor now sits above the grid: a frame worth broadcasting is 400 across.
export function isCameraFrame(info, byteLength) {
  if (!info || !info.width || !info.height) return false;
  const aspect = info.width / info.height;
  if (info.width < 400 || info.height < 225) return false;
  if (aspect < 1.2 || aspect > 2.6) return false; // portrait art or a banner strip
  if (info.type === "png") {
    // PNG is mostly UI art; allow it only when it's large, as photos in PNG are.
    return byteLength >= 150_000 && info.width >= 640;
  }
  return byteLength >= 12_000;
}

// ---------------------------------------------------------------------------
// The public camera index.
// ---------------------------------------------------------------------------
// A web search for "<country> live webcam" returns aggregators whose live view is a video
// stream and whose only stills are promo art from 2022 and thumbnails of other countries.
// opencctv.org instead lists registered public cameras per country and carries Windy's camera
// id in each card. Windy's origin CDN is the one source checked here whose Last-Modified
// survives comparison with the timestamp a camera burns into its own frame — and which
// reports a dead camera as hours old instead of restamping it as new.
//
// Deliberately NOT opencctv's own /api/feed proxy: it rewrites Last-Modified to the moment it
// serves the bytes, which is the same lie the image CDNs tell.

/** Cameras a country index page lists: the feed id on each card, the name it gives, and the
 *  detail page that names the real origin when the card is not a Windy camera. */
export function publicIndexCards(html, max = 12) {
  const out = [];
  const seen = new Set();
  const card = /<a[^>]+href="(\/cameras\/[^"]+)"[^>]*>\s*<img[^>]+src="[^"]*\/api\/feed\/([^"?&]+)[^"]*"[^>]*\salt="([^"]*)"/g;
  for (const m of String(html ?? "").matchAll(card)) {
    if (seen.has(m[2])) continue;
    seen.add(m[2]);
    out.push({ id: m[2], name: decodeEntities(m[3]).trim() || null, detail: m[1] });
    if (out.length >= max) break;
  }
  return out;
}

/** Windy cameras, by id. Kept as its own reading because a Windy id needs no detail page:
 *  the origin URL follows from the id alone. */
export function publicIndexCameras(html, max = 6) {
  const seen = new Map();
  for (const c of publicIndexCards(html, 64)) {
    const id = windyId(c.id);
    if (id && !seen.has(id)) seen.set(id, c.name);
  }
  // Cards render lazily on some pages; the preload hints still name every id.
  for (const m of String(html ?? "").matchAll(/\/api\/feed\/windy-(\d+)/g)) {
    if (!seen.has(m[1])) seen.set(m[1], null);
  }
  return [...seen].slice(0, max).map(([id, name]) => ({ id, name }));
}

/** The camera id inside a Windy feed id, or null when the card is some other source. */
export function windyId(feedId) {
  const m = /^windy-(\d+)$/.exec(String(feedId ?? ""));
  return m ? m[1] : null;
}

/** The origin image a detail page names. Never opencctv's own /api/feed proxy, which stamps
 *  Last-Modified with the moment it served the bytes; the whole point of reading the detail
 *  page is to get past that to the camera's own host. */
export function originImage(html) {
  for (const m of String(html ?? "").matchAll(/https?:\/\/[^"'\s)<>]+\.(?:jpg|jpeg|webp|png)(?:\?[^"'\s)<>]*)?/gi)) {
    const u = m[0];
    if (/opencctv\.org/i.test(u)) continue;
    if (NOT_A_VIEW.test(u)) continue;
    return u;
  }
  return null;
}

/** Windy's origin frame for a camera id — never a proxy in front of it. */
export function windyFrameUrl(id) {
  return `https://imgproxy.windy.com/_/full/plain/current/${id}/original.jpg`;
}

/** The place a camera's name is about. Index cameras are named for the operator's benefit —
 *  "Prizren › West: Ambient Restaurant", "Lima: Av Javier prado" — and the slot this lands in
 *  is set in Newsreader at 18px, where the qualifiers read as noise. The full name still
 *  appears on the source line underneath. */
export function placeName(cameraName) {
  const first = String(cameraName ?? "").split(/\s*[›»|:]\s*/)[0].trim();
  return first.slice(0, 40) || null;
}

/** The index's slugs are plain: lowercase, unaccented, hyphenated. */
export function countrySlug(name) {
  return String(name ?? "")
    .normalize("NFKD")
    .replace(new RegExp("[\\u0300-\\u036f]", "g"), "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function decodeEntities(s) {
  return String(s)
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

// ---------------------------------------------------------------------------
// Freshness. A "live" frame must PROVE it is current.
// ---------------------------------------------------------------------------
// Checked against real pages: SkylineWebcams serves thumbnails named live1825.jpg whose
// Last-Modified is October 2022, and YouTube's maxresdefault_live.jpg is a channel's promo
// artwork with no Last-Modified at all. Both are real photos of real places, and both
// would have been narrated as "right now". So a frame needs a Last-Modified inside this
// window, measured against the serving host's own Date header to dodge clock skew.
export const MAX_FRAME_AGE_MS = 3 * 60 * 60 * 1000;

/** True when the frame's own light flatly contradicts the sun where it claims to be. The
 *  windows are deliberately narrow — 22:00-03:00 and 10:00-15:00 — so dusk, dawn, a winter
 *  afternoon, floodlights and the hour or two of error in a longitude-derived timezone never
 *  trip it. Skipped above 60 degrees, where a midnight sun or a polar night makes the whole
 *  test meaningless. */
export function contradictsSun(daylight, lat, lng, now = Date.now()) {
  if (Math.abs(lat) > 60) return false;
  const hour = new Date(now + Math.round(lng / 15) * 3600 * 1000).getUTCHours();
  const deepNight = hour >= 22 || hour < 3;
  const broadDay = hour >= 10 && hour < 15;
  return (daylight && deepNight) || (!daylight && broadDay);
}


export function frameAgeMs(lastModified, date, now = Date.now()) {
  const lm = Date.parse(lastModified ?? "");
  if (!Number.isFinite(lm)) return null; // no evidence either way
  const ref = Date.parse(date ?? "");
  const age = Math.max(0, (Number.isFinite(ref) ? ref : now) - lm);
  // Last-Modified exactly equal to the response Date is a proxy stamping the moment it served
  // the bytes, not a camera reporting when it took them — a real frame is written before it is
  // asked for. Proven on opencctv's /api/feed, which returned age 0 for bytes whose origin
  // said 6.5 h. A camera that genuinely lands inside the same second loses nothing but a
  // freshness claim it can spare.
  if (Number.isFinite(ref) && age === 0) return null;
  return age;
}

// Video pages never yield a verifiable frame (their thumbnails are cover art), so they
// are skipped before a scrape credit is spent on them.
const VIDEO_HOSTS =
  /(^|\.)(youtube\.com|youtu\.be|twitch\.tv|vimeo\.com|tiktok\.com|facebook\.com|instagram\.com|dailymotion\.com)$/i;

export function isVideoHost(url) {
  try {
    return VIDEO_HOSTS.test(new URL(url).hostname);
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Directory pages → camera pages.
//
// Web search for "<country> live webcam" mostly returns DIRECTORY pages (a country's list of
// cams), whose images are small, often stale thumbnails. The live frame is one click deeper,
// on the single camera's own page. These are the links worth that click: same site, deeper
// than the directory, shaped like a camera page, and — best — naming the place.
// ---------------------------------------------------------------------------
const NOT_A_CAMERA_PAGE =
  /(login|signin|signup|register|account|privacy|terms|cookie|contact|about|advert|newsletter|shop|cart|forum|blog|news|faq|help|search|tag\/|category\/|\/page\/\d|\?page=|#)/i;
const CAMERA_WORD = /(webcam|web-cam|livecam|live-cam|\bcam\b|camera|kamera|webkamera|\blive\b)/i;

function foldText(s) {
  return String(s ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

/** Up to `max` links from a directory page to single-camera pages, best first. `places` are
 *  names (country, city) whose appearance in the link text or path makes a link likelier to
 *  be the right camera. Pure: no network. */
export function cameraLinks(html, pageUrl, places = [], max = 6) {
  let base;
  try {
    base = new URL(pageUrl);
  } catch {
    return [];
  }
  const basePath = base.pathname.replace(/\/+$/, "");
  const baseDepth = basePath.split("/").filter(Boolean).length;
  // places[0] is the country, the rest are cities: a link naming the city is the likeliest
  // camera of all, one naming only the country next.
  const [country, ...cities] = places.map(foldText);
  const seen = new Set();
  const out = [];
  const re = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  let m;
  let order = 0;
  while ((m = re.exec(String(html ?? ""))) !== null) {
    const href = attr(`<a${m[1]}>`, "href");
    if (!href || /^(mailto:|tel:|javascript:)/i.test(href)) continue;
    let u;
    try {
      u = new URL(href, base);
    } catch {
      continue;
    }
    if (!/^https?:$/.test(u.protocol)) continue;
    if (u.hostname.replace(/^www\./, "") !== base.hostname.replace(/^www\./, "")) continue;
    u.hash = "";
    const path = u.pathname.replace(/\/+$/, "");
    const url = u.toString();
    if (seen.has(url) || path === basePath || basePath.startsWith(path)) continue;
    if (NOT_A_CAMERA_PAGE.test(u.pathname + u.search)) continue;
    const depth = path.split("/").filter(Boolean).length;
    const text = foldText(m[2].replace(/<[^>]*>/g, " "));
    const hay = `${text} ${foldText(path)}`;
    let score = 0;
    if (country && hay.includes(country)) score += 3;
    if (cities.some((c) => c && hay.includes(c))) score += 2;
    if (depth > baseDepth) score += 1;
    if (CAMERA_WORD.test(path) || CAMERA_WORD.test(text)) score += 1;
    if (score < 2) continue; // not deeper-and-camera-shaped, and not naming the place
    seen.add(url);
    out.push({ url, score, order: order++ });
  }
  return out
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .slice(0, max)
    .map((x) => x.url);
}
