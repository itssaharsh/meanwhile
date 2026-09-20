import { useId, type ReactNode } from "react";
import { AnimatePresence, motion, useIsPresent } from "motion/react";
import { cn } from "@/lib/utils";
import { COPY, ADDED } from "@/lib/copy";
import { formatAge, formatLocalTime, formatScore } from "@/lib/format";
import { useReduced } from "@/lib/hooks";
import type { Snapshot } from "@/lib/types";
import { MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EnvelopeArc } from "./brand";

const E = [0.22, 1, 0.36, 1] as const;

export type TopBarState = "onair" | "standby" | "cut" | "between" | "degraded" | "error" | "empty";

function Tally({ lit, pulseKey, reduced }: { lit: boolean; pulseKey?: string; reduced: boolean }) {
  return (
    <span aria-hidden="true" className="relative flex size-5 shrink-0 items-center justify-center">
      {lit && <span className="absolute inset-0 rounded-full border border-[color-mix(in_oklab,var(--accent)_35%,transparent)]" />}
      <motion.span
        key={pulseKey}
        className={cn("block size-2.5 rounded-full", lit ? "bg-accent" : "bg-ink-muted")}
        // T-03 row 1: the tally double-pulses 1 → .35 → 1 over 240ms on a cut. Reduced: static.
        initial={false}
        animate={lit && pulseKey && !reduced ? { opacity: [1, 0.35, 1, 0.35, 1] } : { opacity: 1 }}
        transition={{ duration: 0.24, ease: "linear" }}
      />
    </span>
  );
}

const Sep = () => (
  <span aria-hidden="true" className="mx-2 shrink-0 text-[13px] text-ink-muted max-sm:mx-1.5">
    ·
  </span>
);

/** "Tromsø, Norway · 9.6" — the only --ff-place in the TopBar. The score is amber only while
 *  this frame holds the air: a frame being cut away from (`live` false, or exiting) is --ink,
 *  so two amber scores never share the bar, even mid-cut. */
function OnAirPlace({ s, live, muted = false, className, style }: { s: Snapshot; live: boolean; muted?: boolean; className?: string; style?: React.CSSProperties }) {
  const present = useIsPresent();
  const amber = live && present;
  return (
    <span className={cn("flex min-w-0 items-baseline", className)} style={style} data-snapshot-id={amber ? s.snapshotId : undefined}>
      {/* The place name is never truncated and never dropped — it is the one thing the bar is
          for. The country goes first when the bar runs out of room (below 640px), and the
          name keeps its full width at every size. */}
      <span
        className={cn(
          "shrink-0 font-place text-[18px] leading-none font-semibold tracking-[-0.01em] max-sm:text-[16px]",
          muted ? "text-ink-muted" : "text-ink",
        )}
      >
        {s.place.name}
        <span className="max-sm:hidden">, {s.place.country}</span>
      </span>
      <Sep />
      <span
        className={cn(
          "shrink-0 font-mono text-[15px] leading-none tracking-[0.02em] tnum max-sm:text-[13px]",
          amber ? "text-accent" : muted ? "text-ink-muted" : "text-ink",
        )}
      >
        {s.score != null ? formatScore(s.score) : "—.—"}
      </span>
    </span>
  );
}

