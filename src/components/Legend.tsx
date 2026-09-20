import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { ADDED } from "@/lib/copy";
import { useReduced } from "@/lib/hooks";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const E = [0.22, 1, 0.36, 1] as const;
const SEEN = "mw.legend.seen";

/**
 * C-01's legend — the two colour rules, in the chyron, for anyone who did not come in through
 * the landing page.
 *
 * `/watch` is a shareable URL and a judge may well be handed it directly, which meant arriving
 * at a spinning globe, an amber dot and a teal chip with nothing anywhere saying what either
 * colour meant. The landing says it once; this says it on demand, in the same words, forever.
 *
 * It is a popover and never a layout shift: the bar is a fixed 56px row and the channel is live
 * behind it, so nothing here is allowed to move the picture. It opens itself once per browser
 * and, after that, only when asked.
 */
export function Legend({ reduced: forceReduced }: { reduced?: boolean }) {
  const reduced = useReduced(forceReduced);
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  // First visit to the player opens it once. Dismissal is remembered, so it never nags.
  useEffect(() => {
    try {
      if (localStorage.getItem(SEEN) !== "1") setOpen(true);
    } catch {
      // A browser refusing storage just never auto-opens; the button still works.
    }
  }, []);

  const dismiss = useCallback(() => {
    setOpen(false);
    try {
      localStorage.setItem(SEEN, "1");
    } catch {
      /* not worth an error */
    }
  }, []);

  // Escape and a click outside both close it, like any other popover in the product.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && dismiss();
    const onDown = (e: PointerEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) dismiss();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onDown);
    };
  }, [open, dismiss]);

  return (
    <div ref={wrap} className="relative shrink-0">
      <button
        type="button"
        onClick={() => (open ? dismiss() : setOpen(true))}
        aria-expanded={open}
        aria-haspopup="dialog"
        className={cn(
          "hit-44 rounded-sm font-sans text-[12px] leading-none whitespace-nowrap text-ink-muted underline decoration-line-strong underline-offset-[3px]",
          "[transition:color_150ms_var(--ease-out-quint),text-decoration-color_150ms_var(--ease-out-quint)] hover:text-ink hover:decoration-ink-muted",
          "max-[1099px]:hidden",
        )}
      >
        {ADDED.legendOpen.text}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            role="dialog"
            aria-label={ADDED.legendOpen.text}
            // Absolutely positioned under the bar: the row keeps its height and the picture
            // never moves. Right-aligned so it cannot push off the left edge on a narrow bar.
            className="absolute top-[calc(100%+10px)] right-0 z-[70] w-[340px] max-w-[calc(100vw-24px)] rounded-lg border border-line bg-surface-1 p-4 shadow-sheet"
            initial={reduced ? false : { opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0, transition: { duration: reduced ? 0 : 0.2, ease: E } }}
            exit={{ opacity: 0, y: -4, transition: { duration: 0.12 } }}
          >
            <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
              <Rule tone="live">{ADDED.introHow.text}</Rule>
              <Rule tone="accent">{ADDED.introAmber.text}</Rule>
            </ul>
            <div className="mt-3.5 flex justify-end">
              <Button variant="default" size="md" onClick={dismiss} autoFocus>
                {ADDED.legendClose.text}
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Rule({ tone, children }: { tone: "live" | "accent"; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2.5 font-sans text-[13px] leading-[1.5] text-ink-muted">
      {/* data-swatch: a dot that teaches the amber rule is not a claim about a frame — see
          /_kit's amber-unbound assertion, which is what forced this to be explicit. */}
      <span
        aria-hidden="true"
        data-swatch=""
        className={cn("mt-[6px] inline-block size-1.5 shrink-0 rounded-full", tone === "live" ? "bg-live" : "bg-accent")}
      />
      {children}
    </li>
  );
}
