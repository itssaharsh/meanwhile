import { useState } from "react";
import { cn } from "@/lib/utils";
import { COPY, ADDED } from "@/lib/copy";
import { formatCoord, formatUtcTime } from "@/lib/format";
import type { FetchRow, Snapshot } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { EnvelopeArc } from "./brand";
import { CountryFetchProgress } from "./CountryFetchProgress";
import { FreshnessChip, Skeleton } from "./primitives";
import { ScoreReadout } from "./ScoreReadout";

/** COPY §4 credit. With no source time there is no "frame taken" clause to state (COPY rule 2);
 *  that shortened form is ADDED.storyCreditNoTime. */
function creditText(s: Snapshot): string {
  const time = s.capturedAt != null ? formatUtcTime(s.capturedAt) : null;
  if (time == null) return ADDED.storyCreditNoTime.text(s.cameraName ?? COPY.story.publicCamera, s.place.name, s.place.country);
  return s.cameraName
    ? COPY.story.credit(s.cameraName, s.place.name, s.place.country, formatCoord(s.place.lat), formatCoord(s.place.lon), time)
    : COPY.story.creditNoName(s.place.name, s.place.country, time);
}

const firstSentence = (t: string) => (t.match(/^.*?[.!?](\s|$)/)?.[0] ?? t).trim();

