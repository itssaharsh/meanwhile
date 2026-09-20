import { forwardRef, useState } from "react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import { COPY, ADDED } from "@/lib/copy";
import { formatScore, freshness, freshnessText, isVerified } from "@/lib/format";
import { useReduced } from "@/lib/hooks";
import type { Snapshot } from "@/lib/types";
import { LiveDot } from "./primitives";

const E = [0.22, 1, 0.36, 1] as const;

// C-07 RailItem — one frame in the running order. The whole 196×108 tile is the button.
// Amber is derived from `onAirId` and only ever marks the on-air item: an amber border, the
// rank plate (a dot, no number — it IS the rank), the score and an ON AIR tag. The amber is
// drawn as an overlay that mounts and unmounts instantly, so the outgoing item never shares
// amber with the incoming one, even for a frame (the non-negotiable wins over T-08's 200ms
// drain). T-08's tally flash still fires once, on the incoming item.
//
// Scores are 13px (12px below 640), one step above UI-SPEC's 12px: at 1× Space Mono's "6"
// closes up below 13px and reads as "8", which turns a correct running order into a wrong one.
export const RailItem = forwardRef<
  HTMLButtonElement,
  {
    snapshot: Snapshot;
    rank: number;
    onAirId: string | null;
    now: number;
    flash?: boolean;
    forceNoFrame?: boolean;
    forceHover?: boolean;
    reduced?: boolean;
    tabIndex?: number;
    onOpen?: (s: Snapshot) => void;
    onFocus?: () => void;
  }
