---
name: Meanwhile
design: ./DESIGN.md
copy: ./COPY.md
brand: ./brand/
direction: derived — broadcast control room in orbit. No library direction used.
personality: precise
dials: { variance: 5, motion: 4, density: 5 }
archetype: live-channel — persistent globe canvas + docked panels + filmstrip running order
stack: { convex: reactive queries, react: 19, motion: 13, ui: "shadcn on Base UI", ai: ai-elements }
viewports: [390x844, 1024x768, 1440x900]
signature: "The cut happens while you are reading — chyron, globe and rail all move, and you touched nothing"
---

## 0. Idea brief

**User and moment.** Someone with a second monitor, a phone on a commute, or a browser tab open
while they work. Not a task. A window.

**Core loop verb.** Watch. The secondary verb is *click a country*, which is the only place the
user takes control.

**Hero object.** The live frame on air, and the Earth it came from.

**World inventory.** Tally light · chyron / lower-third · running order · cut · slate and
timecode · terminator · subsolar point · ground track.

**Moving data.** The director re-ranks and cuts with no input. Frames age. The terminator moves.

**Wow moment.** You are reading a story card and the channel cuts underneath you — the chyron
flips, the globe flies, the running order re-sorts — and you did nothing.

**Artifact.** The emailed moment: frame, place, caption, time it was taken.

**The judging problem this UI exists to solve.** With 11 cameras on a 20-minute cron, a judge
visiting for four minutes may never see the director direct, and concludes this is a webcam
viewer with extra steps. Two changes fix that without touching the backend: the story card
**docks instead of taking over**, so the channel stays visible while you read it, and the feed
becomes a **rail that visibly re-sorts** on a real cut. After these, the signature moment happens
in ordinary use instead of needing a split screen and a manual insert.

## 1. Demo script (≤ 3:00)

`0:00` a frame is already on air, scored, with the globe flown to it — no landing page, no loader ·
`0:12` spin the globe across the terminator · `0:30` the running order, high score beside low ·
`0:45` click a country; named stages run; a real current frame lands, age-stamped ·
`1:20` ask a question, click the place chip in the answer, the globe flies ·
`1:40` send me this; the delivery chip walks queued → accepted → delivered ·
`2:00` hands off the keyboard; the channel cuts on its own; the rail re-sorts · `2:40` the URL.

## 2. Screen inventory

| id | route | purpose | entered from | primary action | states |
|---|---|---|---|---|---|
| S1 | `/` | the channel | cold open | watch | loading · live · degraded |
| S1a | `/` + dock(Story) | a country's live view | globe click, rail click, chat chip | send me this | loading · ready · stale · empty ×3 · error |
| S1b | `/` + dock(Ask) | ask about what's on screen | Ask button | ask | idle · streaming · done · error |
| S1c | `/` + subscribe | email the frame on air | Send me this | send | idle · sending · sent · error |
| S2 | `/_kit` | every component in every state | direct | — | harness |
| S3 | `/404` | wrong address | bad link | back to the channel | default |

## 3. Flow map

```
S1 --country click--> S1a(loading) --resolved--> S1a(ready) --send me this--> S1c
S1a --esc/close--> S1          S1a --Ask tab--> S1b --place chip--> S1a
S1  --director cuts, no input--> S1 (chyron + globe + rail all move)
S1a --director cuts--> S1a (same, visible past the dock, panel not stolen)
```

## 4. Layout

```
DESKTOP ≥1024
┌ TopBar 56 · never unmounts ────────────────────────────────────────────────┐
│ ◉ ON AIR · Tromsø, Norway · 9.6              [Ask about this][Send me this] │
├──────────────────────────────────────────────┬─────────────────────────────┤
│ GLOBE — persistent canvas, never unmounts,   │ DOCK 380                    │
│ never freezes. Camera x-anchor moves to 62%  │ [ Story | Ask ] 40          │
│ when the dock opens. Countries stay clickable│ own scroll, 20px padding    │
├──────────────────────────────────────────────┴─────────────────────────────┤
│ FEED RAIL 132 — running order, snap-scroll, re-sorts live on a real cut     │
└─────────────────────────────────────────────────────────────────────────────┘

MOBILE <640
globe 45vh, stays mounted and live · dock = bottom sheet, snaps [0, 62vh, 92vh],
slides UNDER the TopBar and never covers it · rail = 96px peek strip on the sheet's top edge
```

**The rule everything else depends on:** the globe canvas and the TopBar live outside the router
outlet and outside every Suspense boundary. They never unmount and never freeze. Panels are
hidden, never unmounted, and their subscriptions stay live.

## 5. Components

### C-01 TopBar / OnAirChyron   (base: custom; actions use shadcn/Button on Base UI)

**Purpose:** From anywhere in the app I can see, without looking away from the globe, that something is on air right now, where it is, and how good the director thought it was.

**Placement:** Row 1 of the app grid, full bleed, `position: sticky; top: 0; z-index: 60`. Never unmounts — it lives outside the router outlet and outside every Suspense boundary. Left cluster (tally + chyron) is `justify-self: start`; right cluster (two actions) is `justify-self: end`. On mobile it stays pinned at the top at the same height and the same z-index; the bottom sheet slides *under* it and never covers it.

**Size:** `h 56px` always (desktop and mobile). `padding: 0 20px` desktop, `0 12px` below 640. Left cluster `gap 10px`. Right cluster `gap 8px`. Tally dot `10px` with a `20px` ring. Action buttons `h 40px`, `padding 0 14px`, `@media (pointer: coarse) { h 44px }`, hit area forced to 44px with `::before { position:absolute; inset-block:-2px; inset-inline:0 }`. No icons in this bar at all.

**Tokens:** bg `--canvas`; bottom border `1px solid --line`; radius `0` on the bar, `--r-md` on the buttons.
- Tally dot: `bg --accent`, `border-radius 50%`; ring is `::after`, `20px`, `border 1px solid color-mix(in oklab, var(--accent) 35%, transparent)`.
- `ON AIR`: `--ff-mono 400 11px`, `letter-spacing .14em`, `text-transform uppercase`, `color --accent`.
- Separator `·`: `--ink-muted`, `margin 0 8px`.
- `Cutting to`: `--ff-body 400 13px`, `letter-spacing 0`, `color --ink-muted`.
- Place: `--ff-place 600 18px`, `letter-spacing -.01em`, `color --ink`. **This is the only `--ff-place` in the TopBar.**
- Em dash: `--ink-muted 13px`, `margin 0 8px`.
- Score: `--ff-mono 400 15px`, `letter-spacing .02em`, `font-variant-numeric: tabular-nums`, `color --accent`.
- Buttons (both): `bg --surface-2`, `fg --ink`, `border 1px solid --line`, `--ff-body 500 13px`. **Neither action is amber.** Amber is a claim about what is on air; a button is not on air. "Send me this" is distinguished from "Ask" only by `border-color --line-strong` and `font-weight 600`.
- **Global focus ring (referenced by every other component as "focus ring"):** `outline: 2px solid var(--ink); outline-offset: 2px; border-radius: inherit`. Never teal, never amber — a focus ring is not a claim.

**States:**
- **idle (on air):** as tokened above. Copy: `◉ ON AIR · Cutting to Reykjavík — 8.4`. a11y: the chyron is `role="status" aria-live="polite" aria-atomic="true"`, label text `On air: Reykjavík, Iceland. Score 8.4.`
- **hover** (buttons only): `bg --surface-2 → color-mix(in oklab, var(--surface-2) 82%, var(--ink))`, `border-color --line-strong`, 150ms. The chyron itself has no hover — it is not interactive.
- **press** (buttons): `transform: scale(.985)`, `bg --surface-1`, 120ms.
- **focus-visible:** focus ring on the button. The chyron is not focusable.
- **disabled:** "Send me this" is disabled only while `channel.onAir` is `null` (nothing to send). `opacity .45`, `cursor: not-allowed`, `aria-disabled="true"`, `title`/`aria-describedby` copy: `Nothing is on air yet.` "Ask" is never disabled — the chat works with no frame on air.
- **loading (standing by, before first `onAir` resolves):** dot `bg --ink-muted`, no ring. Copy: `◉ ——— · Standing by`, all `--ink-muted`. There is deliberately no amber here: nothing has been chosen, so nothing may claim. Live region silent until the first real cut.
- **success:** not a state of this component — a cut *is* the idle state. Omitted.
- **error (`channel.onAir` subscription dropped):** dot `--ink-muted`, copy `◉ ——— · Signal lost — retrying`, text `--ink-muted`, plus `border-bottom-color: --danger` on the bar. Colour carries the fault; the chyron still refuses to make a claim. Live region: `Signal lost. Retrying.` announced once, not on every retry.
- **empty (no snapshots exist at all, e.g. cold DB):** same visual as loading, copy `◉ ——— · Channel starting up`. Action `Send me this` disabled.

**Transitions:**
- `loading -ONAIR_FIRST_RESOLVED-> idle` — no flight, no flash; the first paint is not a cut.
- `idle -ONAIR_ID_CHANGED-> idle'` — runs **T-03**. Guard: new `snapshotId !== current`. Suppressed if the tab has been hidden >120s; on `visibilitychange` back to visible, the chyron hard-swaps with no flash and announces once.
- `idle -SUBSCRIPTION_ERROR(>4s no heartbeat)-> error`; `error -RECONNECT-> idle` after a 300ms settle so a flapping socket cannot strobe the bar.
- `any -SEND_CLICK-> opens C-09` (no state change here).

**Motion:** T-03 (rows 2–4, 8), T-04 (row 2), T-14.
Reduced motion: dot pulse becomes a static dot; place crossfade becomes an instant text swap; the live-region announcement is unchanged and is the primary channel.

**Responsive:** `<900px`: drop the word `Cutting to`; keep `◉ ON AIR · Reykjavík — 8.4`. `<640px`: place drops to `--ff-place 600 16px`, score to `13px`; `Send me this` collapses to the label `Send` (never to a bare icon); `Ask` stays full. `<380px`: place gets `max-width: 42vw; overflow: hidden; text-overflow: ellipsis; white-space: nowrap` — the score never truncates.

**Keyboard / a11y:** Tab order: `Ask` → `Send me this`. `Enter`/`Space` activate. The bar itself is `<header role="banner">`. The chyron's `aria-live` is polite and atomic so a cut is read as one sentence, never token-by-token. A cut **never** moves focus. If focus is inside the Dock when a cut fires, focus stays where it is (see C-03 / T-04).

**Data:** Convex `api.channel.onAir` (reactive query → `{ snapshotId, place: {name, country, lat, lon}, score, capturedAt, verified }`). Under `?demo=1`: a fixture channel of 6 snapshots cuts every 20s on a deterministic loop starting at mount+6s, so a cut is guaranteed to fire inside a 30-second demo.

**Acceptance:** must render at `?state=onair`, `?state=standby`, `?state=cut` (mid-flight frame), `?state=error`, `?state=empty`.

---

### C-02 GlobeCanvas   (base: custom — `react-globe.gl` over three.js, single persistent instance)

**Purpose:** I can see the real planet, spin it to find real daylight, and click any country to demand a live look at it.

