// Demo and /_kit fixtures. The frames are real stills from the camera pool (dev deployment,
// resized into public/fixtures/frames), with the captions and tags the vision model actually
// wrote for them. Scores and ages are set so every freshness state appears at least once, and
// so the on-air numbers match COPY.md's own examples (Tromsø 9.6, Santoríni 9.0, Queenstown 3.8).
import type { FetchRow, MailState, Place, Snapshot, VerifiedChip } from "./types";
import type { NewsItem } from "@/components/NewsPanel";

export const NOW = Date.now();
const MIN = 60 * 1000;
const ago = (min: number) => NOW - min * MIN;
const frame = (file: string) => `/fixtures/frames/${file}`;

const place = (name: string, country: string, lat: number, lon: number, utcOffsetMin: number): Place => ({
  name,
  country,
  lat,
  lon,
  utcOffsetMin,
});

export const PLACES = {
  tromso: place("Tromsø", "Norway", 69.65, 18.96, 120),
  santorini: place("Santoríni", "Greece", 36.39, 25.46, 180),
  venice: place("Venice", "Italy", 45.44, 12.34, 120),
  capeTown: place("Cape Town", "South Africa", -33.92, 18.42, 120),
  reykjavik: place("Reykjavík", "Iceland", 64.15, -21.94, 0),
  kyoto: place("Kyoto", "Japan", 35.01, 135.77, 540),
  birBilling: place("Bir Billing", "India", 32.04, 76.72, 330),
  newTaipei: place("New Taipei", "Taiwan", 25.05, 121.48, 480),
  sydney: place("Sydney", "Australia", -33.87, 151.21, 600),
  newYork: place("New York", "USA", 40.71, -74.0, -240),
  queenstown: place("Queenstown", "New Zealand", -45.03, 168.66, 720),
} satisfies Record<string, Place>;

type SnapInit = Omit<Snapshot, "checkedAt" | "sourceUrl"> & { checkedMin?: number };
const snap = ({ checkedMin, ...s }: SnapInit): Snapshot => ({
  ...s,
  checkedAt: ago(checkedMin ?? 2),
  sourceUrl: s.sourceHost ? `https://${s.sourceHost}/` : null,
});

/** Score, descending — the order feed.recent returns (the on-air frame is the top score, so
 *  it leads). Stable, and unscored frames go last. Fixtures are sorted here rather than typed
 *  in order, so a fixture can never contradict the rule the rail exists to prove. */
export function byScore(items: Snapshot[]): Snapshot[] {
  return [...items].sort((a, b) => (b.score ?? -Infinity) - (a.score ?? -Infinity));
}

/** The running order, on-air first, then by score — the order feed.recent returns.
 *
 *  The `beat` lines are one consistent cut history for the last hour: each frame took the air
 *  from the one below it (Reykjavík from Kyoto, Cape Town from Reykjavík, Venice from Cape
 *  Town, Santoríni from Venice, Tromsø from Santoríni). Frames that never aired carry null. */
