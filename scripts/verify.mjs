// Mock-mode smoke test: no cloud creds, no deployment, no network.
//
// It exercises the REAL director rule — convex/rank.js is the same module the backend
// imports — rather than a copy of it, so a regression in the rule turns this red.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { pickCut, rankFeed, clampScore, MAX_SNAPSHOT_AGE_MS } from "../convex/rank.js";
import {
  imageCandidates,
  imageSize,
  isCameraFrame,
  frameAgeMs,
  MAX_FRAME_AGE_MS,
  isVideoHost,
  cameraLinks,
  contradictsSun,
  publicIndexCameras,
  publicIndexCards,
  windyId,
  originImage,
  windyFrameUrl,
  countrySlug,
  placeName,
  cameraTitle,
} from "../convex/frames.js";
import { trimHeadline } from "../convex/text.js";

const here = dirname(fileURLToPath(import.meta.url));
const fx = JSON.parse(readFileSync(join(here, "../legacy/fixtures.json"), "utf8"));

let pass = true;
function assert(cond, msg) {
  if (!cond) {
    pass = false;
    console.error("  ✗", msg);
  } else console.log("  ✓", msg);
}

console.log("Meanwhile — director verify (mock mode)");

// --- the rule, against the demo fixtures -----------------------------------
// Fixtures carry no `at`, so freshness is waived here and tested on its own below.
const cut = pickCut(fx.feed, { maxAgeMs: Infinity });
assert(cut != null, "a cut is selected from the feed");
assert(
  cut.score === Math.max(...fx.feed.map((s) => s.score)),
  "the selected cut is the top-scored frame",
);
assert(
  cut.camera && fx.cut.camera && cut.camera.name === fx.cut.camera.name,
  `fixtures.cut agrees with the rule (${fx.cut?.camera?.name} === ${cut?.camera?.name})`,
);
assert(
  fx.feed.every((s) => typeof s.score === "number" && s.score >= 0 && s.score <= 10),
  "every score is a valid 0-10 number",
);
assert(fx.countryDemo && fx.countryDemo.caption, "on-demand country fetch returns a narrated card");

// --- freshness: a stale masterpiece must not hold the channel ---------------
const now = 1_700_000_000_000;
const stale = { _id: "stale", score: 9.9, at: now - MAX_SNAPSHOT_AGE_MS - 1 };
const fresh = { _id: "fresh", score: 6.0, at: now - 60_000 };
assert(pickCut([stale, fresh], { now })?._id === "fresh", "a stale high score loses to a fresh one");
assert(pickCut([stale], { now }) === null, "nothing fresh means no cut at all");

// --- ties keep the incumbent, so the channel doesn't flap -------------------
const a = { _id: "a", score: 8, at: now };
const b = { _id: "b", score: 8, at: now };
assert(pickCut([a, b], { now })?._id === "a", "an equal score does not steal the cut");

// --- the feed is ranked and capped -----------------------------------------
const ranked = rankFeed(fx.feed, 3);
assert(ranked.length === 3, "the feed respects its limit");
assert(
  ranked.every((s, i) => i === 0 || ranked[i - 1].score >= s.score),
  "the feed is ordered by score, descending",
);

// --- junk from the model never reaches the database ------------------------
assert(clampScore("8.5") === 8.5, "a numeric string score is coerced");
assert(clampScore(99) === 10 && clampScore(-3) === 0, "out-of-range scores are clamped to 0-10");
assert(clampScore("refused") === null, "a non-numeric score is rejected outright");

// --- the country click must find a VIEW, not a website ----------------------
// Synthetic file headers with known sizes: frames.js must read real pixels, not markup.
const u16 = (n) => [(n >> 8) & 255, n & 255];
const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, ...new Array(14).fill(0),
  0xff, 0xc0, 0, 17, 8, ...u16(720), ...u16(1280), 3, ...new Array(9).fill(0)]);
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13,
  0x49, 0x48, 0x44, 0x52, 0, 0, 2, 128, 0, 0, 1, 104, 8, 2, 0, 0, 0]);
const le24 = (n) => [n & 255, (n >> 8) & 255, (n >> 16) & 255];
const webp = new Uint8Array([...Buffer.from("RIFF"), 0, 0, 0, 0, ...Buffer.from("WEBPVP8X"),
  10, 0, 0, 0, 0, 0, 0, 0, ...le24(1919), ...le24(1079)]);
