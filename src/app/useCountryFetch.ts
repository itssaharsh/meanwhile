import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { progressKey, isFinished, countProblems } from "../../convex/stages.js";
import type { FetchRow, Snapshot, VerifiedChip } from "@/lib/types";

/** No update for this long and the fetch is treated as stopped, whatever the server thinks. */
const NO_UPDATE_TIMEOUT_MS = 30_000;
/** The last named stage stays legible even when the server races past it. */
const MIN_STAGE_MS = 400;

type Row = NonNullable<ReturnType<typeof useQuery<typeof api.fetches.watch>>>;

/** The shape C-08 renders, from the row the action is writing. */
function toFetchRow(row: Row, country: string): FetchRow {
  return {
    fetchId: row._id,
    country: row.country || country,
    stage: row.stage as FetchRow["stage"],
    n: row.n,
    i: row.i,
    cameraName: row.cameraName ?? null,
    frameAgeMs: row.frameAgeMs ?? null,
    stale: row.stale,
    misplaced: row.misplaced,
    kept: row.kept,
    startedAt: row.startedAt,
    stageStartedAt: row.stageStartedAt,
  };
}

/** The story, in the shape the StoryCard renders. */
export function toSnapshot(story: NonNullable<ReturnType<typeof useQuery<typeof api.stories.byId>>>): Snapshot {
  let host: string | null = null;
  try {
    host = new URL(story.sourcePage ?? story.sourceImageUrl).host;
  } catch {
    host = null;
  }
  return {
    snapshotId: story._id,
    place: { name: story.place, country: story.country, lat: story.lat, lon: story.lng, utcOffsetMin: Math.round(story.lng / 15) * 60 },
    score: story.score ?? null,
    capturedAt: story.capturedAt,
    checkedAt: story.at,
    frameUrl: story.frameUrl,
    caption: story.caption,
    tags: story.tags,
    // A country click is not a cut, so there is nothing it beat.
    beat: null,
    cameraName: story.cameraName ?? null,
    sourceHost: host,
    sourceUrl: story.sourcePage ?? story.sourceImageUrl,
    headline: story.headline ?? null,
  };
}

export type CountryFetch = {
  start: (country: string, lat: number, lng: number) => void;
  /** Drop the current fetch — what "back to air" does to the Story tab. */
  reset: () => void;
  country: string | null;
  row: FetchRow | null;
  /** Set once the row settles: what the ladder ended with. */
  outcome: "live" | "undated" | "cached" | "empty" | "error" | null;
  story: Snapshot | null;
  chips: VerifiedChip[];
  /** True when nothing has been written for 30 s — the client stops waiting. */
  timedOut: boolean;
  counts: { n: number; stale: number; misplaced: number; kept: number; pages: number; oldestAt?: number; elsewhere?: string } | null;
};

export function useCountryFetch(): CountryFetch {
  const startFetch = useMutation(api.countries.start);
  const [target, setTarget] = useState<{ country: string; lat: number; lng: number } | null>(null);
  const [fetchId, setFetchId] = useState<Id<"fetches"> | null>(null);
  const [timedOut, setTimedOut] = useState(false);

  const live = useQuery(api.fetches.watch, fetchId ? { fetchId } : "skip");
  const storyDoc = useQuery(api.stories.byId, live?.storyId ? { storyId: live.storyId } : "skip");
  const chips = useQuery(
    api.countries.verifiedNow,
    live?.outcome === "empty" && target ? { exclude: target.country, lat: target.lat, lng: target.lng } : "skip",
  );

  // A stage never goes backwards, and the last one stays up long enough to read.
  const [shown, setShown] = useState<Row | null>(null);
  const holdUntil = useRef(0);
  useEffect(() => {
    if (!live) return;
    if (shown && live._id === shown._id && progressKey(live) < progressKey(shown)) return;
    const wait = Math.max(0, holdUntil.current - Date.now());
    const apply = () => {
      holdUntil.current = Date.now() + MIN_STAGE_MS;
      setShown(live);
    };
    if (wait === 0) apply();
    else {
      const t = setTimeout(apply, wait);
      return () => clearTimeout(t);
    }
  }, [live, shown]);

  // Nothing written for 30 s: stop waiting rather than spin forever.
  useEffect(() => {
    if (!shown || isFinished(shown)) return;
    const id = setInterval(() => {
      if (Date.now() - shown.stageStartedAt > NO_UPDATE_TIMEOUT_MS) setTimedOut(true);
    }, 1000);
    return () => clearInterval(id);
  }, [shown]);

  useEffect(() => {
    if (import.meta.env.DEV && shown) {
      for (const p of countProblems(shown)) console.error(`[meanwhile] fetch counts don't reconcile: ${p}`);
    }
  }, [shown]);

  const start = useCallback(
    (country: string, lat: number, lng: number) => {
      setTarget({ country, lat, lng });
      setShown(null);
      setFetchId(null);
      setTimedOut(false);
      holdUntil.current = 0;
      void startFetch({ country, lat, lng }).then((r) => setFetchId(r.fetchId));
    },
    [startFetch],
  );

  const row = shown && target ? toFetchRow(shown, target.country) : null;
  const finished = shown ? isFinished(shown) : false;
  const outcome = timedOut
    ? "error"
    : finished
      ? shown!.stage === "failed"
        ? "error"
        : ((shown!.outcome ?? "empty") as "live" | "undated" | "cached" | "empty")
      : null;

  /** Drop the current country fetch — what "back to air" does to the Story tab. */
  const reset = useCallback(() => setTarget(null), []);

  return {
    start,
    reset,
    country: target?.country ?? null,
    row,
    outcome,
    story: storyDoc && outcome && outcome !== "empty" && outcome !== "error" ? toSnapshot(storyDoc) : null,
    chips: (chips ?? []).map((c) => ({ country: c.country, capturedAt: c.capturedAt })),
    timedOut,
    counts: shown
      ? {
          n: shown.n,
          stale: shown.stale,
          misplaced: shown.misplaced,
          kept: shown.kept,
          pages: shown.pages,
          oldestAt: shown.oldestAt,
          elsewhere: shown.elsewhere,
        }
      : null,
  };
}