export const RUNNING_ORDER: Snapshot[] = byScore([
  snap({
    snapshotId: "s-tromso",
    place: PLACES.tromso,
    score: 9.6,
    capturedAt: ago(12),
    checkedMin: 12,
    frameUrl: frame("tromso.jpg"),
    caption: "Sunlight spills across the fjord waters, casting a warm golden glow on the rolling hills of Tromsø.",
    tags: ["mountains", "fjord", "clouds", "sun"],
    beat: { place: "Santoríni", score: 9.0 },
    cameraName: "UiT weather camera",
    sourceHost: "weather.cs.uit.no",
  }),
  snap({
    snapshotId: "s-santorini",
    place: PLACES.santorini,
    score: 9.0,
    capturedAt: ago(26),
    frameUrl: frame("santorini.jpg"),
    caption: "Iconic blue-domed churches overlook the deep blue Aegean Sea and the dramatic volcanic cliffs of Santorini.",
    tags: ["caldera", "church", "dome", "sea"],
    beat: { place: "Venice", score: 8.5 },
    cameraName: "Oia caldera camera",
    sourceHost: "g1.ipcamlive.com",
  }),
  snap({
    snapshotId: "s-venice",
    place: PLACES.venice,
    score: 8.5,
    capturedAt: ago(48),
    frameUrl: frame("venice.jpg"),
    caption: "Splendid afternoon sunlight illuminates the intricate marble facade of the Venetian church as pedestrians stroll across the square.",
    tags: ["facade", "sculpture", "square", "columns"],
    beat: { place: "Cape Town", score: 8.3 },
    cameraName: "Campo camera",
    sourceHost: "g0.ipcamlive.com",
  }),
  snap({
    snapshotId: "s-cape-town",
    place: PLACES.capeTown,
    score: 8.3,
    capturedAt: ago(11),
    frameUrl: frame("cape-town.jpg"),
    caption: "Table Mountain stands majestically under a clear blue sky, framed by lush palm trees along the waterfront.",
    tags: ["mountain", "palms", "water", "bay"],
    beat: { place: "Reykjavík", score: 8.1 },
    cameraName: "Capetown webcam",
    sourceHost: "www.kapstadt.de",
  }),
  snap({
    snapshotId: "s-reykjavik",
    place: PLACES.reykjavik,
    score: 8.1,
    capturedAt: ago(38),
    frameUrl: frame("reykjavik.jpg"),
    caption: "Midday traffic flows steadily along the overcast highway of Miklabraut in Reykjavík.",
    tags: ["highway", "road", "overpass", "sky"],
    beat: { place: "Kyoto", score: 7.4 },
    cameraName: "Miklabraut",
    sourceHost: "www.vegagerdin.is",
  }),
  snap({
    snapshotId: "s-kyoto",
    place: PLACES.kyoto,
    score: 7.4,
    capturedAt: null,
    frameUrl: frame("kyoto.jpg"),
    caption: "Night falls over the dimly lit riverbank and bridge in Kyoto under a light drizzle.",
    tags: ["bridge", "river", "lights", "drizzle"],
    beat: null,
    cameraName: null,
    sourceHost: "www.seishiga.kkr.mlit.go.jp",
  }),
  snap({
    snapshotId: "s-bir-billing",
    place: PLACES.birBilling,
    score: 6.8,
    capturedAt: ago(82),
    frameUrl: frame("bir-billing.jpg"),
    caption: "Fading twilight illuminates a heavy cloud blanket over the darkened hills of Bir Billing.",
    tags: ["clouds", "hills", "dusk"],
    beat: null,
    cameraName: "Billing launch site",
    sourceHost: "imgproxy.windy.com",
  }),
  snap({
    snapshotId: "s-new-taipei",
    place: PLACES.newTaipei,
    score: 6.1,
    capturedAt: ago(134),
    frameUrl: frame("new-taipei.jpg"),
    caption: "Late night traffic flows smoothly across the illuminated overpass curves of New Taipei.",
    tags: ["highway", "overpass", "streetlights"],
    beat: null,
    cameraName: "Provincial Highway 64",
    sourceHost: "cctv-ss08.thb.gov.tw",
  }),
  snap({
    snapshotId: "s-sydney",
    place: PLACES.sydney,
    score: 5.2,
    capturedAt: ago(7),
    frameUrl: frame("sydney.jpg"),
    caption: "Midnight traffic flows steadily across the illuminated lanes of the Sydney Harbour Bridge.",
    tags: ["bridge", "highway", "streetlights"],
    beat: null,
    cameraName: "Harbour Bridge",
    sourceHost: "webcams.transport.nsw.gov.au",
  }),
  snap({
    snapshotId: "s-new-york",
    place: PLACES.newYork,
    score: 4.9,
    capturedAt: ago(19),
    frameUrl: frame("new-york.jpg"),
    caption: "Mid-morning traffic flows along the urban highway beneath an overcast New York sky.",
    tags: ["highway", "buildings", "skyline"],
    beat: null,
    cameraName: "FDR Drive",
    sourceHost: "511ny.org",
  }),
  snap({
    snapshotId: "s-queenstown",
    place: PLACES.queenstown,
    score: 3.8,
    capturedAt: ago(365),
    frameUrl: frame("queenstown.jpg"),
    caption: "A lone vehicle waits at a quiet, damp intersection in the early hours of the morning.",
    tags: ["intersection", "traffic lights", "night"],
    beat: null,
    cameraName: "Frankton roundabout",
    sourceHost: "trafficnz.info",
  }),
]);