**Placement:** Grid row 2, column 1. `position: relative`, fills the region. The `<canvas>` is `position: absolute; inset: 0` and is **mounted once, at app root, above the router outlet** — no route, tab, dialog, or sheet can unmount it. Dock open recenters the projection, it does not resize the canvas. Mobile: same canvas, region height `45vh`, sits between the TopBar and the bottom sheet; the sheet overlays its lower portion and the globe keeps rendering behind it.

**Size:** Canvas = region size, `devicePixelRatio` capped at `2`. Camera altitude `2.2` (globe radii) at rest. On dock open the globe's screen anchor moves to `62%` of the *viewport* width — implemented as a camera x-offset, not a CSS transform, so country hit-testing stays exact. Country polygon stroke `0.6px`. Hover polygon lift `0.012` radii. Touch hit slop `8px` added to polygon picking below 640.

**Tokens:** Canvas clear colour `--canvas`. Country polygon fill idle `transparent`; stroke idle `color-mix(in oklab, var(--ink) 14%, transparent)`. Hover fill `color-mix(in oklab, var(--ink) 8%, transparent)`, stroke `--ink-muted`. Active (its Story is open) fill `color-mix(in oklab, var(--live) 10%, transparent)`, stroke `--live` **only if that country's current story is verified-fresh**; if it is not verified, active stroke is `--ink` and there is no teal anywhere. On-air marker: a `6px` amber dot at the on-air lat/lon with a single `18px` amber ring; this is the only amber on the globe. Terminator: no colour of its own — it is the boundary between the day texture and the night-lights texture, feathered `0.9°`.

