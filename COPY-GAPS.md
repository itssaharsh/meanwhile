# Copy beyond COPY.md

Every string in the product lives in `src/lib/copy.ts`:

- `COPY` is COPY.md exactly, with its header conventions applied (curly apostrophes, and a
  non-breaking space between each number and its unit).
- `ADDED` holds the 72 strings COPY.md doesn't have. All of them are approved: "beat {place}
  {score}" from the build brief, UI-SPEC.md's wording approved as rendered on 2026-09-19, and
  that day's three copy calls.

The table at the bottom is generated from `copy.ts`. Each template is rendered with the argument
shapes its real call site passes. The first version passed a place name into every slot, which
produced rows like "Unverified · Reykjavík ago" and "Reykjavík steps · Iceland s". That was a bug
in the audit harness, not in the product's calls.

## Resolved on 2026-09-19

- **A known source time over 3 h:** `Not live · {age} old`, grey. "Unverified" is gone, so "we
  don't know when this was taken" (`Age not verifiable · the source sends no timestamp`) and "we
  know, and it's old" stay distinct claims.
- **404 live line:** `Right now we're in {place}.` While loading it reads
  `Right now we're in ——.`
- **"first on air this hour":** rendered only when the snapshot establishes it
  (`firstOnAirThisHour: true`, set at cut time). Otherwise the beat line is omitted, never
  asserted.
- **One nothing-on-air string:** COPY §2's `Nothing on air yet` is now used in the TopBar's
  empty state, the disabled "Send me this" reason and the send sheet. UI-SPEC's two
  near-duplicates are gone.