assert(JSON.stringify(imageSize(jpeg)) === JSON.stringify({ type: "jpeg", height: 720, width: 1280 }), "reads JPEG dimensions from the SOF header");
assert(JSON.stringify(imageSize(png)) === JSON.stringify({ type: "png", width: 640, height: 360 }), "reads PNG dimensions from IHDR");
assert(JSON.stringify(imageSize(webp)) === JSON.stringify({ type: "webp", width: 1920, height: 1080 }), "reads WebP (VP8X) dimensions");
assert(imageSize(new Uint8Array([1, 2, 3, 4])) === null, "an unknown format is not guessed at");

const f = (type, width, height) => ({ type, width, height });
assert(isCameraFrame(f("jpeg", 1280, 720), 90_000), "a 1280x720 JPEG counts as a camera frame");
assert(!isCameraFrame(f("png", 180, 60), 4_000), "a logo does not");
assert(!isCameraFrame(f("jpeg", 1600, 200), 60_000), "a banner strip does not");
assert(!isCameraFrame(f("jpeg", 800, 1200), 90_000), "a portrait image does not");
assert(!isCameraFrame(f("png", 1280, 720), 40_000), "a light PNG (UI art) does not");

const page = `<header><img src="/img/logo.png" alt="Site logo"></header>
  <img src="https://cdn.cams.example/live/interlaken.jpg" width="640" height="360">
  <img data-src="/thumbs/a.jpg" srcset="/t/a-320.jpg 320w, /t/a-1280.jpg 1280w">
  <img src="/icons/premium-badge.png"><img src="/flags/ch.svg"><img src="/x.jpg" width="40" height="40">`;
const cands = imageCandidates(page, "https://www.cams.example/switzerland/");
assert(cands[0] === "https://cdn.cams.example/live/interlaken.jpg", "keeps a real camera thumbnail");
assert(cands.includes("https://www.cams.example/t/a-1280.jpg"), "takes the largest srcset entry and resolves it");
assert(!cands.some((u) => /logo|badge|\.svg|x\.jpg/.test(u)), "drops logos, badges, SVGs and icon-sized images");

assert(!isCameraFrame(f("jpeg", 344, 193), 21_000), "a 344x193 aggregator grid thumbnail does not");
assert(!isCameraFrame(f("jpeg", 300, 169), 31_000), "a 300x169 category tile beside it does not");
assert(isCameraFrame(f("jpeg", 640, 360), 40_000), "a 640x360 camera frame does");

// A server's Last-Modified is a claim; the light in the frame is evidence. This is the Nairobi
// frame that prompted the check: lng 37.8 rounds to +3, so 23:02 UTC is 02:02 local, and it
// arrived "1 min old" showing an overcast afternoon.
const utc = (h) => Date.UTC(2026, 8, 19, h, 0, 0);
assert(contradictsSun(true, 1.1, 37.8, utc(23)), "a daylight frame at 02:00 local is not from now");
assert(contradictsSun(false, 1.1, 37.8, utc(9)), "a night frame at 12:00 local is not either");
assert(!contradictsSun(true, 1.1, 37.8, utc(9)), "daylight at midday is exactly right");
assert(!contradictsSun(false, 1.1, 37.8, utc(23)), "night at 02:00 is exactly right");
assert(!contradictsSun(true, 1.1, 37.8, utc(5)), "08:00 is inside neither window");
assert(!contradictsSun(false, 1.1, 37.8, utc(14)), "17:00 dusk is left alone");
assert(!contradictsSun(true, 69.6, 18.9, utc(0)), "above 60 degrees the test is skipped");

// The public camera index: the card markup as opencctv.org actually serves it.
const INDEX_HTML = `
<link rel="preload" as="image" href="/api/feed/windy-1250234364?src=seo&amp;t=1&amp;s=zg">
<a href="/cameras/thailand/trat/chai-chet-73867"><img src="/api/feed/windy-1250234364?src=seo&amp;t=1&amp;s=zg" alt="Chai Chet Cape, Koh Chang" loading="lazy"></a>
<a href="/cameras/thailand/phetchaburi/cha-am-300553"><img src="/api/feed/windy-1474797356?src=seo" alt="Gulf of Siam at Cha-am" loading="lazy"></a>
<a href="/cameras/thailand/trat/chai-chet-73867"><img src="/api/feed/windy-1250234364?src=seo" alt="Chai Chet Cape, Koh Chang" loading="lazy"></a>
<a href="/cameras/thailand/x/cafe-9"><img src="/api/feed/windy-9999?src=seo" alt="Caf&#39;e &amp; Bar"></a>
`;

