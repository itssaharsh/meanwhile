import { AnimatePresence, motion, useIsPresent } from "motion/react";
import { cn } from "@/lib/utils";
import { ADDED } from "@/lib/copy";
import { formatScore } from "@/lib/format";
import { useReduced } from "@/lib/hooks";
import type { Snapshot } from "@/lib/types";

const E = [0.22, 1, 0.36, 1] as const;

/** One roll of the score (T-14). An exiting roll is no longer on air, so it drops amber the
 *  moment it starts leaving — two amber scores never share the screen, even mid-transition. */
function Roll({ text, amber, muted, reduced }: { text: string; amber: boolean; muted: boolean; reduced: boolean }) {
  const present = useIsPresent();
  return (
    <motion.span
      className={cn("block", amber && present ? "text-accent" : muted ? "text-ink-muted" : "text-ink")}
      initial={reduced ? false : { y: 14, opacity: 0 }}
      animate={{ y: 0, opacity: 1, transition: reduced ? { duration: 0 } : { duration: 0.2, delay: 0.1, ease: E } }}
      exit={reduced ? { opacity: 0, transition: { duration: 0 } } : { y: -14, opacity: 0, transition: { duration: 0.14, ease: E } }}
    >
      {text}
    </motion.span>
  );
}

// C-10 ScoreReadout — the score, and what it beat, so the number reads as a decision.
//   stage: over the globe's bottom-left, aria-hidden (C-01's live region already says it),
//          hidden below 640.
//   card:  inside the StoryCard.
// Its treatment comes from context, never from the variant: amber only when `snapshot` IS the
// snapshot on air (`onAirId`), otherwise --ink.
export function ScoreReadout({
  variant,
  snapshot,
  onAirId,
  state = "idle",
  showCaption = true,
  reduced: forceReduced,
}: {
  variant: "stage" | "card";
  snapshot: Snapshot | null;
  /** The snapshot currently on air, or null when nothing is (or it can't be confirmed). */
  onAirId: string | null;
  state?: "idle" | "loading" | "unscored";
  /** Card only: off when the StoryCard's narration already is this caption. */
  showCaption?: boolean;
  reduced?: boolean;
}) {
  const reduced = useReduced(forceReduced);

  // Nothing on air: an empty score box on the globe is worse than nothing.
  if (variant === "stage" && !snapshot && state !== "loading") return null;

  const stage = variant === "stage";
  const scored = state === "idle" && snapshot?.score != null;
  const amber = scored && !!snapshot && snapshot.snapshotId === onAirId;
  const scoreText = scored ? formatScore(snapshot!.score!) : "—.—";
  const beat = snapshot?.beat ?? null;
  // "first on air this hour" is a ranking claim: only when the snapshot itself establishes it.
  const firstEstablished = !beat && snapshot?.firstOnAirThisHour === true;

  const scoreBox = (
    <div className="flex items-baseline gap-1" aria-hidden={!stage ? true : undefined}>
      <span
        className={cn(
          // A one-line box (1.2em of Space Mono, whose glyphs overshoot 1em) that clips the roll.
          "relative inline-block h-[1.2em] overflow-hidden font-mono leading-[1.2] font-normal tracking-[-0.02em] tnum",
          stage ? "text-[40px] max-lg:text-[32px]" : "text-[28px] @max-[420px]/dock:text-[26px]",
        )}
      >
        <AnimatePresence mode="popLayout" initial={false}>
          <Roll key={`${snapshot?.snapshotId ?? "none"}-${scoreText}`} text={scoreText} amber={amber} muted={!scored} reduced={reduced} />
        </AnimatePresence>
      </span>
      <span className="font-mono text-[13px] text-ink-muted tnum">/10</span>
    </div>
  );

  let beatContent: React.ReactNode = null;
  if (state === "unscored") beatContent = ADDED.scoreUnscored.text;
  else if (state === "idle" && beat)
    // ADDED.beat: "beat {place} {score}" — the place keeps the editorial voice, muted.
    beatContent = (
      <>
        {ADDED.beat.word} <span className="font-place text-[12px] font-semibold text-ink-muted">{beat.place}</span> {formatScore(beat.score)}
      </>
    );
  else if (state === "idle" && firstEstablished) beatContent = ADDED.scoreFirst.text;

  const beatLine = beatContent ? (
    <p className="m-0 font-mono text-[12px] text-ink-muted tnum" aria-hidden={!stage ? true : undefined}>
      {beatContent}
    </p>
  ) : null;

  const caption =
    state === "idle" && snapshot?.caption ? (
      <p className={cn("m-0 max-w-[46ch] font-sans text-[13px] leading-[1.5] text-ink", stage && "line-clamp-2 max-lg:line-clamp-1")}>
        {snapshot.caption}
      </p>
    ) : null;

  const tags =
    state === "loading" ? (
      <div className="flex gap-1.5">
        <span className="mw-skeleton block h-5 w-[52px]" />
        <span className="mw-skeleton block h-5 w-[52px]" />
      </div>
    ) : state === "idle" && snapshot && snapshot.tags.length > 0 ? (
      <div className={cn("flex gap-1.5", !stage && "@max-[420px]/dock:flex-wrap")}>
        {snapshot.tags.slice(0, 4).map((t) => (
          <span key={t} className="inline-flex h-5 items-center rounded-sm bg-surface-2 px-1.5 font-mono text-[10px] tracking-[0.1em] text-ink-muted uppercase">
            {t}
          </span>
        ))}
      </div>
    ) : null;

  if (stage) {
    return (
      <>
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-0 z-[34] h-40 bg-[linear-gradient(180deg,transparent,color-mix(in_oklab,var(--canvas)_70%,transparent))] max-sm:hidden"
        />
        <div
          aria-hidden="true"
          data-snapshot-id={snapshot?.snapshotId}
          className="absolute bottom-5 left-5 z-[35] flex max-w-[320px] flex-col gap-1.5 max-lg:max-w-[240px] max-sm:hidden"
        >
          {scoreBox}
          {beatLine}
          {caption}
          {tags}
        </div>
      </>
    );
  }

  const sr =
    scored && snapshot ? ADDED.scoreSr.text(formatScore(snapshot.score!), beat?.place ?? null, beat ? formatScore(beat.score) : null) : null;

  return (
    <div role="group" aria-label={ADDED.scoreAria.text} data-snapshot-id={snapshot?.snapshotId} className="flex flex-col gap-2 border-y border-line py-3">
      {sr && <span className="sr-only">{sr}</span>}
      {scoreBox}
      {beatLine}
      {showCaption && caption}
      {tags}
    </div>
  );
}
