// Shapes the components render. They follow UI-SPEC's data contracts (channel.onAir,
// feed.recent, stories.byId, fetches.watch, mailEvents.byMessage) so the live wiring in the
// next blocks maps backend rows onto these instead of reshaping components.

export type Place = {
  name: string;
  country: string;
  lat: number;
  lon: number;
  utcOffsetMin: number;
};

export type Snapshot = {
  snapshotId: string;
  place: Place;
  /** null: the frame exists but was never scored (C-10 error state). */
  score: number | null;
  /** The SOURCE's own timestamp for the frame, ms. null: the source sent none. */
  capturedAt: number | null;
  /** When our pipeline checked the frame, ms (TopBar "Frame checked … ago"). */
  checkedAt: number;
  frameUrl: string | null;
  caption: string;
  tags: string[];
  /** Stored at cut time: a historical fact about that cut, never recomputed client-side. */
  beat: { place: string; score: number } | null;
  /** Stored at cut time: true only when no other frame went on air in the hour before this
   *  cut. Anything else (null, absent) means "not established", and the UI claims nothing. */
  firstOnAirThisHour?: boolean | null;
  cameraName: string | null;
  sourceHost: string | null;
  sourceUrl: string | null;
  headline?: string | null;
  /** The narrator's story for a country fetch; falls back to the scorer's caption. */
  narration?: string | null;
};

export type FetchStage =
  | "searching"
  | "candidates"
  | "pulling"
  | "checking"
  | "rejected"
  | "scoring"
  | "done"
  | "failed";

/** One `fetches` row, as C-08 subscribes to it. Counts reconcile: stale + misplaced =
 *  rejected, rejected + kept = n. */
export type FetchRow = {
  fetchId: string;
  country: string;
  stage: FetchStage;
  n: number;
  i: number;
  cameraName: string | null;
  /** Age the source reported for the frame being checked, ms; null = no timestamp. */
  frameAgeMs: number | null;
  stale: number;
  misplaced: number;
  kept: number;
  startedAt: number;
  stageStartedAt: number;
};

export type MailStatus = "queued" | "accepted" | "delivered" | "bounced" | "unconfirmed";

export type MailState = {
  status: MailStatus;
  messageId: string;
  /** When the latest status was recorded, ms. */
  at: number;
};

export type ChatStep = { label: string; state: "done" | "active" };

export type ChatTurn =
  | { role: "user"; text: string }
  | { role: "assistant"; text: string; places: string[]; status: "streaming" | "done" | "stopped" | "error" };

export type VerifiedChip = { country: string; capturedAt: number };
