# Meanwhile

Most "live" webcams on the internet are lying to you.

I found this out the hard way. A thumbnail labelled LIVE on a webcam directory, showing a
busy Shibuya crossing — `Last-Modified: October 2022`. Not a glitch, and not rare: aggregator
sites are full of frames from years ago sitting under a red LIVE badge, next to grids of
cameras that are in an entirely different country from the one you clicked.

So Meanwhile is a television channel whose only programming is the planet, and its whole value
is that it checks before it shows you anything. An AI director watches real public webcams,
scores each frame, and cuts to the best one. Every viewer sees the same cut at the same moment.
Click any country and it goes and finds a camera there while you watch.

The rule the whole thing is built around: a frame's age comes from the source's own
`Last-Modified` header, measured against that host's own clock. No timestamp, no age claim.
Teal on screen means verified; grey means we could not verify. There is no third colour for
"probably fine".

**Stack:** Convex (reactive queries, crons, file storage, hosting) · any OpenAI-compatible
vision API · Firecrawl · AgentMail · Open-Meteo · Vite · globe.gl

Production serves the React app built from `DESIGN.md` / `UI-SPEC.md` / `COPY.md`. `/` is the
landing — what this is, over the channel already running behind it — and `/watch` is the channel.
Moving between them is a route change, so the globe never restarts. Its
component kit — every component in every state, reachable by URL — is at `/_kit`, and
`?demo=true` runs the whole thing off `src/fixtures.json` with no keys and no backend.
`legacy.html`, the single-file globe this started as, now redirects to the root. See
`FRONTEND.md` for the wiring.

---

## 1. Run it with no keys and no account

```bash
npm install
npm run dev:web        # then open http://localhost:5173/?demo=true
```

`?demo=true` renders the entire app from `legacy/fixtures.json` — same render path, zero API
calls, nothing to log into. Use it to work on the UI, and as the safe path for a live demo.

```bash
npm run verify         # offline smoke test of the real director rule → PASS
```

## 2. Point it at a Convex deployment

```bash
npx convex dev         # first run: log in, create the project. Leave it running.
```

That writes `.env.local` with `CONVEX_DEPLOYMENT` and `VITE_CONVEX_URL`. In a **second
terminal**, set your keys — `npx convex dev` blocks:

```bash
npx convex env set AI_PROVIDER gemini          # gemini (default) | openai | openrouter
npx convex env set OPENAI_API_KEY <key>
```

A vision key is the only one the live channel needs. The others are optional:

| Key | What stops working without it |
|---|---|
| `OPENAI_API_KEY` | Scoring. Frames are still fetched, but nothing is scored or kept — the frame is discarded rather than left as an orphan. |
| `FIRECRAWL_KEY` | The country click (search + screenshot + narration), and the one headline on the snapshot on air. |
| `WINDY_KEY` | Any camera with `source: "windy"`. |
| `AGENTMAIL_KEY` + `AGENTMAIL_INBOX` | The "email me this moment" button. |
| `AGENTMAIL_WEBHOOK_SECRET` | Delivery tracking. The webhook answers 503 until it is set, so AgentMail retries each event later instead of it being recorded unverified. |

Missing keys are logged once, clearly, and the affected step is skipped. Nothing is ever
invented to fill the gap.

## 3. Seed cameras and pull a frame

```bash
npx convex run seed:run          # upserts the pool by name; a camera with no ref is inactive
npx convex run pool:refreshAll   # pull + score once, now
npx convex run director:getCut   # should print a real cut, not null
```

Each camera has a `source`:

