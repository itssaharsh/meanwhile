import { AnimatePresence, motion } from "motion/react";
import { cn } from "@/lib/utils";
import { COPY, ADDED } from "@/lib/copy";
import { FRESH_WINDOW_MS, formatAge } from "@/lib/format";
import { useNow, useReduced } from "@/lib/hooks";
import type { FetchRow } from "@/lib/types";
import { Button } from "@/components/ui/button";

const E = [0.22, 1, 0.36, 1] as const;
const ORDER = ["searching", "candidates", "pulling", "checking", "rejected", "scoring"] as const;
const SLOW_AFTER_MS = 9000;

/** The line for a row, from COPY.md §3. `muted` marks a frame that is about to be rejected
 *  (stale, or no source time) — grey, never a warning colour. */
export function stageLine(row: FetchRow): { text: string; muted: boolean } {
  switch (row.stage) {
    case "searching":
      return { text: COPY.fetch.searching(row.country), muted: false };
    case "candidates":
      return { text: COPY.fetch.candidates(row.n, row.country), muted: false };
    case "pulling":
      return { text: COPY.fetch.pulling(row.i, row.n, row.cameraName ?? COPY.story.publicCamera), muted: false };
    case "checking":
      return row.frameAgeMs == null
        ? { text: COPY.story.noTimestamp, muted: true }
        : { text: COPY.fetch.checkingAge(formatAge(row.frameAgeMs)), muted: row.frameAgeMs > FRESH_WINDOW_MS };
    case "rejected":
      return { text: COPY.fetch.rejected(row.stale + row.misplaced, row.n, row.stale, row.misplaced, row.country), muted: false };
    case "scoring":
      return { text: COPY.fetch.scoring(row.kept), muted: false };
    default:
      return { text: "", muted: false };
  }
}

/** The counts must reconcile before they are shown: stale + misplaced = rejected, and
 *  rejected + kept = n. A row that doesn't is a backend bug, surfaced loudly in dev. */
function assertReconciles(row: FetchRow) {
  if (!import.meta.env.DEV || (row.stage !== "rejected" && row.stage !== "scoring")) return;
  const rejected = row.stale + row.misplaced;
  if (rejected + row.kept !== row.n) {
    console.error(`[meanwhile] fetch ${row.fetchId}: counts don't reconcile — ${row.stale} stale + ${row.misplaced} misplaced + ${row.kept} kept ≠ ${row.n}`);
  }
}

// C-08 CountryFetchProgress — sits in the StoryCard's frame slot (same 16/9 box), so the frame
// replaces it in place. One line is ever on screen. The hairline advances by STAGE, never by
// elapsed time: a time-based bar on a 4.5–24s operation is a lie.
export function CountryFetchProgress({
  row,
  compact = false,
  onCancel,
  reduced: forceReduced,
  fixedNow,
}: {
  row: FetchRow;
  compact?: boolean;
  onCancel?: () => void;
  reduced?: boolean;
  fixedNow?: number;
}) {
  const reduced = useReduced(forceReduced);
  const now = useNow(1000, fixedNow);
  assertReconciles(row);

  const { text, muted } = stageLine(row);
  const index = Math.max(0, ORDER.indexOf(row.stage as (typeof ORDER)[number]));
  const inStageMs = now - row.stageStartedAt;
  const slow = inStageMs >= SLOW_AFTER_MS;

  const line = (
    <AnimatePresence mode="popLayout" initial={false}>
      <motion.p
        key={text}
        className={cn(
          "m-0 font-mono tracking-[0.05em] tnum",
          compact ? "text-[11px] leading-4" : "text-[12px] leading-5 max-sm:text-[13px]",
          muted ? "text-ink-muted" : "text-ink",
        )}
        initial={reduced ? false : { opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0, transition: reduced ? { duration: 0 } : { duration: 0.16, delay: 0.08, ease: E } }}
        exit={reduced ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, y: -4, transition: { duration: 0.12, ease: E } }}
      >
        {text}
      </motion.p>
    </AnimatePresence>
  );

  if (compact) {
    return (
      <div role="status" aria-live="polite" aria-atomic="true" className="h-4 overflow-hidden text-left">
        {line}
      </div>
    );
  }

  return (
    <div className="relative flex aspect-video w-full flex-col items-center justify-center overflow-hidden rounded-md border border-line bg-surface-2 px-4 text-center @max-[420px]/dock:-mx-4 @max-[420px]/dock:w-[calc(100%+32px)] @max-[420px]/dock:rounded-none @max-[420px]/dock:border-x-0">
      <div role="status" aria-live="polite" aria-atomic="true" className="max-w-full">
        {line}
      </div>
      {slow && (
        <div className="mt-2 flex items-center gap-3">
          {/* The counter is not announced every second; only its first appearance is. */}
          <span className="font-mono text-[11px] text-ink-muted tnum" aria-live="off">
            {ADDED.fetchStillGoing.text(Math.floor(inStageMs / 1000))}
          </span>
          <Button variant="text" size="md" className="text-ink-muted" onClick={onCancel} aria-label={ADDED.fetchCancelAria.text(row.country)}>
            {ADDED.fetchCancel.text}
          </Button>
        </div>
      )}
      <span
        aria-hidden="true"
        className="absolute inset-x-0 bottom-0 h-px origin-left bg-line-strong"
        style={{
          transform: `scaleX(${(index + 1) / ORDER.length})`,
          transition: reduced ? "none" : "transform 200ms linear",
        }}
      />
    </div>
  );
}