// C-04 StoryCard — what am I looking at, is it actually live, who filmed it, can I have it.
// Order: freshness chip → frame → place block → score (card) → narration → credit → actions.
export function StoryCard({
  story,
  state = "idle",
  onAirId,
  fetchRow,
  now,
  forceHover,
  reduced,
  onAsk,
  onSend,
  onFrame,
  onPutOnAir,
}: {
  story: Snapshot | null;
  state?: "idle" | "loading" | "fetching";
  /** The snapshot on air. The amber frame and ON AIR tag are derived from it. */
  onAirId: string | null;
  fetchRow?: FetchRow;
  now: number;
  forceHover?: boolean;
  reduced?: boolean;
  onAsk?: () => void;
  onSend?: () => void;
  onFrame?: (s: Snapshot) => void;
  /** Take the director's chair: put THIS frame on air. Absent = the channel is read-only here. */
  onPutOnAir?: (s: Snapshot) => void;
}) {
  const [broken, setBroken] = useState(false);

  if (state === "loading" || (state === "fetching" && fetchRow)) {
    const fetching = state === "fetching" && fetchRow;
    return (
      <div className="flex flex-col gap-3.5" aria-busy="true">
        <Skeleton className="h-6 w-[88px]" pulse={!fetching} />
        {fetching ? (
          <CountryFetchProgress row={fetchRow!} reduced={reduced} />
        ) : (
          <Skeleton className="aspect-video w-full !rounded-md" />
        )}
        <div className="flex flex-col gap-1.5">
          {fetching ? (
            // The country name is known at click time, so it appears with zero latency.
            <h2 tabIndex={-1} className="m-0 font-place text-[22px] leading-[1.2] font-semibold tracking-[-0.01em] text-ink outline-none max-sm:text-[20px]">
              {fetchRow!.country}
            </h2>
          ) : (
            <Skeleton className="h-[22px] w-[160px]" />
          )}
        </div>
        <div className="flex flex-col gap-2">
          <Skeleton className="h-3.5 w-full" pulse={!fetching} />
          <Skeleton className="h-3.5 w-[96%]" pulse={!fetching} />
          <Skeleton className="h-3.5 w-[64%]" pulse={!fetching} />
        </div>
      </div>
    );
  }

  if (!story) return null;
  const s = story;
  const onAir = s.snapshotId === onAirId;
  const noFrame = broken || !s.frameUrl;
  const narration = s.narration ?? s.caption;
  const credit = creditText(s);
  const linkLabel = s.cameraName ?? COPY.story.publicCamera;
  const creditRest = credit.startsWith(linkLabel) ? credit.slice(linkLabel.length) : credit;

  return (
    <article aria-labelledby="story-place" data-snapshot-id={s.snapshotId} className="flex flex-col gap-3.5">
      <FreshnessChip capturedAt={s.capturedAt} now={now} />

      {/* frame */}
      {noFrame ? (
        <div className="flex aspect-video w-full items-center justify-center rounded-md border border-line bg-surface-2 px-4 text-center font-mono text-[10px] tracking-[0.1em] text-ink-muted uppercase @max-[420px]/dock:-mx-4 @max-[420px]/dock:w-[calc(100%+32px)] @max-[420px]/dock:rounded-none @max-[420px]/dock:border-x-0">
          {COPY.errors.frameFailed.title}
        </div>
      ) : (
        <div className="relative">
        <button
          type="button"
          data-hover={forceHover || undefined}
          onClick={() => onFrame?.(s)}
          className={cn(
            "group/frame relative block aspect-video w-full cursor-zoom-in overflow-hidden rounded-md border",
            "[transition:border-color_150ms_var(--ease-out-quint),transform_120ms_var(--ease-out-quint)] active:scale-[.995] motion-reduce:active:scale-100",
            "@max-[420px]/dock:-mx-4 @max-[420px]/dock:w-[calc(100%+32px)] @max-[420px]/dock:rounded-none @max-[420px]/dock:border-x-0",
            onAir ? "border-accent" : "border-line hover:border-line-strong data-[hover]:border-line-strong",
          )}
        >
          <img src={s.frameUrl!} alt={firstSentence(narration)} onError={() => setBroken(true)} className="absolute inset-0 size-full object-cover" />
          {onAir && (
            <span className="absolute top-2 left-2 rounded-sm bg-canvas px-1.5 py-0.5 font-mono text-[10px] leading-[1.3] tracking-[0.14em] text-accent uppercase">
              {COPY.rail.onAirTag}
            </span>
          )}
        </button>
        {/* The control that answers "can I change the camera?". It sits on the frame, opposite
            the ON AIR tag, because the tag is the state this button produces. It is never amber:
            amber marks the frame that IS on air, and this one is not. The frame is itself a
            button (it opens full size), so this cannot nest inside it. */}
        {onPutOnAir &&
          (onAir ? (
            <span className="absolute top-2 right-2 rounded-sm border border-line-strong bg-canvas px-2 py-1 font-mono text-[10px] leading-[1.3] tracking-[0.12em] text-ink-muted uppercase">
              {ADDED.chairOnAir.text}
            </span>
          ) : (
            <button
              type="button"
              onClick={() => onPutOnAir(s)}
              className="hit-44 absolute top-2 right-2 rounded-sm border border-line-strong bg-canvas px-2 py-1 font-mono text-[10px] leading-[1.3] tracking-[0.12em] text-ink uppercase [transition:background-color_150ms_var(--ease-out-quint),border-color_150ms_var(--ease-out-quint)] hover:border-ink-muted hover:bg-surface-1"
            >
              {ADDED.chairTake.text}
            </button>
          ))}
        </div>
      )}

      {/* place block */}
      <div className="flex flex-col gap-1">
        <h2
          id="story-place"
          tabIndex={-1}
          className="m-0 font-place text-[22px] leading-[1.2] font-semibold tracking-[-0.01em] text-ink outline-none max-sm:text-[20px]"
        >
          {s.place.name}
        </h2>
        <p className="m-0 font-mono text-[11px] tracking-[0.1em] text-ink-muted uppercase">{s.place.country}</p>
        {s.headline && <p className="m-0 mt-1.5 font-display text-[17px] leading-[1.3] font-semibold tracking-[-0.01em] text-ink">{s.headline}</p>}
      </div>

      <ScoreReadout variant="card" snapshot={s} onAirId={onAirId} state={s.score == null ? "unscored" : "idle"} showCaption={narration !== s.caption} reduced={reduced} />

      <p className="m-0 max-w-[62ch] font-sans text-[14px] leading-[1.55] text-ink @max-[420px]/dock:text-[15px]">{narration}</p>

      <p className="m-0 font-mono text-[11px] leading-[1.5] text-ink-muted tnum">
        {s.sourceUrl ? (
          <a
            href={s.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="underline decoration-line-strong underline-offset-[3px] [transition:text-decoration-color_150ms_var(--ease-out-quint)] hover:decoration-ink-muted"
          >
            {linkLabel}
          </a>
        ) : (
          linkLabel
        )}
        {creditRest}
      </p>

      {/* actions: sticky to the panel bottom so "Send me this" is always reachable */}
      <div className="sticky bottom-0 -mx-4 mt-auto flex h-[60px] items-center gap-2 border-t border-line bg-surface-1 px-4 max-sm:h-auto max-sm:py-2.5">
        <Button variant="default" size="md" onClick={onAsk} className="max-sm:h-11 max-sm:flex-1">
          {COPY.story.ask}
        </Button>
        <Button
          variant="strong"
          size="md"
          onClick={noFrame ? undefined : onSend}
          aria-disabled={noFrame || undefined}
          aria-describedby={noFrame ? "story-no-frame" : undefined}
          focusableWhenDisabled
          className="max-sm:h-11 max-sm:flex-1"
        >
          <EnvelopeArc size={20} />
          {COPY.story.send}
        </Button>
        {noFrame && (
          <span id="story-no-frame" className="font-sans text-[12px] text-ink-muted">
            {ADDED.storyNoFrame.text}
          </span>
        )}
      </div>
    </article>
  );
}
