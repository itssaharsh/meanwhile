// Watch one country click from the terminal, stage by stage, as the story panel sees it:
//   node scripts/country-try.mjs "New Zealand" Kosovo
// Spends real credits on whichever deployment .env.local points at.
import { readFileSync } from "node:fs";
import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
const url = readFileSync(".env.local", "utf8").match(/^VITE_CONVEX_URL=(.+)$/m)[1].trim();
const c = new ConvexHttpClient(url);
const start = makeFunctionReference("countries:start");
const watch = makeFunctionReference("fetches:watch");
const story = makeFunctionReference("stories:byId");
const countries = JSON.parse(readFileSync("src/data/countries.json", "utf8"));
for (const name of process.argv.slice(2)) {
  const g = countries.find((x) => x.n === name);
  const t0 = Date.now();
  const { fetchId, cached } = await c.mutation(start, { country: name, lat: g.c[1], lng: g.c[0] });
  let seen = "", row;
  for (let i = 0; i < 180; i++) {
    row = await c.query(watch, { fetchId });
    const line = `${row.stage}${row.i ? ` ${row.i}/${row.n}` : ""}${row.cameraName ? ` · ${row.cameraName}` : ""}${row.frameAgeMs !== undefined ? ` · age ${row.frameAgeMs === null ? "none" : Math.round(row.frameAgeMs / 60000) + "m"}` : ""}`;
    if (line !== seen) { console.log(`   ${((Date.now() - t0) / 1000).toFixed(1)}s  ${line}`); seen = line; }
    if (row.stage === "done" || row.stage === "failed") break;
    await new Promise((r) => setTimeout(r, 400));
  }
  const s = row.storyId ? await c.query(story, { storyId: row.storyId }) : null;
  const rejected = row.stale + row.misplaced;
  console.log(`${name}: ${row.outcome ?? row.error} in ${((Date.now() - t0) / 1000).toFixed(1)}s${cached ? " (own cache)" : ""}`);
  console.log(`   counts: n=${row.n} stale=${row.stale} misplaced=${row.misplaced} kept=${row.kept} pages=${row.pages} — reconciles: ${rejected + row.kept === row.n}`);
  if (s) console.log(`   ${s.place} · ${s.capturedAt ? Math.round((Date.now() - s.capturedAt) / 60000) + " min old" : "no source time"} · ${s.sourcePage ?? s.sourceImageUrl}\n   "${s.caption}"`);
}