- **TopBar with the connection down:** `The channel dropped`, then the last verified frame in
  grey (no amber, because nobody can confirm it's still on air), then `Reconnecting · attempt {i}
  of 5`. "Send me this" stays usable, because the frame is still there to send (COPY §8).

## Resolved on 2026-09-20

All seven were answered by the author; nothing in this file is open.

1. **Mobile TopBar.** The place name is never truncated and never dropped. Below 900px the two
   actions become icon buttons (the envelope-arc for send, a chat glyph for ask) keeping the
   exact COPY names as `aria-label` and tooltip — rule 1 governs the name, not whether it is
   visible. Below 640px the country goes. Below 380px the words "On air" go and the amber dot
   carries the state alone. The dot, the place name and the score are never dropped. Measured
   at 1440 / 950 / 899 / 700 / 639 / 400 / 379 / 320: no overflow at any width.
2. **`misplacedBody`** now renders the location the narrator actually named, and says nothing
   when it named none. Times Square is never hardcoded again; the backend records the first
   place a rejection could name (`elsewhereNamed`, `fetches.elsewhere`).
3. **Email validation** has two messages: no `@` gets COPY.md's original; anything else invalid
   gets `That doesn't look like a complete email address — check it and send again.`
4. **Singular forms** — rule 4 of COPY.md. Every count string carries both, behind one
   `count()` helper, rendered in the table below.
5. **`Verified live` vs `Verified`** — confirmed as the full four-tier ladder: under 60 min
   `Verified live · {age} old` teal, 60 min to 3 h `Verified · {age} old` teal, over 3 h
   `Not live · {age} old` grey, no timestamp `Age not verifiable · the source sends no
   timestamp` grey. A restamped `Last-Modified` or a frame whose daylight contradicts its local
   clock is treated as no timestamp: a spoofed age is not an age.
6. **DESIGN.md's amber `button-primary`** was an error in the file and has been corrected there.
   No control in the product is amber. Primary is `--ink` on `--canvas`; secondary is
   `--surface-1` with a `--line` border.
7. **Manifest description** is DESIGN.md's: "A live, AI-directed 3D Earth. The planet is the
   only programming."

## Added on 2026-09-21

Thirteen strings, for three things the author found missing: a visitor could not tell what the
page was, could not change the camera, and could not see the news the channel had already
gathered. All thirteen are in the generated table at the bottom, under their C-numbers.

- **The intro card (C-13)** does not invent a pitch. `introTitle` and `introBody` are COPY.md
  §10's own OG title and description — the words already written for anyone who meets this
  product cold, finally shown to the person who actually arrives. `introHow` is the one rule
  that makes the colours readable, and it is the only new sentence of the three.
- **The director's chair (C-01 / C-04 / C-07).** `Put this on air` is the action,
  `On air now` is the state it produces, `You're directing · {time} left` is the hold and
  `Give the chair back` ends it. Deliberately not amber, anywhere: amber marks the frame that
  is on air, and a chip about who chose it is not that frame.
- **The news tab (C-16).** `News` names the tab; `No headlines yet` and its body cover the
  honest empty case, which is real — a place with nothing published today gets no row rather
  than a filler one. `Looking for today's news…` covers the one lookup, which runs when the
  tab is opened and not before.

## Added on 2026-09-22

Two strings, for two things the author found still missing.

- **`introAmber` (C-17).** The landing teaches the colour rule before a judge meets it, and the
  rule has two halves. `introHow` had the teal-and-grey half since the intro card; this is the
  amber half, and it is the sentence the whole product is built around.
- **`askSubject` (C-05).** COPY.md §6's placeholder is `Ask about what's on air`. That was true
  while the chat could only ever see the cut. Now that a viewer can ask about the frame they have
  open, the placeholder would be a claim the panel cannot keep, so the panel names its subject
  above the composer whenever the subject is not the frame on air.

Retired the same day: the C-13 intro card. `/` is now C-17, a route rather than an overlay, and
it says the same things with the live channel inside it. Its strings (`introTitle`, `introBody`,
`introHow`, `introStart`, `introPick`) moved across unchanged and are retagged C-17.

## Where COPY.md overrode UI-SPEC's inline copy

- **TopBar chyron:** COPY's three parts replace `ON AIR · Cutting to Reykjavík — 8.4`.
- **Freshness chips:** COPY §4 replaces `LIVE · 11m AGO` and `UNVERIFIED · …`.
- **Country fetch:** COPY §3's six stages replace UI-SPEC's seven. Counts reconcile, and a
  dev-only check logs any row where they don't.
- **Chat:** placeholder, chips and steps come from COPY §6.
- **Delivery chip:** `Queued` → `Accepted by the mail provider` → `Handed to your mail server`,
  plus the trailing note. Never "Delivered".
- **Rail loading line and the 404:** COPY §2 and §9.

## COPY.md strings reused for states UI-SPEC wrote its own copy for

- **TopBar error and rail error:** §8 Connection lost.
- **TopBar empty and every nothing-on-air reason:** §2 `Nothing on air yet`.
- **StoryCard error and rail item with no image:** §8 Frame failed.
- **Send error:** §8 Generic.
- **Fetch stage for a frame with no source time:** §4 `Age not verifiable · the source sends no
  timestamp`.
- **Story no-result:** §5 No camera found. **Country no-result:** §5 All stale, plus All wrong
  place.

## ADDED — 72 strings, approved

| key | as rendered | source | where |
|---|---|---|---|
| `beat` | beat Reykjavík 8.1 | build brief | C-10 beat line |
| `topBarStandby` | Standing by | UI-SPEC C-01 loading | C-01 ?state=standby |
| `globeAcquiring` | Acquiring picture | UI-SPEC C-02 loading | C-02 slate |
| `globeLost` | Signal — GPU context lost | UI-SPEC C-02 error | C-02 ?state=contextlost |
| `globeLostBody` | Countries are still clickable from the list. | UI-SPEC C-02 error | C-02 ?state=contextlost |
| `globeRestore` | Restore picture | UI-SPEC C-02 error | C-02 ?state=contextlost |
| `globeUnavailable` | Picture unavailable on this device | UI-SPEC C-02 error | C-02 after a second failure |
| `globeAria` | Interactive globe. Arrow keys rotate. Press K to open the country list. | UI-SPEC C-02 focus-visible | C-02 canvas aria-label |
| `dockTabStory` | Story | UI-SPEC §4 layout | C-03 tab |
| `dockTabAsk` | Ask | UI-SPEC §4 layout | C-03 tab |
| `dockReturnPill` | Now · Cape Town | UI-SPEC C-03 cut-while-open | C-03 ?state=open-cut |
| `dockClose` | Close | UI-SPEC T-06 (unlabelled close button) | C-03 close button aria-label |
| `dockAria` | Panel | UI-SPEC C-03 a11y | C-03 aria-label |
| `storyStaleAge` | Not live · 6 h 5 min old | copy call — a known source time over 3 h (distinct from “Age not verifiable”) | C-04 ?state=story-unverified |
| `storyNoFrame` | No frame to send. | UI-SPEC C-04 disabled | C-04 Send me this, disabled |
| `storyCreditNoTime` | Public camera · Kyoto, Japan | COPY §4's credit without its `frame taken` clause (no source time, rule 2) | C-04 ?state=story-notime |
| `chatSend` | Send | UI-SPEC C-05 composer | C-05 composer submit |
| `chatStop` | Stop | UI-SPEC C-05 streaming | C-05 ?state=chat-streaming |
| `chatSummary` | 4 steps · 2.1 s | UI-SPEC C-05 success | C-05 ?state=chat-answered |
| `chatStopped` | — stopped | UI-SPEC C-05 transitions | C-05 stopped answer |
| `chatGoTo` | Go to | UI-SPEC C-05 place-chip rule | C-05 ?state=chat-nochips |
| `chatWaiting` | Send — waiting for the current answer | UI-SPEC C-05 disabled | C-05 send aria-label while streaming |
| `chatChipAria` | Go to Reykjavík, Iceland — verified live | UI-SPEC C-05 a11y | C-05 place chip aria-label |
| `chatFirstTitle` | Ask anything about right now | UI-SPEC C-11 chat first-run | C-11 ?state=empty-chat-first |
| `chatFirstBody` | Where it’s light, what scored highest, what the director just cut away from. | UI-SPEC C-11 chat first-run | C-11 ?state=empty-chat-first |
| `chatNoneTitle` | No answer for that one | UI-SPEC C-11 chat no-result | C-11 ?state=empty-chat-none |
| `chatNoneBody` | That question needs data the channel doesn’t hold yet. | UI-SPEC C-11 chat no-result | C-11 ?state=empty-chat-none |
| `chatNoneAction` | Ask about somewhere instead | UI-SPEC C-11 chat no-result | C-11 ?state=empty-chat-none |
| `railKeyHint` | ← → step · Home on air | UI-SPEC C-06 tokens | C-06 keyboard hint |
| `railFirstAction` | Start the channel | UI-SPEC C-11 rail first-run | C-11 ?state=empty-rail-first |
| `railNoneTitle` | No frames in the last hour | UI-SPEC C-11 rail no-result | C-11 ?state=empty-rail-none |
| `railNoneBody` | Every camera checked came back stale. The running order only lists frames we could verify. | UI-SPEC C-11 rail no-result | C-11 ?state=empty-rail-none |
| `railNoneAction` | Widen to the last six hours | UI-SPEC C-11 rail no-result | C-11 ?state=empty-rail-none |
| `fetchStillGoing` | Still going — 14 s | UI-SPEC C-08 loading | C-08 ?state=fetch-slow |
| `fetchCancel` | Cancel | UI-SPEC C-08 loading | C-08 ?state=fetch-slow |
| `fetchCancelAria` | Cancel the fetch for Switzerland | UI-SPEC C-08 a11y | C-08 Cancel aria-label |
| `fetchTimeout` | The fetch stopped responding. | UI-SPEC C-08 transitions (30s) | C-08 client-side timeout |
| `countryErrorTitle` | Kenya didn’t come back | UI-SPEC C-11 country error | C-11 ?state=empty-country-error |
| `countryErrorBody` | The search timed out after 30 seconds. | UI-SPEC C-11 country error | C-11 ?state=empty-country-error |
| `countryErrorAction` | Try Kenya again | UI-SPEC C-11 country error | C-11 ?state=empty-country-error |
| `tryThese` | Try one of these | UI-SPEC C-11 country no-result | C-11 three-verified chip row |
| `verifiedChipAria` | Go to Norway, verified live 12 min ago | UI-SPEC C-11 a11y | C-11 verified chip aria-label |
| `retrying` | Retrying… | UI-SPEC C-11 disabled | C-11 action while its retry is in flight |
| `openList` | Open the country list | UI-SPEC C-11 story first-run / nochips | C-11 ?state=empty-story-first, empty-country-nochips |
| `storyFirstTitle` | Pick a country | UI-SPEC C-11 story first-run | C-11 ?state=empty-story-first |
| `storyFirstBody` | Click any country on the globe and we’ll go find a live camera in it. | UI-SPEC C-11 story first-run | C-11 ?state=empty-story-first |
| `mailBounced` | Bounced · 20:38 UTC | UI-SPEC C-09, shaped like COPY §7's chips | C-09 ?state=mail-bounced |
| `mailUnconfirmed` | No confirmation — check spam | UI-SPEC C-09 | C-09 ?state=mail-unconfirmed |
| `mailDone` | Done | UI-SPEC C-09 success | C-09 ?state=mail-delivered |
| `scoreFirst` | first on air this hour | UI-SPEC C-10 — rendered only when the snapshot establishes it (copy call) | C-10 ?state=score-first |
| `scoreUnscored` | not scored | UI-SPEC C-10 error | C-10 ?state=score-unscored |
| `scoreAria` | Score | UI-SPEC C-10 a11y | C-10 group aria-label |
| `scoreSr` | 8.3 out of 10, beat Reykjavík at 8.1 | UI-SPEC C-10 a11y | C-10 card variant, visually hidden |
| `notFoundSlate` | Signal not found | UI-SPEC C-12 slate | C-12 slate caption |
| `notFoundLive` | Right now we’re in Tromsø. | copy call — UI-SPEC C-12 live line, completed | C-12 ?state=404 |
| `notFoundBetween` | The channel is between cuts. | UI-SPEC C-12 empty | C-12 ?state=404-nochannel |
| `notFoundPick` | Pick a country | UI-SPEC C-12 secondary action | C-12 secondary button |

<!-- generated -->
<!-- node scripts/gen-copy-audit.mjs — do not edit below this line -->

## Count strings, both forms

Rule 4 of COPY.md, rendered. The plural is COPY.md's own sentence; the singular is that sentence
with its agreements corrected and the numeral kept.

| key | n = 1 | n = 3 |
| --- | --- | --- |
| `COPY.topBar.betweenMeta` | Picking the next view · 1 frame scored | Picking the next view · 3 frames scored |
| `COPY.rail.loading` | 1 of 1 camera checked · 1 scored | 3 of 3 cameras checked · 3 scored |
| `COPY.fetch.candidates` | 1 candidate found in Kenya · working through it | 3 candidates found in Kenya · working through them in order |
| `COPY.fetch.scoring` | Scoring the 1 frame that cleared… | Scoring the 3 frames that cleared… |
| `COPY.countryEmpty.noCameraBody` | We searched 1 camera page for Kenya and it didn’t serve a frame. Nothing is being held back — there’s nothing verified to put on air. | We searched 3 camera pages for Kenya and none of them served a frame. Nothing is being held back — there’s nothing verified to put on air. |
| `COPY.countryEmpty.staleTitle` | 1 camera in Kenya, its frame stale | 3 cameras in Kenya, every frame stale |
| `COPY.countryEmpty.staleBody` | The frame says it was taken more than three hours ago — it dates to 14 Oct 2022. A picture that old isn’t Kenya right now, so it doesn’t air. | All 3 frames say they were taken more than three hours ago — the oldest dates to 14 Oct 2022. A picture that old isn’t Kenya right now, so it doesn’t air. |
| `COPY.countryEmpty.misplacedBody` | 1 frame came back and 1 was filmed somewhere else — it was Times Square. Wrong place, so it’s out. | 3 frames came back and 3 were filmed somewhere else — one was Times Square. Wrong place, so they’re out. |
| `ADDED.chatSummary` | 1 step · 2.1 s | 3 steps · 2.1 s |

## Strings beyond COPY.md (74)

Each rendered with the arguments its real call site passes.

| key | renders as | source | used by |
| --- | --- | --- | --- |
| `askSubject` | Asking about Kyoto | author request 2026-09-22 | C-05 ?state=chat-subject |
| `beat` | beat Reykjavík 8.1 | build brief | C-10 beat line |
| `chairHeld` | You're directing · 4 min left | author request 2026-09-21 | C-01 ?state=chair |
| `chairOnAir` | On air now | author request 2026-09-21 — the frame already on air | C-07 / C-04 |
| `chairRelease` | Give the chair back | author request 2026-09-21 | C-01 ?state=chair |
| `chairTake` | Put this on air | author request 2026-09-21 — viewer takes the director's chair | C-07 / C-04 |
| `chatChipAria` | Go to Reykjavík, Iceland — verified live | UI-SPEC C-05 a11y | C-05 place chip aria-label |
| `chatFirstBody` | Where it’s light, what scored highest, what the director just cut away from. | UI-SPEC C-11 chat first-run | C-11 ?state=empty-chat-first |
| `chatFirstTitle` | Ask anything about right now | UI-SPEC C-11 chat first-run | C-11 ?state=empty-chat-first |
| `chatGoTo` | Go to | UI-SPEC C-05 place-chip rule | C-05 ?state=chat-nochips |
| `chatNoneAction` | Ask about somewhere instead | UI-SPEC C-11 chat no-result | C-11 ?state=empty-chat-none |
| `chatNoneBody` | That question needs data the channel doesn’t hold yet. | UI-SPEC C-11 chat no-result | C-11 ?state=empty-chat-none |
| `chatNoneTitle` | No answer for that one | UI-SPEC C-11 chat no-result | C-11 ?state=empty-chat-none |
| `chatSend` | Send | UI-SPEC C-05 composer | C-05 composer submit |
| `chatStop` | Stop | UI-SPEC C-05 streaming | C-05 ?state=chat-streaming |
| `chatStopped` | — stopped | UI-SPEC C-05 transitions | C-05 ?state=chat-stopped |
| `chatSummary` | 4 steps · 2.1 s | UI-SPEC C-05 success | C-05 ?state=chat-answered |
| `chatWaiting` | Send — waiting for the current answer | UI-SPEC C-05 disabled | not rendered: Stop replaces Send while an answer streams |
| `countryErrorAction` | Try Kenya again | UI-SPEC C-11 country error | C-11 ?state=empty-country-error |
| `countryErrorBody` | The search timed out after 30 seconds. | UI-SPEC C-11 country error | C-11 ?state=empty-country-error |
| `countryErrorTitle` | Kenya didn’t come back | UI-SPEC C-11 country error | C-11 ?state=empty-country-error |
| `dockAria` | Panel | UI-SPEC C-03 a11y | C-03 aria-label |
| `dockClose` | Close | UI-SPEC T-06 (unlabelled close button) | C-03 close button aria-label |
| `dockReturnPill` | Now · Cape Town | UI-SPEC C-03 cut-while-open | C-03 ?state=open-cut |
| `dockTabAsk` | Ask | UI-SPEC §4 layout | C-03 tab |
| `dockTabNews` | News | author request 2026-09-21 — the third dock tab | C-16 ?state=news |
| `dockTabStory` | Story | UI-SPEC §4 layout | C-03 tab |
| `fetchCancel` | Cancel | UI-SPEC C-08 loading | C-08 ?state=fetch-slow |
| `fetchCancelAria` | Cancel the fetch for Switzerland | UI-SPEC C-08 a11y | C-08 Cancel aria-label |
| `fetchStillGoing` | Still going — 14 s | UI-SPEC C-08 loading | C-08 ?state=fetch-slow |
| `fetchTimeout` | The fetch stopped responding. | UI-SPEC C-08 transitions (30s) | C-08 client timeout (live fetch panel, block 1) |
| `globeAcquiring` | Acquiring picture | UI-SPEC C-02 loading | C-02 slate |
| `globeAria` | Interactive globe. Arrow keys rotate. Press K to open the country list. | UI-SPEC C-02 focus-visible | C-02 canvas aria-label |
| `globeLost` | Signal — GPU context lost | UI-SPEC C-02 error | C-02 ?state=contextlost |
| `globeLostBody` | Countries are still clickable from the list. | UI-SPEC C-02 error | C-02 ?state=contextlost |
| `globeRestore` | Restore picture | UI-SPEC C-02 error | C-02 ?state=contextlost |
| `globeUnavailable` | Picture unavailable on this device | UI-SPEC C-02 error | C-02 ?state=contextlost-twice |
| `introAmber` | Amber marks the one frame on air. Nothing else in the product is amber. | author request 2026-09-22 — the other half of the colour rule, for the landing | C-17 ?state=landing |
| `introBody` | An AI director watches real webcams around the world and cuts the best one on air. True day and night on a spinning globe. Every frame checked for age and place before it airs. | COPY.md §10 description | C-17 ?state=landing |
| `introHow` | Teal means we read the frame's age from the source. Grey means we could not, and we say so. | author request 2026-09-21 — the one rule a judge needs to read the colours | C-17 ?state=landing |
| `introPick` | Or pick a country | author request 2026-09-21 | C-17 ?state=landing |
| `introStart` | Start watching | author request 2026-09-21 | C-17 ?state=landing |
| `introTitle` | Meanwhile — the planet, on air | COPY.md §10 OG title | C-17 ?state=landing |
| `legendClose` | Got it | author request 2026-09-21 — dismisses the legend for good | C-01 legend popover |
| `legendOpen` | What am I looking at? | COPY.md §6 chip text, author request 2026-09-21 | C-01 legend button |
| `mailBounced` | Bounced · 20:38 UTC | UI-SPEC C-09, shaped like COPY §7's chips | C-09 ?state=mail-bounced |
| `mailDone` | Done | UI-SPEC C-09 success | C-09 ?state=mail-delivered |
| `mailUnconfirmed` | No confirmation — check spam | UI-SPEC C-09 | C-09 ?state=mail-unconfirmed |
| `newsEmptyBody` | Nothing has been published today for the places on air. This fills in as the channel moves. | author request 2026-09-21 | C-16 ?state=news-empty |
| `newsEmptyTitle` | No headlines yet | author request 2026-09-21 | C-16 ?state=news-empty |
| `newsLoading` | Looking for today's news… | author request 2026-09-21 | C-16 ?state=news-loading |
| `notFoundBetween` | The channel is between cuts. | UI-SPEC C-12 empty | C-12 ?state=404-nochannel |
| `notFoundLive` | Right now we’re in Tromsø. | copy call — UI-SPEC C-12 live line, completed | C-12 ?state=404 |
| `notFoundPick` | Pick a country | UI-SPEC C-12 secondary action | C-12 secondary button |
| `notFoundSlate` | Signal not found | UI-SPEC C-12 slate | C-12 slate caption |
| `openList` | Open the country list | UI-SPEC C-11 story first-run / nochips | C-11 ?state=empty-story-first, empty-country-nochips |
| `railFirstAction` | Start the channel | UI-SPEC C-11 rail first-run | C-11 ?state=empty-rail-first |
| `railKeyHint` | ← → step · Home on air | UI-SPEC C-06 tokens | C-06 keyboard hint |
| `railNoneAction` | Widen to the last six hours | UI-SPEC C-11 rail no-result | C-11 ?state=empty-rail-none |
| `railNoneBody` | Every camera checked came back stale. The running order only lists frames we could verify. | UI-SPEC C-11 rail no-result | C-11 ?state=empty-rail-none |
| `railNoneTitle` | No frames in the last hour | UI-SPEC C-11 rail no-result | C-11 ?state=empty-rail-none |
| `retrying` | Retrying… | UI-SPEC C-11 disabled | C-11 ?state=empty-country-retrying |
| `scoreAria` | Score | UI-SPEC C-10 a11y | C-10 group aria-label |
| `scoreFirst` | first on air this hour | UI-SPEC C-10 — rendered only when the snapshot establishes it (copy call) | C-10 ?state=score-first |
| `scoreSr` | 8.3 out of 10, beat Reykjavík at 8.1 | UI-SPEC C-10 a11y | C-10 card variant, visually hidden |
| `scoreUnscored` | not scored | UI-SPEC C-10 error | C-10 ?state=score-unscored |
| `storyCreditNoTime` | Public camera · Kyoto, Japan | COPY §4's credit without its `frame taken` clause (no source time, rule 2) | C-04 ?state=story-notime |
| `storyFirstBody` | Click any country on the globe and we’ll go find a live camera in it. | UI-SPEC C-11 story first-run | C-11 ?state=empty-story-first |
| `storyFirstTitle` | Pick a country | UI-SPEC C-11 story first-run | C-11 ?state=empty-story-first |
| `storyNoFrame` | No frame to send. | UI-SPEC C-04 disabled | C-04 Send me this, disabled |
| `storyStaleAge` | Not live · 6 h 5 min old | copy call — a known source time over 3 h (distinct from “Age not verifiable”) | C-04 ?state=story-unverified |
| `topBarStandby` | Standing by | UI-SPEC C-01 loading | C-01 ?state=standby |
| `tryThese` | Try one of these | UI-SPEC C-11 country no-result | C-11 three-verified chip row |
| `verifiedChipAria` | Go to Norway, verified live 12 min ago | UI-SPEC C-11 a11y | C-11 verified chip aria-label |
