import { useEffect, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { COPY, ADDED } from "@/lib/copy";
import { formatDate, formatUtcTime } from "@/lib/format";
import {
  CAPE_TOWN_NEW,
  CHAT,
  FETCH,
  MAIL,
  MAIL_ADDRESS,
  NEWS,
  NOW,
  ON_AIR,
  RERANKED,
  RUNNING_ORDER,
  STORY_NOTIME,
  STORY_ONAIR,
  STORY_STALE,
  STORY_VERIFIED,
  VERIFIED_NOW,
  byId,
} from "@/lib/fixtures";
import type { ChatStep, FetchRow, MailState, Snapshot } from "@/lib/types";
import { AskPanel, type ChatState } from "@/components/AskPanel";
import { CountryFetchProgress } from "@/components/CountryFetchProgress";
import { DeliveryChip } from "@/components/DeliveryChip";
import { FeedRail, type RailState } from "@/components/FeedRail";
import { Globe } from "@/components/globe";
import { NotFound, type NotFoundState } from "@/components/NotFound";
import { Intro } from "@/components/Intro";
import { NewsPanel } from "@/components/NewsPanel";
import { EmptyState, VerifiedChips } from "@/components/primitives";
import { RailItem } from "@/components/RailItem";
import { ScoreReadout } from "@/components/ScoreReadout";
import { StoryCard } from "@/components/StoryCard";
import { SubscribeForm, SubscribeSheet, type SubscribeState } from "@/components/SubscribeSheet";
import { TopBar, type TopBarState } from "@/components/TopBar";
import { Button } from "@/components/ui/button";
import { KitApp } from "./KitApp";
import { LiveFetch } from "./LiveFetch";

export type Frame = "bar" | "tile" | "rail" | "panel" | "fetch" | "dialog" | "readout" | "app" | "phone" | "globe" | "live";
export type KitState = { id: string; frame: Frame; render: (ctx: KitCtx) => ReactNode; extra?: boolean; live?: boolean };
export type KitSection = { id: string; name: string; states: KitState[] };
export type KitCtx = { isolated: boolean; globe: "live" | "slate" };

const places: Record<string, Snapshot> = Object.fromEntries(RUNNING_ORDER.map((s) => [s.snapshotId, s]));
/** Unless a scenario says otherwise, Tromsø is on air — COPY.md's own example. */
const ON_AIR_ID = ON_AIR.snapshotId;

// --- frames ------------------------------------------------------------------------------

/** The dock's inner column: 380 wide, surface-1, a `dock` container for the @container rules. */
export function PanelFrame({ kind = "story", height = 720, children }: { kind?: "story" | "ask"; height?: number; children: ReactNode }) {
  return (
    <div
      className="@container/dock flex w-[380px] max-w-full shrink-0 flex-col overflow-hidden rounded-md border border-line bg-surface-1 max-sm:h-dvh! max-sm:w-full max-sm:rounded-none max-sm:border-0"
      style={{ height }}
    >
      {kind === "story" ? <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 pt-4">{children}</div> : children}
    </div>
  );
}

// --- scenario pieces -----------------------------------------------------------------------

const story = (s: Snapshot | null, opts: Partial<Parameters<typeof StoryCard>[0]> = {}) => (
  <StoryCard story={s} now={NOW} onAirId={ON_AIR_ID} {...opts} />
);

const STEPS_RUNNING: ChatStep[] = [
  { label: COPY.chat.steps[0], state: "done" },
  { label: COPY.chat.steps[1], state: "done" },
  { label: COPY.chat.steps[2], state: "active" },
];
const STEPS_ALL: ChatStep[] = COPY.chat.steps.map((label) => ({ label, state: "done" as const }));

function ask(state: ChatState) {
  const common = { places, now: NOW, goTo: RUNNING_ORDER.slice(0, 3) };
  switch (state) {
    case "empty":
    case "none":
      return <AskPanel state={state} {...common} />;
    case "steps":
      return <AskPanel state="steps" question={CHAT.question} steps={STEPS_RUNNING} {...common} />;
    case "streaming":
      return <AskPanel state="streaming" question={CHAT.question} answer={CHAT.partial} steps={STEPS_ALL} seconds={CHAT.stepsSeconds} {...common} />;
    case "answered":
      return <AskPanel state="answered" question={CHAT.question} answer={CHAT.answer} steps={STEPS_ALL} seconds={CHAT.stepsSeconds} {...common} />;
    case "nochips":
      return <AskPanel state="nochips" question={COPY.chat.chips[0]} answer={CHAT.answerNoChips} steps={STEPS_ALL} seconds="1.8" {...common} />;
    case "stopped":
      return <AskPanel state="stopped" question={CHAT.question} answer={CHAT.partial} steps={STEPS_ALL} seconds={CHAT.stepsSeconds} {...common} />;
    case "error":
      return <AskPanel state="error" question={CHAT.question} {...common} />;
  }
}

const oldest = formatDate(Date.UTC(2022, 9, 14));

function emptyBlock(id: string) {
  const chips = <VerifiedChips chips={VERIFIED_NOW} now={NOW} />;
  switch (id) {
    case "rail-first":
      return <EmptyState kind="first" region="rail" title={COPY.rail.firstRunTitle} body={COPY.rail.firstRunBody} action={{ label: ADDED.railFirstAction.text }} />;
    case "rail-none":
      return <EmptyState kind="none" region="rail" title={ADDED.railNoneTitle.text} body={ADDED.railNoneBody.text} action={{ label: ADDED.railNoneAction.text }} />;
    case "rail-error":
      return (
        <EmptyState
          kind="error"
          region="rail"
          title={COPY.errors.connectionLost.title}
          body={COPY.errors.connectionLost.body}
          status={COPY.errors.connectionLost.status(2)}
          action={{ label: COPY.errors.connectionLost.action }}
        />
      );
    case "story-first":
      return <EmptyState kind="first" region="story" title={ADDED.storyFirstTitle.text} body={ADDED.storyFirstBody.text} action={{ label: ADDED.openList.text }} />;
    case "story-none":
      return (
        <EmptyState
          kind="none"
          region="story"
          title={COPY.countryEmpty.noCameraTitle("Mongolia")}
          body={COPY.countryEmpty.noCameraBody(14, "Mongolia")}
          chipsLabel={ADDED.tryThese.text}
          chips={chips}
          action={{ label: COPY.countryEmpty.noCameraAction("Mongolia") }}
        />
      );
    case "story-error":
      return (
        <EmptyState kind="error" region="story" title={COPY.errors.frameFailed.title} body={COPY.errors.frameFailed.body} action={{ label: COPY.errors.frameFailed.reload }}>
          <Button variant="quiet" size="md">
            {COPY.errors.frameFailed.next}
          </Button>
        </EmptyState>
      );
    case "chat-first":
      return <EmptyState kind="first" region="chat" title={ADDED.chatFirstTitle.text} body={ADDED.chatFirstBody.text} />;
    case "chat-none":
      return <EmptyState kind="none" region="chat" title={ADDED.chatNoneTitle.text} body={ADDED.chatNoneBody.text} action={{ label: ADDED.chatNoneAction.text }} />;
    case "chat-error":
      return <EmptyState kind="error" region="chat" title={COPY.chat.errorTitle} body={COPY.chat.errorBody} action={{ label: COPY.chat.errorAction }} />;
    case "country-none":
      return (
        <EmptyState
          kind="none"
          region="country"
          title={COPY.countryEmpty.staleTitle(3, "Kenya")}
          body={COPY.countryEmpty.staleBody(3, oldest, "Kenya")}
          chipsLabel={ADDED.tryThese.text}
          chips={chips}
          action={{ label: COPY.countryEmpty.staleAction("Kenya") }}
        />
      );
    case "country-misplaced":
      return (
        <EmptyState
          kind="none"
          region="country"
          title={COPY.countryEmpty.misplacedTitle("Kenya")}
          body={COPY.countryEmpty.misplacedBody(2, 2, "Times Square")}
          chipsLabel={ADDED.tryThese.text}
          chips={chips}
          action={{ label: COPY.countryEmpty.misplacedAction("Kenya") }}
        />
      );
    case "country-error":
      return (
        <EmptyState
          kind="error"
          region="country"
          title={ADDED.countryErrorTitle.text("Kenya")}
          body={ADDED.countryErrorBody.text}
          action={{ label: ADDED.countryErrorAction.text("Kenya") }}
        />
      );
    case "country-retrying":
      return (
        <EmptyState
          kind="error"
          region="country"
          title={ADDED.countryErrorTitle.text("Kenya")}
          body={ADDED.countryErrorBody.text}
          action={{ label: ADDED.countryErrorAction.text("Kenya"), busy: true }}
        />
      );
    case "country-nochips":
      return (
        <EmptyState
          kind="none"
          region="country"
          title={COPY.countryEmpty.staleTitle(3, "Kenya")}
          body={COPY.countryEmpty.staleBody(3, oldest, "Kenya")}
          action={{ label: ADDED.openList.text }}
        />
      );
  }
  return null;
}

// --- live demos (catalogue only): the real transitions, looping ----------------------------

function CutLoop() {
  const [i, setI] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setI((n) => (n + 1) % 4), 3000);
    return () => clearInterval(id);
  }, []);
  return <TopBar state="onair" onAir={RUNNING_ORDER[i]} now={NOW} className="static" />;
}

