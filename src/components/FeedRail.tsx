import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { LayoutGroup } from "motion/react";
import { cn } from "@/lib/utils";
import { COPY, ADDED } from "@/lib/copy";
import { useReduced } from "@/lib/hooks";
import type { Snapshot } from "@/lib/types";
import { RailItem, RailSlot, RAIL_SPRING, rankViolations } from "./RailItem";
import { EmptyState } from "./primitives";

export type RailState = "idle" | "loading" | "first" | "none" | "error";

// C-06 FeedRail — the running order, like a strip of tape. The query's order IS the rank:
// the client never sorts. On a re-rank every item slides on the one spring (T-07).
export function FeedRail({
  items,
  onAirId,
  now,
  state = "idle",
  loadingCounts = { checked: 0, total: 0, scored: 0 },
  flashId = null,
  scrollToEnd = false,
  reconnectAttempt = 1,
  reduced: forceReduced,
  onOpen,
  onAction,
  className,
}: {
  items: Snapshot[];
  onAirId: string | null;
  now: number;
  state?: RailState;
  loadingCounts?: { checked: number; total: number; scored: number };
  flashId?: string | null;
  scrollToEnd?: boolean;
  reconnectAttempt?: number;
  reduced?: boolean;
  onOpen?: (s: Snapshot) => void;
  onAction?: (kind: RailState) => void;
  className?: string;
}) {
  const reduced = useReduced(forceReduced);

  // The rail exists to prove the director ranks. An item that outscores the one above it
  // turns that proof into decoration, so a mis-ordered list is shouted about, not rendered
  // quietly. The client still never sorts: the query's order is the rank.
  if (import.meta.env.DEV && state === "idle") {
    const broken = rankViolations(items);
    if (broken.length) console.error(`[meanwhile] running order is out of order: ${broken.join("; ")}`);
  }

  const trackRef = useRef<HTMLDivElement>(null);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(false);

  const measure = useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    setAtStart(el.scrollLeft <= 1);
    setAtEnd(el.scrollLeft + el.clientWidth >= el.scrollWidth - 1);
  }, []);

  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    measure();
    el.addEventListener("scroll", measure, { passive: true });
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", measure);
      ro.disconnect();
    };
  }, [measure, state]);

  useLayoutEffect(() => {
    const el = trackRef.current;
    if (scrollToEnd && el) el.scrollLeft = el.scrollWidth;
  }, [scrollToEnd, items.length]);

  const body = (() => {
    if (state === "first")
      return (
        <EmptyState
          kind="first"
          region="rail"
          title={COPY.rail.firstRunTitle}
          body={COPY.rail.firstRunBody}
          action={{ label: ADDED.railFirstAction.text, onClick: () => onAction?.("first") }}
        />
      );
    if (state === "none")
      return (
        <EmptyState
          kind="none"
          region="rail"
          title={ADDED.railNoneTitle.text}
          body={ADDED.railNoneBody.text}
          action={{ label: ADDED.railNoneAction.text, onClick: () => onAction?.("none") }}
        />
      );
    if (state === "error")
      return (
        <EmptyState
          kind="error"
          region="rail"
          title={COPY.errors.connectionLost.title}
          body={COPY.errors.connectionLost.body}
          status={COPY.errors.connectionLost.status(reconnectAttempt)}
          action={{ label: COPY.errors.connectionLost.action, onClick: () => onAction?.("error") }}
        />
      );
    if (state === "loading")
      return (
        <div className="flex h-full gap-3 overflow-hidden px-5 pt-2.5 pb-3.5 max-sm:gap-2 max-sm:px-3 max-sm:pt-2 max-sm:pb-2">
          <p className="m-0 flex h-full w-[196px] shrink-0 items-center font-mono text-[10px] leading-[1.5] tracking-[0.12em] text-ink-muted uppercase tnum max-sm:w-[168px]">
            {COPY.rail.loading(loadingCounts.checked, loadingCounts.total, loadingCounts.scored)}
          </p>
          {Array.from({ length: 6 }, (_, i) => (
            // static: no sweep, no pulse (C-06 loading)
            <span key={i} aria-hidden="true" className="mw-skeleton block h-[108px] w-[196px] shrink-0 !rounded-md max-sm:h-[84px] max-sm:w-[168px]" />
          ))}
        </div>
      );
    return (
      <LayoutGroup>
        <div
          ref={trackRef}
          role="list"
          aria-label={COPY.rail.heading}
          data-rail=""
          data-at-start={atStart}
          data-at-end={atEnd}
          className={cn(
            "mw-rail-track flex h-full snap-x snap-mandatory scroll-pl-5 gap-3 overflow-x-auto overflow-y-hidden px-5 pt-2.5 pb-3.5",
            "max-sm:scroll-pl-3 max-sm:gap-2 max-sm:px-3 max-sm:pt-2 max-sm:pb-2 max-sm:[touch-action:pan-x]",
            "max-lg:px-4 max-lg:scroll-pl-4",
          )}
        >
          {items.map((s, i) => (
            <RailSlot key={s.snapshotId} layout={!reduced} transition={{ layout: RAIL_SPRING }}>
              <RailItem
                snapshot={s}
                rank={i + 1}
                onAirId={onAirId}
                now={now}
                flash={flashId === s.snapshotId}
                reduced={reduced}
                onOpen={onOpen}
              />
            </RailSlot>
          ))}
        </div>
      </LayoutGroup>
    );
  })();

  return (
    <section className={cn("group/rail relative z-30 h-[var(--rail-h)] shrink-0 border-t border-line bg-canvas", className)}>
      {body}
      {state === "idle" && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -top-2 right-5 bg-canvas px-1.5 font-mono text-[10px] leading-4 tracking-[0.1em] text-ink-muted uppercase opacity-0 group-has-[:focus-visible]/rail:opacity-100 max-sm:hidden"
        >
          {ADDED.railKeyHint.text}
        </span>
      )}
    </section>
  );
}
