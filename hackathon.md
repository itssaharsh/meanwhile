# Meanwhile

Meanwhile is a television channel whose only programming is the planet. An AI director scores
real webcam frames for beauty and cuts to the best one on air — the user watches; they do not
query.

**Live:** https://honorable-opossum-473.convex.site/legacy.html

---

## What it does

An AI director watches real public webcams around the world and cuts the best one on air. True
day and night on a spinning globe. Every frame is checked for age and place before it airs.

Click any of 177 countries and it goes and finds a live camera there, on demand.

---

## How each sponsor tool is used

### Convex — the whole backend, and the reason it feels live

Not a database behind an API. The channel *is* Convex:

- **Reactive subscriptions** are the broadcast mechanism. `director:getCut` is a query every
  viewer subscribes to; when the director writes a new cut, every open browser repaints. There
  is no polling, no socket code, no cache invalidation.
- **Cron + scheduler** run the channel: a 20-minute cron re-pulls and re-scores the camera pool,
  a 6-hour cron prunes old snapshots and their blobs, an hourly cron refreshes the country →
  camera map. Per-camera work is staggered with `ctx.scheduler.runAfter`.
- **File storage** holds every frame we broadcast, so the image on screen is one we fetched and
  kept — not a hotlink to a webcam that may have moved on.
- **Actions** do the outside world (vision models, Firecrawl, AgentMail, image downloads);
  **mutations** keep the database consistent; the split is what makes the ladder resumable.
- **Static hosting** (`@convex-dev/static-hosting`) serves the frontend from the same origin as
  the backend, so there is one URL and no CORS.
- **HTTP actions** receive the AgentMail delivery webhook at `/agentmail/webhook`.

### OpenAI — the director's eye, and the narrator

Every frame that survives the age and place checks is sent to a vision model, which returns a
structured verdict: a 0–10 score for beauty and human interest, a one-line narration, 3–6
concrete tags, and whether the frame is daylight. That score is the editorial decision — it is
what puts a camera on air.

The vision call sits behind a provider layer (`convex/providers.ts`) with a failover chain, so a
model outage degrades instead of breaking the channel, and a viewer can bring their own key.

### Firecrawl — demand-driven, never on the cron

Firecrawl is used in exactly two places, and never once per camera per refresh:

1. **The country click.** `/v2/search` with three query formulations finds camera pages for a
   country; `/v2/scrape` returns a page's HTML, and directories are followed one level down to
   the single-camera pages where the real frame lives.
2. **One headline per story.** A news-only search for what is happening in that place today,
   attached to the frame on air. Cached per place, with misses cached too, so a place with no
   news does not re-search on every pass.

### AgentMail — "Send me this"

The frame on air, emailed. An AgentMail inbox sends the picture, the place and the time it was
taken; the delivery webhook (Svix-signed, over a Convex HTTP action) reports back `delivered`,
`bounced` or `rejected`, and the UI shows the real state rather than claiming success on submit.

---

## What's real and what isn't

The product's entire value is that it verifies before it shows you anything, so this section is
the honest one.

**Real:**

- The cameras are real public webcams. The frames are fetched live, stored, and shown.
- **Freshness is proven, not asserted.** A frame's age is read from the source's own
  `Last-Modified`, measured against that host's own `Date` header. No timestamp means no age
  claim — ever.
- The scores, captions and tags are a real vision model's output on that real frame.
- The day/night terminator is computed from the true subsolar point, not a gradient.
- The country click really does go and search the live web when it has to. The counts it shows
  reconcile: `stale + misplaced = rejected`, `rejected + kept = n`.
- Delivery states come from AgentMail's webhook, not from the send call returning 200.

**Not real, or not yet:**

- **The chat panel on the live page is not an LLM.** It is local pattern-matching over the
  current feed. It is being replaced by a real model call.
- **Timezones are approximate.** Seeded offsets are fixed (no DST), and the country click
  derives one as `round(lng / 15)`, which is wrong for India, China, Spain and others.
- **Coverage is uneven and shown as such.** 103 of 177 countries have a camera we can reach;
  the globe tints only what a frame has actually proved within the hour, outlines what we hold a
  camera for, and leaves the rest untouched. It does not pretend to cover the world.
- **Some cameras lie about their own freshness.** Image CDNs restamp `Last-Modified` as they
  re-serve an old frame. Two guards catch it: a `Last-Modified` exactly equal to the response
  `Date` is treated as no timestamp, and a frame whose daylight contradicts its local clock
  loses its age claim. A spoofed age is not an age.
- There is no viewer counter. The prototype had one — a random walk that invented an audience
  every two seconds — and it was removed rather than left on screen.

**AI use:** this project was built with heavy AI assistance. The Convex backend, schema and
pipelines were generated from a written build plan and then reviewed and wired by the author.
External integrations use their public APIs; keys live only in Convex environment variables and
never in this repo.

---

## Running it

No keys and no account required — the whole app runs on fixtures:

```bash
npm install
npm run dev:web        # http://localhost:5173/?demo=true
```

Full setup, the environment variables, the cost controls and the deploy steps are in
[README.md](README.md).