/** A real cut: the new Cape Town snapshot enters at the top and everything below slides right. */
function RerankOnce() {
  const [after, setAfter] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setAfter(true), 700);
    return () => clearTimeout(t);
  }, []);
  const items = after ? RERANKED : RUNNING_ORDER;
  return <FeedRail items={items} onAirId={items[0].snapshotId} flashId={after ? items[0].snapshotId : null} now={NOW} />;
}
/** Isolated: the cut plays once. Catalogue: the same forward cut replays every 4s (remounted),
 *  never un-cut back to the old order. */
function RerankLoop({ once = false }: { once?: boolean }) {
  const [k, setK] = useState(0);
  useEffect(() => {
    if (once) return;
    const id = setInterval(() => setK((n) => n + 1), 4000);
    return () => clearInterval(id);
  }, [once]);
  return <RerankOnce key={k} />;
}

function FetchLoop() {
  const seq: FetchRow[] = [FETCH.searching, FETCH.candidates, FETCH.pulling, FETCH.freshOk, FETCH.rejected, FETCH.scoring];
  const [i, setI] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setI((n) => (n + 1) % seq.length), 1200);
    return () => clearInterval(id);
  }, [seq.length]);
  return <CountryFetchProgress row={{ ...seq[i], stageStartedAt: Date.now() }} />;
}

