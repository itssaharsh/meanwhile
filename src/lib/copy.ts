/*
 * Every string in the product.
 *
 * `COPY` is COPY.md, verbatim, section by section. Its header conventions are applied here
 * once rather than in each component: apostrophes are set as ’, and a number is joined to
 * its unit (min, h, s, UTC) by a non-breaking space.
 *
 * `ADDED` holds strings a spec'd state needs that COPY.md does not have. Each one is
 * UI-SPEC.md's wording for that state, labelled with where it came from, and listed in the
 * /_kit copy audit and COPY-GAPS.md until it is approved or replaced. Nothing in this file
 * is invented; where neither document has a string, the entry says so.
 */

export const NBSP = String.fromCharCode(0xa0);
export const MINUS = String.fromCharCode(0x2212);
const u = (n: string | number, unit: string) => `${n}${NBSP}${unit}`;

/**
 * Both forms of a count string, chosen by the count that governs the sentence.
 *
 * English does not pluralise by suffix here: "All 3 frames say they were taken" becomes "The
 * frame says it was taken" — noun, verb, determiner and pronoun all move together. So each
 * entry writes the two sentences out and this picks between them, rather than any attempt to
 * inflect at runtime. The plural form stays exactly as COPY.md wrote it; the singular is the
 * same sentence with its agreements corrected.
 *
 * Only strings that genuinely break are given two forms. `Pulling frame 1 of 1`,
 * `#1 in the running order`, `1 stale, 1 filmed outside Kenya` and every `{age}` string are
 * already correct at one, and are left alone.
 */
const count = (n: number, one: string, many: string) => (n === 1 ? one : many);