- **`image`** — `ref` is a direct still-image URL (a road/harbour/airport cam's `.jpg`).
  No API key, no credit, no third party. This is the default.
- **`windy`** — `ref` is a Windy webcam id.

There is deliberately no "screenshot a page" camera source: that would spend Firecrawl
credit per camera on every refresh.

Swap a dead camera without a reseed:

```bash
npx convex run cameras:setRef '{"name":"Venice","ref":"https://…/cam.jpg","source":"image"}'
```

## 4. Turn the channel on

The cron is **off until you say so**, so pushing code never starts spending:

```bash
npx convex env set POOL_ENABLED 1     # 20-minute refresh starts
```

Then open `http://localhost:5173/` (no `?demo=true`). Every browser repaints the moment a
new frame is scored — that reactivity is the whole point.

### Swapping vision providers

Every provider worth using speaks the OpenAI chat-completions wire format, so the provider
is configuration, not code. `convex/providers.ts` maps a name to a base URL and a default
model:

| `AI_PROVIDER` | base URL | model |
|---|---|---|
| `gemini` *(default)* | `https://generativelanguage.googleapis.com/v1beta/openai` | failover chain, below |
| `openai` | *(SDK default)* | `gpt-4o-mini` |
| `openrouter` | `https://openrouter.ai/api/v1` | `openai/gpt-4o-mini` |

`OPENAI_API_KEY` is the key; `OPENAI_BASE_URL` overrides the table's base URL.
GitHub Models was removed — it is retired (`410 github_models_retirement_brownout`).

### Gemini model failover

Each Gemini model has its **own** daily free-tier quota, so one spent model is no reason
to stop. Gemini is called with a chain, ordered by daily headroom — Flash-Lite first
(~500 requests/day each), then regular Flash (~20/day each):

```
gemini-3.5-flash-lite → gemini-3.1-flash-lite → gemini-3.5-flash → gemini-3-flash-preview →
gemini-2.5-flash → gemini-3.7-flash → gemini-3.8-flash → gemini-3.6-flash → gemini-2.5-flash-lite
```

`OPENAI_MODEL` sets the **preferred** model, tried first; the chain is the fallback order
after it. On each call:

1. **Validate.** `GET {baseURL}/models` (cached an hour). Anything not on the live list is
   dropped rather than guessed at. Non-chat models (Gemma, embeddings, TTS, image, live,
   Veo, …) are filtered out by name.
2. **Skip what's spent.** Models already marked exhausted today are skipped without a request.
3. **Rotate on the right errors.** Quota (`429` / `RESOURCE_EXHAUSTED`), retired (`410`), and
   model-not-found (`404`) move to the next model; so does an overloaded `5xx`. **A genuine
   `400` does not** — a bad image or bad schema would fail on every model, so it is surfaced
   instead of burning the chain.
4. **Remember.** A spent model is recorded in the `modelState` table until the next UTC
   midnight, so the next call starts at the first model that can still answer.

Gemini's 429s carry structured `quotaId`s, which is what separates a spent **daily**
allowance (`…PerDay…` — skip until midnight) from a **per-minute** limit (`…PerMinute…` —
cool down for the `retryDelay`, typically under a minute). Treating a per-minute limit as
daily would let one 11-camera refresh mark the entire chain dead until midnight. A model
with **no** free quota at all answers `429` with `limit: 0` and is skipped for the day.

Two things `/models` does *not* tell you, both handled at call time instead: per-model
limits (it lists IDs and names only), and whether a listed model still answers —
`gemini-2.5-pro` is on the list and returns `404 no longer available to new users`.

Each call logs the model that served it, and `snapshots.servedBy` records it. To forget
today's exhaustion marks (say, after moving to a paid tier): `npx convex run modelState:reset`.

**Moderation.** It's a live AI channel, so a caption can come out wrong. Pull one snapshot
off the air — the cut is re-picked in the same transaction:

```bash
npx convex run cut:removeSnapshot '{"snapshotId":"…"}'
```

**BYOK.** `score:scoreSnapshot` and `countries:fetchCountry` both take optional
`{provider, apiKey, model}` that override the deployment defaults for a single call. A
caller's key is used for that one request and then dropped — never logged (errors are
scrubbed before they reach the log), never written to the database. Failover still runs
for a caller's Gemini key, but its exhaustion is tracked only for that call: their quota
is not ours, so it never marks a model dead for the deployment.

