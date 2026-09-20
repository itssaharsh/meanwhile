// Turning whatever a news index returns into a headline that fits on a card.
//
// Titles arrive as scraped: sometimes clean, sometimes a whole social post in the title
// field. The Kenya one was a post that styled its title in Unicode "math bold" and ran
// straight into the body with no punctuation at all:
//   "𝗜𝗱𝗮 𝗢𝗱𝗶𝗻𝗴𝗮 𝘂𝗻𝘃𝗲𝗶𝗹𝘀 … 𝗥𝗮𝗶𝗹𝗮 Kenya's Ambassador and Permanent Representative to …"
// Folding the styling to plain letters erases the only separator, so the styled run has
// to be split off FIRST, then a sentence break, then a hard cap.
//
// Plain .js on purpose (like rank.js and frames.js): news.ts imports it inside Convex, and
// scripts/verify.mjs unit-tests the very same file under plain `node`.

const MAX_HEADLINE_LEN = 120;

// Abbreviations whose trailing period is not the end of a sentence.
const ABBREVIATIONS = new Set(
  (
    "mr mrs ms dr prof sr jr st mt no nos vs etc inc ltd co corp gov gen rep sen lt col sgt capt " +
    "jan feb mar apr jun jul aug sep sept oct nov dec u.s u.k u.n e.u a.m p.m"
  )
    .split(" ")
    .filter(Boolean),
);

// Sports desks and live-blog accounts open a title with colour: "🔴🔵Alianza Lima vs.
// Fluminense EN VIVO …". Our type stack has no emoji face, so each one draws as a .notdef
// box on the card — and a box in front of a headline reads as a broken string, not as a
// flourish. Strip the pictographs (and the joiners, flags and skin tones that travel with
// them) and keep the words.
const PICTOGRAPHIC = /[\p{Extended_Pictographic}\p{Regional_Indicator}\u{1F3FB}-\u{1F3FF}\u{FE0E}\u{FE0F}\u{200D}\u{20E3}]/gu;

// Mathematical Alphanumeric Symbols: 𝐀 (U+1D400) … 𝟿 (U+1D7FF).
const isStyled = (cp) => cp >= 0x1d400 && cp <= 0x1d7ff;
const isPlainLetter = (ch) => /[A-Za-zÀ-ɏ]/.test(ch);

// When a post opens with a styled title run followed by plain body text, the run IS the
// headline. Returns null when the string doesn't have that shape.
export function styledLead(raw) {
  const chars = Array.from(raw);
  let styled = 0;
  let end = -1;
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    const cp = ch.codePointAt(0);
    if (isStyled(cp)) {
      styled++;
      continue;
    }
    if (isPlainLetter(ch)) {
      end = i;
      break;
    }
    // spaces, digits and punctuation may sit inside a styled title
  }
  if (styled < 3 || end <= 0) return null;
  return chars.slice(0, end).join("").trim() || null;
}

// The first sentence, if the text has a real sentence break early enough to matter.
export function firstSentence(text) {
  const re = /[.!?](?=\s+["'“‘(]?[A-Z0-9])/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const before = text.slice(0, m.index);
    const lastWord = (before.split(" ").pop() ?? "").toLowerCase();
    if (ABBREVIATIONS.has(lastWord)) continue; // "Dr. Ida Odinga", "U.S. Senate"
    if (/^[a-z]$/i.test(lastWord)) continue; // an initial: "John F. Kennedy"
    const sentence = text.slice(0, m.index + 1).trim();
    if (sentence.length >= 20) return sentence; // "Breaking. …" is not a headline
  }
  return text;
}

export function trimHeadline(raw, max = MAX_HEADLINE_LEN) {
  if (typeof raw !== "string") return null;
  let t = styledLead(raw) ?? raw;
  // Scraped text reaches both a model prompt and the DOM: fold compatibility forms
  // ("math bold" -> plain), drop control characters, strip angle brackets (the prompt
  // wraps this in <headline> tags, and the text must not close its own delimiter), and
  // collapse whitespace.
  t = t
    .normalize("NFKC")
    .replace(/[\x00-\x1f\x7f]/g, " ")
    .replace(/[<>]/g, "")
    .replace(PICTOGRAPHIC, "")
    .replace(/\s+/g, " ")
    .trim();
  t = firstSentence(t);
  if (t.length > max) {
    const cut = t.slice(0, max);
    const space = cut.lastIndexOf(" ");
    t = `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,;:–—-]+$/, "")}…`;
  }
  return t || null;
}
