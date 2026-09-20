// The order a country fetch moves through. Shared by the action that writes the row and the
// panel that renders it, so both agree on what "forward" means.
//
// `pulling` and `checking` alternate per frame, so a plain stage index would read frame 2's
// "pulling" as a step BACKWARDS from frame 1's "checking". Progress is the pair (stage, frame).
export const STAGES = ["searching", "candidates", "pulling", "checking", "rejected", "scoring", "done", "failed"];

export function progressKey(row) {
  if (!row) return -1;
  switch (row.stage) {
    case "searching":
      return 0;
    case "candidates":
      return 1;
    case "pulling":
      return 10 + (row.i ?? 0) * 2;
    case "checking":
      return 11 + (row.i ?? 0) * 2;
    case "rejected":
      return 10_000;
    case "scoring":
      return 10_001;
    case "done":
    case "failed":
      return 20_000;
    default:
      return 0;
  }
}

export const isFinished = (row) => !!row && (row.stage === "done" || row.stage === "failed");

/** stale + misplaced = rejected, and rejected + kept = n. Returns [] when they reconcile. */
export function countProblems(row) {
  if (!row || !isFinished(row) || row.stage === "failed") return [];
  const rejected = (row.stale ?? 0) + (row.misplaced ?? 0);
  return rejected + (row.kept ?? 0) === (row.n ?? 0)
    ? []
    : [`${row.stale} stale + ${row.misplaced} misplaced + ${row.kept} kept ≠ ${row.n} candidates`];
}