// C-01 TopBar / OnAirChyron — never unmounts, never freezes. Amber only when something is on
// air; neither action is amber. The live region is the chyron's first line only, so the
// "frame checked … ago" meta, which ticks every minute, is never re-announced.
export function TopBar({
  state,
  onAir,
  previous,
  now,
  framesScored = null,
  backAt = null,
  reconnectAttempt = 1,
  deliveryChip,
  reduced: forceReduced,
  onAsk,
  onSend,
  className,
}: {
  state: TopBarState;
  onAir?: Snapshot | null;
  /** For ?state=cut: the frame being cut away from. */
  previous?: Snapshot | null;
  now: number;
  /** From data only; without it the between-cuts line says just "Cutting". */
  framesScored?: number | null;
  /** From data only; without it the degraded line omits the time. */
  backAt?: string | null;
  reconnectAttempt?: number;
  deliveryChip?: ReactNode;
  reduced?: boolean;
  onAsk?: () => void;
  onSend?: () => void;
  className?: string;
}) {
  const reduced = useReduced(forceReduced);
  const disabledId = useId();
  const lit = (state === "onair" || state === "cut") && !!onAir;
  const sendDisabled = state === "standby" || state === "empty" || state === "between" || !onAir;

  // Below 380px the words go and the tally dot carries the state by itself — it is amber or it
  // is not, which is the whole claim. Screen readers still hear the word: the status region
  // above is aria-live, so the label is hidden visually rather than removed.
  const label = (text: string, amber = false) => (
    <span
      className={cn(
        "shrink-0 font-mono text-[11px] leading-none font-normal tracking-[0.14em] uppercase max-[380px]:sr-only",
        amber ? "text-accent" : "text-ink-muted",
      )}
    >
      {text}
    </span>
  );
  const sentence = (text: string, mono = false) => (
    <span className={cn("min-w-0 truncate leading-none text-ink-muted", mono ? "font-mono text-[11px] tnum" : "font-sans text-[13px]")}>{text}</span>
  );

  let line: ReactNode = null;
  let meta: string | null = null;

  if (state === "onair" && onAir) {
    line = (
      <>
        {label(COPY.topBar.onAirLabel, true)}
        <Sep />
        <span className="relative flex min-w-0 items-baseline overflow-hidden py-1">
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span
              key={onAir.snapshotId}
              className="flex min-w-0 items-baseline"
              // T-03 row 2: out -8px over 120ms; in from 8px over 180ms E starting at 80ms.
              initial={reduced ? false : { y: 8, opacity: 0 }}
              animate={{ y: 0, opacity: 1, transition: reduced ? { duration: 0 } : { duration: 0.18, delay: 0.08, ease: E } }}
              exit={reduced ? { opacity: 0, transition: { duration: 0 } } : { y: -8, opacity: 0, transition: { duration: 0.12, ease: E } }}
            >
              <OnAirPlace s={onAir} live />
            </motion.span>
          </AnimatePresence>
        </span>
      </>
    );
    // COPY rule 2: an age renders only from a source-supplied timestamp — so {age} is the
    // frame's own (capturedAt), and with no source time there is no age clause at all.
    meta = onAir.capturedAt != null ? COPY.topBar.onAirMeta(formatAge(now - onAir.capturedAt), formatLocalTime(now, onAir.place.utcOffsetMin)) : null;
  } else if (state === "cut" && onAir) {
    // A frozen mid-flight frame of T-03 (≈150ms in): the outgoing place is almost gone, the
    // incoming one is arriving.
    line = (
      <>
        {label(COPY.topBar.onAirLabel, true)}
        <Sep />
        <span className="relative flex min-w-0 items-baseline overflow-hidden py-1">
          {previous && <OnAirPlace s={previous} live={false} className="absolute inset-0 top-1" style={{ transform: "translateY(-7px)", opacity: 0.12 }} />}
          <OnAirPlace s={onAir} live style={{ transform: "translateY(2px)", opacity: 0.72 }} />
        </span>
      </>
    );
  } else if (state === "standby") {
    line = (
      <>
        {label("———")}
        <Sep />
        {sentence(ADDED.topBarStandby.text)}
      </>
    );
  } else if (state === "between") {
    line = (
      <>
        {label(COPY.topBar.betweenLabel)}
        {framesScored != null && (
          <>
            <Sep />
            {sentence(COPY.topBar.betweenMeta(framesScored), true)}
          </>
        )}
      </>
    );
  } else if (state === "degraded") {
    line = (
      <>
        {label(COPY.topBar.degradedLabel)}
        <Sep />
        {sentence(COPY.topBar.degradedMeta)}
      </>
    );
    meta = backAt ? COPY.topBar.degradedBack(backAt) : null;
  } else if (state === "error") {
    // COPY §8: the last verified frame is still here. It stays on screen, but in grey: with
    // the connection down nobody can confirm it is still on air, so nothing claims it is.
    line = (
      <>
        {sentence(COPY.errors.connectionLost.title)}
        <Sep />
        {onAir && (
          <>
            <OnAirPlace s={onAir} live={false} muted />
            <Sep />
          </>
        )}
        {sentence(COPY.errors.connectionLost.status(reconnectAttempt), true)}
      </>
    );
  } else {
    line = sentence(COPY.rail.firstRunTitle);
  }

  return (
    <header
      role="banner"
      data-state={state}
      className={cn(
        "sticky top-0 z-[60] flex h-14 shrink-0 items-center justify-between gap-4 border-b bg-canvas px-5 max-sm:gap-2 max-sm:px-3",
        state === "error" ? "border-danger" : "border-line",
        className,
      )}
    >
      <div className="flex min-w-0 items-center gap-2.5 max-sm:gap-2" data-snapshot-id={lit ? onAir!.snapshotId : undefined}>
        <Tally lit={lit} pulseKey={state === "onair" ? onAir?.snapshotId : undefined} reduced={reduced} />
        <div className="flex min-w-0 items-center">
          <div role="status" aria-live="polite" aria-atomic="true" className="flex min-w-0 items-center">
            {line}
          </div>
          {meta && (
            <span className="ml-2 flex min-w-0 items-center max-[1099px]:hidden">
              <span aria-hidden="true" className="mr-2 text-[13px] text-ink-muted">
                ·
              </span>
              <span className="truncate font-mono text-[11px] leading-none text-ink-muted tnum">{meta}</span>
            </span>
          )}
        </div>
      </div>

      {/* Below 900px the actions keep their names and lose their labels: the words move into
          aria-label and the tooltip, so the name is still the one COPY.md wrote — it is just
          no longer taking room the place name needs. */}
      <div className="flex shrink-0 items-center gap-2 max-sm:gap-1.5">
        <Button
          variant="default"
          size="md"
          onClick={onAsk}
          aria-label={COPY.topBar.askAria}
          title={COPY.topBar.ask}
          className="hit-44 max-[900px]:size-[44px] max-[900px]:px-0"
        >
          <MessageCircle aria-hidden="true" className="hidden size-[18px] max-[900px]:block" strokeWidth={1.6} />
          <span className="max-[900px]:hidden">{COPY.topBar.ask}</span>
        </Button>
        <Button
          variant="strong"
          size="md"
          onClick={sendDisabled ? undefined : onSend}
          aria-label={COPY.topBar.sendAria}
          aria-disabled={sendDisabled || undefined}
          aria-describedby={sendDisabled ? disabledId : undefined}
          title={sendDisabled ? COPY.rail.firstRunTitle : COPY.topBar.send}
          focusableWhenDisabled
          className="hit-44 max-[900px]:size-[44px] max-[900px]:px-0"
        >
          <EnvelopeArc aria-hidden="true" size={18} className="hidden max-[900px]:block" />
          <span className="max-[900px]:hidden">{COPY.topBar.send}</span>
        </Button>
        {sendDisabled && (
          <span id={disabledId} className="sr-only">
            {COPY.rail.firstRunTitle}
          </span>
        )}
        {/* C-09: after a send, the DeliveryChip docks here as the third element. */}
        {deliveryChip}
      </div>
    </header>
  );
}
