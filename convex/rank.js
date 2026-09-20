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

/** The keys the cut is decided on, most significant first.
 *
 *  Score alone was enough while the model answered to one decimal. When it started returning
 *  whole numbers, four cameras tied on 7 and "strictly greater to replace" meant the channel
 *  stopped cutting altogether — a live channel that never cuts. So a tie now falls through to
 *  the thing this product is actually about: a frame whose age we can prove beats one we
 *  cannot, and between two provable frames the fresher one wins. Both keys are properties of
 *  the snapshot, so the order is stable for a given set of frames. */
function cutKeys(s) {
  return [s.score, s.capturedAt != null ? 1 : 0, s.capturedAt ?? 0];
}

function beats(a, b) {
  const ka = cutKeys(a);
  const kb = cutKeys(b);
  for (let i = 0; i < ka.length; i++) {
    if (ka[i] !== kb[i]) return ka[i] > kb[i];
  }
  return false; // a dead heat on every key keeps the incumbent, so the cut cannot flap
}

// Highest-scored fresh snapshot wins; see cutKeys for how a tie is settled.
export function pickCut(snapshots, opts = {}) {
  const now = opts.now ?? Date.now();
  const maxAgeMs = opts.maxAgeMs ?? MAX_SNAPSHOT_AGE_MS;
  let best = null;
  for (const s of snapshots ?? []) {
    if (!s || typeof s.score !== "number" || Number.isNaN(s.score)) continue;
    if (!isFresh(s, now, maxAgeMs)) continue;
    if (!best || beats(s, best)) best = s;
  }
  return best;
}

export function rankFeed(items, limit = 12) {
  return (items ?? [])
    .filter((s) => s && typeof s.score === "number" && !Number.isNaN(s.score))
    .slice()
    // Same order the cut is chosen in, so the running order never contradicts the frame on air.
    .sort((a, b) => (beats(a, b) ? -1 : beats(b, a) ? 1 : 0))
    .slice(0, limit);
}

// The vision model is asked for 0-10 but nothing guarantees it. Returns null for anything
// that isn't a usable number, so callers can refuse to persist junk.
export function clampScore(value) {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(10, n));
}
