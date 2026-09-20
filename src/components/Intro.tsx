import { motion } from "motion/react";
import { ADDED } from "@/lib/copy";
import { useReduced } from "@/lib/hooks";
import { Button } from "@/components/ui/button";
import { LogoMark } from "@/components/brand";

const E = [0.22, 1, 0.36, 1] as const;

/**
 * C-13 Intro — what this is, for the first ten seconds.
 *
 * A visitor used to land on a spinning globe with a chyron and no way to know what they were
 * looking at. This says it in two sentences and gets out of the way.
 *
 * It is not a wall and not a loader: the channel is already running behind it — the globe is
 * turning, the bar is live, the rail is filling — and dismissing it reveals a screen that was
 * working the whole time. It appears once per browser.
 */
export function Intro({
  onStart,
  onPick,
  reduced: forceReduced,
}: {
  onStart: () => void;
  onPick?: () => void;
  reduced?: boolean;
}) {
  const reduced = useReduced(forceReduced);
  return (
    <motion.div
      role="dialog"
      aria-modal="false"
      aria-label={ADDED.introTitle.text}
      className="pointer-events-none absolute inset-0 z-50 flex items-end justify-center p-5 sm:items-center"
      initial={reduced ? false : { opacity: 0 }}
      animate={{ opacity: 1, transition: { duration: reduced ? 0 : 0.28, ease: E } }}
      exit={{ opacity: 0, transition: { duration: 0.15 } }}
    >
      <motion.section
        className="pointer-events-auto flex w-full max-w-[440px] flex-col gap-4 rounded-lg border border-line bg-surface-1 p-5 shadow-sheet"
        initial={reduced ? false : { y: 12, scale: 0.98 }}
        animate={{ y: 0, scale: 1, transition: { duration: reduced ? 0 : 0.32, ease: E } }}
      >
        <div className="flex items-center gap-2.5">
          <LogoMark size={22} />
          <h1 className="m-0 font-display text-[19px] leading-[1.2] font-semibold tracking-[-0.03em] text-ink">
            {ADDED.introTitle.text}
          </h1>
        </div>

        <p className="m-0 font-sans text-[14px] leading-[1.6] text-ink-muted">{ADDED.introBody.text}</p>

        {/* The one rule that makes the colours readable. */}
        <p className="m-0 flex items-start gap-2 font-sans text-[13px] leading-[1.5] text-ink-muted">
          <span aria-hidden="true" className="mt-[6px] inline-block size-1.5 shrink-0 rounded-full bg-live" />
          {ADDED.introHow.text}
        </p>

        <div className="flex gap-2 max-sm:flex-col">
          <Button variant="strong" size="lg" onClick={onStart} className="max-sm:w-full" autoFocus>
            {ADDED.introStart.text}
          </Button>
          {onPick && (
            <Button variant="quiet" size="lg" onClick={onPick} className="max-sm:w-full">
              {ADDED.introPick.text}
            </Button>
          )}
        </div>
      </motion.section>
    </motion.div>
  );
}