function FlashTile() {
  const [k, setK] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setK((n) => n + 1), 2500);
    return () => clearInterval(id);
  }, []);
  return <RailItem key={k} snapshot={CAPE_TOWN_NEW} rank={1} onAirId={CAPE_TOWN_NEW.snapshotId} now={NOW} flash />;
}

// --- mail -----------------------------------------------------------------------------------

function mailForm(state: SubscribeState, mail?: MailState, email = MAIL_ADDRESS) {
  return <SubscribeForm inline onAir={ON_AIR} state={state} email={email} mail={mail} />;
}

function MailIsolated({ state, mail, email = MAIL_ADDRESS }: { state: SubscribeState; mail?: MailState; email?: string }) {
  return (
    <>
      <KitApp now={NOW} topBar={{ state: "onair", onAir: ON_AIR }} globe={{ mode: "slate" }} rail={{ items: RUNNING_ORDER }} stage={ON_AIR} />
      <SubscribeSheet open onOpenChange={() => {}} onAir={ON_AIR} state={state} email={email} mail={mail} />
    </>
  );
}

// --- app-level scenarios ------------------------------------------------------------------

function appState(id: string, ctx: KitCtx): ReactNode {
  const base = { now: NOW, globe: { mode: ctx.globe } as const, rail: { items: RUNNING_ORDER } };
  switch (id) {
    case "closed":
      return <KitApp {...base} topBar={{ state: "onair", onAir: ON_AIR }} stage={ON_AIR} />;
    case "open-story":
    case "sheet-62":
      return (
        <KitApp
          {...base}
          topBar={{ state: "onair", onAir: ON_AIR }}
          stage={ON_AIR}
          globe={{ mode: ctx.globe, props: { active: { name: "South Africa", verified: true } } }}
          dock={{ open: true, tab: "story", story: story(STORY_VERIFIED), ask: ask("answered"), snap: 62 }}
        />
      );
    case "open-ask":
    case "sheet-92":
      return (
        <KitApp
          {...base}
          topBar={{ state: "onair", onAir: ON_AIR }}
          stage={ON_AIR}
          dock={{ open: true, tab: "ask", story: story(STORY_VERIFIED), ask: ask("answered"), snap: 92 }}
        />
      );
    case "open-news":
      return (
        <KitApp
          {...base}
          topBar={{ state: "onair", onAir: ON_AIR }}
          stage={ON_AIR}
          dock={{
            open: true,
            tab: "news",
            story: story(STORY_VERIFIED),
            ask: ask("answered"),
            news: <NewsPanel items={NEWS} now={NOW} onOpen={() => {}} />,
            snap: 62,
          }}
        />
      );
    case "intro":
    case "intro-reduced":
      // The point of this state is that the channel is NOT stopped behind the card: the bar is
      // live, the running order is full and the planet is turning. A judge dismisses it onto a
      // screen that was already working.
      return (
        <KitApp
          {...base}
          topBar={{ state: "onair", onAir: ON_AIR }}
          stage={ON_AIR}
          overlay={<Intro onStart={() => {}} onPick={() => {}} reduced={id === "intro-reduced"} />}
        />
      );
    case "open-cut":
      // The cut landed while Venice's story was open: Cape Town's new frame is on air.
      return (
        <KitApp
          {...base}
          topBar={{ state: "onair", onAir: CAPE_TOWN_NEW }}
          stage={CAPE_TOWN_NEW}
          rail={{ items: RERANKED, flashId: CAPE_TOWN_NEW.snapshotId }}
          dock={{
            open: true,
            tab: "story",
            story: story(byId("s-venice"), { onAirId: CAPE_TOWN_NEW.snapshotId }),
            ask: ask("answered"),
            returnTo: CAPE_TOWN_NEW,
            cutPulse: true,
          }}
        />
      );
  }
  const nf = id.replace(/^404-?/, "") as "" | "loading" | "nochannel" | "error";
  const state: NotFoundState = nf === "" ? "idle" : nf;
  return (
    <KitApp
      now={NOW}
      topBar={{ state: state === "error" ? "standby" : state === "nochannel" ? "between" : "onair", onAir: state === "idle" ? ON_AIR : null }}
      globe={{ mode: ctx.globe, dim: 0.35, props: { reduced: true } }}
      rail={{ items: [] }}
      overlay={<NotFound state={state} onAir={state === "idle" ? ON_AIR : null} now={NOW} />}
    />
  );
}

