import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { convex } from "@/lib/convex";
import { useNow } from "@/lib/hooks";
import { Globe } from "@/components/globe";
import { TopBar } from "@/components/TopBar";
import { FeedRail } from "@/components/FeedRail";
import { Dock, type DockTab } from "@/components/Dock";
import { StoryCard } from "@/components/StoryCard";
import { EmptyState } from "@/components/primitives";
import { ADDED } from "@/lib/copy";
import { useChannel, DEMO } from "./useChannel";
import { useCountryFetch } from "./useCountryFetch";
import { StoryPanel } from "./StoryPanel";
import type { Snapshot } from "@/lib/types";
import COUNTRIES from "@/data/countries.json";

/** UI-SPEC C-02: a country click flies for 400ms, a cut for 640ms. */
const FLY_COUNTRY_MS = 400;
const FLY_CUT_MS = 640;
/** C-03's cut-while-open border pass. */
const CUT_PULSE_MS = 420;

/**
 * The shell. Everything that must never stop is mounted here.
 *
 * The TopBar and the globe sit OUTSIDE the router outlet and outside every Suspense boundary,
 * so a route change, a story loading, or a lazy chunk arriving cannot unmount them. That is the
 * load-bearing rule of the whole screen: the channel's claim is that you are watching something
 * live, and a globe that freezes while a panel loads breaks that claim more thoroughly than any
 * missing feature would. The outlet renders over them; it never contains them.
 */
