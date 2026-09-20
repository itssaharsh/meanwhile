import { useEffect, useRef } from "react";
import { AnimatePresence, motion } from "motion/react";
import { cn } from "@/lib/utils";
import { COPY, ADDED } from "@/lib/copy";
import { useReduced } from "@/lib/hooks";
import type { Snapshot } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { FreshnessChip } from "./primitives";

const E = [0.22, 1, 0.36, 1] as const;

// "Right now we're in {place}." — split around the slot so the place keeps its own voice and roll.
const SLOT = "{place}";
const [LIVE_BEFORE, LIVE_AFTER] = ADDED.notFoundLive.text(SLOT).split(SLOT);

export type NotFoundState = "idle" | "loading" | "nochannel" | "error";

// C-12 NotFound — not outside the channel, a caption over it. The TopBar stays above and the
// globe keeps turning behind at .35. The live line proves the product's claim as well as any
// other screen: it names where the channel is right now, teal or grey exactly as everywhere.
export function NotFound({
  state,
  onAir,
  now,
  reduced: forceReduced,
  onReturn,
  onPick,
}: {
  state: NotFoundState;
  onAir: Snapshot | null;
  now: number;
  reduced?: boolean;
  onReturn?: () => void;
  onPick?: () => void;
}) {
  const reduced = useReduced(forceReduced);
  const h1 = useRef<HTMLHeadingElement>(null);
  useEffect(() => h1.current?.focus({ preventScroll: true }), []);

  const enter = (delay: number, y = 10) =>
    reduced ? {} : { initial: { opacity: 0, y }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.24, delay, ease: E } };

  return (
    <main className="absolute inset-0 z-10 overflow-y-auto bg-[color-mix(in_oklab,var(--canvas)_86%,transparent)] px-5">
      <div className="mx-auto my-[12vh] flex w-full max-w-[440px] flex-col gap-3 max-sm:my-[8vh]">
        <motion.div
          aria-hidden="true"
          {...(reduced ? {} : { initial: { opacity: 0 }, animate: { opacity: 1 }, transition: { duration: 0.2 } })}
          className={cn(
            "mb-5 flex aspect-video w-full flex-col items-center justify-center gap-1 rounded-md border border-line bg-surface-1 max-[379px]:aspect-[4/3]",
            "[background-image:linear-gradient(var(--line)_1px,transparent_1px),linear-gradient(90deg,var(--line)_1px,transparent_1px)] [background-position:center] [background-size:48px_48px]",
          )}
        >
          <span className="font-mono text-[56px] leading-none tracking-[0.06em] text-line-strong tnum max-sm:text-[44px]">404</span>
          <span className="font-mono text-[11px] tracking-[0.14em] text-ink-muted uppercase">{ADDED.notFoundSlate.text}</span>
        </motion.div>

        <motion.div className="flex flex-col gap-3" {...enter(0.06)}>
          <h1 ref={h1} tabIndex={-1} className="m-0 font-display text-[22px] leading-[1.2] font-semibold text-ink outline-none max-sm:text-[20px]">
            {COPY.notFound.title}
          </h1>
          <p className="m-0 font-sans text-[14px] leading-[1.55] text-ink-muted">{COPY.notFound.body}</p>

          {state !== "error" && (
            <div role="status" aria-live="polite" className="flex min-h-7 flex-wrap items-center gap-x-2 gap-y-1.5 font-sans text-[13px] text-ink-muted">
              {state === "nochannel" ? (
                ADDED.notFoundBetween.text
              ) : state === "loading" || !onAir ? (
                <span>{ADDED.notFoundLive.text("——")}</span>
              ) : (
                <>
                  <span>
                  {LIVE_BEFORE}
                  <span className="relative inline-flex overflow-hidden py-0.5 align-bottom">
                    <AnimatePresence mode="popLayout" initial={false}>
                      <motion.span
                        key={onAir.snapshotId}
                        className="font-place text-[16px] font-semibold text-ink"
                        // T-14 at reduced amplitude: 20px → 0 on the place name.
                        initial={reduced ? false : { y: 20, opacity: 0 }}
                        animate={{ y: 0, opacity: 1, transition: reduced ? { duration: 0 } : { duration: 0.2, delay: 0.1, ease: E } }}
                        exit={reduced ? { opacity: 0, transition: { duration: 0 } } : { y: -20, opacity: 0, transition: { duration: 0.14, ease: E } }}
                      >
                        {onAir.place.name}
                      </motion.span>
                    </AnimatePresence>
                  </span>
                  {LIVE_AFTER}
                  </span>
                  <FreshnessChip capturedAt={onAir.capturedAt} now={now} />
                </>
              )}
            </div>
          )}

          <div className="mt-2 flex gap-2 max-sm:flex-col">
            <Button variant="strong" size="lg" onClick={onReturn} className="max-sm:h-12 max-sm:w-full">
              {COPY.notFound.action}
            </Button>
            <Button variant="quiet" size="lg" onClick={onPick} className="max-sm:h-12 max-sm:w-full">
              {ADDED.notFoundPick.text}
            </Button>
          </div>
        </motion.div>
      </div>
    </main>
  );
}
