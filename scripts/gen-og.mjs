// Rasterises brand/opengraph-image.tsx's design to public/og.png (1200x630).
//
// The kit drew that design for next/og (Satori), which this project does not run, and Satori
// needs .ttf while the app ships .woff2 — so the composition is rebuilt here as plain HTML and
// screenshotted by the same Chromium that renders /_kit. Same tokens, same layout, same intent.
//
//   node scripts/gen-og.mjs
//
// The places are real cameras from the pool rather than the kit's illustrative ones: a poster
// for a product whose whole claim is "nothing here is a mock" should not open with invented
// place names. The freshness chip deliberately carries NO age — an OG image is cached by every
// scraper that ever sees it, and a frozen "2 min ago" becomes a lie within the hour.
import { createRequire } from "node:module";
import { writeFileSync, globSync } from "node:fs";

// Playwright is not a dependency of this project (and must not be installed here), so this
// generator borrows whichever copy the machine already has. It is a one-off asset script, not
// part of the build — `npm run build` never touches it.
const require_ = createRequire(import.meta.url);
const CANDIDATES = [
  "playwright",
  "playwright-core",
  `${process.env.HOME}/.rote/lib/playwright-runtime/node_modules/playwright`,
];
let chromium = null;
for (const c of CANDIDATES) {
  try {
    ({ chromium } = require_(c));
    break;
  } catch {
    /* try the next one */
  }
}
if (!chromium) {
  console.error("No Playwright available. Tried:\n  " + CANDIDATES.join("\n  "));
  process.exit(1);
}

const C = {
  canvas: "#080b11", surface: "#10151d", line: "#232d3a",
  ink: "#e8eef4", muted: "#94a3b3", air: "#f5bd53", live: "#43e6d4",
};

// The running order as it actually stood when this was generated.
const ORDER = [
  { place: "Santoríni", country: "Greece", score: "7.8", state: "air" },
  { place: "Kyoto", country: "Japan", score: "7.3", state: "live" },
  { place: "Cape Town", country: "South Africa", score: "7.0", state: "live" },
  { place: "Venice", country: "Italy", score: "6.8", state: "live" },
  { place: "New York", country: "USA", score: "—", state: "unverified" },
];

const tone = (s) => (s === "air" ? C.air : s === "live" ? C.ink : C.muted);

const rows = ORDER.map(
  (r) => `
  <div style="display:flex;align-items:center;justify-content:space-between;padding:13px 0;border-bottom:1px solid ${C.line}">
    <div style="display:flex;align-items:baseline;gap:10px;min-width:0">
      ${r.state === "air" ? `<span style="width:8px;height:8px;border-radius:4px;background:${C.air};flex:none"></span>` : `<span style="width:8px;flex:none"></span>`}
      <span style="font-family:Newsreader,Georgia,serif;font-size:25px;color:${tone(r.state)};white-space:nowrap">${r.place}</span>
      <span style="font-family:'Space Mono',monospace;font-size:12px;letter-spacing:.12em;color:${C.muted};text-transform:uppercase">${r.country}</span>
    </div>
    <span style="font-family:'Space Mono',monospace;font-size:20px;color:${tone(r.state)};font-variant-numeric:tabular-nums">${r.score}</span>
  </div>`,
).join("");

const html = `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Funnel+Sans:wght@400;500;600&family=Funnel+Display:wght@600;700&family=Newsreader:wght@600&family=Space+Mono&display=block">
<style>*{box-sizing:border-box;margin:0;padding:0}html,body{width:1200px;height:630px;overflow:hidden}</style></head>
<body style="background:${C.canvas};color:${C.ink};font-family:'Funnel Sans',system-ui,sans-serif;display:flex;flex-direction:column">

  <div style="display:flex;align-items:center;justify-content:space-between;height:72px;padding:0 44px;border-bottom:1px solid ${C.line};flex:none">
    <div style="display:flex;align-items:center">
      <span style="width:14px;height:14px;border-radius:7px;background:${C.air};box-shadow:0 0 0 7px rgba(245,189,83,.16);margin-right:16px"></span>
      <span style="font-family:'Space Mono',monospace;font-size:17px;letter-spacing:.22em;color:${C.air}">ON AIR</span>
      <span style="width:1px;height:18px;background:${C.line};margin:0 20px"></span>
      <span style="font-family:'Space Mono',monospace;font-size:15px;letter-spacing:.14em;color:${C.muted}">11 CAMERAS · 11 COUNTRIES</span>
    </div>
    <span style="font-family:'Funnel Display',sans-serif;font-size:21px;font-weight:600;letter-spacing:-.02em;color:${C.ink}">Meanwhile</span>
  </div>

  <div style="display:flex;flex:1;gap:30px;padding:30px 44px 34px 44px;min-height:0">

    <div style="position:relative;flex:1.32;display:flex;flex-direction:column;justify-content:flex-end;border-radius:14px;border:3px solid ${C.air};background:#0b1017;overflow:hidden">
      <div style="position:absolute;left:-780px;top:198px;width:2400px;height:2400px;border-radius:1200px;background:#0e1a21;border:4px solid ${C.live}"></div>
      <div style="position:absolute;left:426px;top:56px;width:54px;height:54px;border-radius:27px;background:${C.air};box-shadow:0 0 0 20px rgba(245,189,83,.10)"></div>
      <div style="position:relative;display:flex;align-items:flex-end;justify-content:space-between;padding:22px 26px 24px;background:rgba(8,11,17,.88);border-top:1px solid ${C.line}">
        <div style="display:flex;flex-direction:column">
          <span style="align-self:flex-start;padding:5px 10px;margin-bottom:13px;border-radius:4px;border:1px solid rgba(67,230,212,.38);font-family:'Space Mono',monospace;font-size:13px;letter-spacing:.16em;color:${C.live}">VERIFIED LIVE</span>
          <div style="display:flex;align-items:flex-end;gap:11px">
            <span style="font-family:Newsreader,Georgia,serif;font-size:52px;line-height:1;color:${C.ink}">Santoríni</span>
            <span style="font-family:'Space Mono',monospace;font-size:14px;letter-spacing:.14em;color:${C.muted};text-transform:uppercase;padding-bottom:6px">Greece</span>
          </div>
        </div>
        <span style="font-family:'Space Mono',monospace;font-size:44px;line-height:1;color:${C.air};font-variant-numeric:tabular-nums">7.8</span>
      </div>
    </div>

    <div style="flex:1;display:flex;flex-direction:column;min-width:0">
      <span style="font-family:'Space Mono',monospace;font-size:12px;letter-spacing:.2em;color:${C.muted};text-transform:uppercase;margin-bottom:6px">Running order</span>
      ${rows}
      <p style="margin-top:auto;padding-top:20px;font-size:19px;line-height:1.45;color:${C.muted};max-width:36ch">An AI director watches real webcams and cuts the best one on air — and every frame says how old it is.</p>
    </div>
  </div>
</body></html>`;

// The borrowed Playwright may expect a browser build this machine does not have, so pick any
// installed headless shell rather than the one it was pinned to.
const shells = globSync(`${process.env.HOME}/.cache/ms-playwright/chromium_headless_shell-*/chrome-headless-shell-linux64/chrome-headless-shell`).sort();
const b = await chromium.launch(shells.length ? { executablePath: shells[shells.length - 1] } : {});
const p = await b.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
await p.setContent(html, { waitUntil: "networkidle" });
await p.evaluate(() => document.fonts.ready);
await p.waitForTimeout(400);
writeFileSync("public/og.png", await p.screenshot({ type: "png" }));
await b.close();
console.log("public/og.png written (1200x630)");