>(function RailItem({ snapshot: s, rank, onAirId, now, flash, forceNoFrame, forceHover, reduced: forceReduced, tabIndex, onOpen, onFocus }, ref) {
  const reduced = useReduced(forceReduced);
  const [broken, setBroken] = useState(false);
  const onAir = s.snapshotId === onAirId;
  const noFrame = forceNoFrame || broken || !s.frameUrl;
  const f = freshness(s.capturedAt, now);
  const verified = isVerified(f);
  const score = s.score != null ? formatScore(s.score) : "—.—";

  // Accessible name, composed from COPY.md §2/§4 strings. The last clause is what the click
  // DOES: the running order is also the control that changes the camera, and a tile that only
  // announces its rank and score never says so.
  const label = [
    onAir ? COPY.rail.onAirTag : COPY.rail.rank(rank),
    `${COPY.rail.scoreChip(score, s.place.name)}, ${s.place.country}`,
    freshnessText(f),
    onAir ? ADDED.chairOnAir.text : ADDED.chairTake.text,
  ].join(". ");

  return (
    <button
      ref={ref}
      type="button"
      tabIndex={tabIndex}
      aria-label={label}
      aria-current={onAir ? "true" : undefined}
      data-hover={forceHover || undefined}
      data-rail-item=""
      data-snapshot-id={s.snapshotId}
      data-score={s.score ?? ""}
      onClick={() => onOpen?.(s)}
      onFocus={onFocus}
      className={cn(
        "group/item relative block size-full overflow-hidden rounded-md border border-line bg-surface-2 text-left outline-offset-2",
        "[transition:border-color_150ms_var(--ease-out-quint),transform_120ms_var(--ease-out-quint)] active:scale-[.985] motion-reduce:active:scale-100",
        "hover:border-line-strong data-[hover]:border-line-strong",
      )}
    >
      {noFrame ? (
        <span className="absolute inset-0 flex items-center justify-center bg-surface-2 px-3 pb-8 text-center font-mono text-[10px] tracking-[0.1em] text-ink-muted uppercase">
          {COPY.errors.frameFailed.title}
        </span>
      ) : (
        <img
          src={s.frameUrl!}
          alt=""
          draggable={false}
          onError={() => setBroken(true)}
          className={cn(
            "absolute inset-0 size-full object-cover",
            "[transition:transform_150ms_var(--ease-out-quint)] group-hover/item:scale-[1.02] group-data-[hover]/item:scale-[1.02] motion-reduce:group-hover/item:scale-100",
          )}
        />
      )}

      {/* rank plate */}
      <span
        aria-hidden="true"
        className={cn(
          "absolute top-1.5 left-1.5 flex size-5 items-center justify-center rounded-sm border font-mono text-[12px] leading-none tnum max-sm:size-[18px] max-sm:text-[11px]",
          onAir ? "border-accent bg-accent" : "border-line bg-canvas text-ink-muted",
        )}
      >
        {onAir ? <span className="size-1.5 rounded-full bg-accent-ink" /> : rank}
      </span>

      {onAir ? (
        <span
          aria-hidden="true"
          className="absolute top-1.5 right-1.5 rounded-sm bg-canvas px-1 py-px font-mono text-[9px] leading-[1.3] tracking-[0.14em] text-accent uppercase max-sm:bg-transparent max-sm:px-0 max-sm:text-[8px]"
        >
          {COPY.rail.onAirTag}
        </span>
      ) : (
        /* The same corner the ON AIR tag owns, holding the thing that puts it there. Hover
           and focus only, and never on a phone, where there is no hover and the result of the
           tap is immediate anyway. Grey: amber is the frame on air, and this one is not. */
        <span
          aria-hidden="true"
          className={cn(
            "absolute top-1.5 right-1.5 rounded-sm border border-line-strong bg-canvas px-1 py-px font-mono text-[9px] leading-[1.3] tracking-[0.14em] text-ink uppercase max-sm:hidden",
            "opacity-0 [transition:opacity_150ms_var(--ease-out-quint)] group-hover/item:opacity-100 group-focus-visible/item:opacity-100 group-data-[hover]/item:opacity-100",
          )}
        >
          {ADDED.chairTake.text}
        </span>
      )}

      {/* lower-third: COPY §2 score chip, "{score} · {place}" */}
      <span
        aria-hidden="true"
        className="absolute inset-x-0 bottom-0 flex h-8 items-center gap-1.5 bg-[linear-gradient(180deg,transparent,color-mix(in_oklab,var(--canvas)_92%,transparent)_55%)] px-2"
      >
        <span className={cn("shrink-0 font-mono text-[13px] tnum max-sm:text-[12px]", onAir ? "text-accent" : "text-ink")}>{score}</span>
        <span className="shrink-0 text-[12px] text-ink-muted">·</span>
        {verified && <LiveDot />}
        <span className="min-w-0 truncate font-place text-[12px] font-semibold text-ink max-sm:text-[11px]">{s.place.name}</span>
      </span>

      {/* The on-air border: an overlay, so gaining or losing the air is instant. */}
      {onAir && <span aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-md border border-accent" />}

      {/* T-08 tally flash: an amber wash .18 → 0 over 420ms, and the border pulsing to 2px over
          320ms (drawn as an overlay's opacity, so only opacity animates). Reduced: the static
          2px border simply appears. */}
      {flash && onAir && !reduced && (
        <>
          <motion.span
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-accent"
            initial={{ opacity: 0.18 }}
            animate={{ opacity: 0 }}
            transition={{ duration: 0.42, ease: E }}
          />
          <motion.span
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 rounded-md border-2 border-accent"
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 1, 0] }}
            transition={{ duration: 0.32, ease: "linear", times: [0, 0.5, 1] }}
          />
        </>
      )}
      {flash && onAir && reduced && <span aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-md border-2 border-accent" />}
    </button>
  );
});

/** The layout child. Keyed by snapshotId in the parent — never by index — so a real re-rank
 *  slides the same DOM node to its new x. T-07 is the only spring in the product. */
export const RailSlot = motion.create(
  forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(function RailSlot({ className, ...props }, ref) {
    return <div ref={ref} role="listitem" className={cn("h-[108px] w-[196px] shrink-0 snap-start max-sm:h-[84px] max-sm:w-[168px]", className)} {...props} />;
  }),
);

export const RAIL_SPRING = { type: "spring", visualDuration: 0.45, bounce: 0.12 } as const;

/** Where the running order breaks: any item that outscores the one above it. The on-air item
 *  is first by rule; everything after must be non-increasing. Empty when the order holds. */
export function rankViolations(items: Snapshot[]): string[] {
  const out: string[] = [];
  for (let i = 1; i < items.length; i++) {
    const a = items[i - 1].score ?? -Infinity;
    const b = items[i].score ?? -Infinity;
    if (b > a) out.push(`#${i + 1} ${items[i].place.name} ${items[i].score} outscores #${i} ${items[i - 1].place.name} ${items[i - 1].score}`);
  }
  return out;
}
