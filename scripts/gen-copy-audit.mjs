// Regenerates the tables at the bottom of COPY-GAPS.md straight from src/lib/copy.ts, so the
// audit can never drift from what the product actually renders:
//
//   node --experimental-strip-types scripts/gen-copy-audit.mjs
//
// Two tables. The ADDED table renders each extra string with the argument shape its real call
// site passes (the `sample` on each entry — an earlier hand-run passed a place name into every
// slot and produced rows like "Reykjavík steps · Iceland s", which was a bug in the audit and
// not in the product). The counts table renders every count string at one and at many, which
// is the 2026-09-20 rule made visible.
import { readFileSync, writeFileSync } from "node:fs";
// Run with node's own type stripping; copy.ts imports nothing and is plain TS:
//   node --experimental-strip-types scripts/gen-copy-audit.mjs
const { COPY, ADDED, renderAdded } = await import("../src/lib/copy.ts");

const esc = (s) => String(s).replace(/\|/g, "\\|").replace(/\n/g, " ");

// Every string that takes a count, with the count that governs the sentence.
const COUNTS = [
  ["COPY.topBar.betweenMeta", (n) => COPY.topBar.betweenMeta(n)],
  ["COPY.rail.loading", (n) => COPY.rail.loading(n, n, n)],
  ["COPY.fetch.candidates", (n) => COPY.fetch.candidates(n, "Kenya")],
  ["COPY.fetch.scoring", (n) => COPY.fetch.scoring(n)],
  ["COPY.countryEmpty.noCameraBody", (n) => COPY.countryEmpty.noCameraBody(n, "Kenya")],
  ["COPY.countryEmpty.staleTitle", (n) => COPY.countryEmpty.staleTitle(n, "Kenya")],
  ["COPY.countryEmpty.staleBody", (n) => COPY.countryEmpty.staleBody(n, "14 Oct 2022", "Kenya")],
  ["COPY.countryEmpty.misplacedBody", (n) => COPY.countryEmpty.misplacedBody(n, n, "Times Square")],
  ["ADDED.chatSummary", (n) => ADDED.chatSummary.text(n, "2.1")],
];

const countRows = COUNTS.map(([key, render]) => `| \`${key}\` | ${esc(render(1))} | ${esc(render(3))} |`);

const addedRows = Object.keys(ADDED)
  .sort()
  .map((key) => {
    const e = ADDED[key];
    return `| \`${key}\` | ${esc(renderAdded(key))} | ${esc(e.source)} | ${esc(e.usedBy)} |`;
  });

const md = readFileSync("COPY-GAPS.md", "utf8");
const marker = "<!-- generated -->";
const head = md.includes(marker) ? md.slice(0, md.indexOf(marker)) : md + "\n";

const out = `${head}${marker}
<!-- node scripts/gen-copy-audit.mjs — do not edit below this line -->

## Count strings, both forms

Rule 4 of COPY.md, rendered. The plural is COPY.md's own sentence; the singular is that sentence
with its agreements corrected and the numeral kept.

| key | n = 1 | n = 3 |
| --- | --- | --- |
${countRows.join("\n")}

## Strings beyond COPY.md (${addedRows.length})

Each rendered with the arguments its real call site passes.

| key | renders as | source | used by |
| --- | --- | --- | --- |
${addedRows.join("\n")}
`;

writeFileSync("COPY-GAPS.md", out);
console.log(`COPY-GAPS.md: ${countRows.length} count strings, ${addedRows.length} added strings`);
