import { readFileSync, writeFileSync } from "node:fs";

const root = "/home/saharsh/contri/convex/meanwhile-app/";
const cs = JSON.parse(readFileSync(root + "src/data/countries.json", "utf8"));
const geo = readFileSync(root + "convex/geo.ts", "utf8");
const names = [...geo.matchAll(/^  "?([^":]+)"?: \{ common:/gm)].map((m) => m[1]);
const byName = new Map(cs.map((c) => [c.n, c.c]));
const missing = names.filter((n) => !byName.has(n));
console.log("geo names", names.length, "· with centroid", names.length - missing.length, "· missing", missing.length, missing.slice(0, 6));

const rows = names
  .filter((n) => byName.has(n))
  .map((n) => {
    const [lng, lat] = byName.get(n);
    return `  ${JSON.stringify(n)}: [${lat.toFixed(2)}, ${lng.toFixed(2)}],`;
  });

const out = `// Polygon centroids, generated from src/data/countries.json — the same geometry the globe
// draws, so a country the backend warms is the country a click on that polygon would send.
// Stored [lat, lng]; the click sends them in that order too.
//
// Regenerate: node scripts/gen-centroids.mjs
export const CENTROIDS = {
${rows.join("\n")}
};

/** The point a click on this polygon carries, or null when we don't hold that polygon. */
export function centroidFor(country) {
  const c = CENTROIDS[country];
  return c ? { lat: c[0], lng: c[1] } : null;
}
`;
writeFileSync(root + "convex/centroids.js", out);
console.log("wrote convex/centroids.js with", rows.length, "entries");
