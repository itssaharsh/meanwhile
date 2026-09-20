# Meanwhile — copy deck

Conventions: sentence case, curly quotes, `…` (U+2026), `−` (U+2212) for negatives, `·` as the
chyron separator, non-breaking space between every number and its unit (`12 min`, `2 h`).
`{braces}` are runtime values.

**Three binding rules**
1. `Send me this` and `Ask about this` keep those exact names on every surface. Never
   `Subscribe`, `Submit`, `Email me`.
2. Any string stating an age renders only from a source-supplied timestamp. With no timestamp,
   the only permitted chip is `Age not verifiable · the source sends no timestamp`. No relative
   age, no "just now", no default.
3. Rejection counts reconcile: `stale + misplaced = rejected`, `rejected + kept = n`.
4. Every count string has both forms (added 2026-09-20). The plural is written below; the
   singular is the same sentence with its agreements corrected, and the numeral kept —
   `Scoring the 1 frame that cleared…`, not `Scoring the one frame…`. Strings already correct
   at one (`Pulling frame 1 of 1`, `#1 in the running order`, `1 stale, 1 filmed outside
   Kenya`, and every `{age}`, which renders abbreviations) are left alone. Both forms live in
   `src/lib/copy.ts` behind one `count()` helper, and the audit renders both.

## 1. TopBar

**On air** — `On air` / `{place}, {country} · {score}` / `Frame checked {age} ago · local time {localTime}`
→ `On air` · `Tromsø, Norway · 9.6` · `Frame checked 12 min ago · local time 01:47`

**Between cuts** — `Cutting` / `Picking the next view · {n} frames scored`

**Degraded** — `Unranked` / `Scoring paused · views are still live, nothing is being ranked` /
`Back to full scoring at {time} UTC`

**Actions** — `Ask about this` · `Send me this`
aria: `Ask about the view that's on air` · `Email me the view that's on air`

## 2. Feed rail

Heading `Running order` · on-air tag `On air` · `Up next` · `#{rank} in the running order` ·
`Ran {age} ago` · `Held · {reason}`
Score chip `{score} · {place}` → `9.0 · Santoríni`, `3.8 · Queenstown`

**First run** — `Nothing on air yet` / `The director is opening its first cameras. The channel
starts the moment one clears the age and place checks.`

**Loading** — `{checked} of {total} cameras checked · {scored} scored`

## 3. Country fetch — named stages

One line at a time, replacing in place.
```
Searching camera pages in {country}…
{n} candidates found in {country} · working through them in order
Pulling frame {i} of {n} · {cameraName}
Checking frame age · the source says {age} old
Rejected {rejected} of {n} · {stale} stale, {misplaced} filmed outside {country}
Scoring the {kept} frames that cleared…
```
Filled (Switzerland): `11 candidates found` → `Pulling frame 4 of 11 · Glecksteinhütte` →
`the source says 38 min old` → `Rejected 5 of 11 · 4 stale, 1 filmed outside Switzerland` →
`Scoring the 6 frames that cleared…`

## 4. StoryCard

Freshness, three states:
- `Verified live · {age} old` → `Verified live · 12 min old`  (teal, under 3 h)
- `Verified · {age} old` → `Verified · 2 h 14 min old`  (teal, over an hour, inside window)
- `Age not verifiable · the source sends no timestamp`  (grey)

Source credit — `{cameraName} · {place}, {country} · {lat}, {lon} · frame taken {time} UTC`
→ `Wilson Airport runway · Nairobi, Kenya · −1.32°, 36.81° · frame taken 15:04 UTC`
No camera name → `Public camera · {place}, {country} · frame taken {time} UTC`

Actions — `Ask about this` · `Send me this`

## 5. Country empty states

**No camera found** — `No camera we can reach in {country}` / `We searched {n} camera pages for
{country} and none of them served a frame. Nothing is being held back — there's nothing verified
to put on air.` / `Search {country} again`

**All stale** — `{n} cameras in {country}, every frame stale` / `All {n} frames say they were
taken more than three hours ago — the oldest dates to {oldestDate}. A picture that old isn't
{country} right now, so it doesn't air.` / `Check {country} again`

**All wrong place** — `The {country} cameras weren't in {country}` / `{n} frames came back and
{n} were filmed somewhere else — one was Times Square on a page listed under {country}. Wrong
place, so they're out.` / `Search {country} again`

Each of the three also offers three countries verified working this minute, pulled from the live
cache, never hardcoded.

## 6. Chat

Placeholder `Ask about what's on air`
Chips — `What am I looking at?` · `Where is the sun right now?` · `Why did the director cut here?`
Steps — `Reading the frame…` · `Locating the camera…` · `Working out the sun angle there…` · `Writing…`
Error — `The chat lost its line to the director.` / `Your question is still in the box.` / `Ask again`

## 7. Send me this

Prompt `Send me this` / `We'll email the frame that's on air right now — the picture, the place,
and the time it was taken.`
Input label `Email address`, placeholder `you@example.com`,
validation, no `@` `That address is missing an @ — check it and send again.`
validation, anything else `That doesn’t look like a complete email address — check it and send
again.` (added 2026-09-20)
Button `Send me this` → `Sending…` → `Sent`

Success — `Sent to {email}.` / `Meanwhile mails from a shared sending domain, so Gmail often
files it under Promotions or Spam rather than the inbox. If it isn't with you in 5 min, look there.`

Delivery chip — `Queued · {time} UTC` → `Accepted by the mail provider · {time} UTC` →
`Handed to your mail server · {time} UTC`
Trailing note — `That's as far as we can see. Whether it lands in the inbox is your mail server's call.`

## 8. Errors

**Frame failed** — `This frame didn't arrive` / `The camera answered but the image never came
through. The channel is still running.` / `Load this frame again` · `Cut to the next view`

**Connection lost** — `The channel dropped` / `The live connection is down, so nothing new is
coming in. The globe still turns and the last verified frame is still here.` /
`Reconnecting · attempt {i} of 5` / `Reconnect`

**Rate-limited** — `Scoring is rate-limited` / `The director has used its scores for this minute.
Views keep coming, unranked, until {time} UTC.` / `Keep watching`

**Generic** — `The channel hit something it didn't expect` / `Nothing you did caused this. Your
question and your email address are still where you left them.` / `Try that again`

## 9. 404

`Off air` / `There's no page at this address. The planet is on the other one.` / `Back to the channel`

## 10. Meta

title `Meanwhile — a live channel of Earth`
description `An AI director watches real webcams around the world and cuts the best one on air.
True day and night on a spinning globe. Every frame checked for age and place before it airs.`
OG title `Meanwhile — the planet, on air`
OG description `Santoríni at 9.0. Tromsø at 9.6. A road outside Queenstown at 3.8. One live view
at a time, age-checked and place-checked before it airs. Click any of 177 countries and watch it
go and find one.`

## Banned
"Oops" · "Uh oh" · bare "Something went wrong" · "Please try again later" · exclamation marks ·
emoji · seamlessly · unleash · elevate · supercharge · journey · "powered by AI" · ✨
