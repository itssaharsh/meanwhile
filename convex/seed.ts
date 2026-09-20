import { internalMutation } from "./_generated/server";

// Seed / re-seed the curated camera pool: `npx convex run seed:run`.
//
// `source` decides how a frame is fetched (see ingest.ts):
//   "image"     — ref is a direct still-image URL. No API key, no credit. Preferred.
//   "windy"     — ref is a Windy webcam id.        Needs WINDY_KEY.
//
// Every ref below was verified live: HTTP 200, content-type image/*, and two fetches
// minutes apart returning DIFFERENT bytes. That last check matters — plenty of "webcam"
// URLs return a perfectly valid JPEG that was last modified in 2022.
//
// A camera with an empty ref is seeded INACTIVE, so it never appears in the feed and never
// costs a vision call. Swap one in later without a reseed:
//   npx convex run cameras:setRef '{"name":"Rio de Janeiro","ref":"https://…/cam.jpg","source":"image"}'
type Seed = {
  name: string;
  country: string;
  lat: number;
  lng: number;
  tz: number;
  source: "image" | "windy";
  ref: string;
};

const POOL: Seed[] = [
  // Vegagerðin (Icelandic Road Administration). Spares: bustadabru_1, kringlan_1.
  { name: "Reykjavík", country: "Iceland", lat: 64.15, lng: -21.94, tz: 0, source: "image",
    ref: "https://www.vegagerdin.is/vgdata/vefmyndavelar/artunsbrekka_1.jpg" },

  // Campo San Moisè. Hotel-operated via IPCamLive — the alias URL redirects to a
  // per-stream host, so keep the alias, not the resolved URL.
  { name: "Venice", country: "Italy", lat: 45.44, lng: 12.34, tz: 2, source: "image",
    ref: "https://g0.ipcamlive.com/player/snapshot.php?alias=5b51f1c0c1016" },

  // Caldera from Imerovigli. 3840×2160, ~580 KB — the heaviest in the pool.
  { name: "Santoríni", country: "Greece", lat: 36.39, lng: 25.46, tz: 3, source: "image",
    ref: "https://g1.ipcamlive.com/player/snapshot.php?alias=altana01" },

  // University of Tromsø panorama — fjord and mountains. Nicer than any road cam here.
  { name: "Tromsø", country: "Norway", lat: 69.65, lng: 18.96, tz: 2, source: "image",
    ref: "https://weather.cs.uit.no/panorama/images/panorama.jpg" },

  // Taiwan THB: Xinbei Bridge over the Tamsui River. There is no THB camera inside Taipei
  // City proper, so this is named for where it actually is. Note the literal "+" in the
  // path — URL-encoding it to %2B returns 404. Smallest frame in the pool (352×240).
  { name: "New Taipei", country: "Taiwan", lat: 25.045, lng: 121.478, tz: 8, source: "image",
    ref: "https://cctv-ss08.thb.gov.tw:443/T64-17K+008/snapshot" },

  // MLIT Yodogawa river camera. Updates every few minutes rather than seconds.
  { name: "Kyoto", country: "Japan", lat: 35.01, lng: 135.77, tz: 9, source: "image",
    ref: "https://www.seishiga.kkr.mlit.go.jp/yodogawa/pic/C03001.jpg" },

  // SUBSTITUTE for Mumbai — see the note at the bottom of this file.
  { name: "Bir Billing", country: "India", lat: 32.04, lng: 76.72, tz: 5.5, source: "image",
    ref: "https://imgproxy.windy.com/_/full/plain/current/1707102692/original.jpg?v=2" },

  // 511NY (NYSDOT), Brooklyn Bridge approach with the Manhattan skyline behind.
  // Other angles: 3336 (@ Centre St), 3376 (FDR @ Brooklyn Bridge exit).
  { name: "New York", country: "USA", lat: 40.71, lng: -74.0, tz: -4, source: "image",
    ref: "https://511ny.org/map/Cctv/3335" },

  // NOT VERIFIED — no working Rio (or Brazilian) camera found. Seeded inactive rather than
  // seeded dead. Every candidate was a stale file: the Panomax Sugarloaf cam is offline
  // (last modified Jan 2025), and the Windy Rio cameras are 404 or months old.
  { name: "Rio de Janeiro", country: "Brazil", lat: -22.97, lng: -43.18, tz: -3, source: "image",
    ref: "" },

  // Private tourism site, refreshed by FTP every ~6 minutes. The only non-institutional
  // source here besides the two IPCamLive hotel cams — attribute it, and expect it to be
  // the first to break.
  { name: "Cape Town", country: "South Africa", lat: -33.92, lng: 18.42, tz: 2, source: "image",
    ref: "https://www.kapstadt.de/webcam.jpg" },

  // Transport for NSW. REQUIRES a browser User-Agent: without one it returns HTTP 200 with
  // a 307-byte HTML page, not an error — which is exactly why ingest.ts checks content-type.
  { name: "Sydney", country: "Australia", lat: -33.87, lng: 151.21, tz: 10, source: "image",
    ref: "https://webcams.transport.nsw.gov.au/livetraffic-webcams/cameras/sydney_harbour_bridge.jpeg" },

  // NZTA. Spares: 622 (Queenstown Nth), 623 (SH6 Frankton), 627 (Frankton Roundabout).
  { name: "Queenstown", country: "New Zealand", lat: -45.03, lng: 168.66, tz: 12, source: "image",
    ref: "https://trafficnz.info/camera/621.jpg" },
];

// INTERNAL, like cameras:setRef — still runnable as `npx convex run seed:run`.
//
// Upserts by name. The scaffold bailed out entirely if ANY camera already existed
// (`take(1)`), which made re-seeding a silent no-op — so a fixed ref could never land.
export const run = internalMutation({
  args: {},
  handler: async (ctx) => {
    let inserted = 0;
    let updated = 0;
    const inactive: string[] = [];

    for (const c of POOL) {
      const row = { ...c, active: c.ref.length > 0 };
      if (!row.active) inactive.push(c.name);

      const existing = await ctx.db
        .query("cameras")
        .withIndex("by_name", (q) => q.eq("name", c.name))
        .first();

      if (existing) {
        await ctx.db.patch(existing._id, row);
        updated++;
      } else {
        await ctx.db.insert("cameras", row);
        inserted++;
      }
    }

    if (inactive.length) {
      console.warn(
        `[meanwhile] ${inactive.length} camera(s) have no ref and were seeded inactive: ${inactive.join(", ")}. ` +
          `Fill them in seed.ts, or use cameras:setRef.`,
      );
    }
    return { inserted, updated, inactive: inactive.length, active: POOL.length - inactive.length };
  },
});

// Two of the original twelve cities had no verifiable live camera:
//
//   Mumbai — every candidate was a dead file serving a stale JPEG. The pictimo India
//     cameras (1485 and every neighbouring id) return a convincing 91 KB road scene with
//     last-modified in March 2022, which passes a naive size/content-type check. Replaced
//     with Bir Billing, Himachal Pradesh, whose burned-in clock matched real time.
//
//   Rio de Janeiro — no working Brazilian camera found at all. Left inactive deliberately.
//     The skylinewebcams Rio page is an HLS <video> player: screenshotting it with
//     Firecrawl yields a "click to play" poster, not the live scene, so it is not a
//     usable fallback.
