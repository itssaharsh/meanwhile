import { COPY, MINUS, NBSP, ADDED } from "./copy";

// The freshness window: a frame is teal only if its SOURCE timestamp is under three hours old.
export const FRESH_WINDOW_MS = 3 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;

/** "12 min", "2 h", "2 h 14 min" — number and unit joined by a non-breaking space. Never
 *  "just now": anything under a minute rounds up to 1 min, which overstates age, the safe
 *  direction for a freshness claim. */
export function formatAge(ms: number): string {
  const totalMin = Math.max(1, Math.round(ms / 60000));
  if (totalMin < 60) return `${totalMin}${NBSP}min`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m === 0 ? `${h}${NBSP}h` : `${h}${NBSP}h ${m}${NBSP}min`;
}

/** One decimal, always: 8.4, 9.0 — never 8 or 8.40. */
export function formatScore(score: number): string {
  return score.toFixed(1);
}

/** −1.32°, 36.81° — a real minus sign. */
export function formatCoord(value: number): string {
  const s = Math.abs(value).toFixed(2);
  return `${value < 0 ? MINUS : ""}${s}°`;
}

/** 15:04 (UTC, 24-hour). */
export function formatUtcTime(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}

/** Local wall-clock time at a place, from its UTC offset in minutes. */
export function formatLocalTime(ms: number, utcOffsetMin: number): string {
  return formatUtcTime(ms + utcOffsetMin * 60000);
}

/** 14 Oct 2022 */
export function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

export type Freshness =
  | { kind: "live"; ageMs: number }      // under 1 h: "Verified live · 12 min old" (teal)
  | { kind: "verified"; ageMs: number }  // 1–3 h: "Verified · 2 h 14 min old" (teal)
  | { kind: "stale"; ageMs: number }     // over 3 h, known time: grey (string pending)
  | { kind: "unknown" };                 // no source timestamp: grey

/** Classifies a frame by its SOURCE timestamp. `capturedAt` null means the source sent none. */
export function freshness(capturedAt: number | null, now: number): Freshness {
  if (capturedAt == null) return { kind: "unknown" };
  const ageMs = Math.max(0, now - capturedAt);
  if (ageMs > FRESH_WINDOW_MS) return { kind: "stale", ageMs };
  return ageMs < HOUR ? { kind: "live", ageMs } : { kind: "verified", ageMs };
}

export const isVerified = (f: Freshness) => f.kind === "live" || f.kind === "verified";

/** The chip's text: COPY §4 for the three states it defines; the stale-with-known-time state
 *  is not in COPY.md (see ADDED.storyStaleAge). */
export function freshnessText(f: Freshness): string {
  switch (f.kind) {
    case "live":
      return COPY.story.verifiedLive(formatAge(f.ageMs));
    case "verified":
      return COPY.story.verified(formatAge(f.ageMs));
    case "stale":
      return ADDED.storyStaleAge.text(formatAge(f.ageMs));
    case "unknown":
      return COPY.story.noTimestamp;
  }
}