// The United States shape: every card points at the index's own restamping proxy, and the
// camera's real host is named one page down.
const US_HTML = `
<a href="/cameras/united-states/alaska/kachemak-bay-755"><img src="/api/feed/otcm-754?src=seo&amp;t=1" alt="Kachemak Bay at end of Main St" width="640"></a>
`;
const US_DETAIL = `
<meta property="og:image" content="https://opencctv.org/api/feed/otcm-754?src=seo">
<img src="https://opencctv.org/static/logo.png">
<img src="https://volcview.wr.usgs.gov/ashcam-api/images/webcams/homer-NE/current-medium.jpg">
`;
const cards = publicIndexCards(US_HTML, 8);
assert(cards.length === 1 && cards[0].id === "otcm-754", "a non-Windy card is still a camera");
assert(cards[0].detail === "/cameras/united-states/alaska/kachemak-bay-755", "and it carries the page that names its host");
assert(publicIndexCameras(US_HTML, 6).length === 0, "but it is not a Windy camera");
assert(windyId("windy-1250234364") === "1250234364" && windyId("otcm-754") === null, "the Windy id is read from the feed id");
assert(
  originImage(US_DETAIL) === "https://volcview.wr.usgs.gov/ashcam-api/images/webcams/homer-NE/current-medium.jpg",
  "the detail page's origin is the camera's own host, never the proxy and never the logo",
);
assert(originImage("<p>no images</p>") === null, "a page naming no origin resolves to none");
const listed = publicIndexCameras(INDEX_HTML, 6);
assert(listed.length === 3, "each camera is listed once, preload hints and repeats folded in");
assert(listed[0].name === "Chai Chet Cape, Koh Chang", "the card's alt text is the camera's name");
assert(listed[3 - 1].name === "Caf'e & Bar", "entities in a camera name are decoded");
assert(publicIndexCameras(INDEX_HTML, 2).length === 2, "and the list is capped");
assert(publicIndexCameras("<p>nothing here</p>").length === 0, "a page with no cameras lists none");
assert(
  windyFrameUrl("1250234364") === "https://imgproxy.windy.com/_/full/plain/current/1250234364/original.jpg",
  "frames come from Windy's origin, never a proxy that would restamp them",
);
assert(countrySlug("Islamic Republic of Iran") === "islamic-republic-of-iran", "slugs are lowercase and hyphenated");
assert(countrySlug("C\u00f4te d\u2019Ivoire") === "cote-d-ivoire", "accents and punctuation fold away");
assert(placeName("Prizren \u203a West: Ambient Restaurant") === "Prizren", "a camera's qualifiers fall away from the place slot");
assert(placeName("Lima: Av Javier prado") === "Lima", "so does the street it points at");
assert(placeName("Gulf of Siam at Cha-am") === "Gulf of Siam at Cha-am", "a name with no qualifier is left alone");
assert(placeName("") === null, "and an empty name is no name");
assert(cameraTitle("\u200eToday for iPhone - App Store") === null, "a storefront is not a camera name");
assert(cameraTitle("Sign in to continue") === null, "nor is a login wall");
assert(cameraTitle("Dahab: Na Lagunu") === "Dahab: Na Lagunu", "a real camera name survives");
assert(cameraTitle("   ") === null, "and an empty title is no name");
assert(
  frameAgeMs("Sat, 19 Sep 2026 23:00:00 GMT", "Sat, 19 Sep 2026 23:00:00 GMT") === null,
  "a Last-Modified equal to the response Date is a restamp, not an age",
);
assert(
  frameAgeMs("Sat, 19 Sep 2026 22:59:57 GMT", "Sat, 19 Sep 2026 23:00:00 GMT") === 3000,
  "three seconds before the response is a real three-second-old frame",
);

// --- "live" must be proven, not claimed ---------------------------------------
const hostNow = "Sat, 19 Sep 2026 15:54:14 GMT";
assert(frameAgeMs("Sat, 19 Sep 2026 15:49:51 GMT", hostNow) === 263_000, "frame age is read from Last-Modified against the host's clock");
assert(frameAgeMs("Mon, 31 Oct 2022 12:59:52 GMT", hostNow) > MAX_FRAME_AGE_MS, "a 2022 'live' thumbnail is stale");
assert(frameAgeMs(null, hostNow) === null, "no Last-Modified means no evidence, not 'fresh'");
assert(isVideoHost("https://www.youtube.com/watch?v=XsOU8JnEpNM") && isVideoHost("https://youtu.be/x"), "video pages are recognised and skipped");
assert(!isVideoHost("https://worldcams.tv/japan/"), "a webcam directory is not a video host");

