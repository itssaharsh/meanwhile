import { useEffect, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { Snapshot } from "@/lib/types";
import { Dock, type DockTab } from "@/components/Dock";
import { FeedRail, type RailState } from "@/components/FeedRail";
import { Globe, type GlobeProps } from "@/components/globe";
import { GlobeSlate } from "@/components/globe/GlobeSlate";
import { ScoreReadout } from "@/components/ScoreReadout";
import { TopBar, type TopBarState } from "@/components/TopBar";

/** true below 640px — the spec's mobile layout (sheet dock, 96px rail strip). */
export function useMobile(): boolean {
  const q = "(max-width: 639px)";
  const [m, setM] = useState(() => typeof window !== "undefined" && window.matchMedia(q).matches);
  useEffect(() => {
    const mq = window.matchMedia(q);
    const on = () => setM(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return m;
}

// The channel's layout, composed from the real components with fixture data. Blocks 2–3 turn
// this into the live shell. One on-air id is derived here and handed to every component that
// can paint amber — the TopBar, the stage score, the globe marker and the rail — so amber can
// only ever mark one frame.
export function KitApp({
  now,
  topBar,
  globe,
  dock,
  rail,
  stage,
  overlay,
}: {
  now: number;
  topBar: { state: TopBarState; onAir: Snapshot | null; previous?: Snapshot | null; deliveryChip?: ReactNode };
  /** "slate" skips WebGL entirely (the loading slate is a real C-02 state). */
  globe: { mode: "live" | "slate"; props?: Partial<GlobeProps>; dim?: number };
  dock?: { open: boolean; tab: DockTab; story: ReactNode; ask: ReactNode; returnTo?: Snapshot | null; cutPulse?: boolean; snap?: 0 | 62 | 92 };
  rail: { items: Snapshot[]; state?: RailState; flashId?: string | null };
  stage?: Snapshot | null;
  overlay?: ReactNode;
}) {
  const mobile = useMobile();
  // On air means the director's current cut, confirmed. In the error state the last frame
  // stays on screen but nothing is on air, so nothing is amber.
  const onAirId = (topBar.state === "onair" || topBar.state === "cut") && topBar.onAir ? topBar.onAir.snapshotId : null;
  const railEl = <FeedRail items={rail.items} onAirId={onAirId} state={rail.state} flashId={rail.flashId} now={now} />;

  const globeEl =
    globe.mode === "live" ? (
      <Globe
        onAir={onAirId && topBar.onAir ? { lat: topBar.onAir.place.lat, lon: topBar.onAir.place.lon, snapshotId: onAirId } : null}
        {...globe.props}
      />
    ) : (
      <GlobeSlate state="loading" />
    );

  return (
    <div className="fixed inset-0 flex flex-col overflow-hidden bg-canvas">
      <TopBar state={topBar.state} onAir={topBar.onAir} previous={topBar.previous} now={now} deliveryChip={topBar.deliveryChip} />

      {mobile ? (
        <div className="relative min-h-0 flex-1">
          <div className={cn("absolute inset-x-0 top-0", dock?.open ? "h-[45%]" : "bottom-[var(--rail-h)]")} style={{ opacity: globe.dim }}>
            {globeEl}
          </div>
          {overlay}
          {(dock || rail.items.length > 0) && (
            <Dock
              layout="sheet"
              open={!!dock?.open}
              snap={dock?.open ? (dock.snap ?? 62) : 0}
              tab={dock?.tab ?? "story"}
              story={dock?.story}
              ask={dock?.ask}
              railStrip={railEl}
              returnTo={dock?.returnTo}
            />
          )}
        </div>
      ) : (
        <>
          <div className="relative min-h-0 flex-1">
            <div className="absolute inset-0" style={{ opacity: globe.dim }}>
              {globeEl}
            </div>
            {stage !== undefined && <ScoreReadout variant="stage" snapshot={stage} onAirId={onAirId} />}
            {overlay}
            {dock && (
              <Dock
                layout="side"
                open={dock.open}
                tab={dock.tab}
                story={dock.story}
                ask={dock.ask}
                returnTo={dock.returnTo}
                cutPulse={dock.cutPulse}
              />
            )}
          </div>
          {rail.items.length > 0 && railEl}
        </>
      )}
    </div>
  );
}

/** A 390×844 phone, for mobile-only states viewed on a wide screen (holds an iframe, so the
 *  components inside see a real 390px viewport and their breakpoints apply). */
export function PhoneFrame({ children }: { children: ReactNode }) {
  return <div className="relative mx-auto h-[844px] w-[390px] max-w-full overflow-hidden rounded-lg border border-line bg-canvas">{children}</div>;
}