export const byId = (id: string) => RUNNING_ORDER.find((s) => s.snapshotId === id)!;
export const ON_AIR = RUNNING_ORDER[0];

/** After a real cut: a fresh Cape Town frame — a NEW snapshot, scored 9.7 — takes the air.
 *  Cape Town's older frame leaves the running order, and every item from Tromsø down slides
 *  one place right on the rail's spring (T-07). No existing snapshot has its score rewritten. */
export const CAPE_TOWN_NEW: Snapshot = {
  ...byId("s-cape-town"),
  snapshotId: "s-cape-town-2",
  score: 9.7,
  capturedAt: ago(2),
  checkedAt: ago(1),
  frameUrl: frame("cape-town-night.jpg"),
  caption: "Night falls over Cape Town with the illuminated Table Mountain looming above a sparkling city skyline.",
  tags: ["cityscape", "mountain", "lights", "skyline"],
  beat: { place: "Tromsø", score: 9.6 },
};
export const RERANKED: Snapshot[] = byScore([CAPE_TOWN_NEW, ...RUNNING_ORDER.filter((x) => x.snapshotId !== "s-cape-town")]);

// C-04 stories
export const STORY_VERIFIED = byId("s-cape-town");
export const STORY_STALE = byId("s-queenstown");
export const STORY_NOTIME = byId("s-kyoto");
export const STORY_ONAIR = ON_AIR;

// C-08: COPY.md §3's filled example, stage by stage (Switzerland, 11 candidates).
const fetchBase: FetchRow = {
  fetchId: "f-switzerland",
  country: "Switzerland",
  stage: "searching",
  n: 0,
  i: 0,
  cameraName: null,
  frameAgeMs: null,
  stale: 0,
  misplaced: 0,
  kept: 0,
  startedAt: NOW - 3000,
  stageStartedAt: NOW - 400,
};
export const FETCH = {
  searching: fetchBase,
  candidates: { ...fetchBase, stage: "candidates", n: 11 },
  pulling: { ...fetchBase, stage: "pulling", n: 11, i: 4, cameraName: "Glecksteinhütte" },
  freshOk: { ...fetchBase, stage: "checking", n: 11, i: 4, cameraName: "Glecksteinhütte", frameAgeMs: 38 * MIN },
  freshFail: { ...fetchBase, stage: "checking", n: 11, i: 5, cameraName: "Grindelwald First", frameAgeMs: 6 * 60 * MIN },
  noTime: { ...fetchBase, stage: "checking", n: 11, i: 6, cameraName: "Kleine Scheidegg", frameAgeMs: null },
  rejected: { ...fetchBase, stage: "rejected", n: 11, i: 11, stale: 4, misplaced: 1, kept: 6 },
  scoring: { ...fetchBase, stage: "scoring", n: 11, i: 11, stale: 4, misplaced: 1, kept: 6 },
  slow: {
    ...fetchBase,
    stage: "pulling",
    n: 11,
    i: 7,
    cameraName: "Jungfraujoch",
    stageStartedAt: NOW - 14000,
  },
  failed: { ...fetchBase, stage: "failed" },
} satisfies Record<string, FetchRow>;

/** countries.verifiedNow(): three countries whose latest cached story is verified this
 *  minute, freshest first, excluding the country that just failed. */
export const VERIFIED_NOW: VerifiedChip[] = RUNNING_ORDER.filter((s) => s.capturedAt != null && NOW - s.capturedAt < 3 * 60 * MIN)
  .sort((a, b) => (b.capturedAt ?? 0) - (a.capturedAt ?? 0))
  .slice(0, 3)
  .map((s) => ({ country: s.place.country, capturedAt: s.capturedAt! }));

