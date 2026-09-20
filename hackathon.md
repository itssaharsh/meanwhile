# Meanwhile

**Live:** https://honorable-opossum-473.convex.site/legacy.html
**Repo:** https://github.com/itssaharsh/meanwhile

Most "live" webcams on the internet are lying to you.

I learned this while building something else. A webcam directory showed me a thumbnail of
Shibuya crossing under a red LIVE badge; the file it served had `Last-Modified: October 2022`.
Once I started checking, it was everywhere — years-old stills labelled live, and grids of
"cameras in Kenya" where the biggest fresh frame turned out to be Times Square.

So I built a television channel whose only programming is the planet, and whose entire value is
that it verifies before it shows you anything. An AI director watches real public webcams,
scores each frame for how worth watching it is, and cuts to the best one. Everyone sees the same
cut at the same moment. Click any country and it goes and finds a camera there while you wait,
narrating what it's doing.

The rule underneath all of it: a frame's age comes from the source's own `Last-Modified`,
measured against that host's own clock. No timestamp means no age claim, ever. Teal means
verified, grey means I could not verify, and there is no third colour for "probably fine".

## How the sponsor tools are used

**Convex** is not a database sitting behind an API here — it is the broadcast mechanism.
`director:getCut` is a query every viewer subscribes to, so when the director writes a new cut,
every open browser repaints. No polling, no socket code. A 20-minute cron re-pulls and re-scores
the camera pool, a 6-hour cron deletes old snapshots and their blobs, and an hourly cron walks
the country-to-camera map ten countries at a time. Frames live in Convex file storage, so what
you see is a picture I fetched and kept rather than a hotlink to a camera that has since moved
on. Actions do the outside world, mutations keep the database consistent, and that split is what
lets a country search report its progress stage by stage while it runs. The site is served from
the same deployment through the static-hosting component, and AgentMail's delivery webhook
arrives at an HTTP action on the same origin.

**OpenAI** is the director's eye. Every frame that survives the age and place checks goes to a
vision model, which returns a score out of ten, a one-line narration, three to six concrete tags,
and whether the frame shows daylight. That score is the editorial decision — it is what puts a
camera on air. The same call answers the chat: ask "what am I looking at?" and the model is shown
the actual frame, its age and its facts, and told not to call it live when it isn't.

The vision call sits behind a provider layer with model failover, and the failover crosses
providers: small OpenAI models first, nine Gemini models beneath them. A balance running out
costs the better model, not the channel. Bring your own key and it uses yours instead, for your
request only.

**Firecrawl** never runs on the cron — camera frames come from direct image URLs, which cost
nothing. It runs when a person does something. Click a country and three differently-phrased
searches find camera pages, five of them get scraped, and directory pages are followed one level
down to where the real frame lives. Separately, one news search per story attaches what is
actually happening in that place today, cached per place so a quiet town doesn't re-search every
twenty minutes.

**AgentMail** sends you the frame that's on air — the picture, the place, and the time it was
taken. Its webhook reports back `delivered`, `bounced` or `rejected` over a Convex HTTP action,
and the interface shows that real state instead of claiming success the moment you hit send.

## What's real

The cameras are real public webcams and the frames are fetched live, stored, and shown. The
scores, captions and tags are a real vision model's reading of that real frame. The day/night
line on the globe is computed from the true subsolar point.

Freshness is proven rather than asserted, and the counts on screen reconcile: stale plus
misplaced equals rejected, rejected plus kept equals the number of candidates. When a country
search fails, it says which check failed and offers three countries verified working that minute.

## What isn't

Coverage is uneven: 103 of 177 countries have a camera I can reach, and the globe shows exactly
that in three tiers rather than pretending to cover the world.

Timezones are approximate — fixed offsets with no DST, and a longitude-derived guess for the
country click, which is wrong for India, China and Spain among others.

Some sources lie about their own freshness. Image CDNs restamp `Last-Modified` as they re-serve
an old frame, so a `Last-Modified` identical to the response `Date` is treated as no timestamp,
and a frame whose daylight contradicts its local clock keeps its place on screen but loses its
age. Both guards exist because I got caught: a Nairobi frame arrived claiming to be one minute
old, showing an overcast afternoon at two in the morning, with January burned into its corner.

There is no viewer counter. The prototype invented an audience every two seconds and I deleted
it rather than leave it on screen.

## AI assistance

I built this with heavy AI assistance (Claude). The Convex backend, schema and pipelines were
generated from a written build plan, then reviewed and wired by me. The integrations use public
APIs, and every key lives in Convex environment variables — none are in this repo.

## Running it

No keys, no account, nothing to log into:

```bash
npm install
npm run dev:web        # http://localhost:5173/?demo=true
```

That renders the whole app from fixtures. Setup, environment variables, cost controls and deploy
steps are in [README.md](README.md).
