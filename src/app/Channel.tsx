import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { convex } from "@/lib/convex";
import { useNow, useNarrow } from "@/lib/hooks";
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

import { useAsk } from "./useAsk";
import { useSubscribe } from "./useSubscribe";
import { SubscribeSheet } from "@/components/SubscribeSheet";
import { FrameDialog } from "@/components/FrameDialog";
import { NewsPanel } from "@/components/NewsPanel";
import { Intro } from "@/components/Intro";
import { useMutation, useAction } from "convex/react";
import { AnimatePresence } from "motion/react";
import type { Snapshot } from "@/lib/types";
import COUNTRIES from "@/data/countries.json";

// The Ask panel renders the answer through AI Elements' markdown component, which drags in a
// syntax highlighter, a diagram engine and a maths typesetter — a megabyte of JavaScript, in
// the shell, to render one sentence with a place chip in it. Split out so it is fetched when
// someone opens the Ask tab and not before. The globe and the TopBar are NOT inside this
// boundary; only the panel is.
const AskPanel = lazy(() => import("@/components/AskPanel").then((m) => ({ default: m.AskPanel })));

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

  const narrow = useNarrow();
  /** Mobile only: which of [0, 62, 92] the sheet is resting at. */
  const [snap, setSnap] = useState<0 | 62 | 92>(0);
  const [dockOpen, setDockOpen] = useState(false);
  const [tab, setTab] = useState<DockTab>("story");
  const [picked, setPicked] = useState<{ name: string; lat: number; lng: number } | null>(null);
  /** A frame opened directly — from the rail, or a place chip in an answer. */
  const [storyOverride, setStoryOverride] = useState<Snapshot | null>(null);
  const [flyTo, setFlyTo] = useState<{ lat: number; lng: number; ms?: number } | null>(null);
  const country = useCountryFetch();

  // Whatever had focus when the dock opened, so Escape can give it back.
  const opener = useRef<HTMLElement | null>(null);

  const openCountry = useCallback(
    (name: string, centroid: [number, number]) => {
      opener.current = (document.activeElement as HTMLElement) ?? null;
      const [lng, lat] = centroid;
      setPicked({ name, lat, lng });
      setStoryOverride(null);
      // T-01: the dock opens before any network call. The stages fill it in.
      setDockOpen(true);
      setSnap(62);
      setTab("story");
      setFlyTo({ lat, lng, ms: FLY_COUNTRY_MS });
      country.start(name, lat, lng);
    },
    [country],
  );

  const closeDock = useCallback(() => {
    setDockOpen(false);
    setSnap(0);
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
    setStoryOverride(null);
    setTab("story");
    setReturnTo(null);
    setFlyTo({ lat: onAir.place.lat, lng: onAir.place.lon, ms: FLY_CUT_MS });
  }, [onAir, country]);

  useEffect(() => {
    if (!dockOpen) setReturnTo(null);
  }, [dockOpen]);

  // The Ask thread lives here, not inside the panel, so switching to Story and back keeps the
  // question, the answer and its chips. The Dock hides its panels rather than unmounting them,
  // so the scroll position survives with it.
  const askCandidates = useMemo(() => (onAir ? [onAir, ...feed.filter((f) => f.snapshotId !== onAir.snapshotId)] : feed), [onAir, feed]);
  const chat = useAsk(askCandidates);
  const mail = useSubscribe();

  // The director's chair: who is choosing the frame on air.
  const chair = useQuery(api.director.chair, DEMO || !convex ? "skip" : {});
  const takeChair = useMutation(api.director.takeChair);
  const releaseChair = useMutation(api.director.releaseChair);
  const putOnAir = useCallback(
    (s: Snapshot) => {
      setFlyTo({ lat: s.place.lat, lng: s.place.lon, ms: FLY_CUT_MS });
      if (!DEMO && convex) void takeChair({ snapshotId: s.snapshotId as never }).catch(() => undefined);
    },
    [takeChair],
  );

  // The frame at full size (UI-SPEC C-04 hover: "clicking opens the frame at full size").
  const [zoomed, setZoomed] = useState<Snapshot | null>(null);

  // Every story card gets the same four handlers, whether it came from the running order, a
  // country click or the cut. They were wired on the TopBar but not here, so the card's own
  // "Ask about this" and "Send me this" did nothing — the buttons were there, the actions
  // were not.
  const storyActions = {
    onAsk: () => {
      setTab("ask");
      setDockOpen(true);
      setSnap(62);
    },
    onSend: mail.show,
    onFrame: setZoomed,
  };

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
      {...storyActions}
    />
  ) : storyOverride ? (
    <StoryCard story={storyOverride} now={now} onAirId={onAir?.snapshotId ?? null} {...storyActions} onPutOnAir={putOnAir} />
  ) : onAir ? (
    <StoryCard story={onAir} now={now} onAirId={onAir.snapshotId} {...storyActions} onPutOnAir={putOnAir} />
  ) : (
    <EmptyState kind="first" region="story" title={ADDED.storyFirstTitle.text} body={ADDED.storyFirstBody.text} />
  );


  // The News tab: headlines for the places the channel is watching. The lookup runs when the
  // tab is first opened — demand-driven, like every other Firecrawl call here.
  const news = useQuery(api.director.getNews, DEMO || !convex ? "skip" : { limit: 12 });
  const fillNews = useAction(api.news.fillForChannel);
  const filled = useRef(false);
  useEffect(() => {
    if (tab !== "news" || filled.current || DEMO || !convex) return;
    filled.current = true;
    void fillNews({ max: 6 }).catch(() => undefined);
  }, [tab, fillNews]);

  // First visit: say what this is, over a channel that is already running.
  const [introOpen, setIntroOpen] = useState(() => {
    if (typeof localStorage === "undefined") return true;
    try {
      return localStorage.getItem("mw.intro.seen") !== "1";
    } catch {
      return true;
    }
  });
  const closeIntro = useCallback(() => {
    setIntroOpen(false);
    try {
      localStorage.setItem("mw.intro.seen", "1");
    } catch {
      // A browser that refuses storage just sees it again; that is not worth an error.
    }
  }, []);

  // T-05: a place named in an answer flies the globe and opens that Story — without clearing
  // the thread behind it.
  const goToPlace = useCallback(
    (s: Snapshot) => {
      setPicked(null);
      country.reset();
      setFlyTo({ lat: s.place.lat, lng: s.place.lon, ms: FLY_COUNTRY_MS });
      setStoryOverride(s);
      setTab("story");
    },
    [country],
  );

  const verified = country.outcome === "live" || country.outcome === "cached";

  const railEl = (
    <FeedRail
      items={feed}
      onAirId={onAir?.snapshotId ?? null}
      now={now}
      state={railState}
      flashId={flashId}
      onOpen={(s) => {
        opener.current = (document.activeElement as HTMLElement) ?? null;
        setPicked(null);
        country.reset();
        setStoryOverride(s);
        setTab("story");
        setDockOpen(true);
        setSnap(62);
        // Opening a frame from the running order also puts it on air: the rail is the channel's
        // running order, and clicking one and not seeing it is the confusing half-measure.
        putOnAir(s);
      }}
    />
  );

  return (
    <div className="fixed inset-0 flex flex-col bg-canvas">
      <TopBar state={topBarState} onAir={onAir} previous={previous} now={now} onAsk={() => { setTab("ask"); setDockOpen(true); setSnap(62); }}
        onSend={mail.show}
        chair={chair?.by === "viewer" && chair.until ? { untilMs: chair.until, onRelease: () => void releaseChair({}).catch(() => undefined) } : null}
      />

      <div className="relative flex min-h-0 flex-1">
        {/* The planet, always mounted, always turning. On mobile its region is pinned to 45vh
            and the sheet travels OVER it — the canvas never reflows when the sheet moves, so
            the globe never restarts mid-drag. */}
        <div className={cn("relative", narrow ? "h-[45vh] w-full shrink-0" : "min-h-0 flex-1")}>
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

          <AnimatePresence>
            {introOpen && (
              <Intro
                key="intro"
                onStart={closeIntro}
                onPick={() => {
                  closeIntro();
                  const first = (coveredList ?? [])[0];
                  const c = first ? centroidOf(first) : null;
                  if (c && first) openCountry(first, c);
                }}
              />
            )}
          </AnimatePresence>
        </div>

        <Dock
          open={dockOpen}
          tab={tab}
          onTabChange={setTab}
          layout={narrow ? "sheet" : "side"}
          snap={narrow ? snap : undefined}
          onSnapChange={(v) => {
            setSnap(v);
            setDockOpen(v !== 0);
          }}
          railStrip={narrow ? railEl : undefined}
          returnTo={returnTo}
          cutPulse={cutPulse}
          story={storyNode}
          news={<NewsPanel items={news ?? []} now={now} loading={news === undefined} onOpen={(n) => {
            const hit = feed.find((f) => f.snapshotId === n.snapshotId);
            if (hit) { setPicked(null); country.reset(); setStoryOverride(hit); setTab("story"); setFlyTo({ lat: hit.place.lat, lng: hit.place.lon, ms: FLY_COUNTRY_MS }); }
          }} />}
          ask={
            <Suspense fallback={<div className="min-h-0 flex-1" />}>
            <AskPanel
              state={chat.state}
              question={chat.question}
              answer={chat.answer}
              steps={chat.steps}
              seconds={chat.seconds}
              servedBy={chat.servedBy}
              places={chat.places}
              goTo={feed.slice(0, 3)}
              now={now}
              onAsk={chat.ask}
              onStop={chat.stop}
              onPlace={goToPlace}
            />
            </Suspense>
          }
          onClose={closeDock}
          onReturn={returnToAir}
        />
      </div>

      <SubscribeSheet
        open={mail.open}
        onOpenChange={(o) => (o ? mail.show() : mail.close())}
        onAir={onAir}
        state={mail.state}
        email={mail.email}
        mail={mail.mail}
        onSubmit={mail.submit}
        onDone={mail.close}
      />

      <FrameDialog story={zoomed} now={now} onOpenChange={(o) => !o && setZoomed(null)} />

      {!narrow && railEl}

    </div>
  );
}

/** The centroid the globe would send for a country name, for chips that name a place. */
function centroidOf(name: string): [number, number] | null {
  const hit = (COUNTRIES as { n: string; c: number[] }[]).find((c) => c.n === name);
  return hit && hit.c.length === 2 ? [hit.c[0], hit.c[1]] : null;
}