// --- the registry ----------------------------------------------------------------------------

const topBar = (state: TopBarState, onAir: Snapshot | null = ON_AIR, extra: Partial<Parameters<typeof TopBar>[0]> = {}) => (ctx: KitCtx) => (
  <TopBar state={state} onAir={onAir} now={NOW} className={ctx.isolated ? undefined : "static"} {...extra} />
);
const tile = (node: ReactNode) => () => node;
const panel = (node: ReactNode, kind: "story" | "ask" = "story", height?: number) => () => (
  <PanelFrame kind={kind} height={height ?? (kind === "ask" ? 640 : 760)}>
    {node}
  </PanelFrame>
);
const fetch = (row: FetchRow) => () => <CountryFetchProgress row={row} fixedNow={NOW} />;
const rail = (state: RailState, extra: Partial<Parameters<typeof FeedRail>[0]> = {}) => () => (
  <FeedRail items={RUNNING_ORDER} onAirId={ON_AIR_ID} state={state} now={NOW} loadingCounts={{ checked: 4, total: 11, scored: 2 }} reconnectAttempt={2} {...extra} />
);
const globe = (props: Parameters<typeof Globe>[0]) => () => <Globe {...props} />;
const tromso = { lat: ON_AIR.place.lat, lon: ON_AIR.place.lon, snapshotId: ON_AIR_ID };
const item = (s: Snapshot, rank: number, extra: Partial<Parameters<typeof RailItem>[0]> = {}) =>
  tile(<RailItem snapshot={s} rank={rank} onAirId={ON_AIR_ID} now={NOW} {...extra} />);