export function Channel({ children }: { children?: ReactNode }) {
  const now = useNow(30_000);
  const { onAir, feed, topBarState, railState, previous, flashId } = useChannel();

  // Countries the globe tints, straight from the coverage table. Two lists, three honest
  // tiers: verified within the hour, a camera we hold that hasn't proved itself, and nothing.
  const coveredList = useQuery(api.coverage.covered, DEMO || !convex ? "skip" : {});
  const indexedList = useQuery(api.coverage.indexed, DEMO || !convex ? "skip" : {});
  const covered = useMemo(() => (coveredList ? new Set(coveredList) : null), [coveredList]);
  const indexed = useMemo(() => (indexedList ? new Set(indexedList) : null), [indexedList]);

  const [dockOpen, setDockOpen] = useState(false);
  const [tab, setTab] = useState<DockTab>("story");
  const [picked, setPicked] = useState<{ name: string; lat: number; lng: number } | null>(null);
  const [flyTo, setFlyTo] = useState<{ lat: number; lng: number; ms?: number } | null>(null);
  const country = useCountryFetch();

  // Whatever had focus when the dock opened, so Escape can give it back.
  const opener = useRef<HTMLElement | null>(null);

  const openCountry = useCallback(
    (name: string, centroid: [number, number]) => {
      opener.current = (document.activeElement as HTMLElement) ?? null;
      const [lng, lat] = centroid;
      setPicked({ name, lat, lng });
      // T-01: the dock opens before any network call. The stages fill it in.
      setDockOpen(true);
      setTab("story");
      setFlyTo({ lat, lng, ms: FLY_COUNTRY_MS });
      country.start(name, lat, lng);
    },
    [country],
  );

  const closeDock = useCallback(() => {
    setDockOpen(false);
    // Focus goes back where it came from; it never lands on the body.
    opener.current?.focus?.();
  }, []);

  // A country click without a pointer, for the QA sweep and for rehearsing the demo: the globe's
  // raycasting needs a real GPU, and the headless browser has software GL. Dev builds only.
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    (window as unknown as { __openCountry?: (n: string) => void }).__openCountry = (name: string) => {
      const c = centroidOf(name);
      if (c) openCountry(name, c);
    };
  }, [openCountry]);

  useEffect(() => {
    if (!dockOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeDock();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dockOpen, closeDock]);

  // ---- T-04: the director cuts while the dock is open -------------------------------------
  // The dock does not change tabs, does not scroll, does not move focus and does not dismiss.
  // It runs one amber pass down its left border and raises a persistent return-to-air pill.
  const [returnTo, setReturnTo] = useState<Snapshot | null>(null);
  const [cutPulse, setCutPulse] = useState(false);
  const lastCutId = useRef<string | null>(null);
  useEffect(() => {
    const id = onAir?.snapshotId ?? null;
    const had = lastCutId.current;
    lastCutId.current = id;
    if (!id || !had || id === had) return; // first frame of the session is not a cut

    // The globe flies to the new frame whether or not the dock is open — the channel is still
    // the channel. GlobeCanvas itself refuses the flight if a hand is on the planet.
    setFlyTo({ lat: onAir!.place.lat, lng: onAir!.place.lon, ms: FLY_CUT_MS });

    if (!dockOpen) return;
    setReturnTo(onAir);
    setCutPulse(true);
    const t = setTimeout(() => setCutPulse(false), CUT_PULSE_MS);
    return () => clearTimeout(t);
  }, [onAir?.snapshotId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Going back to air: the Story tab swaps to the on-air frame and the globe flies to it.
  const returnToAir = useCallback(() => {
    if (!onAir) return;
    setPicked(null);
    country.reset();
    setTab("story");
    setReturnTo(null);
    setFlyTo({ lat: onAir.place.lat, lng: onAir.place.lon, ms: FLY_CUT_MS });
  }, [onAir, country]);

  useEffect(() => {
    if (!dockOpen) setReturnTo(null);
  }, [dockOpen]);

  // The story panel: a country fetch when one is running, otherwise the frame on air.
  const storyNode = picked ? (
    <StoryPanel
      fetch={country}
      now={now}
      onAirId={onAir?.snapshotId ?? null}
      onRetry={() => picked && openCountry(picked.name, [picked.lng, picked.lat])}
      onPickCountry={(name) => {
        const c = centroidOf(name);
        if (c) openCountry(name, c);
      }}
    />
  ) : onAir ? (
    <StoryCard story={onAir} now={now} onAirId={onAir.snapshotId} />
  ) : (
    <EmptyState kind="first" region="story" title={ADDED.storyFirstTitle.text} body={ADDED.storyFirstBody.text} />
  );

  const verified = country.outcome === "live" || country.outcome === "cached";

  return (
    <div className="fixed inset-0 flex flex-col bg-canvas">
      <TopBar state={topBarState} onAir={onAir} previous={previous} now={now} onAsk={() => { setTab("ask"); setDockOpen(true); }} />

      <div className="relative flex min-h-0 flex-1">
        {/* The planet, always mounted, always turning. */}
        <div className="relative min-h-0 flex-1">
          <Globe
            onAir={onAir ? { lat: onAir.place.lat, lon: onAir.place.lon, snapshotId: onAir.snapshotId } : null}
            active={picked ? { name: picked.name, verified } : null}
            covered={covered}
            indexed={indexed}
            flyTo={flyTo}
            onCountryClick={openCountry}
          />
          {/* The router's outlet renders over the globe, never around it. */}
          {children}
        </div>

        <Dock
          open={dockOpen}
          tab={tab}
          onTabChange={setTab}
          returnTo={returnTo}
          cutPulse={cutPulse}
          story={storyNode}
          ask={<EmptyState kind="first" region="chat" title={ADDED.chatFirstTitle.text} body={ADDED.chatFirstBody.text} />}
          onClose={closeDock}
          onReturn={returnToAir}
        />
      </div>

      <FeedRail
        items={feed}
        onAirId={onAir?.snapshotId ?? null}
        now={now}
        state={railState}
        flashId={flashId}
        onOpen={(s) => {
          opener.current = (document.activeElement as HTMLElement) ?? null;
          setPicked(null);
          setTab("story");
          setDockOpen(true);
          setFlyTo({ lat: s.place.lat, lng: s.place.lon, ms: FLY_COUNTRY_MS });
        }}
      />
    </div>
  );
}

/** The centroid the globe would send for a country name, for chips that name a place. */
function centroidOf(name: string): [number, number] | null {
  const hit = (COUNTRIES as { n: string; c: number[] }[]).find((c) => c.n === name);
  return hit && hit.c.length === 2 ? [hit.c[0], hit.c[1]] : null;
}