**States:**
- **idle:** day texture (NASA Blue Marble, 4k), night-lights texture on the dark side, terminator from the true subsolar point recomputed every 60s. Auto-rotate `0.18°/s`, paused for 8s after any user drag.
- **hover (country):** polygon fill/stroke as above, 150ms, plus a `lower-third` label pinned to the cursor: `--ff-place 600 14px --ink` on `--surface-1`, `border 1px solid --line`, `radius --r-sm`, `padding 4px 8px`, offset `14px/14px`. Cursor `pointer`.
- **press (country):** polygon fill jumps to `color-mix(in oklab, var(--ink) 14%, transparent)` for 120ms, then C-02 immediately emits `countryClick` — **the dock opens before any network call** (T-01).
- **focus-visible:** the canvas is `tabindex="0"` with `role="application"` and `aria-label="Interactive globe. Arrow keys rotate. Press K to open the country list."`; focus ring drawn as a CSS ring on the wrapping div. Keyboard users get the country list (C-11's picker) rather than polygon-by-polygon focus — 177 focus stops is worse than a searchable list, and the list is the accessible equivalent.
- **disabled:** cannot occur. The globe is never disabled; if data is missing the textures still render.
- **loading:** the wrapper paints the **slate** immediately on first paint: `--surface-1` fill, a `48px` grid of `1px --line` lines, and a centre mono line `--ff-mono 11px .14em uppercase --ink-muted`: `ACQUIRING PICTURE`. Textures fade in over 320ms when decoded. **The rest of the UI never waits on this** — the globe module is lazy-imported and its Suspense boundary wraps only itself; TopBar, Dock and Rail render from Convex the instant the page mounts.
- **success:** not a discrete state — texture-ready is the idle state.
- **error (WebGL init failed or `webglcontextlost`):** the slate persists permanently with copy changed to `SIGNAL — GPU CONTEXT LOST`, a second mono line `Countries are still clickable from the list.`, and a `Restore picture` button (`h 40`, `bg --surface-2`, `border 1px solid --line-strong`) that calls `restoreContext()` once; after a second failure the button is replaced by `Picture unavailable on this device` and the country list opens automatically in the Dock. The subsolar readout keeps ticking from data, so the page is visibly still live with no GPU. **Nothing here goes amber or red** — a dead GPU is not a claim about the world.
- **empty:** cannot occur — there is always a planet. Country polygons come from a bundled GeoJSON, not the network.

**Transitions:**
- `idle -DOCK_OPEN-> recentered` (T-09), camera x-offset animated 280ms `--ease-out-quint`, exactly matching the dock slide. Guard: skip if viewport `<1024` (mobile sheet does not recenter; it overlays).
- `idle -ONAIR_ID_CHANGED-> flying -> idle` (T-03), camera flight `640ms --ease-out-quint` to the new lat/lon. Guard: if the user has touched the globe in the last 2500ms, the flight is **suppressed** and instead the amber on-air marker pulses in place — the director never yanks the camera out of someone's hands. The chyron still flips.
- `idle -COUNTRY_CLICK-> flying(400ms) -> idle`, with `activeCountry` set immediately.
- `any -CONTEXT_LOST-> error`; `error -RESTORE_OK-> loading -> idle`.

**Motion:** T-01, T-03, T-05, T-09, T-12, T-17.
Reduced motion: auto-rotate is **off** at rest; all camera flights become a single-frame `pointOfView(..., 0)` jump; the on-air marker ring does not pulse, it is drawn at a static 2px; texture fade-in becomes an instant swap. Country hover lift is dropped; hover is conveyed by stroke colour alone.

**Responsive:** `≥1024`: as above. `640–1023`: dock is a right sheet at `min(380px, 86vw)` and the globe recenters to `58%`. `<640`: region `45vh`, altitude `2.6`, auto-rotate off (battery), no hover label (no hover), tap = press + click in one gesture, drag threshold `6px` before a drag cancels the click.

**Keyboard / a11y:** `ArrowLeft/Right` rotate ±6° (ARIA: no announcement, it is continuous), `ArrowUp/Down` ±4° latitude, `+`/`-` altitude ±0.2, `K` opens the Dock country list, `Home` flies to the on-air point and announces `Returned to air: <place>`. `Escape` inside the canvas does nothing (it belongs to the Dock). No focus trap ever.

**Data:** `api.channel.onAir` for the marker; `api.countries.list` (bundled GeoJSON + Convex-side `lastVerifiedAt` per ISO code) for polygon state; subsolar point computed client-side from `Date.now()` — no query. Under `?demo=1` the subsolar point advances at 60× so the terminator visibly moves during a demo, and the fixture cut at +6s triggers a real camera flight.

**Acceptance:** `?state=idle`, `?state=hover`, `?state=active-verified`, `?state=active-unverified`, `?state=contextlost`, `?state=reduced` .

---

### C-03 Dock   (base: shadcn/Tabs on Base UI; mobile shell = Base UI Dialog in non-modal mode)

**Purpose:** I get the detail — the story of a place, or a conversation — without ever losing sight of the channel.

**Placement:** Grid row 2, column 2. `position: relative`, slides in from the right edge. `z-index: 40` (below TopBar's 60). **Non-modal on every breakpoint**: no scrim, no `aria-modal`, no focus trap, no inert on the globe. Countries stay clickable while it is open — that is the whole point. Mobile: bottom sheet anchored to the viewport bottom, snap points `[0, 62vh, 92vh]`, with the Feed Rail peek strip (C-06 mobile form) welded to its top edge so the rail is always the sheet's handle.

**Size:** `width --dock-w` (380px), `height` = row height, desktop. `border-left 1px solid --line`. Tab bar `h 40px`, `padding 0 8px`, tabs `h 32` visual with `::before { inset-block:-6px }` for a 44px target, `gap 4px`. Panel padding `16px`, panel `gap 14px`, own scroll (`overflow-y:auto; overscroll-behavior: contain`). Mobile: `width 100vw`, `border-radius --r-lg --r-lg 0 0`, `border-top 1px solid --line`, drag handle is the rail strip itself (96px) plus a `36×3px --line-strong` grabber at `top 6px`.

**Tokens:** bg `--surface-1` (opaque — **no backdrop-blur anywhere**). Tab bar bg `--surface-1`, `border-bottom 1px solid --line`. Tab idle `--ff-body 500 13px --ink-muted`; tab selected `--ink` with a `2px` underline in `--ink` inset to the label width. Radius `--r-md` on tab hover fills. Container: `container-type: inline-size; container-name: dock`.

**States:**
- **idle (closed):** `transform: translateX(100%)`, `visibility: hidden` after the transition ends, not unmounted. Its children keep their Convex subscriptions alive so reopening is instant.
- **idle (open):** `translateX(0)`.
- **hover / press / focus-visible:** apply to tabs only. Hover `bg --surface-2`, 150ms. Press `scale(.985)`, 120ms. Focus ring on the tab.
- **disabled:** never. Both tabs are always reachable; Story with no story shows C-11's story-empty rather than being disabled.
- **loading:** the Dock shell never loads — it opens instantly and its *panel* shows the relevant skeleton (C-08 for a fetch, C-04's skeleton for a cached story).
- **success:** not a state. Omitted — the Dock is a container; success belongs to its contents.
- **error:** only if the panel's own query fails; the shell stays, the panel renders C-11's error block. The Dock never disappears on error.
- **empty:** Story tab with nothing selected → C-11 story-first-run.

**Cut-while-open treatment (the important one):** when `channel.onAir` changes while the Dock is open, the Dock does **not** change tabs, does not scroll, does not move focus, and does not dismiss. It does three things: (1) its left border animates `--line → --accent → --line` over 420ms, one pass; (2) a persistent **return-to-air pill** appears at the right end of the tab bar — `h 24`, `radius --r-sm`, `bg transparent`, `border 1px solid --accent`, label `--ff-mono 10px .12em uppercase --accent` reading `NOW · REYKJAVÍK`, place truncated at 14 chars, with a 44px hit area; clicking it swaps the Story tab to the on-air snapshot and flies the globe; (3) nothing is announced by the Dock — C-01's live region already said it, and two announcements for one event is a bug.

**Transitions:**
- `closed -COUNTRY_CLICK|ASK_CLICK|PLACE_CHIP_CLICK-> open` (T-01), 280ms `--ease-out-quint`, globe recenter runs on the same clock (T-09).
- `open -ESCAPE|CLOSE_CLICK|BACKDROP_N/A-> closed` (T-06), 280ms. Guard: `Escape` is swallowed by the Ask composer if it has text (first `Escape` clears the composer, second closes the dock).
- `open -ONAIR_ID_CHANGED-> open` (T-04) — never closes.
- Mobile: `sheet -DRAG_END-> snap(nearest of 0/62vh/92vh)` with velocity projection at `0.35 × v`, 280ms.

**Motion:** T-01, T-04, T-06, T-09, T-16, T-19.
Reduced motion: slide becomes `opacity 0→1` over 120ms with no translate; the left-border amber pass becomes a static `2px --accent` left border held for 6s then removed; sheet snapping becomes an instant position set.

**Responsive:** `@container dock (max-width: 420px)` — StoryCard frame goes full-bleed to the panel edges (negative 16px inline margin), Ask suggestion chips wrap to 2 rows. `<640`: bottom sheet form, tab bar sticks to the sheet top under the rail strip, panel `padding 16px 16px calc(16px + env(safe-area-inset-bottom))`.

**Keyboard / a11y:** `role="complementary"` `aria-label="Panel"`. Tabs are a real `role="tablist"` with `ArrowLeft/Right` roving tabindex, `Home`/`End`. Opening the Dock moves focus to the panel's heading (`tabindex="-1"`), **not** into the scroll body. Closing returns focus to whatever opened it: the country's list entry if opened from the list, the chat place-chip if opened from C-05, and the globe canvas if opened by a polygon click (`canvas.focus()` — never a silent focus loss to `<body>`).

**Data:** no query of its own. Reads `ui.dockTab` and `ui.activeStoryId` from local state; `api.channel.onAir` only for the return-to-air pill. `?demo=1` opens the Dock on the Story tab at +3s with a fixture Kenya story so the panel is never empty on camera.

**Acceptance:** `?state=closed`, `?state=open-story`, `?state=open-ask`, `?state=open-cut` (return-to-air pill visible), `?state=sheet-62`, `?state=sheet-92`.

---

### C-04 StoryCard   (base: custom composition; shadcn/Card shell, shadcn/Button for actions)

**Purpose:** I clicked a country and I want to know: what am I looking at, is it actually live, who filmed it, and can I have it.

**Placement:** Story tab of C-03, single column, scrolls with the panel. Order, top to bottom: freshness chip → frame → place block → C-10 (card variant) → narration → source credit → action row. The action row is `position: sticky; bottom: 0` inside the panel with a `--surface-1` backing and a `1px --line` top border, so `Send me this` is always reachable in a long narration. Mobile: identical order inside the sheet; the sticky action row sits above the safe-area inset.

**Size:** Frame `width 100%`, `aspect-ratio 16/9`, `radius --r-md`, `object-fit: cover`. Freshness chip `h 24`, `padding 0 8px`, `radius --r-sm`, not interactive. Place block `margin-top 12px`. Narration `margin-top 12px`, `max-width 62ch`. Action row `h 60` (`padding 10px 0`), buttons `h 40` (`44` on coarse pointers), `gap 8px`. Panel gap between blocks `14px`.

**Tokens:**
- Freshness chip **verified** (`capturedAt` within 3h): `bg color-mix(in oklab, var(--live) 12%, transparent)`, `border 1px solid color-mix(in oklab, var(--live) 40%, transparent)`, text `--ff-mono 400 11px .12em uppercase`, `color --live`, `tabular-nums`. Copy: `LIVE · 11m AGO`.
- Freshness chip **unverifiable** (over 3h, or no source timestamp at all): `bg transparent`, `border 1px solid --line`, text `--ff-mono 400 11px .12em uppercase --ink-muted`, `tabular-nums`. Copy with a known time: `UNVERIFIED · 6h AGO`. Copy with no timestamp: `UNVERIFIED · NO SOURCE TIME`. **There is no amber, no red, no yellow here.** Staleness is the absence of teal.
- Headline: `--ff-display 600 17px`, `letter-spacing -.01em`, `--ink`.
- Place name: `--ff-place 600 22px`, `letter-spacing -.01em`, `--ink`; the country/region sub-line is `--ff-mono 11px .1em uppercase --ink-muted`.
- Narration: `--ff-body 400 14px`, `line-height 1.55`, `--ink`.
- Source credit: `--ff-mono 11px --ink-muted`, `tabular-nums` on the timestamp; the host is a link, `text-decoration: underline; text-underline-offset: 3px; text-decoration-color: --line-strong`, hover `text-decoration-color: --ink-muted`.
- Frame border: `1px solid --line`. If the story is the one on air, and only then, the frame border is `1px solid --accent` and a `--ff-mono 10px .14em uppercase --accent` `ON AIR` tag sits top-left of the frame at `8px/8px` on a `--canvas` plate.

**States:**
- **idle:** all blocks present.
- **hover:** frame only — `border-color --line-strong`, 150ms, cursor `zoom-in`; clicking opens the frame at full size in a Base UI Dialog (modal is fine here; it is an explicit user action and the globe is behind it, not being hidden from a cut — the dialog is 80vw max and the TopBar stays visible above it).
- **press:** frame `scale(.995)`, 120ms.
- **focus-visible:** focus ring on frame, source link, and each action button.
- **disabled:** `Send me this` disabled when `frameUrl` is null (a fetch returned metadata but no image). `opacity .45`, `aria-disabled="true"`, helper line below: `No frame to send.`
- **loading:** a skeleton that mirrors this exact layout — chip `88×24`, frame `16/9`, place `160×22`, narration 3 lines at `100%/96%/64%`, each `bg --surface-2`, `radius --r-sm`, with a 1400ms `opacity .55 ↔ 1` pulse (not a shimmer sweep, not a spinner). For a *live country fetch* the skeleton is replaced by C-08 in the frame's slot — the named stage line — because during a fetch we know what is happening and must say so.
- **success:** not a persistent state; the arrival of content is T-02.
- **error (fetch failed / no camera found):** see C-11 story-error. The card is replaced entirely, not decorated.
- **empty (no country selected):** C-11 story-first-run.

**Transitions:** `loading -FETCH_ROW.stage="done"-> idle` runs **T-02**. Guard: hold the stage line at its final text for a minimum of 400ms even if the fetch resolves faster, so the last named step is legible. `idle -SEND_CLICK-> C-09 open`. `idle -SOURCE_CLICK-> new tab (rel="noopener noreferrer")`.

**Motion:** T-01, T-02, T-05, T-10.
Reduced motion: T-02's frame scale-in becomes a 120ms opacity fade; the skeleton pulse is replaced by a static `--surface-2` block; no stagger between blocks.

**Responsive:** `@container dock (max-width: 420px)`: frame goes edge-to-edge (`margin-inline: -16px; border-radius: 0; border-inline: none`), narration `15px`. `<640`: place `--ff-place 600 20px`, action row buttons go 50/50 full width, `h 44`.

**Keyboard / a11y:** Card is an `<article aria-labelledby="story-place">`. The freshness chip is **not** decorative: it is `<span role="status">` on first render with text `Verified live, captured 11 minutes ago` or `Cannot verify: source time unknown` — the claim must reach a screen reader, not just an eye. Frame `<img>` has `alt` = the narration's first sentence, never "image". Tab order: frame → source link → Ask about this → Send me this.

**Data:** `api.stories.byId({ storyId })`, itself fed by `api.countries.fetch` (action → Firecrawl → OpenAI vision) which writes a `fetches` row (C-08) and then a `stories` row. Freshness comes from `capturedAt` on the story, computed server-side against `Date.now()` at write time **and** recomputed client-side each minute so the chip ages in front of you and can fall out of teal while you watch. `?demo=1`: Kenya fixture, `capturedAt = now - 11min` (teal), and a second fixture (Shibuya, `capturedAt = 2022-10-14`) reachable at `?state=story-unverified` to demonstrate the grey claim.

**Acceptance:** `?state=story-verified`, `?state=story-unverified`, `?state=story-notime`, `?state=story-onair`, `?state=story-loading`, `?state=story-error`, `?state=story-empty`.

---

### C-05 AskPanel   (base: AI Elements/Conversation + Message + Response + PromptInput + Suggestion)

**Purpose:** I can ask anything about the planet right now and get an answer I can *click into* — every place it names takes me there.

**Placement:** Ask tab of C-03. Three stacked regions: conversation (flex-1, own scroll, `scroll-behavior: smooth`, auto-stick to bottom with a 40px release threshold), suggestion chip row (fixed above the composer, always present), composer (`position: sticky; bottom: 0`). Mobile: identical; the composer sits above `env(safe-area-inset-bottom)` and the sheet auto-snaps to `92vh` on composer focus.

**Size:** Conversation `padding 16px 16px 8px`, message `gap 16px`. User bubble `max-width 84%`, `padding 8px 12px`, `radius --r-md`, aligned right. Assistant block `max-width 100%`, `padding 0`, aligned left, **no bubble, no background, no border, no avatar**. Chip row `h 44` (`padding 8px 16px`, `gap 6px`, horizontal scroll, no wrap on mobile). Chips `h 28` visual with `::before { inset-block:-8px }` → 44px target, `padding 0 10px`, `radius --r-sm`. Composer `min-h 44`, `padding 10px 12px`, textarea auto-grows to `4` rows then scrolls.

**Tokens:**
- User bubble: `bg --surface-2`, `fg --ink`, `border none`, `--ff-body 400 14px`.
- Assistant: `fg --ink`, `--ff-body 400 14px`, `line-height 1.6`. Paragraph gap `10px`.
- Step lines (in place of typing dots): `--ff-mono 400 11px`, `letter-spacing .06em`, `color --ink-muted`, `tabular-nums`, one line, `h 18`, each prefixed by a `3px` square in `--line-strong` at `margin-right 8px`. Completed steps stay visible, collapsed to `opacity .5`; only the active step is at full opacity. Copy sequence: `Reading the running order…` → `12 snapshots in the last hour` → `Checking source times…` → `Writing`.
- **Place chip** (inline, inside assistant prose): `display: inline-flex`, `h 24`, `padding 0 8px`, `radius --r-sm`, `bg --surface-2`, `border 1px solid --line`, place text `--ff-place 600 13px --ink`, and — only if that place's latest story is verified-fresh — a `4px` teal dot before the name. No teal dot means we could not verify it; there is no other marking.
- Suggestion chips: `bg transparent`, `border 1px solid --line`, `--ff-body 500 12px --ink-muted`; hover `border-color --line-strong`, `color --ink`.
- Composer: `bg --surface-2`, `border 1px solid --line`, `radius --r-md`; focus-within `border-color --line-strong` (not a glow). Input `--ff-body 400 14px`, `@media (max-width: 639px) { font-size: 16px }` — always, to defeat iOS zoom. Send button `h 32` square-ish, label `Send` in `--ff-mono 11px .1em uppercase`, hit area 44px.

**States:**
- **idle:** conversation with history; three suggestion chips present; composer empty with placeholder `Ask about anywhere on Earth`.
- **hover / press / focus-visible:** chips and send button per C-01's conventions; focus ring on composer wrapper.
- **disabled:** send disabled while the composer is empty or while a response is streaming. `opacity .45`, `aria-disabled="true"`. Reason surfaced as `aria-label="Send — waiting for the current answer"` during streaming.
- **loading (streaming):** the step lines above, replacing in place as the action reports stages; then prose streams token-by-token into the assistant block. **Never a spinner, never three dots.** A `Stop` button replaces `Send` (`--ff-mono 11px uppercase --danger` text on `--surface-2`) and aborts the action.
- **success:** the answer settles, step lines collapse into a single `--ff-mono 10px --ink-muted` line: `4 steps · 2.1s`, `tabular-nums`, clickable to re-expand.
- **error:** the assistant block is replaced by `--ff-body 14px --ink` copy `That didn't come back. The question is still in the box — try again.`, the user's text is restored into the composer, and a `Retry` text button (`--ff-mono 11px uppercase --ink`) sits under it. Border-left `2px solid --danger` on the assistant block is the only colour.
- **empty (no messages yet):** C-11 chat-first-run above the chip row.

**The place-chip rule (non-negotiable):** every geographic proper noun in an assistant answer is post-processed against `api.places.resolve` and rendered as a place chip. A chip click runs **T-05**: flies the globe, switches the Dock to the Story tab, loads or fetches that place. **A text-only answer is a failed answer** — if the resolver returns zero chips for an answer that mentions a place, the assistant block appends a fallback row of up to 3 chips built from the places in the current running order, labelled `--ff-mono 10px .1em uppercase --ink-muted`: `GO TO`.

**Transitions:** `idle -SUBMIT-> streaming` (guard: non-empty, not already streaming). `streaming -FIRST_TOKEN-> streaming'` (step lines collapse to the summary line). `streaming -DONE-> success -> idle`. `streaming -STOP|ABORT-> idle` with partial text kept and marked `— stopped` in `--ff-mono 10px --ink-muted`. `streaming -TIMEOUT(45s)-> error`. `idle -CHIP_CLICK-> submits that chip's text verbatim`.

**Motion:** T-05, T-15, T-19.
Reduced motion: token streaming still streams (it is content, not decoration) but the per-line fade-in is dropped; step-line replacement is an instant text swap; chip hover has no transform; the conversation's auto-scroll uses `behavior: "auto"`.

**Responsive:** `@container dock (max-width: 420px)`: chip row becomes a single horizontally-scrolling line with 16px edge padding and no fade masks (it is short). `<640`: input `16px`, composer `min-h 48`, `Send` becomes a 44×44 target.

**Keyboard / a11y:** `Enter` sends, `Shift+Enter` newlines, `Escape` clears the composer (first press) then closes the Dock (second). Conversation is `role="log" aria-live="polite" aria-relevant="additions text"` — but the streaming assistant block sets `aria-busy="true"` while streaming and only announces on completion, so a screen reader hears the finished answer once, not every token. Step lines are `aria-live="polite"` with `aria-atomic="true"` so each named step is announced as a whole sentence. Place chips are `<button>` with `aria-label="Go to Reykjavík, Iceland — verified live"` or `"… — cannot verify"`.

**Data:** `api.chat.thread({ threadId })` reactive query for messages; `api.chat.ask` action (OpenAI SDK) writes step rows into `chatSteps` which the step lines subscribe to — the named steps are real, not simulated. `api.places.resolve` for chips. Three suggestion chips are static and always these: `Where is it daylight right now?`, `What's the best frame in the last hour?`, `Show me somewhere cold`. Under `?demo=1` the first suggestion is pre-sent at +12s so a full step-line → streamed answer → place-chip sequence plays unattended.

**Acceptance:** `?state=chat-empty`, `?state=chat-steps`, `?state=chat-streaming`, `?state=chat-answered`, `?state=chat-nochips` (fallback GO TO row), `?state=chat-error`.

---

### C-06 FeedRail   (base: custom)

**Purpose:** I can see the running order — what's on air and what it beat — and scrub through it like a tape.

**Placement:** Grid row 3, full width, spans under both the globe and the Dock (the Dock stops above it on desktop). `position: relative`, `z-index: 30`. Mobile: becomes a `96px` peek strip welded to the top edge of the bottom sheet, always visible at every snap point including `0` (where it is the only part of the sheet on screen, acting as the handle).

**Size:** `h --rail-h` (132px). Track `padding 10px 20px 14px`, `gap 12px`. `scroll-snap-type: x mandatory`, `scroll-padding-left: 20px`, `overflow-x: auto`, `overflow-y: hidden`, `overscroll-behavior-x: contain`. Native scrollbar hidden (`scrollbar-width: none; &::-webkit-scrollbar { display:none }`). Edge fades: `mask-image: linear-gradient(90deg, transparent 0, #000 48px, #000 calc(100% - 48px), transparent 100%)`, applied conditionally — the left 48px mask is removed when `scrollLeft === 0`, the right when scrolled to the end, so the rail never looks like it is hiding something that isn't there.

**Tokens:** bg `--canvas`, `border-top 1px solid --line`. No surface fill — the rail reads as a strip of the channel, not a panel. Arrow-step affordances are invisible until keyboard focus enters the rail, at which point a `--ff-mono 10px .1em uppercase --ink-muted` hint appears at the right of the top border: `← → STEP · HOME ON AIR`.

**States:**
- **idle:** items laid out, on-air item present.
- **hover:** none on the rail itself; see C-07.
- **press (drag):** `cursor: grabbing`; pointer drag maps 1:1 to `scrollLeft`; on release, momentum runs a `requestAnimationFrame` decay at `v *= 0.94` per frame until `|v| < 0.4`, then snaps to the nearest item. Drag threshold `6px` before a press becomes a drag (so a tap still opens the item).
- **focus-visible:** the rail is `tabindex="0"`; focus ring on the track; roving focus then lives on items.
- **disabled:** cannot occur.
- **loading:** 6 skeleton items at `196×108`, `bg --surface-2`, `radius --r-md`, carrying C-04's 1400ms opacity pulse staggered 90ms apart so the rail reads as filling left to right — **never a shimmer sweep** (DESIGN.md bans it). Held fully static they read as six dead boxes rather than as a running order being built. A `--ff-mono 10px .12em uppercase --ink-muted` line sits at the rail's left: `BUILDING RUNNING ORDER`.
- **success:** not a state.
- **error (`feed.recent` failed):** C-11 rail-error inline at the rail's left, the rail keeps its height so the layout never jumps.
- **empty (zero snapshots):** C-11 rail-first-run, same fixed height.

**Transitions:** `idle -FEED_ORDER_CHANGED-> idle'` runs **T-07** (Motion `layout` reorder). Guard: reorder animation is skipped entirely if the rail is mid-drag (`pointerdown` active) — items snap to their new positions on `pointerup` instead, because animating under a finger feels broken. `idle -HOME-> scrolled(on-air item at scroll-padding-left)`, `scrollTo({ behavior: "smooth" })`, or `"auto"` under reduced motion.

**Motion:** T-03 (row 5), T-07, T-08, T-18, T-20.
Reduced motion: `layout` animations disabled (`<MotionConfig reducedMotion="user">` covers this); re-rank is an instant reflow; `Home` scroll is instant.

**Responsive:** `≥1024` as above. `640–1023`: same, track padding `10px 16px 14px`. `<640`: `h 96`, items scale to `168×84` (see C-07), track padding `8px 12px`, and the strip gains `touch-action: pan-x` so a horizontal drag scrolls the rail while a vertical drag moves the sheet — the gesture split is resolved on the first `12px` of travel by dominant axis.

**Keyboard / a11y:** `role="list"` with `aria-label="Running order"`; items are `role="listitem"` containing a button. `ArrowRight`/`ArrowLeft` move focus one item and scroll it into view (step = `208px` desktop, `180px` mobile). `Home` jumps focus **and** scroll to the on-air item and announces `On air: Reykjavík, position 1 of 12`. `End` goes to the last item. `Enter` opens that snapshot's Story in the Dock. Tab from the rail exits the rail entirely (roving tabindex, one tab stop).

**Data:** `api.feed.recent({ limit: 24 })` reactive query → snapshots ordered by `score desc` within the last hour, with the on-air one forced to index 0. The order changing *is* the re-rank; the client does no sorting. `?demo=1`: fixture of 12 snapshots; at the +20s cut, two items genuinely swap rank so T-07 is visible without faking it.

**Acceptance:** `?state=rail-idle`, `?state=rail-rerank`, `?state=rail-loading`, `?state=rail-empty`, `?state=rail-error`, `?state=rail-scrolled-end` (right mask removed).

---

### C-07 RailItem   (base: custom, `motion.div layout` child)

**Purpose:** One frame in the running order — I can see its rank, where it is, what it scored, and instantly which one is on air.

**Placement:** Child of C-06's track, `scroll-snap-align: start`. Order is the query order, never client-sorted. **Every item is a Motion `layout` child keyed by `snapshotId`** — not by index — so a real re-rank physically slides the same DOM node to its new x.

**Size:** `196×108` desktop, `radius --r-md`, `overflow: hidden`, `flex: 0 0 196px`. Mobile `<640`: `168×84`, `flex: 0 0 168px`. Lower-third overlay `h 32`, absolute bottom, `padding 0 8px`, `gap 8px`. Rank plate `20×20`, absolute `top 6px left 6px`, `radius --r-sm`. Touch target: the whole item is the button, `196×108` — far over 44px.

**Tokens:**
- Frame: `object-fit: cover`, `border 1px solid --line`.
- Lower-third: `background: linear-gradient(180deg, transparent, color-mix(in oklab, var(--canvas) 92%, transparent) 55%)`. No blur.
- Rank: `bg --canvas`, `border 1px solid --line`, `--ff-mono 400 11px --ink-muted`, `tabular-nums`, centred.
- Place: `--ff-place 600 12px --ink`, single line, `text-overflow: ellipsis`.
- Score: `--ff-mono 400 12px --ink`, `tabular-nums`, `margin-left: auto`.
- **Verified dot:** a `4px` circle in `--live` immediately before the place name, present **only** when that snapshot's source time is under 3h. Absent otherwise. No grey dot substitutes for it — absence is the signal.
- **On-air treatment:** `border 1px solid --accent`; rank plate becomes `bg --accent`, `color --accent-ink`, and its content is replaced by a `6px` amber-ink dot (no number — the on-air item has no rank, it *is* the rank); score switches to `--accent`; and an `ON AIR` tag `--ff-mono 9px .14em uppercase --accent` sits at `top 6px right 6px` on a `--canvas` plate with `radius --r-sm`, `padding 1px 4px`.

**States:**
- **idle:** as above.
- **hover:** `border-color --line-strong` (on-air items keep `--accent`), frame `transform: scale(1.02)` inside the fixed-size clip (the item's box does not grow — it must not disturb the layout or the snap positions), 150ms `--ease-out-quint`. Lower-third gradient opacity `→ 1`.
- **press:** `scale(.985)` on the item, 120ms.
- **focus-visible:** focus ring; item scrolled into view with `block: "nearest", inline: "nearest"`.
- **disabled:** cannot occur — every snapshot in the rail is openable.
- **loading:** the skeleton form described in C-06; individual items do not load independently.
- **success:** the **tally flash** (T-08) — fired once, only on the item that *takes* the air: a full-bleed `--accent` overlay at `18%` opacity fades to `0` over 420ms `--ease-out-quint` while the border goes `1px → 2px → 1px --accent` over 320ms. Exactly one flash per cut; the outgoing item does not flash, it simply loses its amber over 200ms.
- **error (image 404 / decode fail):** the frame slot becomes `bg --surface-2` with a centred `--ff-mono 10px .1em uppercase --ink-muted` line `NO FRAME`. Place, rank and score still render — the record is still real even if the picture is gone. Not red; a missing image is not a false claim.
- **empty:** cannot occur — an item without a snapshot is not rendered.

**Transitions:** `idle -BECOMES_ONAIR-> onair` (T-08). `onair -LOSES_AIR-> idle`, amber drains over 200ms. `idle -FEED_ORDER_CHANGED-> idle` (T-07, `layout` spring). `idle -CLICK|ENTER-> opens Story in Dock` (T-01 path, but with no fetch — the snapshot is already stored).

**Motion:** T-03 (rows 5–6), T-07, T-08.
- T-07 spring: `transition={{ layout: { type: "spring", visualDuration: 0.45, bounce: 0.12 } }}` — **the only spring in the product.**
Reduced motion: `layout` off (instant reflow); the tally flash is replaced by a static `2px --accent` border that simply appears; no hover scale.

**Responsive:** `<640`: `168×84`, place `--ff-place 600 11px`, score `--ff-mono 11px`, rank plate `18×18`, `ON AIR` tag drops to `8px` and loses its padding plate (sits directly on the gradient). `@container` not needed — the item is fixed-width by design.

**Keyboard / a11y:** `<button>` inside the `role="listitem"`, `aria-label="Rank 3. Reykjavík, Iceland. Score 8.1. Verified live."` or `"… Source time unknown."`; on-air items read `"On air. Reykjavík, Iceland. Score 8.4. Verified live."`. `aria-current="true"` on the on-air item. The tally flash itself is **not** announced — C-01's live region owns the cut announcement.

**Data:** one row of `api.feed.recent`. Image is the stored frame URL from Convex storage (never a hot-linked source URL, so a dead source does not empty the rail). `?demo=1` uses bundled fixture frames so the rail renders offline.

**Acceptance:** `?state=item-idle`, `?state=item-onair`, `?state=item-verified`, `?state=item-unverified`, `?state=item-noframe`, `?state=item-flash`.

---

### C-08 CountryFetchProgress   (base: custom, modelled on AI Elements/Task)

**Purpose:** While the app goes and finds a live camera in the country I clicked, I can see exactly what it is doing and that it is actually checking.

**Placement:** Occupies the frame slot of C-04 inside the Story tab — same `16/9` box, same position — so when the frame arrives it replaces this in place with no layout shift. A second, compact instance renders as a single line under the country's name on the globe hover label when a fetch is running for a country that isn't currently open. Mobile: identical, inside the sheet.

**Size:** Box `width 100%`, `aspect-ratio 16/9`, `radius --r-md`. Stage line is vertically centred, `h 20`, `padding-inline 16px`, single line, `text-align: center`. Progress hairline `h 1`, absolute bottom `0`, inset `0`. Compact instance: `h 16`, left-aligned, no box.

**Tokens:** Box `bg --surface-2`, `border 1px solid --line`. Stage text `--ff-mono 400 12px`, `letter-spacing .05em`, `color --ink`, `tabular-nums` (times and counts change). Completed-stage colour is not used — **only one line is ever on screen; it replaces in place.** The progress hairline is `bg --line-strong`, width = `(stageIndex + 1) / 5 * 100%`, transitioned over 200ms — driven by **stage index, never by elapsed time**, because a time-based bar on a 4.5–24s operation is a lie.

**Stage copy (exact, driven by `fetches.stage`):**
| stage | copy |
|---|---|
| `searching` | `Searching cameras in Kenya…` |
| `candidates` | `3 candidates found` |
| `fetching` | `Pulling the freshest one…` |
| `fresh_ok` | `Frame is 11 minutes old — accepted` |
| `fresh_fail` | `Frame is 6 hours old — cannot verify` |
| `no_time` | `Source has no timestamp — cannot verify` |
| `scoring` | `Scoring…` |
| `done` | (component unmounts into T-02) |

Country name is interpolated from the clicked polygon, not from the server, so the first line appears at click time with zero latency. Counts and durations are `tabular-nums`.

**States:**
- **idle:** cannot occur — this component only exists while a fetch is in flight.
- **hover / press:** none. Not interactive, except the cancel affordance below.
- **focus-visible:** `Cancel` is the only focusable child.
- **disabled:** n/a.
- **loading:** this *is* the loading state; the distinction is which stage. After `9s` in any single stage a second line appears below in `--ff-mono 11px --ink-muted`: `Still going — 14s`, a `tabular-nums` counter ticking each second, plus a `Cancel` text button (`--ff-mono 11px .1em uppercase --ink-muted`, 44px target). **Honest waiting beats a fake bar.**
- **success:** the `fresh_ok` line holds for a minimum of 400ms (enforced client-side even if the server races past it), then T-02 runs. If the frame came back but could not be verified, the last line shown before the card is `fresh_fail` or `no_time`, in `--ink-muted` — and the resulting StoryCard carries the grey chip. The stage line's own colour never goes teal; the *chip* makes the claim.
- **error:** `fetches.stage = "failed"` → replaced immediately by C-11 country-error.
- **empty:** n/a.

**Transitions:** `searching -ROW_UPDATE-> candidates -> fetching -> (fresh_ok | fresh_fail | no_time) -> scoring -> done`. Each replacement is T-10. Guard: stages may be skipped by the server but **never regress** — the client ignores any update whose stage index is lower than the current one. Timeout: at `30s` with no row update, force `failed` client-side with copy `The fetch stopped responding.`

**Motion:** T-10.
- T-10: outgoing line `opacity 1→0, translateY 0→-4px` over 120ms; incoming `opacity 0→1, translateY 4px→0` over 160ms `--ease-out-quint`, starting at 80ms (60ms overlap). Hairline width 200ms linear.
Reduced motion: no translate, no crossfade — the text content is swapped in one frame. The hairline still moves (it is a position, not a flourish) but with `transition: none`.

**Responsive:** `<640`: stage text `13px` (readable at arm's length on a phone), box unchanged. `@container dock (max-width: 420px)`: box goes edge-to-edge with the card.

**Keyboard / a11y:** wrapper is `role="status" aria-live="polite" aria-atomic="true"`. Each stage is announced as a full sentence exactly once. The `Still going` counter is inside `aria-live="off"` — a per-second announcement would be intolerable; only its first appearance is announced, as `Still going.` `Cancel` is a real button, `aria-label="Cancel the fetch for Kenya"`.

**Data:** subscribes to the existing `fetches` row: `api.fetches.watch({ fetchId })` → `{ stage, candidateCount, frameAgeMinutes, countryName, startedAt }`. The action `api.countries.fetch` writes this row as it goes; the client renders whatever the row says and invents nothing. `?demo=1` replays the sequence at fixed offsets: 0.0s `searching`, 1.2s `candidates`, 2.4s `fetching`, 3.6s `fresh_ok`, 4.8s `scoring`, 6.0s `done`. `?demo=1&slow=1` stretches it past 9s so the `Still going` line can be demonstrated.

**Acceptance:** `?state=fetch-searching`, `?state=fetch-candidates`, `?state=fetch-freshok`, `?state=fetch-freshfail`, `?state=fetch-notime`, `?state=fetch-scoring`, `?state=fetch-slow`, `?state=fetch-failed`.

---

### C-09 SubscribeSheet + DeliveryChip   (base: shadcn/Dialog on Base UI; chip is custom)

**Purpose:** I can have the moment that's on air sent to me, and then watch the app prove it actually arrived instead of asking me to take its word for it.

**Placement:** Centred dialog on desktop (`max-width 420px`), bottom sheet on mobile (`<640`, full width, `radius --r-lg --r-lg 0 0`, snaps `[0, auto]`). This is the **one modal in the product** — it is a short, explicit, user-initiated transaction. The TopBar stays above the scrim (`z-index 60 > 50`) so a cut is still visible while the dialog is open; the scrim is `--canvas` at `72%` opacity, **no blur**, and it does not cover the TopBar. DeliveryChip additionally persists after the dialog closes, docked to the TopBar's right cluster as a third element, until dismissed or 10 minutes elapse.

**Size:** Dialog `padding 20px`, `gap 14px`. Frame preview `width 100%`, `aspect-ratio 16/9`, `radius --r-md`. Email input `h 48`, `padding 0 12px`, `radius --r-md`. Submit `h 44`, full width. DeliveryChip `h 26`, `padding 0 8px`, `radius --r-sm`, `gap 6px`; in the TopBar it gets a 44px hit area via `::before`.

**Tokens:** Dialog `bg --surface-1`, `border 1px solid --line`, `radius --r-lg`. Heading `--ff-display 600 17px --ink`: `Send me this`. Sub-line `--ff-body 13px --ink-muted`: `The frame on air right now, in your inbox.` Place inside the preview caption uses `--ff-place 600 14px`. Input `bg --surface-2`, `border 1px solid --line`, `--ff-body 400 16px` (16px at **every** breakpoint, not just mobile — it is the only text field a stranger will type into on a phone). Submit `bg --surface-2`, `border 1px solid --line-strong`, `--ff-body 600 14px --ink`. **Not amber** — sending is not being on air.

**DeliveryChip tokens by status (from `mailEvents`):**
| status | border | text | copy |
|---|---|---|---|
| `queued` | `1px solid --line` | `--ink-muted` | `QUEUED` |
| `accepted` | `1px solid --line-strong` | `--ink` | `ACCEPTED BY PROVIDER` |
| `delivered` | `1px solid color-mix(in oklab, var(--success) 45%, transparent)` | `--success` | `DELIVERED · a3f91c8d` |
| `bounced` | `1px solid color-mix(in oklab, var(--danger) 50%, transparent)` | `--danger` | `BOUNCED · a3f91c8d` |
| `unconfirmed` (90s, no terminal event) | `1px solid --line` | `--ink-muted` | `NO CONFIRMATION — CHECK SPAM` |

All chip text is `--ff-mono 400 10px`, `letter-spacing .12em`, `uppercase`, `tabular-nums`. The message id is the first 8 hex chars; the full id is on `title` and is copied to the clipboard on click, with the chip briefly reading `ID COPIED` for 1200ms. **Teal is never used here** — `--live` is reserved for frame freshness, and diluting it across a second meaning would destroy the one claim the product is built on. Delivery success gets `--success`.

**States:**
- **idle:** preview + input + submit. Submit enabled only with a syntactically valid address.
- **hover / press / focus-visible:** standard; focus ring on input and submit.
- **disabled:** submit disabled when the input is empty or invalid (`opacity .45`, `aria-disabled="true"`, helper `--ff-body 12px --ink-muted`: `That doesn't look like an email address.` shown only after blur, never while typing). Also disabled when nothing is on air, with helper `Nothing is on air to send.`
- **loading:** submit label swaps to `Sending…` in place, `aria-busy="true"`, input becomes `readonly` (not disabled — the address must stay readable). No spinner.
- **success:** the form is replaced in place by: a `--ff-body 14px --ink` line `Sent to sam@example.com.`, the DeliveryChip, and a `--ff-body 12px --ink-muted` line `Watch this chip. Mail from a shared domain often gets filtered — this is how you'll know it landed.` Dialog gains a `Done` button. Closing the dialog moves the chip into the TopBar and it keeps updating there.
- **error (action threw):** inline `border-left 2px solid --danger` block, copy `That didn't send. Your address is still here — try again.`, `Retry` button, address preserved.
- **empty:** cannot occur — the dialog only opens when something is on air.

**Transitions:** `idle -SUBMIT-> loading` (guard: valid email, not already sending). `loading -ACTION_OK-> success` (chip starts at `queued`). `queued -MAILEVENT(accepted)-> accepted -MAILEVENT(delivered)-> delivered`. `queued|accepted -90s_NO_TERMINAL-> unconfirmed`. `any -MAILEVENT(bounced)-> bounced`. `loading -ACTION_ERR|20s-> error`.

**Motion:** T-11, T-19.
- T-11: chip text crossfades on status change — outgoing `opacity → 0` 100ms, incoming `opacity 0 → 1` 140ms; border colour transitions 200ms. The chip's width animates with `layout` (no spring: `duration .2, ease --ease-out-quint`) because the copy length changes.
Reduced motion: instant text and colour swap, no width animation (`transition: none`), chip still updates.

**Responsive:** `<640`: bottom sheet, `padding 16px 16px calc(16px + env(safe-area-inset-bottom))`, submit `h 48`, input `h 52`. In the TopBar below 640 the chip replaces the `Send` label entirely while active (one right-cluster slot, not two), and reverts when dismissed.

**Keyboard / a11y:** Dialog is modal here: `aria-modal="true"`, focus trap, initial focus on the email input, `Escape` closes, focus returns to the `Send me this` button in C-01. The DeliveryChip is `role="status" aria-live="polite" aria-atomic="true"` and announces each transition as a sentence: `Queued.` → `Accepted by the mail provider.` → `Delivered. Message id a3f91c8d.` When docked in the TopBar it is a `<button aria-label="Delivery status: delivered. Message id a3f91c8d... Click to copy.">`.

**Data:** `api.mail.send` action (AgentMail) → returns `messageId`, writes a `mailEvents` row. `api.mailEvents.byMessage({ messageId })` reactive query drives the chip — the chip is not optimistic and never shows a status the table has not recorded. `?demo=1`: fixture advances `queued` at 0s, `accepted` at 1.5s, `delivered` at 4.0s; `?demo=1&mail=bounce` demonstrates the bounce path; `?demo=1&mail=silent` demonstrates `unconfirmed`.

**Acceptance:** `?state=mail-idle`, `?state=mail-invalid`, `?state=mail-sending`, `?state=mail-queued`, `?state=mail-accepted`, `?state=mail-delivered`, `?state=mail-bounced`, `?state=mail-unconfirmed`, `?state=mail-error`.

---

### C-10 ScoreReadout   (base: custom)

**Purpose:** I can see not just what the director scored this frame, but what it beat — so the number reads as a decision someone made, not a number a machine printed.

**Placement:** Two variants of one component.
- `variant="stage"`: absolutely positioned over the globe region, `bottom 20px left 20px`, `z-index 35`, always visible, always the **on-air** frame. Hidden below 640 (no room) — its content moves into the rail's on-air item aria-label and into the Story card.
- `variant="card"`: inline inside C-04, directly under the frame, full width. Shows *that story's* score, which may not be the on-air one.

**Size:** stage: `max-width 320px`, `gap 6px`, no background box — it sits directly on the canvas with a `linear-gradient(180deg, transparent, color-mix(in oklab, var(--canvas) 70%, transparent))` scrim `160px` tall behind it at the globe region's bottom-left, so text stays legible over daylight without a glass panel. card: `padding 12px 0`, `border-top 1px solid --line`, `border-bottom 1px solid --line`, `gap 8px`.

**Tokens:**
- Score: `--ff-mono 400 40px` (stage) / `28px` (card), `letter-spacing -.02em`, `tabular-nums`. Colour: `--accent` in the stage variant and in the card variant **only when this story is the one on air**; otherwise `--ink`. One decimal, always (`8.4`, never `8` or `8.40`).
- `/10` suffix: `--ff-mono 400 13px --ink-muted`, `tabular-nums`, baseline-aligned.
- Beat line: `--ff-mono 400 12px --ink-muted`, `tabular-nums`. Copy: `beat Reykjavík 8.1`. The beaten place is in `--ff-place 600 12px --ink-muted` inline — the editorial voice is used for place names here too, at muted weight, because it is still a place name. If there is nothing to beat (first frame of a session, or a cold channel): `first on air this hour` — **never** a fabricated comparison.
- Caption: `--ff-body 400 13px --ink`, `max-width 46ch`, clamped to 2 lines in the stage variant (`-webkit-line-clamp: 2`), unclamped in the card.
- Tags: row of up to 4, `h 20`, `padding 0 6px`, `radius --r-sm`, `bg --surface-2`, `border none`, `--ff-mono 400 10px .1em uppercase --ink-muted`. Non-interactive.

**States:**
- **idle:** score + `/10` + beat line + caption + tags.
- **hover / press:** none — not interactive in either variant.
- **focus-visible:** not focusable.
- **disabled:** cannot occur.
- **loading:** score renders as `—.—` in `--ink-muted` with `tabular-nums` (so the box does not resize when the real number lands), beat line and caption hidden, tags replaced by two `52×20` `--surface-2` blocks. No spinner.
- **success:** not persistent — the arrival is T-14.
- **error (score missing on an otherwise valid snapshot):** score shows `—.—` in `--ink-muted` permanently, beat line replaced by `not scored`, caption and tags omitted. **Not red.** An unscored frame is not a broken frame.
- **empty (nothing on air, stage variant):** the whole component is `display: none` — an empty score box on the globe is worse than nothing.

**Transitions:** `idle -ONAIR_ID_CHANGED-> idle'` runs **T-14** (stage variant only). `loading -DATA-> idle`.

**Motion:** T-03 (row 7), T-14.
- T-14: old score `translateY 0 → -14px, opacity → 0` over 140ms; new score `translateY 14px → 0, opacity 0 → 1` over 200ms `--ease-out-quint`, starting at 100ms. Clipped by `overflow: hidden` on a `1lh` box so it reads as a mechanical roll, not a fade. Beat line and caption crossfade 160ms with no translate, starting at 180ms. Tags do not animate.
Reduced motion: all of T-14 collapses to a single-frame content swap.

**Responsive:** `≥1024` stage variant visible. `640–1023` stage variant visible but `max-width 240px`, score `32px`, caption clamped to 1 line. `<640` stage variant `display: none`; card variant only. `@container dock (max-width: 420px)`: card score `26px`, tags wrap.

**Keyboard / a11y:** wrapper is `<div role="group" aria-label="Score">`. The stage variant is `aria-hidden="true"` — its content is already inside C-01's live-region sentence and repeating it would double every announcement. The card variant is readable, with the score exposed as `8.4 out of 10, beat Reykjavík at 8.1` in a visually-hidden span so the `/10` and the comparison are spoken as prose.

**Data:** `api.channel.onAir` (stage) / `api.stories.byId` (card), each returning `{ score, caption, tags[], beat: { place, score } | null }`. `beat` is computed server-side at cut time and stored on the snapshot — it is a historical fact about that cut, not a client-side comparison that would drift as the feed changes. `?demo=1` fixtures always include a `beat`.

**Acceptance:** `?state=score-onair`, `?state=score-card`, `?state=score-nobeat`, `?state=score-loading`, `?state=score-unscored`.

---

### C-11 EmptyStates   (base: custom; one `<EmptyState>` primitive, four regions × three kinds)

**Purpose:** When a region has nothing in it, I'm told what would normally be here, why it isn't, and the one thing that fixes it — instead of staring at a blank rectangle.

**Placement:** Each instance fills its own region exactly, preserving that region's height so nothing in the layout jumps: rail instance is `h --rail-h` and horizontally left-aligned at the track's `padding-left`; story and chat instances fill the Dock panel, centred vertically with `max-width 30ch`; country instance renders inside the Story tab in place of C-04.

**Size:** Primitive: `gap 8px`, `padding 20px` (rail instance `padding 0 20px`, row layout). Rule line `w 24px, h 1px, bg --line-strong` above the title. Action button `h 40` (`44` coarse), `padding 0 14px`. Country chips `h 32` visual / 44px target, `gap 6px`.

**Tokens:** No background box, no card, no illustration, no icon, no emoji. `bg transparent`. Title `--ff-display 600 14px --ink`. Body `--ff-body 400 13px --ink-muted`, `line-height 1.5`. Action `bg --surface-2`, `border 1px solid --line`, `--ff-body 500 13px --ink`. The rule line is the only ornament. Error variants add `border-left 2px solid --danger` and `padding-left 12px`; **first-run and no-result variants get no colour at all** — nothing has gone wrong, so nothing should be tinted.

**The twelve blocks (exact copy):**

*Rail*
- **first-run:** `The running order` / `Nothing has gone on air yet. The director scores a new frame every few seconds.` / action `Start the channel` (calls `api.channel.tick`).
- **no-result:** `No frames in the last hour` / `Every camera checked came back stale. The running order only lists frames we could verify.` / action `Widen to the last six hours`.
- **error:** `Running order unavailable` / `The feed subscription dropped.` / action `Reconnect`.

*Story*
- **first-run:** `Pick a country` / `Click any country on the globe and we'll go find a live camera in it.` / action `Open the country list` (focuses the globe and opens the searchable list).
- **no-result:** `No camera found in Mongolia` / `We searched 14 sources and none published a frame we could date.` / action `Try a neighbour` → renders the three verified chips below (see country rule).
- **error:** `That fetch failed` / `The source responded, then stopped partway through.` / action `Try Mongolia again`.

*Chat*
- **first-run:** `Ask anything about right now` / `Where it's light, what scored highest, what the director just cut away from.` / action: the three suggestion chips are the action (no button) — `Where is it daylight right now?` · `What's the best frame in the last hour?` · `Show me somewhere cold`.
- **no-result:** `No answer for that one` / `That question needs data the channel doesn't hold yet.` / action `Ask about somewhere instead` → inserts `What's on air right now?` into the composer.
- **error:** `The answer didn't come back` / `The model call failed partway through. Your question is still in the box.` / action `Try again`.

*Country fetch*
- **first-run:** handled by C-08 — a fetch is never empty, it is always at a named stage. Omitted here, deliberately.
- **no-result:** `Kenya has no verifiable camera right now` / `Three candidates, all last updated over a day ago. We'd rather say nothing than show you a frame from 2022.` / action `Try one of these` + the three verified chips.
- **error:** `Kenya didn't come back` / `The search timed out after 30 seconds.` / action `Try Kenya again`.

**The three-verified-countries rule:** the chips are populated from `api.countries.verifiedNow()` — a reactive query returning exactly 3 ISO codes whose most recent cached story has `capturedAt` within the last 3 hours, ordered by `capturedAt desc`, excluding the country that just failed. Each chip: `--ff-place 600 13px --ink`, preceded by a `4px --live` dot, followed by `--ff-mono 10px --ink-muted tabular-nums` age (`14m`). **Nothing is hardcoded.** If the query returns fewer than 3, render however many it returns; if it returns 0, drop the chip row entirely and change the action to `Open the country list` — never pad the row with unverified suggestions, because a chip with a teal dot is a claim.

**States:** The primitive's own states:
- **idle:** as above. **hover/press/focus-visible:** on the action button and chips only, per C-01's conventions. **disabled:** the action is disabled only while its own retry is in flight, label swapping to `Retrying…`, `aria-busy="true"`. **loading:** the region shows its skeleton (C-04/C-06), not an empty state — an empty state never appears while data is still in flight; it appears only after the query has settled to zero. **success/error/empty:** n/a — this component *is* those states.

**Transitions:** `skeleton -QUERY_SETTLED(count===0)-> empty`. Guard: a minimum 300ms skeleton dwell prevents a flash of empty state on a fast zero-result query. `empty -ACTION-> skeleton`. `empty -DATA_ARRIVES-> region content` via T-20 (rail) or T-02 (story).

**Motion:** T-20.
- T-20: empty block `opacity 1 → 0` 120ms, then content enters with an 8px rise, 200ms `--ease-out-quint`, staggered `30ms` per rail item, capped at 6 items of stagger.
Reduced motion: no fade, no rise, no stagger — content replaces in one frame.

**Responsive:** `<640`: story/chat instances left-align instead of centring (a phone's vertical centre is under the thumb), `max-width` removed, chips wrap to two rows. Rail instance at `h 96` drops the body line and keeps title + action only.

**Keyboard / a11y:** each block is `role="status"` (first-run and no-result) or `role="alert"` (error, so a failure interrupts). Title is the accessible name via `aria-labelledby`. Focus is moved to the action button **only** in the error case and **only** when the failure followed a user action in the last 2s — never for first-run, which would hijack the page on load. Chips are buttons with `aria-label="Go to Iceland, verified live 14 minutes ago"`.

**Data:** `api.feed.recent`, `api.stories.byId`, `api.chat.thread`, `api.fetches.watch` (zero/error results); `api.countries.verifiedNow` for the chips. `?demo=1` never shows an empty state on the happy path; `?demo=1&empty=rail|story|chat|country` forces each.

**Acceptance:** `?state=empty-rail-first`, `empty-rail-none`, `empty-rail-error`, `empty-story-first`, `empty-story-none`, `empty-story-error`, `empty-chat-first`, `empty-chat-none`, `empty-chat-error`, `empty-country-none`, `empty-country-error`, `empty-country-nochips`.

---

### C-17 Landing (`/`)   (base: custom, full-page overlay on the live shell)

**Purpose:** a judge arriving cold learns what this is, sees that it is real, and is one click from watching it.

**Placement:** route `/`, rendered inside `Channel` so the TopBar, globe and running order behind it are the live ones. `/watch` is the channel itself. Entering is a route change, never a page load: the globe is never torn down and no subscription drops. Replaced C-13, the first-visit intro card, which said less and was not addressable.

**Size:** scrim `--canvas` at 88%, no blur. Content grid `max-width 1040`, 12 columns, `gap-x 40 / gap-y 28`. Left column 5 (head, row 1; legend + actions, row 2), preview column 7 starting at column 6 and spanning both rows. Below 900 it is one column at `max-width 560` and the **preview moves above the legend**, so the live frame is on the first screen of a phone.

**Tokens:** H1 `--ff-display 600 36px` at `-0.035em` (28 below 640). Body `--ff-body 400 15px/1.6 --ink-muted`, `max-width 46ch`. Legend rows 13px with a 6px swatch. Stat line `--ff-mono 11px .1em uppercase tabular-nums`. Preview card `radius --r-lg`, `1px --accent` border, `ON AIR NOW` tag top-left on a `--canvas` plate; the running-order strip beneath is 4 tiles, `radius --r-md`, `1px --line`.

**States:**
- **idle:** everything present, preview showing the current cut.
- **loading (no cut yet):** the preview is a skeleton the shape of the real card — never a spinner, never an empty box, so nothing jumps when the first cut lands.
- **live:** the preview is a subscription, so it re-renders on every cut while the visitor reads. This is the signature moment of the screen and it needs no interaction to fire.
- **hover / press** on the preview: `scale 1.004 / .997`, 150ms, `--ease-out-quint`.
- **focus-visible:** ring on the preview and on both actions; `Start watching` takes focus on mount.
- Reduced motion: no fade or rise, no preview scale.

**Transitions:** `idle -START-> /watch` (T-17: the landing fades 150ms, nothing else moves — the channel underneath was never hidden, so there is nothing to reveal). `idle -PICK-> /watch` + the first covered country opens.

**Colour:** the two legend swatches are the only amber and teal on the screen that are not bound to a frame. They carry `data-swatch` and no text of their own, which is how `/_kit`'s `amber-unbound` assertion lets them through — a swatch teaching the rule is not a claim about a frame.

**Keyboard / a11y:** `role="dialog" aria-modal="false"` — it does not trap focus, because the channel behind it is not hidden and remains readable to a screen reader. The preview is a button labelled `On air now — {place}, {country}`.

**Data:** `director.getCut` and `director.getFeed`, the same two subscriptions the channel uses. Nothing on this screen is a mock. `?demo=true` renders it from `src/fixtures.json`.

**Acceptance:** `?state=landing`, `?state=landing-loading`, `?state=landing-reduced`, `?state=landing-phone`.

---

### C-12 NotFound (404)   (base: custom, full-page route)

**Purpose:** I landed on a dead link and, instead of a dead end, I get told the channel is still running and handed a way straight back into it.

**Placement:** Full-page route at `*`. **The TopBar still renders above it** and the globe canvas still renders behind it at `opacity .35` — this page is not outside the channel, it is a caption over it. Content block is centred, `max-width 440px`, `margin-block: 12vh auto`. Mobile: same, `margin-block: 8vh auto`, `padding-inline 20px`.

**Size:** Slate box `width 100%`, `aspect-ratio 16/9`, `radius --r-md`, `margin-bottom 20px`. Content `gap 12px`. Actions row `gap 8px`, buttons `h 44`.

**Tokens:** Page bg `--canvas` at `86%` over the dimmed globe (a flat overlay colour, **no blur**). Slate box: `bg --surface-1`, `border 1px solid --line`, containing a test-card grid of `1px --line` lines on a `48px` pitch and, centred, `404` in `--ff-mono 400 56px`, `letter-spacing .06em`, `color --line-strong`, `tabular-nums`. Under it, `--ff-mono 400 11px .14em uppercase --ink-muted`: `SIGNAL NOT FOUND`.
Title `--ff-display 600 22px --ink`: `That address isn't on the air.`
Body `--ff-body 400 14px --ink-muted`: `The page you asked for doesn't exist. The channel does.`
**Live line** (the point of the page): `--ff-body 13px --ink-muted` reading `Right now we're in` followed by the place in `--ff-place 600 16px --ink`, followed by C-04's freshness chip, teal or grey exactly as everywhere else. This line subscribes to `api.channel.onAir` and updates live — the 404 page proves the product's claim as well as any other screen does.
Primary action: `Return to air` → `/`, `bg --surface-2`, `border 1px solid --line-strong`, `--ff-body 600 14px --ink`. Secondary: `Pick a country` → `/?list=1`, `bg transparent`, `border 1px solid --line`. **Neither is amber.**

**States:**
- **idle:** all of the above, with the live line populated.
- **hover / press / focus-visible:** per C-01's conventions on both buttons.
- **disabled:** never.
- **loading:** the live line renders as `Right now we're —— ` in `--ink-muted` until `onAir` resolves; the rest of the page is fully rendered immediately. The page never blocks on the query.
- **success:** n/a.
- **error (`onAir` unavailable):** the live line is removed entirely and the body line becomes `The page you asked for doesn't exist. Head back and we'll find you something.` — we do not claim to be in a place we cannot confirm.
- **empty (channel has nothing on air):** live line reads `The channel is between cuts.` in `--ink-muted`, no chip.

**Transitions:** `loading -ONAIR-> idle`, live line fades in 160ms. `idle -ONAIR_ID_CHANGED-> idle'` — the place swaps with T-14's roll, at `20px` instead of `40px`, because a 404 that visibly cuts is the best possible advert for the product. `idle -RETURN_CLICK-> "/"`.

**Motion:** T-13, T-14 (reduced amplitude).
- T-13 (entry): slate box `opacity 0 → 1` 200ms; content block `translateY 10px → 0, opacity 0 → 1` 240ms `--ease-out-quint` at a 60ms delay; the background globe fades from `0` to `.35` over 400ms.
Reduced motion: no translate, no fade — the page renders complete on first frame, background globe at a static `.35`.

**Responsive:** `<640`: `404` glyph `44px`, title `20px`, buttons stack full-width `h 48`, background globe opacity reduced to `.22` (a phone's contrast budget is smaller). `<380`: slate box `aspect-ratio 4/3` to keep the glyph from crowding the edges.

**Keyboard / a11y:** `<main>` with `<h1>` = the title (the visual title is a real `h1`; `404` in the slate is `aria-hidden="true"` decoration). `role="alert"` is **not** used — this is a destination, not an interruption. Focus moves to the `h1` (`tabindex="-1"`) on route entry so a screen reader lands on the explanation, not on the nav. The live line is `role="status" aria-live="polite"`. Tab order: `Return to air` → `Pick a country`, and both are reachable before anything in the dimmed globe behind (which is `inert` on this route — it is decorative here).

**Data:** `api.channel.onAir` only. `?demo=1` gives the fixture place so the live line is populated offline.

**Acceptance:** `?state=404`, `?state=404-loading`, `?state=404-nochannel`, `?state=404-error`.

---

## Choreography

All timings are absolute. `E` = `--ease-out-quint: cubic-bezier(.22,1,.36,1)`. Every row is wrapped by `<MotionConfig reducedMotion="user">`; the **Reduced** column is what actually happens under `prefers-reduced-motion: reduce`.

| T-id | trigger | from → to | what moves | timing | Reduced |
|---|---|---|---|---|---|
| **T-01** | user clicks a country polygon (or a rail item, or a chat place chip) | dock closed → dock open, story loading | 1. polygon press tint at 0ms (120ms). 2. Dock `translateX 100% → 0` at 0ms, 280ms E. 3. Globe camera x-anchor → 62%, 0ms, 280ms E (same clock as the dock — they are one movement). 4. Globe flight to the country centroid, 0ms, 400ms E. 5. C-08 stage line `Searching cameras in Kenya…` appears at 120ms, 160ms fade. | 0 → 400ms | Dock fades in 120ms, camera and anchor set in one frame, stage line appears instantly |
| **T-02** | `fetches.stage = "done"` (min 400ms after the last stage line) | fetch progress → StoryCard | 1. Stage line `opacity → 0`, 120ms. 2. Frame `scale .98 → 1, opacity 0 → 1`, 240ms E at 80ms. 3. Freshness chip, place, C-10, narration, source, actions rise `8px → 0` with `opacity 0 → 1`, 200ms E each, staggered 40ms starting at 160ms. 4. Globe polygon for that country goes active (teal stroke if verified, `--ink` if not) at 240ms, 200ms. | 0 → 440ms | Card replaces the stage line in one frame; no stagger, no scale |
| **T-03** | **`channel.onAir.snapshotId` changes with no user input — the signature** | on air A → on air B | 1. Tally dot double-pulse `opacity 1 → .35 → 1`, 0ms, 240ms total. 2. Chyron place `translateY 0 → -8px, opacity → 0`, 0ms, 120ms; new place `8px → 0, opacity 0 → 1`, 80ms, 180ms E. 3. Globe camera flight A → B, 120ms, 640ms E *(suppressed if the user touched the globe within 2500ms; the amber on-air marker pulses in place instead, 400ms)*. 4. Rail re-ranks (T-07), 200ms. 5. Incoming rail item tally flash (T-08), 260ms. 6. C-10 stage score rolls (T-14), 340ms. 7. Live region announces the complete sentence at 760ms — once, after the movement settles. | 0 → 760ms | Dot static; chyron text swaps in one frame; camera `pointOfView(...,0)`; rail reflows instantly; flash becomes a persistent static `2px --accent` border; score swaps; announcement still fires at 760ms |
| **T-04** | `channel.onAir` changes **while the Dock is open** | dock open → dock open (unchanged) | Everything in T-03 still runs, visibly, past the dock — the globe is only 62%-anchored, not hidden. Additionally: Dock `border-left-color --line → --accent → --line`, one pass, 420ms starting at 0ms; the **return-to-air pill** (`NOW · REYKJAVÍK`) enters in the tab bar at 200ms, `opacity 0 → 1` + `translateX 6px → 0`, 180ms E, and **persists**. The Dock does not scroll, does not switch tabs, does not close, and **does not take focus**. No second announcement — C-01 owns it. | 0 → 760ms | Border goes to a static `2px --accent` held 6s; pill appears with no transition; everything else as T-03 reduced |
| **T-05** | user clicks a place chip inside a chat answer | ask tab → story tab, globe flown | 1. Chip press `scale .985`, 0ms, 120ms. 2. Tab underline slides Ask → Story, 60ms, 200ms E; panels crossfade `opacity`, 60ms, 160ms (no horizontal slide — the dock is already a horizontal thing). 3. Globe flight to the chip's lat/lon, 60ms, 520ms E. 4. Story content enters via T-02 (cached) or C-08 appears (uncached), at 220ms. The Ask thread is **not** cleared; returning to the Ask tab restores scroll position exactly. | 0 → 580ms | Tab content swaps in one frame; camera set in one frame; underline jumps |
| **T-06** | `Escape` (composer empty), close button, or a second click on the active country | dock open → dock closed | 1. Dock `translateX 0 → 100%`, 0ms, 280ms E. 2. Globe camera x-anchor 62% → 50%, 0ms, 280ms E (same clock). 3. Active country polygon returns to idle stroke, 0ms, 200ms. 4. Focus returns to the opener (globe canvas, rail item, or chat chip) at 280ms. Dock is hidden, **not unmounted**; subscriptions stay live. | 0 → 280ms | Dock `opacity → 0` 120ms; anchor set in one frame; focus returns immediately |
| **T-07** | `feed.recent` order changes | rail order A → order B | Motion `layout` on every `RailItem` keyed by `snapshotId`. `transition={{ layout: { type: "spring", visualDuration: 0.45, bounce: 0.12 } }}`. **The only spring in the product.** Guard: skipped while a pointer is down on the rail; positions apply on `pointerup`. | ~450ms | `layout` disabled — items reflow in one frame |
| **T-08** | a rail item takes the air | item idle → item on air | Amber wash overlay `opacity .18 → 0`, 420ms E; border `1px → 2px → 1px --accent`, 320ms; rank plate swaps to the amber dot at 120ms; `ON AIR` tag fades in 160ms at 120ms. Fires **once per cut, on the incoming item only**. The outgoing item drains its amber over 200ms with no flash. | 0 → 420ms | No wash, no pulse: the `--accent` border, amber rank plate and `ON AIR` tag simply appear |
| **T-09** | dock opens or closes | globe anchored 50% ↔ 62% | Camera x-offset only — never a CSS transform on the canvas, so polygon hit-testing stays exact. 280ms E, on the dock's clock. Not run below 1024 (the sheet overlays instead). | 280ms | Offset set in one frame |
| **T-10** | `fetches.stage` advances | stage line N → N+1 | Outgoing `opacity 1 → 0, translateY 0 → -4px`, 120ms; incoming `opacity 0 → 1, translateY 4px → 0`, 160ms E at 80ms; hairline width to `(i+1)/5`, 200ms linear. | 0 → 240ms | Text swaps in one frame; hairline jumps (`transition: none`) |
| **T-11** | `mailEvents` row status advances | chip status N → N+1 | Text crossfade (out 100ms / in 140ms at 60ms); border colour 200ms; chip width `layout` `duration .2, ease E`. | 0 → 200ms | All three properties set in one frame |
| **T-12** | pointer enters a country polygon | polygon idle → hover | Fill and stroke 150ms E; polygon altitude lift `+0.012` 150ms; cursor label follows with no easing (1:1 with the pointer). | 150ms | Colour only — no lift, no label animation |
| **T-13** | 404 route entry | blank → 404 | Slate box `opacity 0 → 1` 200ms; content `translateY 10px → 0, opacity 0 → 1` 240ms E at 60ms; background globe `opacity 0 → .35` 400ms. | 0 → 400ms | Everything at final values on first frame |
| **T-14** | on-air score changes | score A → score B | Inside a `1lh` `overflow: hidden` box: old `translateY 0 → -14px, opacity → 0` 140ms; new `14px → 0, opacity 0 → 1` 200ms E at 100ms. Beat line + caption crossfade 160ms at 180ms. Tags do not move. On C-12 the amplitude is `20px → 0` on the place name instead. | 0 → 380ms | Content swap in one frame |
| **T-15** | `chatSteps` row appended | step line N → N+1 | Previous step drops to `opacity .5` over 120ms; new step `opacity 0 → 1, translateY 3px → 0` 160ms E. On first prose token, all step lines collapse into the `4 steps · 2.1s` summary: `height → 18px` 200ms E, `opacity` crossfade 140ms. | 0 → 200ms | No translate, no collapse animation — steps swap and the summary replaces them in one frame |
| **T-16** | mobile sheet drag release | snap A → snap B | Target = nearest of `[0, 62vh, 92vh]` after velocity projection at `0.35 × v`. `translateY` 280ms E. The Feed Rail peek strip travels with the sheet as one body. Globe never resizes — it stays mounted at `45vh` behind. | 280ms | Position set in one frame |
| **T-17** | `webglcontextlost` | globe → slate | Canvas `opacity 1 → 0` 160ms; slate `opacity 0 → 1` 200ms at 100ms. Subsolar readout keeps ticking throughout — the page must still look alive. | 0 → 300ms | Instant swap |
| **T-18** | rail `scrollLeft` reaches either end | mask on → mask off | The relevant 48px edge-fade stop animates to `0`, 200ms E, so the rail never implies content that isn't there. | 200ms | Mask toggles in one frame |
| **T-19** | dock tab change (Story ↔ Ask) | panel A → panel B | Underline `translateX` + `width` to the new label, 200ms E; panels crossfade `opacity`, 160ms. Outgoing panel keeps its scroll position in state. | 200ms | Instant |
| **T-20** | an empty region receives its first data | empty → populated | Empty block `opacity 1 → 0` 120ms; content enters `translateY 8px → 0, opacity 0 → 1` 200ms E at 120ms, staggered 30ms per rail item, stagger capped at 6 items. | 0 → 500ms | Replacement in one frame, no stagger |
---

## 6. Copy

Every string in the product is in `./COPY.md`, grouped by surface. Three rules bind the build:

- `Send me this` and `Ask about this` keep those exact names on every surface they appear on.
  Never `Subscribe`, `Submit` or `Email me`.
- Any string stating an age renders only from a source-supplied timestamp. With no timestamp the
  only permitted chip is `Age not verifiable · the source sends no timestamp` — no relative age,
  no "just now", no default.
- Rejection counts always reconcile: `stale + misplaced = rejected`, and `rejected + kept = n`.

## 7. Brand

In `./brand/`: the mark (a disc cut by the terminator — amber day, teal night, the product's
two claims in one shape), the wordmark whose `i` tittle is the mark, four custom glyphs matching
Lucide/Tabler metrics (`envelope-arc`, `track-to-ring`, `dot-between-arcs`, `clock-before-three`),
the favicon set with raster export script, `manifest.ts`, and `opengraph-image.tsx`.

The `verified-fresh` glyph is a clock reading just before three, not a checkmark. The claim is
"we read the source timestamp", so the glyph shows a timestamp. Paint it `--live` when verified
and grey when the source sends none — the glyph obeys the color rule like everything else.

The OG card renders the real director state at build time rather than art: a frame on air with
its score, and a running order whose last row is honestly grey with `NO TIMESTAMP`.

## 8. Don'ts specific to this build

- Amber is on air and nothing else. Teal is verified-fresh and nothing else. No warning color exists.
- No emoji as icons. The ✉ currently on "Send me this" becomes `envelope-arc` at 20px.
- No `backdrop-blur`, glass, glow or neon. One shadow exists, under the mobile sheet.
- No generic spinners. Named stages (C-08, C-15) or skeletons shaped like the real layout.
- Never gate the UI on the globe canvas. Rail and TopBar paint before it is ready.
- The dock never exceeds 40% of desktop width. The channel stays the main object on screen.
- A cut never steals focus, never scrolls the dock, never switches its tab, never closes it.
- A StoryCard frame is never a screenshot of a webpage. If that is all that exists, it is an empty state.
- `--ff-place` appears on place names only.
- One spring in the entire product: the rail re-sort. Everything else is `--ease-out-quint`.

## 9. Acceptance

Run the screenshot loop at 390 / 1024 / 1440 across `/`, a country view and `/_kit`, for every
`?state=`. Chromium is preinstalled — never run `playwright install`.

- [ ] Open a country card and watch a real cut happen behind it without the card closing, scrolling or stealing focus.
- [ ] The rail visibly re-sorts on a real director cut, with no reload and no manual insert.
- [ ] Click 15 random countries: at most 2 reach an empty state, and every empty state offers three alternatives that are verified working this minute.
- [ ] Every fetch over 3s shows named stages whose counts reconcile, never a bare spinner.
- [ ] A chat answer naming a place renders a chip that flies the globe and opens that Story.
- [ ] Nothing teal appears on a frame whose age was not read from the source.
- [ ] Exactly one amber element on screen at any time.
- [ ] No horizontal page scroll at 390px. The rail scrolls; the page does not.
- [ ] Esc closes the dock and returns focus to whatever opened it.
- [ ] `prefers-reduced-motion`: rail re-sorts with no movement, no camera flight, opacity and color kept.
- [ ] The globe never unmounts or freezes on panel open or close; kill the WebGL context and the page still looks alive.
- [ ] Contrast: WCAG AA on every pair, plus APCA Lc ≥ 75 body / ≥ 60 secondary.
- [ ] LCP < 2.5s with the globe lazy and a poster as LCP. No console errors.

## 10. Deviations from the skill's defaults

1. **Four type roles instead of two plus mono.** `--ff-place` (Newsreader) is a fourth family
   restricted to place names. Justified because the place name is the only emotional content in
   an otherwise instrumental interface, and restricting a serif to one noun is an argument rather
   than decoration. Newsreader is flagged in the skill as a convergence font when used *as the
   voice*; here it is deliberately demoted to a supporting role, which is what that warning asks for.
2. **No `--warning` token.** Replaced by grey plus a sentence, because in this product an
   unverifiable claim is a factual state, not a caution.
3. **One spring in the product.** The skill permits springs for layout generally; here they are
   rationed to the rail re-sort so that the one physical movement in the interface is the one that
   carries the thesis.
4. **No landing page.** Law 3 is satisfied by the app itself opening on a live frame. A separate
   marketing route would put a page between the judge and the product.
