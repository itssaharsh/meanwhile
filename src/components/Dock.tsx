import { useState, type ReactNode } from "react";
import { motion } from "motion/react";
import { XIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { ADDED } from "@/lib/copy";
import { useReduced } from "@/lib/hooks";
import type { Snapshot } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const E = [0.22, 1, 0.36, 1] as const;
export type DockTab = "story" | "ask";

/** "NOW · REYKJAVÍK" — persists after a cut until clicked; the place is cut at 14 characters. */
function ReturnPill({ s, reduced, onReturn }: { s: Snapshot; reduced: boolean; onReturn?: () => void }) {
  const name = s.place.name.length > 14 ? `${s.place.name.slice(0, 13)}…` : s.place.name;
  return (
    <motion.button
      type="button"
      data-snapshot-id={s.snapshotId}
      onClick={onReturn}
      // T-04: enters at 200ms, opacity 0 → 1 and 6px → 0 over 180ms E. Reduced: no transition.
      initial={reduced ? false : { opacity: 0, x: 6 }}
      animate={{ opacity: 1, x: 0, transition: reduced ? { duration: 0 } : { duration: 0.18, delay: 0.2, ease: E } }}
      className="hit-44 inline-flex h-6 max-w-[160px] items-center rounded-sm border border-accent bg-transparent px-2 font-mono text-[10px] leading-none tracking-[0.12em] whitespace-nowrap text-accent uppercase"
    >
      {ADDED.dockReturnPill.text(name)}
    </motion.button>
  );
}

// C-03 Dock — the detail, without ever losing sight of the channel. Non-modal at every size:
// no scrim, no focus trap, no inert on the globe. Panels are hidden, never unmounted, so their
// subscriptions stay live and reopening is instant.
/** Below this a gesture is still a tap — UI-SPEC C-02's 6px drag threshold. */
const DRAG_THRESHOLD_PX = 6;
/** The rail peek, which is what "snap 0" shows. */
const RAIL_PEEK_PX = 96;

type Drag = { startY: number; height: number; moved: boolean; at: number; lastY: number; v: number };

export function Dock({
  open,
  tab,
  onTabChange,
  returnTo = null,
  cutPulse = false,
  layout = "side",
  snap = 62,
  onSnapChange,
  story,
  ask,
  railStrip,
  reduced: forceReduced,
  onClose,
  onReturn,
  className,
}: {
  open: boolean;
  tab: DockTab;
  onTabChange?: (t: DockTab) => void;
  /** Set after a cut while open: shows the persistent return-to-air pill. */
  returnTo?: Snapshot | null;
  /** T-04's one amber pass down the left border. */
  cutPulse?: boolean;
  layout?: "side" | "sheet";
  snap?: 0 | 62 | 92;
  story: ReactNode;
  ask: ReactNode;
  /** Mobile: the snap the drag settled on. */
  onSnapChange?: (snap: 0 | 62 | 92) => void;
  /** Mobile: the rail's 96px peek strip, welded to the sheet's top edge as its handle. */
  railStrip?: ReactNode;
  reduced?: boolean;
  onClose?: () => void;
  onReturn?: () => void;
  className?: string;
}) {
  const reduced = useReduced(forceReduced);
  const sheet = layout === "sheet";
  const [drag, setDrag] = useState<Drag | null>(null);

  const tabs = (
    <Tabs value={tab} onValueChange={(v) => onTabChange?.(v as DockTab)} className="min-h-0 flex-1">
      <div className="flex h-10 shrink-0 items-center border-b border-line bg-surface-1 pr-2">
        <TabsList className="h-full border-b-0">
          <TabsTrigger value="story">{ADDED.dockTabStory.text}</TabsTrigger>
          <TabsTrigger value="ask">{ADDED.dockTabAsk.text}</TabsTrigger>
        </TabsList>
        <div className="ml-auto flex items-center gap-1">
          {returnTo && <ReturnPill s={returnTo} reduced={reduced} onReturn={onReturn} />}
          {!sheet && (
            <Button variant="icon" size="icon" aria-label={ADDED.dockClose.text} onClick={onClose}>
              <XIcon className="size-4" strokeWidth={2} />
            </Button>
          )}
        </div>
      </div>
      <TabsContent value="story" className="flex flex-col overflow-y-auto overscroll-contain px-4 pt-4 max-sm:pb-[env(safe-area-inset-bottom)]">
        {story}
      </TabsContent>
      <TabsContent value="ask" className="flex flex-col overflow-hidden">
        {ask}
      </TabsContent>
    </Tabs>
  );

  if (sheet) {
    // T-16. The sheet is dragged by its handle and by the rail welded to its top edge, so the
    // two move as one body. Height rather than transform, because the rail has to stay put at
    // the sheet's top edge at every snap — and the globe is outside the sheet entirely, so it
    // never reflows whichever we animate.
    // vh, not %: the snap points are defined against the viewport (UI-SPEC: [0, 62vh, 92vh])
    // and the drag projects against window.innerHeight. A percentage would resolve against the
    // container under the TopBar instead, so a released drag would settle a few pixels away
    // from where it was let go.
    const height = drag ? `${Math.round(drag.height)}px` : snap === 0 ? "var(--rail-h)" : `${snap}vh`;

    const onPointerDown = (e: React.PointerEvent) => {
      // Never swallow a tap on a rail card: a drag has to travel before it is a drag.
      const el = e.currentTarget as HTMLElement;
      el.setPointerCapture?.(e.pointerId);
      setDrag({ startY: e.clientY, height: el.parentElement?.getBoundingClientRect().height ?? 0, moved: false, at: Date.now(), lastY: e.clientY, v: 0 });
    };
    const onPointerMove = (e: React.PointerEvent) => {
      if (!drag) return;
      const dy = drag.startY - e.clientY;
      if (!drag.moved && Math.abs(dy) < DRAG_THRESHOLD_PX) return;
      const now = Date.now();
      const dt = Math.max(1, now - drag.at);
      setDrag({
        ...drag,
        moved: true,
        height: Math.max(0, Math.min(window.innerHeight * 0.96, (drag.moved ? drag.height : drag.height) + (e.clientY === drag.lastY ? 0 : drag.lastY - e.clientY))),
        lastY: e.clientY,
        at: now,
        v: (drag.lastY - e.clientY) / dt, // px per ms, upward positive
      });
    };
    const onPointerUp = () => {
      if (!drag) return;
      if (!drag.moved) {
        setDrag(null);
        return;
      }
      // Velocity projection at 0.35 × v, then the nearest of the three snaps.
      const projected = drag.height + drag.v * 350 * 0.35;
      const points: Array<{ snap: 0 | 62 | 92; px: number }> = [
        { snap: 0, px: RAIL_PEEK_PX },
        { snap: 62, px: window.innerHeight * 0.62 },
        { snap: 92, px: window.innerHeight * 0.92 },
      ];
      const nearest = points.reduce((a, b) => (Math.abs(b.px - projected) < Math.abs(a.px - projected) ? b : a));
      setDrag(null);
      if (nearest.snap !== snap) onSnapChange?.(nearest.snap);
    };

    return (
      <aside
        role="complementary"
        aria-label={ADDED.dockAria.text}
        data-open={open}
        data-snap={snap}
        className={cn(
          "@container/dock absolute inset-x-0 bottom-0 z-40 flex flex-col rounded-t-lg border-t border-line bg-surface-1 shadow-sheet",
          reduced || drag ? "" : "[transition:height_280ms_var(--ease-out-quint)]",
          className,
        )}
        // The TopBar is the one thing the sheet may never cover: 92vh plus a rounding error
        // puts its top edge exactly on the bar's bottom, and a pixel either way eats it. The
        // sheet's containing block already starts below the bar, so 100% of it is exactly
        // "everything under the TopBar and no more" — and unlike a dvh calculation it means
        // the same thing in every engine.
        style={{ height, maxHeight: "100%", paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {/* The handle and the rail are one grab area: the rail IS the sheet's handle. */}
        <div
          className="shrink-0 touch-none"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <span aria-hidden="true" className="absolute top-1.5 left-1/2 z-10 h-[3px] w-9 -translate-x-1/2 rounded-full bg-line-strong" />
          <div className="hit-44 flex items-start overflow-hidden rounded-t-lg pt-3">{railStrip}</div>
        </div>
        {snap !== 0 && tabs}
      </aside>
    );
  }

  return (
    <aside
      role="complementary"
      aria-label={ADDED.dockAria.text}
      aria-hidden={!open || undefined}
      data-open={open}
      className={cn(
        "@container/dock absolute inset-y-0 right-0 z-40 flex w-[min(var(--dock-w),86vw)] flex-col border-l border-line bg-surface-1",
        reduced
          ? open
            ? "visible opacity-100 [transition:opacity_120ms_linear]"
            : "invisible opacity-0 [transition:opacity_120ms_linear,visibility_0s_linear_120ms]"
          : open
            ? "visible translate-x-0 [transition:transform_280ms_var(--ease-out-quint)]"
            : "invisible translate-x-full [transition:transform_280ms_var(--ease-out-quint),visibility_0s_linear_280ms]",
        className,
      )}
    >
      {cutPulse &&
        (reduced ? (
          <span aria-hidden="true" data-snapshot-id={returnTo?.snapshotId} className="pointer-events-none absolute inset-y-0 -left-px z-10 w-0.5 bg-accent" />
        ) : (
          <motion.span
            aria-hidden="true"
            data-snapshot-id={returnTo?.snapshotId}
            className="pointer-events-none absolute inset-y-0 -left-px z-10 w-px bg-accent"
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 1, 0] }}
            transition={{ duration: 0.42, ease: "linear" }}
          />
        ))}
      {tabs}
    </aside>
  );
}
