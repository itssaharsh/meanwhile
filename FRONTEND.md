# How the globe is wired to Convex

> Describes the vanilla page, now `legacy.html` + `legacy/`, which stays live until the React rebuild in `src/` replaces it. The rebuild's components and states are at `/_kit`.

`legacy.html` is the prototype, unchanged in spirit: a globe.gl earth, a card feed, a story
viewer, all painted procedurally on canvas. What changed is where its data comes from.

## The shape of it

```
convex/director.ts ──┐
convex/countries.ts ─┼─> legacy/live.js ─> legacy/viewmodel.js ─> window.__setCut / __setFeed
legacy/fixtures.json ───┘                                       (defined inside legacy.html)
```

- **`legacy/live.js`** picks a source. `?demo=true` (or no `VITE_CONVEX_URL`) uses the bundled
  fixtures; otherwise it opens a `ConvexClient` and subscribes.
- **`legacy/viewmodel.js`** adapts whatever arrived into the one shape the renderers already
  understood. This is why no renderer had to be rewritten.
- **`legacy/main.js`** hands the result to the page and labels the masthead in demo mode.

Two details worth knowing:

**Function references are built by name.**
```js
makeFunctionReference("director:getCut")
```
not `import { api } from "../convex/_generated/api"`. That directory doesn't exist until
`npx convex dev` has run, and demo mode has to build on a clean checkout.

**Fixtures are imported, not fetched.** `import fixtures from "./fixtures.json"` — so
`?demo=true` works offline, and `legacy/fixtures.json` stays the single file that both the app
and `npm run verify` read.

## The two hooks

`legacy.html` exposes these; everything else is internal to its IIFE.

```js
window.__setFeed(moments)   // replace the card feed + globe markers
window.__setCut(moment)     // the director's pick: fly there, mark it, stop auto-rotating
```

and looks for these, using local fallbacks when they're absent:

```js
window.__fetchCountry(name, lat, lng)  // -> a moment, rendered in the story viewer
window.__subscribe(email)              // -> the "email me this" button
```

Once a live cut arrives, `liveCut` is set and the 7-second auto-rotation stops driving the
channel — otherwise the timer and the director fight over what's on screen.

## Real images, procedural fallback

A snapshot may or may not have a frame. `paint(canvas, moment, t)` handles both:

- `moment.url` set → the real webcam frame, cover-fit into the same canvas, with the
  procedural scene shown while it loads and kept on error.
- `moment.url` null → `drawScene` / `drawLandmark`, exactly as before.

Demo fixtures carry `url: null`, so demo mode keeps the original art. Live snapshots carry a
Convex storage URL, so live mode shows photographs. Same code path.

## Where the procedural `scene{}` comes from

The backend returns one caption, not an art direction. `synthScene()` in
`legacy/viewmodel.js` derives the sky palette and scene flags (`aurora`, `water`, `mountains`,
`skyline`, `rain`, `mist`, `snow`, `stars`, `lanterns`…) from real signal only: the
Open-Meteo weather text, the vision model's `tags`, whether it's day there, and latitude.
The prototype already did a small version of this in `countryData()`; this generalises it.

The three story lines are built the same way — line 1 is the model's caption, line 2 is
today's local headline from Firecrawl (falling back to time + weather when there isn't one),
line 3 is the time, weather, score and tags. Nothing is invented.

The headline also appears on the feed card itself, in a small monospace row under the
caption. It is scraped third-party text, so it is escaped with the page's own `esc()` before
it is inserted, and the backend already length-caps it and strips control characters.

## Adding the frontend to a deployment

`npx convex dev` writes `VITE_CONVEX_URL` into `.env.local`; Vite picks it up. Build with
`npm run build:web` and, if you want one URL for everything, serve `dist/` with the
[static-hosting component](https://www.convex.dev/components/static-hosting).