// --- directory pages lead to camera pages -----------------------------------------
const dir = `<a href="/en/webcam/paraguay/alto-parana/ciudad-del-este/ponte-da-amizade.html">Ponte da Amizade</a>
  <a href="/en/webcam/paraguay/central/asuncion/costanera.html">Asunción - Costanera</a>
  <a href="/en/webcam/brasil/parana/foz-do-iguacu/cataratas.html">Foz do Iguaçu</a>
  <a href="/en/privacy.html">Privacy</a><a href="/en/webcam.html">All webcams</a><a href="https://other.example/cam/1">elsewhere</a>`;
const links = cameraLinks(dir, "https://www.skylinewebcams.com/en/webcam/paraguay.html", ["Paraguay", "Asunción"]);
assert(links[0].endsWith("/asuncion/costanera.html"), "a camera page naming the city ranks first");
assert(links[1].endsWith("/ponte-da-amizade.html"), "then one naming the country");
assert(links.indexOf(links.find((l) => l.includes("brasil"))) === links.length - 1, "a sidebar camera elsewhere ranks last");
assert(!links.some((l) => /privacy|\/webcam\.html$|other\.example/.test(l)), "never an off-site link, a legal page, or the directory's own parent");

// --- a tie is broken by provable freshness, not by arrival order -------------------
// The model started returning whole numbers, four cameras tied on 7, and "strictly greater to
// replace" froze the cut. These pin the rule that unfroze it.
{
  const now = Date.now();
  const fresh = { at: now, score: 7, capturedAt: now - 60_000, id: "verifiable" };
  const blind = { at: now, score: 7, capturedAt: null, id: "no-timestamp" };
  const older = { at: now, score: 7, capturedAt: now - 3 * 60 * 60_000, id: "older" };
  assert(pickCut([blind, fresh], { now }).id === "verifiable", "on a tie, a frame whose age we can prove wins");
  assert(pickCut([older, fresh], { now }).id === "verifiable", "on a tie between two provable frames, the fresher wins");
  assert(pickCut([fresh, { ...blind, score: 7.1 }], { now }).id === "no-timestamp", "a higher score still beats a provable age");
  const same = { ...fresh, id: "incumbent" };
  assert(pickCut([same, { ...fresh, id: "challenger" }], { now }).id === "incumbent", "a dead heat on every key keeps the incumbent");
  assert(
    rankFeed([blind, older, fresh]).map((x) => x.id).join(",") === "verifiable,older,no-timestamp",
    "the running order uses the same rule as the cut",
  );
}

// --- headlines fit on a card ---------------------------------------------------
const styledPost = "\u{1D5DC}\u{1D5F1}\u{1D5EE} \u{1D5E2}\u{1D5F1}\u{1D5F6}\u{1D5FB}\u{1D5F4}\u{1D5EE} Kenya's Ambassador to the United Nations has unveiled a committee";
assert(trimHeadline(styledPost) === "Ida Odinga", "a post's styled title run is split off its plain body");
assert(trimHeadline("Dr. Ida Odinga unveils memorial committee. It meets next week.") === "Dr. Ida Odinga unveils memorial committee.", "cuts at the first sentence break, not at 'Dr.'");
assert(trimHeadline("U.S. Senate passes budget. More to follow.") === "U.S. Senate passes budget.", "'U.S.' is not a sentence break");
assert(trimHeadline("The week in Switzerland") === "The week in Switzerland", "a clean headline is left alone");
assert(
  trimHeadline("\u{1F534}\u{1F535}Alianza Lima vs. Fluminense EN VIVO") === "Alianza Lima vs. Fluminense EN VIVO",
  "a live-blog title's emoji is stripped — we have no emoji face, so it drew as a box",
);
assert(trimHeadline("\u{26BD}\u{FE0F} Troms\u00f8 signs Larsen \u{1F1F3}\u{1F1F4}") === "Troms\u00f8 signs Larsen", "flags, joiners and variation selectors go with them");
assert(trimHeadline("\u{1F44D}") === null, "a title that is only emoji is not a headline");
const runOn = trimHeadline("Word ".repeat(60).trim());
assert(runOn.length <= 121 && runOn.endsWith("…") && !runOn.includes("Wor…"), "a run-on with no break is capped at a word boundary");

console.log(pass ? "\nPASS" : "\nFAIL");
process.exit(pass ? 0 : 1);