export const COPY = {
  // §1 TopBar
  topBar: {
    onAirLabel: "On air",
    onAirPlace: (place: string, country: string, score: string) => `${place}, ${country} · ${score}`,
    onAirMeta: (age: string, localTime: string) => `Frame checked ${age} ago · local time ${localTime}`,
    betweenLabel: "Cutting",
    betweenMeta: (n: number) =>
      count(n, `Picking the next view · 1 frame scored`, `Picking the next view · ${n} frames scored`),
    degradedLabel: "Unranked",
    degradedMeta: "Scoring paused · views are still live, nothing is being ranked",
    degradedBack: (time: string) => `Back to full scoring at ${u(time, "UTC")}`,
    ask: "Ask about this",
    send: "Send me this",
    askAria: "Ask about the view that’s on air",
    sendAria: "Email me the view that’s on air",
  },

  // §2 Feed rail
  rail: {
    heading: "Running order",
    onAirTag: "On air",
    upNext: "Up next",
    rank: (rank: number) => `#${rank} in the running order`,
    ran: (age: string) => `Ran ${age} ago`,
    held: (reason: string) => `Held · ${reason}`,
    scoreChip: (score: string, place: string) => `${score} · ${place}`,
    firstRunTitle: "Nothing on air yet",
    firstRunBody:
      "The director is opening its first cameras. The channel starts the moment one clears the age and place checks.",
    loading: (checked: number, total: number, scored: number) =>
      // Governed by the total, not the number checked: "0 of 1 cameras" is the broken one.
      count(total, `${checked} of 1 camera checked · ${scored} scored`, `${checked} of ${total} cameras checked · ${scored} scored`),
  },

  // §3 Country fetch — named stages, one line at a time, replacing in place
  fetch: {
    searching: (country: string) => `Searching camera pages in ${country}…`,
    candidates: (n: number, country: string) =>
      count(
        n,
        `1 candidate found in ${country} · working through it`,
        `${n} candidates found in ${country} · working through them in order`,
      ),
    pulling: (i: number, n: number, cameraName: string) => `Pulling frame ${i} of ${n} · ${cameraName}`,
    checkingAge: (age: string) => `Checking frame age · the source says ${age} old`,
    rejected: (rejected: number, n: number, stale: number, misplaced: number, country: string) =>
      `Rejected ${rejected} of ${n} · ${stale} stale, ${misplaced} filmed outside ${country}`,
    scoring: (kept: number) =>
      count(kept, `Scoring the 1 frame that cleared…`, `Scoring the ${kept} frames that cleared…`),
  },

  // §4 StoryCard
  story: {
    verifiedLive: (age: string) => `Verified live · ${age} old`,
    verified: (age: string) => `Verified · ${age} old`,
    noTimestamp: "Age not verifiable · the source sends no timestamp",
    credit: (cameraName: string, place: string, country: string, lat: string, lon: string, time: string) =>
      `${cameraName} · ${place}, ${country} · ${lat}, ${lon} · frame taken ${u(time, "UTC")}`,
    publicCamera: "Public camera",
    creditNoName: (place: string, country: string, time: string) =>
      `Public camera · ${place}, ${country} · frame taken ${u(time, "UTC")}`,
    ask: "Ask about this",
    send: "Send me this",
  },

  // §5 Country empty states
  countryEmpty: {
    noCameraTitle: (country: string) => `No camera we can reach in ${country}`,
    noCameraBody: (n: number, country: string) =>
      count(
        n,
        `We searched 1 camera page for ${country} and it didn’t serve a frame. Nothing is being held back — there’s nothing verified to put on air.`,
        `We searched ${n} camera pages for ${country} and none of them served a frame. Nothing is being held back — there’s nothing verified to put on air.`,
      ),
    noCameraAction: (country: string) => `Search ${country} again`,
    staleTitle: (n: number, country: string) =>
      count(n, `1 camera in ${country}, its frame stale`, `${n} cameras in ${country}, every frame stale`),
    staleBody: (n: number, oldestDate: string, country: string) =>
      count(
        n,
        `The frame says it was taken more than three hours ago — it dates to ${oldestDate}. A picture that old isn’t ${country} right now, so it doesn’t air.`,
        `All ${n} frames say they were taken more than three hours ago — the oldest dates to ${oldestDate}. A picture that old isn’t ${country} right now, so it doesn’t air.`,
      ),
    staleAction: (country: string) => `Check ${country} again`,
    misplacedTitle: (country: string) => `The ${country} cameras weren’t in ${country}`,
    // Rewritten by the author 2026-09-20: the detected location is rendered when the narrator
    // returned one, and nothing is claimed when it didn't. Times Square was true of exactly one
    // Kenyan page and is never hardcoded again.
    misplacedBody: (n: number, rejected: number, detectedPlace?: string | null) =>
      count(
        n,
        `1 frame came back and ${rejected} was filmed somewhere else${detectedPlace ? ` — it was ${detectedPlace}` : ""}. Wrong place, so it’s out.`,
        `${n} frames came back and ${rejected} were filmed somewhere else${detectedPlace ? ` — one was ${detectedPlace}` : ""}. Wrong place, so they’re out.`,
      ),
    misplacedAction: (country: string) => `Search ${country} again`,
  },

  // §6 Chat
  chat: {
    placeholder: "Ask about what’s on air",
    chips: ["What am I looking at?", "Where is the sun right now?", "Why did the director cut here?"] as const,
    steps: ["Reading the frame…", "Locating the camera…", "Working out the sun angle there…", "Writing…"] as const,
    errorTitle: "The chat lost its line to the director.",
    errorBody: "Your question is still in the box.",
    errorAction: "Ask again",
  },

  // §7 Send me this
  send: {
    title: "Send me this",
    body: "We’ll email the frame that’s on air right now — the picture, the place, and the time it was taken.",
    inputLabel: "Email address",
    placeholder: "you@example.com",
    invalid: "That address is missing an @ — check it and send again.",
    // Copy call 2026-09-20: the other half of validation. COPY.md only wrote the missing-@ case.
    invalidOther: "That doesn’t look like a complete email address — check it and send again.",
    button: "Send me this",
    sending: "Sending…",
    sent: "Sent",
    successTitle: (email: string) => `Sent to ${email}.`,
    successBody: `Meanwhile mails from a shared sending domain, so Gmail often files it under Promotions or Spam rather than the inbox. If it isn’t with you in ${u(5, "min")}, look there.`,
    chipQueued: (time: string) => `Queued · ${u(time, "UTC")}`,
    chipAccepted: (time: string) => `Accepted by the mail provider · ${u(time, "UTC")}`,
    chipHanded: (time: string) => `Handed to your mail server · ${u(time, "UTC")}`,
    trailing: "That’s as far as we can see. Whether it lands in the inbox is your mail server’s call.",
  },

  // §8 Errors
  errors: {
    frameFailed: {
      title: "This frame didn’t arrive",
      body: "The camera answered but the image never came through. The channel is still running.",
      reload: "Load this frame again",
      next: "Cut to the next view",
    },
    connectionLost: {
      title: "The channel dropped",
      body: "The live connection is down, so nothing new is coming in. The globe still turns and the last verified frame is still here.",
      status: (i: number) => `Reconnecting · attempt ${i} of 5`,
      action: "Reconnect",
    },
    rateLimited: {
      title: "Scoring is rate-limited",
      body: (time: string) =>
        `The director has used its scores for this minute. Views keep coming, unranked, until ${u(time, "UTC")}.`,
      action: "Keep watching",
    },
    generic: {
      title: "The channel hit something it didn’t expect",
      body: "Nothing you did caused this. Your question and your email address are still where you left them.",
      action: "Try that again",
    },
  },

  // §9 404
  notFound: {
    title: "Off air",
    body: "There’s no page at this address. The planet is on the other one.",
    action: "Back to the channel",
  },

  // §10 Meta
  meta: {
    title: "Meanwhile — a live channel of Earth",
    description:
      "An AI director watches real webcams around the world and cuts the best one on air. True day and night on a spinning globe. Every frame checked for age and place before it airs.",
    ogTitle: "Meanwhile — the planet, on air",
    ogDescription:
      "Santoríni at 9.0. Tromsø at 9.6. A road outside Queenstown at 3.8. One live view at a time, age-checked and place-checked before it airs. Click any of 177 countries and watch it go and find one.",
  },
} as const;

