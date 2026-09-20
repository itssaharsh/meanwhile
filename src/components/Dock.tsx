import type { ReactNode } from "react";
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
export function Dock({
  open,
  tab,
  onTabChange,
  returnTo = null,
  cutPulse = false,
  layout = "side",
  snap = 62,
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
  /** Mobile: the rail's 96px peek strip, welded to the sheet's top edge as its handle. */
  railStrip?: ReactNode;
  reduced?: boolean;
  onClose?: () => void;
  onReturn?: () => void;
  className?: string;
}) {
  const reduced = useReduced(forceReduced);
  const sheet = layout === "sheet";

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
    return (
      <aside
        role="complementary"
        aria-label={ADDED.dockAria.text}
        className={cn(
          "@container/dock absolute inset-x-0 bottom-0 z-40 flex flex-col rounded-t-lg border-t border-line bg-surface-1 shadow-sheet",
          reduced ? "" : "[transition:height_280ms_var(--ease-out-quint)]",
          className,
        )}
        style={{ height: snap === 0 ? "var(--rail-h)" : `${snap}%` }}
      >
        <span aria-hidden="true" className="absolute top-1.5 left-1/2 z-10 h-[3px] w-9 -translate-x-1/2 rounded-full bg-line-strong" />
        <div className="shrink-0 overflow-hidden rounded-t-lg">{railStrip}</div>
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