Two things that make this actually portable rather than nominally portable:

- **Frames are sent as base64 data URIs**, not as links to Convex file storage. Gemini's
  compatibility endpoint will not go and fetch an external image URL.
- **Structured output steps down**, as the inner loop under each model: strict
  `json_schema` first, then `json_object`, then prompt-only with fence-tolerant parsing.

### What Firecrawl does here

Firecrawl never runs on the cron. Camera frames come from direct image URLs, which cost
nothing, so the 20-minute refresh spends no credits at all. Firecrawl runs in two places, both
of them driven by something a person did:

1. **The country click** (`countries:start` → `countries:run`) — the money shot, and a
   ladder rather than a single attempt, because a first cut that searched once and judged
   the first page's frames dead-ended on 14 of 15 random countries. Firecrawl is now the
   *second* thing tried, not the first, so most clicks cost nothing:

   | Rung | What it does | Cost |
   | --- | --- | --- |
   | 0 | The channel's own cache: a pool camera in that country, or a story fetched in the last 30 min | free, ~1 s |
   | 1 | The public camera index: [opencctv.org](https://opencctv.org/how-we-source) lists registered public cameras per country, and each card carries a Windy camera id | free, ~5 s |
   | 2 | The open web: three query formulations, five candidate pages, directories followed one level down to the single-camera page | ≤3 search + ≤5 scrape credits |
   | 3 | A real frame we found or hold that is older than 3 h, shown with its true age ("Not live · 6 h old") | free |
   | 4 | An empty state naming which check failed, offering the nearest countries verified this minute | free |

   **Rung 1 is the one that made the difference**, and it is free. Frames are pulled from
   Windy's origin (`imgproxy.windy.com/_/full/plain/current/{id}/original.jpg`) and never
   from the index's own `/api/feed` proxy, which rewrites `Last-Modified` to the moment it
   serves the bytes — the same lie the image CDNs tell. Windy's origin reports a dead camera
   as six hours old instead of restamping it, which is the property the whole freshness claim
   rests on. Spot-checked against the timestamps cameras burn into their own frames: an
   Egyptian camera's HTTP age of 3 minutes matched the `2026-09-20 01:26:56` in its corner,
   at 01:30 local.

   Rung 2 scrapes and judges in **laps** — two pages, then a page-diverse handful of frames,
   then round again. One aggregator's grid of thumbnails would otherwise spend the whole
   candidate budget on the first page it opened, and every one of those thumbnails is a
   camera in another country. A frame has to earn its place:
   - **Photographic and camera-sized** — real pixel dimensions read from the file header,
     landscape, ≥400×225, not a logo, badge, banner or grid thumbnail (`convex/frames.js`).
   - **Provably current** — `Last-Modified` within 3 hours by the host's own clock. This is
     not paranoia: SkylineWebcams serves "live" thumbnails last modified in 2022, and
     YouTube's `_live` thumbnail is a channel's promo art. No date means no trust.
   - **Lit like the place it claims to be** — the scoring call reports whether the frame is
     daylight, and a frame that says noon at 02:00 local loses its timestamp, not its place
     on screen (`contradictsSun`). Image CDNs restamp old frames with a fresh
     `Last-Modified` as they re-serve them; a Nairobi frame arrived "1 min old" showing an
     overcast afternoon at 2 a.m., with January burned into its own corner.
   - **Actually in that country** — camera pages carry "popular cams elsewhere" sidebars (a
     Kenyan page's biggest fresh frame was Times Square), so the narrator is told the
     country and rejects a view of somewhere else (`NOT_HERE`) or a non-view (`NOT_A_VIEW`),
     and the next frame is tried.

   **Measured**, on the same 15 pseudo-random countries before and after
   (`node scripts/country-benchmark.mjs`, seed `meanwhile/block1`):

   | | Before | After |
   | --- | --- | --- |
   | Put a frame on screen | 1 of 15 | 8 of 15 |
   | Verified live | 1 | 8 |
   | Answered by the paid web search | 1 | 0 |
   | Median time | 12.1 s | 9.8 s |

   Of the 8, four came from the free index and four from our own cache. Six of the seven
   that still fail are simply not in the index — no page exists for them — and the seventh,
   Saudi Arabia, lists one camera which at 02:24 local was a near-black frame of a palm
   frond that the narrator rightly refused. The paid web search answered none of the 15 even
   with its full five-page budget, which is why it now sits below the free rung.

   Every rung writes its stage into the `fetches` row the UI subscribes to, and the counts
   on screen reconcile: stale + misplaced = rejected, rejected + kept = n. Video pages are
   skipped unscraped. Scrapes use `maxAge` of 10 minutes — Firecrawl would otherwise serve a
   cached page up to two days old — and a 429 is waited out once rather than counted as a
   page with nothing on it (the plan allows 10 requests a minute, and one click can make 8).
2. **One headline for the snapshot on air.** When the director cuts to a *new* snapshot, a
   single `/v2/search` for `"<place> today"` (news, past 24h) attaches today's headline to
   it. That's at most one lookup per cut change — cached per place for
   `HEADLINE_TTL_HOURS` (default 6) — never one per camera per refresh.

Check both in isolation once `FIRECRAWL_KEY` is set:

```bash
npx convex run news:headlineFor '{"place":"Reykjavík","country":"Iceland"}'
npx convex run countries:fetchCountry '{"country":"Japan","lat":35.01,"lng":135.77}'
```

Misses are cached for an hour, so a place with no news (or a Firecrawl outage) doesn't
re-search on every cut. The on-air headline and the public country click draw on
**separate** budgets (60 searches per 6h each), so globe clicks can't starve the channel.
The country click is also capped at 10 per 10 minutes and 50 per day, since it spends 2-4
credits each time (one search, one or two scrapes, plus a cached headline) and is public and
unauthenticated.

### What a refresh costs

11 cameras on the 20-minute cron is ~790 vision calls/day — but the model is now
**`gpt-4o-mini`** at `detail: "low"`, roughly a sixteenth of gpt-4o's price, so that is
cents/day rather than ~$3.50.

On top of that, **an unchanged frame costs nothing**. Every frame is sha256-hashed before
it is stored; if it is byte-identical to the camera's last scored frame, the existing
snapshot is updated in place — no OpenAI call, no second copy of the image, and crucially
no new timestamp. That last detail matters: minting a fresh row would hand a camera serving
a frozen file permanent "freshness" and let a stale score own the channel forever. Instead
the frame ages out of cut eligibility after `MAX_SNAPSHOT_AGE_MS` (6h) like any other,
while still showing in the feed.

`POOL_MAX_CAMERAS` caps a single run. `cut:prune` (every 6h) deletes snapshots and their
stored images after 3h, always keeping the newest frame per camera, and sweeps up any
orphaned image files.

## Deploy

Backend and frontend share one origin via the
[static-hosting component](https://www.convex.dev/components/static-hosting), already wired
up in `convex/convex.config.ts` and `convex/http.ts`:

```bash
npx convex deploy                                   # backend
npx @convex-dev/static-hosting upload --build --prod # builds dist/ and uploads it
```

Production is a **separate deployment**: its own environment variables and its own empty
database. Before it can show anything:

```bash
npx convex env set AI_PROVIDER gemini --prod
npx convex env set OPENAI_API_KEY <key> --prod
npx convex run seed:run --prod
npx convex run pool:refreshAll --prod
```

`upload --build` bakes the target deployment's `VITE_CONVEX_URL` into the bundle, so a
`--prod` upload talks to prod and a plain upload talks to your dev deployment.

Your app is then live at `https://<deployment>.convex.site`, with the AgentMail webhook
still at `/agentmail/webhook` (it is registered before the static catch-all, so the static
handler does not shadow it).

To know whether a sent email was delivered, bounced or rejected, register that webhook
once and store the signing secret AgentMail returns (`whsec_…`):

```bash
curl -X POST https://api.agentmail.to/v0/webhooks \
  -H "Authorization: Bearer $AGENTMAIL_KEY" -H "Content-Type: application/json" \
  -d '{"url":"https://<deployment>.convex.site/agentmail/webhook",
       "event_types":["message.delivered","message.bounced","message.rejected"],
       "inbox_ids":["<your inbox>"]}'
npx convex env set AGENTMAIL_WEBHOOK_SECRET whsec_... --prod
```

Unsigned or forged requests get a 401. Each verified event is stored in the `mailEvents`
table and logged as `[meanwhile] agentmail message.delivered — message_id <…> to …`.
"Delivered" means the recipient's mail server accepted the message, not that it reached
the inbox: Gmail accepted a test send and never showed it, not even in spam.

The sender name recipients see is the inbox's display name. AgentMail ignores a `From`
header on the send, so set the name on the inbox once:

```bash
curl -X PATCH "https://api.agentmail.to/v0/inboxes/<your inbox>" \
  -H "Authorization: Bearer $AGENTMAIL_KEY" -H "Content-Type: application/json" \
  -d '{"display_name":"Meanwhile"}'
```

Then turn the channel on:

```bash
npx convex env set POOL_ENABLED 1 --prod
```

---

## What's true, and what isn't

Eleven of the twelve seeded cameras are live and verified. Rio de Janeiro is seeded inactive
because I could not find a Brazilian camera that proved itself — every candidate served a JPEG
last modified somewhere between 2022 and 2025. Mumbai went the same way and was replaced by Bir
Billing. The reasoning is written down next to each camera in `convex/seed.ts`.

There is no viewer counter. The prototype had one, a random walk that invented an audience every
two seconds, and I deleted it on 20 September along with the "240 cameras" beside it. The page
now says what I can defend: 11 always-on cameras, and 103 countries I hold at least one camera
for. Not 177 — that is every polygon on the globe, and about 74 of them have no camera at all.

The chat is a real model call. It used to be regex matching over the feed, sitting behind a box
that said "ask about what's on air", which was a claim the product couldn't keep. It now goes
through the same provider layer as the director's scoring, and the model is shown the frame
itself along with its age — and told not to call it live when it isn't. Ask about a
ten-hour-old frame and it says so.

Timezones are approximate. Seeded offsets are fixed UTC values with no DST, and the country
click derives one as `round(lng / 15)`, which is wrong for India, China, Spain and plenty of
others. It is good enough to say whether it is night there and not much more.

Coverage is uneven, and the globe shows that rather than hiding it. 103 of 177 countries have a
camera I can reach. A country is tinted teal only when a frame from it proved current within
the hour, outlined when I hold a camera that hasn't proved itself lately, and left alone when I
have nothing. Clicking an untinted country still works — it just has further to go.

Some cameras lie about their own freshness, and two guards catch it. Image CDNs restamp
`Last-Modified` as they re-serve an old frame, so a `Last-Modified` exactly equal to the
response `Date` is treated as no timestamp at all. And the scorer reports whether the frame is
daylight: if it says noon while the local clock says two in the morning, the frame stays on
screen and loses its age. A spoofed age is not an age.

The public endpoints are `director:getCut`, `director:getFeed`, `cameras:list`,
`countries:start`, `chat:ask` and `agentmail:subscribe`. The last three spend money, so they
carry format validation and global rate limits — but there is no real auth and no double
opt-in. `seed:run` and `cameras:setRef` are internal, still runnable from the CLI.

The headline is scraped text from a news search. It is length-capped, stripped of control
characters, escaped before rendering, and passed to the model inside `<headline>` tags labelled
as untrusted — but it is still third-party text reaching a prompt and a page.

I built this with heavy AI assistance (Claude). The Convex backend, schema and pipelines were
generated from a written build plan and then reviewed and wired by me. The integrations use
public APIs, and every key lives in Convex environment variables — none are in this repo.