export const KIT: KitSection[] = [
  {
    id: "C-01",
    name: "TopBar / OnAirChyron",
    states: [
      { id: "onair", frame: "bar", render: topBar("onair") },
      { id: "standby", frame: "bar", render: topBar("standby", null) },
      { id: "cut", frame: "bar", render: topBar("cut", CAPE_TOWN_NEW, { previous: ON_AIR }) },
      // COPY §8: the last verified frame stays on screen while the connection is down.
      { id: "error", frame: "bar", render: topBar("error", ON_AIR, { reconnectAttempt: 2 }) },
      { id: "empty", frame: "bar", render: topBar("empty", null) },
      { id: "between", frame: "bar", extra: true, render: topBar("between", null, { framesScored: 11 }) },
      { id: "degraded", frame: "bar", extra: true, render: topBar("degraded", ON_AIR, { backAt: formatUtcTime(NOW + 60_000) }) },
      { id: "cut-replay", frame: "bar", extra: true, live: true, render: () => <CutLoop /> },
      // The chip is grey on purpose: the viewer is choosing, but amber marks the frame on air,
      // and only that.
      { id: "chair", frame: "bar", render: topBar("onair", ON_AIR, { chair: { untilMs: NOW + 4 * 60_000, onRelease: () => {} } }) },
    ],
  },
  {
    id: "C-02",
    name: "GlobeCanvas",
    states: [
      { id: "idle", frame: "globe", render: globe({ onAir: tromso }) },
      { id: "hover", frame: "globe", render: globe({ onAir: tromso, forceHover: "Norway", pov: { lat: 58, lng: 14 } }) },
      { id: "active-verified", frame: "globe", render: globe({ onAir: tromso, active: { name: "South Africa", verified: true }, pov: { lat: -22, lng: 22 } }) },
      { id: "active-unverified", frame: "globe", render: globe({ onAir: tromso, active: { name: "Japan", verified: false }, pov: { lat: 34, lng: 136 } }) },
      { id: "contextlost", frame: "globe", render: globe({ onAir: tromso, forceLost: true }) },
      { id: "contextlost-twice", frame: "globe", extra: true, render: globe({ onAir: tromso, forceUnavailable: true }) },
      { id: "reduced", frame: "globe", render: globe({ onAir: tromso, reduced: true }) },
    ],
  },
  {
    id: "C-03",
    name: "Dock",
    states: [
      { id: "closed", frame: "app", render: (ctx) => appState("closed", ctx) },
      { id: "open-story", frame: "app", render: (ctx) => appState("open-story", ctx) },
      { id: "open-ask", frame: "app", render: (ctx) => appState("open-ask", ctx) },
      { id: "open-cut", frame: "app", render: (ctx) => appState("open-cut", ctx) },
      { id: "sheet-62", frame: "phone", render: (ctx) => appState("sheet-62", ctx) },
      { id: "sheet-92", frame: "phone", render: (ctx) => appState("sheet-92", ctx) },
      { id: "open-news", frame: "app", render: (ctx) => appState("open-news", ctx) },
    ],
  },
  {
    id: "C-04",
    name: "StoryCard",
    states: [
      { id: "story-verified", frame: "panel", render: panel(story(STORY_VERIFIED)) },
      { id: "story-unverified", frame: "panel", render: panel(story(STORY_STALE)) },
      { id: "story-notime", frame: "panel", render: panel(story(STORY_NOTIME)) },
      { id: "story-onair", frame: "panel", render: panel(story(STORY_ONAIR)) },
      { id: "story-loading", frame: "panel", render: panel(story(null, { state: "loading" })) },
      { id: "story-fetching", frame: "panel", extra: true, render: panel(story(null, { state: "fetching", fetchRow: FETCH.pulling })) },
      { id: "story-error", frame: "panel", render: panel(emptyBlock("story-error")) },
      { id: "story-empty", frame: "panel", render: panel(emptyBlock("story-first")) },
      { id: "story-hover", frame: "panel", extra: true, render: panel(story(STORY_VERIFIED, { forceHover: true })) },
      { id: "story-putonair", frame: "panel", render: panel(story(STORY_VERIFIED, { onPutOnAir: () => {} })) },
      { id: "story-isonair", frame: "panel", extra: true, render: panel(story(STORY_ONAIR, { onPutOnAir: () => {} })) },
    ],
  },
  {
    id: "C-05",
    name: "AskPanel",
    states: (["empty", "steps", "streaming", "answered", "nochips", "stopped", "error"] as const).map((s) => ({
      id: `chat-${s}`,
      frame: "panel" as const,
      render: panel(ask(s), "ask"),
    })),
  },
  {
    id: "C-06",
    name: "FeedRail",
    states: [
      { id: "rail-idle", frame: "rail", render: rail("idle") },
      { id: "rail-rerank", frame: "rail", live: true, render: (ctx) => <RerankLoop once={ctx.isolated} /> },
      { id: "rail-loading", frame: "rail", render: rail("loading") },
      { id: "rail-empty", frame: "rail", render: rail("first") },
      { id: "rail-error", frame: "rail", render: rail("error") },
      { id: "rail-scrolled-end", frame: "rail", render: rail("idle", { scrollToEnd: true }) },
    ],
  },
  {
    id: "C-07",
    name: "RailItem",
    states: [
      { id: "item-idle", frame: "tile", render: item(byId("s-venice"), 3) },
      { id: "item-onair", frame: "tile", render: item(ON_AIR, 1) },
      { id: "item-verified", frame: "tile", render: item(byId("s-sydney"), 9) },
      { id: "item-unverified", frame: "tile", render: item(byId("s-kyoto"), 6) },
      { id: "item-noframe", frame: "tile", render: item(byId("s-reykjavik"), 5, { forceNoFrame: true }) },
      { id: "item-flash", frame: "tile", live: true, render: () => <FlashTile /> },
      { id: "item-hover", frame: "tile", extra: true, render: item(byId("s-santorini"), 2, { forceHover: true }) },
    ],
  },
  {
    id: "C-08",
    name: "CountryFetchProgress",
    states: [
      { id: "fetch-searching", frame: "fetch", render: fetch(FETCH.searching) },
      { id: "fetch-candidates", frame: "fetch", render: fetch(FETCH.candidates) },
      { id: "fetch-pulling", frame: "fetch", extra: true, render: fetch(FETCH.pulling) },
      { id: "fetch-freshok", frame: "fetch", render: fetch(FETCH.freshOk) },
      { id: "fetch-freshfail", frame: "fetch", render: fetch(FETCH.freshFail) },
      { id: "fetch-notime", frame: "fetch", render: fetch(FETCH.noTime) },
      { id: "fetch-rejected", frame: "fetch", extra: true, render: fetch(FETCH.rejected) },
      { id: "fetch-scoring", frame: "fetch", render: fetch(FETCH.scoring) },
      { id: "fetch-slow", frame: "fetch", render: fetch(FETCH.slow) },
      { id: "fetch-failed", frame: "panel", render: panel(emptyBlock("country-error")) },
      { id: "fetch-replay", frame: "fetch", extra: true, live: true, render: () => <FetchLoop /> },
    ],
  },
  {
    id: "C-09",
    name: "SubscribeSheet + DeliveryChip",
    states: [
      { id: "mail-idle", frame: "dialog", render: (ctx) => (ctx.isolated ? <MailIsolated state="idle" email="" /> : mailForm("idle", undefined, "")) },
      {
        id: "mail-invalid",
        frame: "dialog",
        render: (ctx) => (ctx.isolated ? <MailIsolated state="invalid" email="sam.example.com" /> : mailForm("invalid", undefined, "sam.example.com")),
      },
      { id: "mail-sending", frame: "dialog", render: (ctx) => (ctx.isolated ? <MailIsolated state="sending" /> : mailForm("sending")) },
      ...(["queued", "accepted", "delivered", "bounced", "unconfirmed"] as const).map((k) => ({
        id: `mail-${k}`,
        frame: "dialog" as const,
        render: (ctx: KitCtx) => (ctx.isolated ? <MailIsolated state="success" mail={MAIL[k]} /> : mailForm("success", MAIL[k])),
      })),
      { id: "mail-error", frame: "dialog", render: (ctx) => (ctx.isolated ? <MailIsolated state="error" /> : mailForm("error")) },
      {
        id: "mail-chip-docked",
        frame: "bar",
        extra: true,
        render: (ctx) => (
          <TopBar state="onair" onAir={ON_AIR} now={NOW} className={ctx.isolated ? undefined : "static"} deliveryChip={<DeliveryChip mail={MAIL.delivered} docked />} />
        ),
      },
    ],
  },
  {
    id: "C-10",
    name: "ScoreReadout",
    states: [
      { id: "score-onair", frame: "readout", render: () => <ScoreReadout variant="stage" snapshot={ON_AIR} onAirId={ON_AIR_ID} /> },
      { id: "score-card", frame: "panel", render: panel(<ScoreReadout variant="card" snapshot={STORY_VERIFIED} onAirId={ON_AIR_ID} />, "story", 260) },
      // No beat, and nothing establishes "first on air this hour": no beat line at all.
      { id: "score-nobeat", frame: "readout", render: () => <ScoreReadout variant="stage" snapshot={{ ...ON_AIR, beat: null }} onAirId={ON_AIR_ID} /> },
      {
        id: "score-first",
        frame: "readout",
        extra: true,
        render: () => <ScoreReadout variant="stage" snapshot={{ ...ON_AIR, beat: null, firstOnAirThisHour: true }} onAirId={ON_AIR_ID} />,
      },
      { id: "score-loading", frame: "readout", render: () => <ScoreReadout variant="stage" snapshot={null} onAirId={null} state="loading" /> },
      {
        id: "score-unscored",
        frame: "panel",
        render: panel(<ScoreReadout variant="card" snapshot={{ ...STORY_NOTIME, score: null }} onAirId={ON_AIR_ID} state="unscored" />, "story", 260),
      },
      { id: "score-card-onair", frame: "panel", extra: true, render: panel(<ScoreReadout variant="card" snapshot={ON_AIR} onAirId={ON_AIR_ID} />, "story", 260) },
    ],
  },
  {
    id: "C-11",
    name: "EmptyStates",
    states: [
      ...(["rail-first", "rail-none", "rail-error"] as const).map((k) => ({
        id: `empty-${k}`,
        frame: "rail" as const,
        render: () => <section className="relative h-[var(--rail-h)] border-t border-line bg-canvas">{emptyBlock(k)}</section>,
      })),
      ...(["story-first", "story-none", "story-error", "chat-first", "chat-none", "chat-error"] as const).map((k) => ({
        id: `empty-${k}`,
        frame: "panel" as const,
        render: panel(emptyBlock(k), "story", 520),
      })),
      ...(["country-none", "country-misplaced", "country-error", "country-retrying", "country-nochips"] as const).map((k) => ({
        id: `empty-${k}`,
        frame: "panel" as const,
        extra: k === "country-misplaced" || k === "country-retrying",
        render: panel(emptyBlock(k), "story", 560),
      })),
    ],
  },
  {
    id: "C-13",
    name: "Intro (first visit)",
    states: [
      { id: "intro", frame: "app", render: (ctx) => appState("intro", ctx) },
      { id: "intro-reduced", frame: "app", extra: true, render: (ctx) => appState("intro-reduced", ctx) },
    ],
  },
  {
    id: "C-16",
    name: "NewsPanel",
    states: [
      { id: "news", frame: "panel", render: panel(<NewsPanel items={NEWS} now={NOW} onOpen={() => {}} />, "story", 720) },
      { id: "news-loading", frame: "panel", render: panel(<NewsPanel items={[]} now={NOW} loading />, "story", 420) },
      { id: "news-empty", frame: "panel", render: panel(<NewsPanel items={[]} now={NOW} />, "story", 420) },
      { id: "news-docked", frame: "app", extra: true, render: (ctx) => appState("open-news", ctx) },
    ],
  },
  {
    // Not a spec'd state: the country click running against the live deployment, so C-08's
    // stages and C-11's empty states can be judged on real data before block 2 docks them.
    id: "LIVE",
    name: "Country click · live",
    states: [{ id: "live-fetch", frame: "live", live: true, render: () => <LiveFetch /> }],
  },
  {
    id: "C-12",
    name: "NotFound (404)",
    states: ["404", "404-loading", "404-nochannel", "404-error"].map((id) => ({
      id,
      frame: "app" as const,
      render: (ctx: KitCtx) => appState(id, ctx),
    })),
  },
];

