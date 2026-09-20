import { motion } from "motion/react";
import { ADDED } from "@/lib/copy";
import { formatScore } from "@/lib/format";
import { useReduced } from "@/lib/hooks";
import type { Snapshot } from "@/lib/types";
import { FreshnessChip } from "@/components/primitives";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const E = [0.22, 1, 0.36, 1] as const;

/**
 * C-17 Landing — the front door, over a channel that is already broadcasting.
 *
 * A visitor used to arrive at a spinning globe and a chyron with no sentence anywhere saying
 * what any of it was. The card that replaced that said enough for ten seconds; this says enough
 * to decide whether to stay, and it proves the claim while it makes it.
 *
 * It is deliberately not a marketing page with a screenshot. The TopBar above it is the live
 * chyron, the globe behind it is turning with the real terminator, the running order below it is
 * the real one, and the panel on the right is the frame that is genuinely on air this second —
 * it changes while you read. Nothing here is a mock, which is the whole argument the product is
 * making: you can check a claim, or you can watch it be true.
 */
export function Landing({
  onAir,
  feed,
  now,
  onStart,
  onPick,
  reduced: forceReduced,
}: {
  onAir: Snapshot | null;
  feed: Snapshot[];
  now: number;
  onStart: () => void;
  onPick?: () => void;
  reduced?: boolean;
}) {
  const reduced = useReduced(forceReduced);
  const countries = new Set(feed.map((f) => f.place.country)).size;

  return (
    <motion.div
      role="dialog"
      aria-modal="false"
      aria-label={ADDED.introTitle.text}
      className="absolute inset-0 z-40 overflow-y-auto overscroll-contain"
      initial={reduced ? false : { opacity: 0 }}
      animate={{ opacity: 1, transition: { duration: reduced ? 0 : 0.3, ease: E } }}
      exit={{ opacity: 0, transition: { duration: 0.15 } }}
    >
      {/* The planet stays visible through this: it is the product, not a backdrop. Dark enough
          that body copy sits on a flat field rather than on a coastline. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[color-mix(in_oklab,var(--canvas)_88%,transparent)]" />

      <div className="relative flex min-h-full items-center justify-center px-5 py-10 max-sm:px-4 max-sm:py-6">
        <motion.div
          className={cn(
            "grid w-full max-w-[1040px] grid-cols-12 grid-rows-[auto_auto] items-start gap-x-10 gap-y-7",
            // Below 900 it becomes one column, and the PREVIEW moves above the legend: the live
            // frame is the argument, so on a phone it has to be on the first screen, not under
            // three paragraphs about it.
            // items-start is a grid rule; in the one-column flex it would shrink every block to
            // its content width, which left the preview card narrower than the paragraph above it.
            "max-[900px]:flex max-[900px]:max-w-[560px] max-[900px]:flex-col max-[900px]:items-stretch max-[900px]:gap-5",
          )}
          initial={reduced ? false : { y: 10 }}
          animate={{ y: 0, transition: { duration: reduced ? 0 : 0.34, ease: E } }}
        >
          {/* ---- what it is ------------------------------------------------------------ */}
          <div className="col-span-5 col-start-1 row-start-1 flex flex-col gap-4 max-[900px]:order-1">
            <h1 className="m-0 font-display text-[36px] leading-[1.08] font-semibold tracking-[-0.035em] text-ink text-balance max-sm:text-[28px]">
              {ADDED.introTitle.text}
            </h1>
            <p className="m-0 max-w-[46ch] font-sans text-[15px] leading-[1.6] text-ink-muted text-pretty">{ADDED.introBody.text}</p>
          </div>

          {/* ---- the product, running ---------------------------------------------------- */}
          <div className="col-span-7 col-start-6 row-span-2 row-start-1 max-[900px]:order-2">
            <Preview onAir={onAir} feed={feed} now={now} onOpen={onStart} />
          </div>

          {/* ---- how to read it, and the way in ------------------------------------------ */}
          <div className="col-span-5 col-start-1 row-start-2 flex flex-col gap-5 max-[900px]:order-3">
            {/* The two colour rules, in the colours they describe. This is the whole legend a
                judge needs to read every screen that follows. */}
            <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
              <Rule tone="live">{ADDED.introHow.text}</Rule>
              <Rule tone="accent">{ADDED.introAmber.text}</Rule>
            </ul>

            <div className="flex flex-wrap gap-2">
              <Button variant="strong" size="lg" onClick={onStart} autoFocus className="max-sm:w-full">
                {ADDED.introStart.text}
              </Button>
              {onPick && (
                <Button variant="quiet" size="lg" onClick={onPick} className="max-sm:w-full">
                  {ADDED.introPick.text}
                </Button>
              )}
            </div>

            {/* Data, not claims: every number here is counted off the running order on screen. */}
            {feed.length > 0 && (
              <p className="m-0 font-mono text-[11px] tracking-[0.1em] text-ink-muted uppercase tnum">
                {feed.length} cameras · {countries} countries · live now
              </p>
            )}
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}

function Rule({ tone, children }: { tone: "live" | "accent"; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2.5 font-sans text-[13px] leading-[1.5] text-ink-muted">
      <span
        aria-hidden="true"
        data-swatch=""
        className={cn("mt-[6px] inline-block size-1.5 shrink-0 rounded-full", tone === "live" ? "bg-live" : "bg-accent")}
      />
      {children}
    </li>
  );
}

/** The frame on air, at this second, with the running order under it. Clicking anything here
 *  goes straight into the channel — the preview IS the door. */
function Preview({ onAir, feed, now, onOpen }: { onAir: Snapshot | null; feed: Snapshot[]; now: number; onOpen: () => void }) {
  if (!onAir) {
    // Never a spinner and never an empty box: the skeleton is the shape of the real card, so
    // the layout does not jump when the first cut lands.
    return (
      <div className="flex flex-col gap-3" aria-busy="true">
        <div className="mw-skeleton aspect-video w-full rounded-lg" />
        <div className="mw-skeleton h-4 w-40 rounded-sm" />
      </div>
    );
  }

  const strip = feed.filter((f) => f.snapshotId !== onAir.snapshotId).slice(0, 4);

  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        onClick={onOpen}
        data-snapshot-id={onAir.snapshotId}
        aria-label={`${ADDED.chairOnAir.text} — ${onAir.place.name}, ${onAir.place.country}`}
        className={cn(
          "group/prev relative block aspect-video w-full cursor-pointer overflow-hidden rounded-lg border border-accent bg-surface-2 text-left",
          "[transition:transform_150ms_var(--ease-out-quint)] hover:scale-[1.004] active:scale-[.997] motion-reduce:hover:scale-100 motion-reduce:active:scale-100",
        )}
      >
        {onAir.frameUrl && <img src={onAir.frameUrl} alt={onAir.caption} className="absolute inset-0 size-full object-cover" />}
        <span className="absolute top-2.5 left-2.5 rounded-sm bg-canvas px-1.5 py-0.5 font-mono text-[10px] leading-[1.3] tracking-[0.14em] text-accent uppercase">
          {ADDED.chairOnAir.text}
        </span>
        <span className="absolute inset-x-0 bottom-0 flex flex-wrap items-center gap-x-2.5 gap-y-1 bg-[linear-gradient(180deg,transparent,color-mix(in_oklab,var(--canvas)_94%,transparent)_60%)] px-3 pt-8 pb-2.5">
          <span className="font-place text-[17px] leading-none font-semibold text-ink">{onAir.place.name}</span>
          <span className="font-mono text-[10px] tracking-[0.12em] text-ink-muted uppercase">{onAir.place.country}</span>
          {onAir.score != null && <span className="ml-auto font-mono text-[15px] text-accent tnum">{formatScore(onAir.score)}</span>}
        </span>
      </button>

      <div className="flex flex-wrap items-center gap-2">
        <FreshnessChip capturedAt={onAir.capturedAt} now={now} />
      </div>

      {strip.length > 0 && (
        <ul className="m-0 grid list-none grid-cols-4 gap-2 p-0">
          {strip.map((s) => (
            <li key={s.snapshotId} className="relative aspect-video overflow-hidden rounded-md border border-line bg-surface-2">
              {s.frameUrl && <img src={s.frameUrl} alt="" className="absolute inset-0 size-full object-cover" />}
              <span className="absolute inset-x-0 bottom-0 flex items-center gap-1 bg-[linear-gradient(180deg,transparent,color-mix(in_oklab,var(--canvas)_92%,transparent)_55%)] px-1.5 pt-5 pb-1">
                <span className="font-mono text-[10px] text-ink tnum">{s.score != null ? formatScore(s.score) : "—.—"}</span>
                <span className="min-w-0 truncate font-place text-[10px] font-semibold text-ink-muted">{s.place.name}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