// ---------------------------------------------------------------------------------------
// ADDED — strings the product needs that COPY.md doesn't have. Every one is approved:
//   · "beat {place} {score}" came from the build brief;
//   · the rest are UI-SPEC.md's wording, approved as rendered on 2026-09-19, with three
//     copy calls applied that day (storyStaleAge, notFoundLive, scoreFirst's render rule);
//   · "Nothing on air yet" (COPY §2) replaced the two near-duplicates UI-SPEC had.
// Templates carry the exact argument shapes their call sites pass (`sample`), so the /_kit
// audit renders what the product renders — never a place name in a number's slot.
// ---------------------------------------------------------------------------------------
type Added<T> = { text: T; source: string; usedBy: string };
type AddedFn<A extends unknown[]> = Added<(...a: A) => string> & { sample: A };
const s = (text: string, source: string, usedBy: string): Added<string> => ({ text, source, usedBy });
const f = <A extends unknown[]>(text: (...a: A) => string, source: string, usedBy: string, sample: A): AddedFn<A> => ({
  text,
  source,
  usedBy,
  sample,
});

export const ADDED = {
  beat: { ...f((place: string, score: string) => `beat ${place} ${score}`, "build brief", "C-10 beat line", ["Reykjavík", "8.1"]), word: "beat" },

  topBarStandby: s("Standing by", "UI-SPEC C-01 loading", "C-01 ?state=standby"),

  globeAcquiring: s("Acquiring picture", "UI-SPEC C-02 loading", "C-02 slate"),
  globeLost: s("Signal — GPU context lost", "UI-SPEC C-02 error", "C-02 ?state=contextlost"),
  globeLostBody: s("Countries are still clickable from the list.", "UI-SPEC C-02 error", "C-02 ?state=contextlost"),
  globeRestore: s("Restore picture", "UI-SPEC C-02 error", "C-02 ?state=contextlost"),
  globeUnavailable: s("Picture unavailable on this device", "UI-SPEC C-02 error", "C-02 ?state=contextlost-twice"),
  globeAria: s("Interactive globe. Arrow keys rotate. Press K to open the country list.", "UI-SPEC C-02 focus-visible", "C-02 canvas aria-label"),

  // Added 2026-09-21 at the author's request: a judge landing on a spinning globe could not
  // tell what they were looking at, could not change the camera, and could not see the news
  // the channel had already gathered. The intro's title and body are COPY.md §10 verbatim.
  introTitle: s("Meanwhile — the planet, on air", "COPY.md §10 OG title", "C-17 ?state=landing"),
  introBody: s(
    "An AI director watches real webcams around the world and cuts the best one on air. True day and night on a spinning globe. Every frame checked for age and place before it airs.",
    "COPY.md §10 description",
    "C-17 ?state=landing",
  ),
  introHow: s(
    "Teal means we read the frame's age from the source. Grey means we could not, and we say so.",
    "author request 2026-09-21 — the one rule a judge needs to read the colours",
    "C-17 ?state=landing",
  ),
  // The button that opens the legend in the chyron. The wording is COPY.md §6's own first chat
  // chip, reused deliberately: a viewer who wonders this has always been able to ask it, and the
  // legend is the answer that needs no model call.
  legendOpen: s("What am I looking at?", "COPY.md §6 chip text, author request 2026-09-21", "C-01 legend button"),
  legendClose: s("Got it", "author request 2026-09-21 — dismisses the legend for good", "C-01 legend popover"),
  introAmber: s(
    "Amber marks the one frame on air. Nothing else in the product is amber.",
    "author request 2026-09-22 — the other half of the colour rule, for the landing",
    "C-17 ?state=landing",
  ),
  introStart: s("Start watching", "author request 2026-09-21", "C-17 ?state=landing"),
  introPick: s("Or pick a country", "author request 2026-09-21", "C-17 ?state=landing"),
  chairTake: s("Put this on air", "author request 2026-09-21 — viewer takes the director's chair", "C-07 / C-04"),
  chairOnAir: s("On air now", "author request 2026-09-21 — the frame already on air", "C-07 / C-04"),
  chairHeld: f((time: string) => `You're directing · ${time} left`, "author request 2026-09-21", "C-01 ?state=chair", ["4 min"]),
  chairRelease: s("Give the chair back", "author request 2026-09-21", "C-01 ?state=chair"),
  // COPY.md §6's placeholder is "Ask about what's on air". Once a viewer can ask about a frame
  // that ISN'T on air, that placeholder is a claim the panel cannot keep, so the panel names its
  // subject instead of the placeholder being quietly wrong.
  askSubject: f((place: string) => `Asking about ${place}`, "author request 2026-09-22", "C-05 ?state=chat-subject", ["Kyoto"]),
  dockTabNews: s("News", "author request 2026-09-21 — the third dock tab", "C-16 ?state=news"),
  newsEmptyTitle: s("No headlines yet", "author request 2026-09-21", "C-16 ?state=news-empty"),
  newsEmptyBody: s(
    "Nothing has been published today for the places on air. This fills in as the channel moves.",
    "author request 2026-09-21",
    "C-16 ?state=news-empty",
  ),
  newsLoading: s("Looking for today's news…", "author request 2026-09-21", "C-16 ?state=news-loading"),
  dockTabStory: s("Story", "UI-SPEC §4 layout", "C-03 tab"),
  dockTabAsk: s("Ask", "UI-SPEC §4 layout", "C-03 tab"),
  dockReturnPill: f((place: string) => `Now · ${place}`, "UI-SPEC C-03 cut-while-open", "C-03 ?state=open-cut", ["Cape Town"]),
  dockClose: s("Close", "UI-SPEC T-06 (unlabelled close button)", "C-03 close button aria-label"),
  dockAria: s("Panel", "UI-SPEC C-03 a11y", "C-03 aria-label"),

  storyStaleAge: f(
    (age: string) => `Not live · ${age} old`,
    "copy call — a known source time over 3 h (distinct from “Age not verifiable”)",
    "C-04 ?state=story-unverified",
    [`${u(6, "h")} ${u(5, "min")}`],
  ),
  storyNoFrame: s("No frame to send.", "UI-SPEC C-04 disabled", "C-04 Send me this, disabled"),
  storyCreditNoTime: f(
    (camera: string, place: string, country: string) => `${camera} · ${place}, ${country}`,
    "COPY §4's credit without its `frame taken` clause (no source time, rule 2)",
    "C-04 ?state=story-notime",
    ["Public camera", "Kyoto", "Japan"],
  ),

  chatSend: s("Send", "UI-SPEC C-05 composer", "C-05 composer submit"),
  chatStop: s("Stop", "UI-SPEC C-05 streaming", "C-05 ?state=chat-streaming"),
  chatSummary: f(
    (n: number, secs: string) => count(n, `1 step · ${u(secs, "s")}`, `${n} steps · ${u(secs, "s")}`),
    "UI-SPEC C-05 success",
    "C-05 ?state=chat-answered",
    [4, "2.1"],
  ),
  chatStopped: s("— stopped", "UI-SPEC C-05 transitions", "C-05 ?state=chat-stopped"),
  chatGoTo: s("Go to", "UI-SPEC C-05 place-chip rule", "C-05 ?state=chat-nochips"),
  chatWaiting: s("Send — waiting for the current answer", "UI-SPEC C-05 disabled", "not rendered: Stop replaces Send while an answer streams"),
  chatChipAria: f(
    (place: string, country: string, verified: boolean) => `Go to ${place}, ${country} — ${verified ? "verified live" : "cannot verify"}`,
    "UI-SPEC C-05 a11y",
    "C-05 place chip aria-label",
    ["Reykjavík", "Iceland", true],
  ),
  chatFirstTitle: s("Ask anything about right now", "UI-SPEC C-11 chat first-run", "C-11 ?state=empty-chat-first"),
  chatFirstBody: s("Where it’s light, what scored highest, what the director just cut away from.", "UI-SPEC C-11 chat first-run", "C-11 ?state=empty-chat-first"),
  chatNoneTitle: s("No answer for that one", "UI-SPEC C-11 chat no-result", "C-11 ?state=empty-chat-none"),
  chatNoneBody: s("That question needs data the channel doesn’t hold yet.", "UI-SPEC C-11 chat no-result", "C-11 ?state=empty-chat-none"),
  chatNoneAction: s("Ask about somewhere instead", "UI-SPEC C-11 chat no-result", "C-11 ?state=empty-chat-none"),

  railKeyHint: s("← → step · Home on air", "UI-SPEC C-06 tokens", "C-06 keyboard hint"),
  railFirstAction: s("Start the channel", "UI-SPEC C-11 rail first-run", "C-11 ?state=empty-rail-first"),
  railNoneTitle: s("No frames in the last hour", "UI-SPEC C-11 rail no-result", "C-11 ?state=empty-rail-none"),
  railNoneBody: s("Every camera checked came back stale. The running order only lists frames we could verify.", "UI-SPEC C-11 rail no-result", "C-11 ?state=empty-rail-none"),
  railNoneAction: s("Widen to the last six hours", "UI-SPEC C-11 rail no-result", "C-11 ?state=empty-rail-none"),

  fetchStillGoing: f((secs: number) => `Still going — ${u(secs, "s")}`, "UI-SPEC C-08 loading", "C-08 ?state=fetch-slow", [14]),
  fetchCancel: s("Cancel", "UI-SPEC C-08 loading", "C-08 ?state=fetch-slow"),
  fetchCancelAria: f((country: string) => `Cancel the fetch for ${country}`, "UI-SPEC C-08 a11y", "C-08 Cancel aria-label", ["Switzerland"]),
  fetchTimeout: s("The fetch stopped responding.", "UI-SPEC C-08 transitions (30s)", "C-08 client timeout (live fetch panel, block 1)"),
  countryErrorTitle: f((country: string) => `${country} didn’t come back`, "UI-SPEC C-11 country error", "C-11 ?state=empty-country-error", ["Kenya"]),
  countryErrorBody: s("The search timed out after 30 seconds.", "UI-SPEC C-11 country error", "C-11 ?state=empty-country-error"),
  countryErrorAction: f((country: string) => `Try ${country} again`, "UI-SPEC C-11 country error", "C-11 ?state=empty-country-error", ["Kenya"]),
  tryThese: s("Try one of these", "UI-SPEC C-11 country no-result", "C-11 three-verified chip row"),
  verifiedChipAria: f(
    (country: string, age: string) => `Go to ${country}, verified live ${age} ago`,
    "UI-SPEC C-11 a11y",
    "C-11 verified chip aria-label",
    ["Norway", u(12, "min")],
  ),
  retrying: s("Retrying…", "UI-SPEC C-11 disabled", "C-11 ?state=empty-country-retrying"),
  openList: s("Open the country list", "UI-SPEC C-11 story first-run / nochips", "C-11 ?state=empty-story-first, empty-country-nochips"),
  storyFirstTitle: s("Pick a country", "UI-SPEC C-11 story first-run", "C-11 ?state=empty-story-first"),
  storyFirstBody: s("Click any country on the globe and we’ll go find a live camera in it.", "UI-SPEC C-11 story first-run", "C-11 ?state=empty-story-first"),

  mailBounced: f((time: string) => `Bounced · ${u(time, "UTC")}`, "UI-SPEC C-09, shaped like COPY §7's chips", "C-09 ?state=mail-bounced", ["20:38"]),
  mailUnconfirmed: s("No confirmation — check spam", "UI-SPEC C-09", "C-09 ?state=mail-unconfirmed"),
  mailDone: s("Done", "UI-SPEC C-09 success", "C-09 ?state=mail-delivered"),

  scoreFirst: s("first on air this hour", "UI-SPEC C-10 — rendered only when the snapshot establishes it (copy call)", "C-10 ?state=score-first"),
  scoreUnscored: s("not scored", "UI-SPEC C-10 error", "C-10 ?state=score-unscored"),
  scoreAria: s("Score", "UI-SPEC C-10 a11y", "C-10 group aria-label"),
  scoreSr: f(
    (score: string, beatPlace: string | null, beatScore: string | null) =>
      beatPlace ? `${score} out of 10, beat ${beatPlace} at ${beatScore}` : `${score} out of 10`,
    "UI-SPEC C-10 a11y",
    "C-10 card variant, visually hidden",
    ["8.3", "Reykjavík", "8.1"],
  ),

  notFoundSlate: s("Signal not found", "UI-SPEC C-12 slate", "C-12 slate caption"),
  notFoundLive: f((place: string) => `Right now we’re in ${place}.`, "copy call — UI-SPEC C-12 live line, completed", "C-12 ?state=404", ["Tromsø"]),
  notFoundBetween: s("The channel is between cuts.", "UI-SPEC C-12 empty", "C-12 ?state=404-nochannel"),
  notFoundPick: s("Pick a country", "UI-SPEC C-12 secondary action", "C-12 secondary button"),
} as const;

export type AddedKey = keyof typeof ADDED;

/** An ADDED entry rendered with the arguments its call site passes. */
export function renderAdded(key: AddedKey): string {
  const e = ADDED[key] as Added<string> | AddedFn<unknown[]>;
  return typeof e.text === "function" ? (e as AddedFn<unknown[]>).text(...(e as AddedFn<unknown[]>).sample) : e.text;
}