export const ALL_STATES = KIT.flatMap((s) => s.states.map((st) => ({ ...st, section: s })));
export const findState = (id: string) => ALL_STATES.find((s) => s.id === id) ?? null;

/** Framing for a state rendered on its own (?state=), at the viewport's real size. */
export function Isolated({ id, ctx }: { id: string; ctx: KitCtx }) {
  const st = findState(id);
  if (!st) return null;
  const node = st.render(ctx);
  switch (st.frame) {
    case "bar":
      return <div className="min-h-dvh bg-canvas">{node}</div>;
    case "tile":
      return (
        <div className="grid min-h-dvh place-items-center bg-canvas">
          <div className="h-[108px] w-[196px] max-sm:h-[84px] max-sm:w-[168px]">{node}</div>
        </div>
      );
    case "rail":
      return <div className="flex min-h-dvh flex-col justify-end bg-canvas">{node}</div>;
    case "panel":
      return <div className="flex min-h-dvh justify-center bg-canvas py-8 max-sm:py-0">{node}</div>;
    case "fetch":
      return (
        <div className="grid min-h-dvh place-items-center bg-canvas px-4">
          <div className="@container/dock w-[348px] max-w-full">{node}</div>
        </div>
      );
    case "readout":
      return (
        <div className="fixed inset-0 bg-canvas">
          <div className="absolute inset-0 opacity-40">
            <Globe onAir={null} reduced />
          </div>
          {node}
        </div>
      );
    default:
      return <>{node}</>;
  }
}

export const cellClass = (frame: Frame) =>
  cn(
    frame === "tile" && "h-[108px] w-[196px]",
    frame === "fetch" && "@container/dock w-[348px]",
    frame === "readout" && "relative h-[300px] w-full max-w-[640px] overflow-hidden rounded-md border border-line bg-canvas",
  );