// C-09
const MESSAGE_ID = "<010001a0bac889d3-eefb99ee-3d64-4f0b-ac9f-b11abd86ae2a-000000@email.amazonses.com>";
export const MAIL = {
  queued: { status: "queued", messageId: MESSAGE_ID, at: NOW - 4000 },
  accepted: { status: "accepted", messageId: MESSAGE_ID, at: NOW - 2500 },
  delivered: { status: "delivered", messageId: MESSAGE_ID, at: NOW },
  bounced: { status: "bounced", messageId: MESSAGE_ID, at: NOW },
  unconfirmed: { status: "unconfirmed", messageId: MESSAGE_ID, at: NOW - 90000 },
} satisfies Record<string, MailState>;
export const MAIL_ADDRESS = "sam@example.com";

// C-16 — the news tab. Real headlines the channel pulled for these places, with the source
// each one came from, so the panel can be judged on the shape the live data actually has:
// one place on air, a place with a frame but no cut, and a country someone pulled up (no
// frame behind it, so its row is text only). Ages span the panel's whole range.
export const NEWS: NewsItem[] = [
  {
    key: "cam:tromso",
    place: "Tromsø",
    country: "Norway",
    headline: "Confirmed Transfer: Tromsø signs Heine Larsen.",
    headlineUrl: "https://onefootball.com/en/transfers/43472472",
    at: ago(4),
    snapshotId: "s-tromso",
    onAir: true,
  },
  {
    key: "cam:new-taipei",
    place: "New Taipei",
    country: "Taiwan",
    headline: "Marchers seek to solve stray problem",
    headlineUrl: "https://www.taipeitimes.com/News/taiwan/archives/2026/09/20/2003864581",
    at: ago(9),
    snapshotId: "s-new-taipei",
    onAir: false,
  },
  {
    key: "cam:reykjavik",
    place: "Reykjavík",
    country: "Iceland",
    headline: "Word Of The Issue: Rannsaka",
    headlineUrl: "https://grapevine.is/icelandic-culture/history-language/2026/09/20/word-of-the-issue-rannsaka/",
    at: ago(23),
    snapshotId: "s-reykjavik",
    onAir: false,
  },
  {
    key: "story:lima",
    place: "Lima",
    country: "Peru",
    headline: "Alianza Lima vs. Fluminense EN VIVO: horario y dónde ver el partido de HOY por la Brasil Cup 2026",
    headlineUrl: "https://www.exitosanoticias.pe/deportes/alianza-lima-fluminense-en-vivo",
    at: ago(57),
    snapshotId: null,
    onAir: false,
  },
  {
    key: "cam:kyoto",
    place: "Kyoto",
    country: "Japan",
    headline: "Watch Okayama v Kyoto Live Stream Online",
    headlineUrl: "https://www.dazn.com/en-JP/home/ay7iwoilfn3s017p6gfked5on3",
    at: ago(102),
    snapshotId: "s-kyoto",
    onAir: false,
  },
  {
    key: "story:coquimbo",
    place: "Coquimbo",
    country: "Chile",
    headline: "Air quality in Coquimbo",
    headlineUrl: "https://www.iqair.com/om/air-quality/chile/coquimbo/coquimbo",
    at: ago(188),
    snapshotId: null,
    onAir: false,
  },
];

// C-05 — model output, not product copy. Places are marked as links to `#place:<snapshotId>`
// so the answer renderer can turn each one into a place chip.
export const CHAT = {
  question: "Where is the sun right now?",
  answer:
    "It’s late afternoon in [Tromsø](#place:s-tromso), where the sun is low over the fjord — that’s the frame on air. " +
    "[Santoríni](#place:s-santorini) is an hour further into its evening, and the light is going gold on the caldera.\n\n" +
    "On the other side of the planet it’s past midnight: [Sydney](#place:s-sydney) is running on streetlights.",
  partial:
    "It’s late afternoon in [Tromsø](#place:s-tromso), where the sun is low over the fjord — that’s the frame on air. " +
    "Santoríni is an hour further into",
  answerNoChips:
    "The frame on air is a fjord in northern Norway, lit from the south-west — the sun is only a few degrees above the hills there.",
  stepsSeconds: "2.1",
};
