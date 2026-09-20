// The director's rule, in one place.
//
// Plain .js on purpose: convex/score.ts and convex/director.ts import it inside the Convex
// runtime, and scripts/verify.mjs imports the very same file under plain `node` (which
// cannot load .ts without a flag). One implementation, one rule, actually under test.

// A snapshot older than this is history, not "now". The scaffold's comment promised the
// cut was the "highest-scored recent snapshot" but nothing enforced recency, so a stale
// 9.8 from hours ago won the channel forever.
export const MAX_SNAPSHOT_AGE_MS = 6 * 60 * 60 * 1000;

export function isFresh(snap, now, maxAgeMs = MAX_SNAPSHOT_AGE_MS) {
  if (!snap) return false;
  if (maxAgeMs === Infinity) return true;
  if (typeof snap.at !== "number") return false;
  return now - snap.at <= maxAgeMs;
}

// Highest-scored fresh snapshot wins. Ties keep the incumbent (strictly greater to replace),
// which stops two equal scores from flapping the cut back and forth.
export function pickCut(snapshots, opts = {}) {
  const now = opts.now ?? Date.now();
  const maxAgeMs = opts.maxAgeMs ?? MAX_SNAPSHOT_AGE_MS;
  let best = null;
  for (const s of snapshots ?? []) {
    if (!s || typeof s.score !== "number" || Number.isNaN(s.score)) continue;
    if (!isFresh(s, now, maxAgeMs)) continue;
    if (!best || s.score > best.score) best = s;
  }
  return best;
}

export function rankFeed(items, limit = 12) {
  return (items ?? [])
    .filter((s) => s && typeof s.score === "number" && !Number.isNaN(s.score))
    .slice()
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

// The vision model is asked for 0-10 but nothing guarantees it. Returns null for anything
// that isn't a usable number, so callers can refuse to persist junk.
export function clampScore(value) {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(10, n));
}
