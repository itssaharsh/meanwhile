import { useCallback, useRef, useState } from "react";
import { useAction } from "convex/react";
import { api } from "../../convex/_generated/api";
import { convex } from "@/lib/convex";
import { COPY } from "@/lib/copy";
import type { ChatState } from "@/components/AskPanel";
import type { ChatStep, Snapshot } from "@/lib/types";
import { DEMO } from "./useChannel";

/** COPY §6's four step lines. The work really happens in this order — the model is sent the
 *  frame, its place, its local time and its age, then asked — so the labels describe stages
 *  rather than decorate a wait. Their timing is client-side because the action answers in one
 *  call; what each one claims is true. */
const STEP_MS = [700, 900, 900];

export type Ask = {
  state: ChatState;
  question: string;
  answer: string;
  steps: ChatStep[];
  seconds: string;
  /** snapshotId -> snapshot, for the place chips in an answer (T-05). */
  places: Record<string, Snapshot>;
  /** The model that answered, rendered as data beside the step count. */
  servedBy: string | null;
  ask: (text: string) => void;
  stop: () => void;
};

/** Turn every place the answer names into a chip the globe can fly to.
 *
 *  UI-SPEC's place-chip rule wants a resolver service; what exists today is the running order,
 *  which is the set of places the channel can actually show. Matching against it means a chip
 *  only ever appears when clicking it will resolve to a real frame — a chip that flew the globe
 *  to nothing would be worse than plain text. */
/** Fold one character to its plain-ASCII base, keeping the string the same length so that an
 *  index into the folded text is an index into the original. A model writes "Santorini" and
 *  "Tromso"; the channel calls them "Santoríni" and "Tromsø", and without this the chip rule
 *  silently never fires. */
const ODD: Record<string, string> = { ø: "o", Ø: "O", æ: "a", Æ: "A", œ: "o", Œ: "O", ð: "d", Ð: "D", þ: "t", Þ: "T", ł: "l", Ł: "L", ß: "s" };
function fold(text: string): string {
  return [...text]
    .map((ch) => {
      if (ODD[ch]) return ODD[ch];
      const base = ch.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
      return base.length === 1 ? base : ch;
    })
    .join("");
}

const WORDISH = /[\p{L}\p{N}_]/u;

/** Turn every place the answer names into a chip the globe can fly to.
 *
 *  UI-SPEC's place-chip rule wants a resolver service; what exists today is the running order,
 *  which is the set of places the channel can actually show. Matching against it means a chip
 *  only ever appears when clicking it will resolve to a real frame — a chip that flew the globe
 *  to nothing would be worse than plain text. */
function linkPlaces(answer: string, candidates: Snapshot[]): { text: string; places: Record<string, Snapshot> } {
  const places: Record<string, Snapshot> = {};
  let text = answer;
  const taken = new Set<string>();
  // Longest names first, so "New York" is matched before "York" could be.
  for (const s of [...candidates].sort((a, b) => b.place.name.length - a.place.name.length)) {
    const name = s.place.name;
    if (!name || taken.has(fold(name).toLowerCase())) continue;
    const hay = fold(text).toLowerCase();
    const needle = fold(name).toLowerCase();
    let at = -1;
    for (let from = 0; ; ) {
      const i = hay.indexOf(needle, from);
      if (i === -1) break;
      const before = i > 0 ? hay[i - 1] : "";
      const after = hay[i + needle.length] ?? "";
      // Not inside a word, and not inside a link we already wrote.
      if (!WORDISH.test(before) && !WORDISH.test(after) && before !== "[" && before !== "#") {
        at = i;
        break;
      }
      from = i + needle.length;
    }
    if (at === -1) continue;
    taken.add(needle);
    places[s.snapshotId] = s;
    // Slice from the ORIGINAL text, so the chip keeps the answer's own spelling.
    const label = text.slice(at, at + name.length);
    text = `${text.slice(0, at)}[${label}](#place:${s.snapshotId})${text.slice(at + name.length)}`;
  }
  return { text, places };
}

/** What the question is ABOUT. A pool frame and a country pulled off the globe are different
 *  tables, and the chat action takes whichever it is given; null means the cut, which is what
 *  the bar's own "Ask about this" means. */
export type AskSubject = { kind: "snapshot" | "story"; id: string } | null;

/** @param candidates every place a chip could resolve to. */
export function useAsk(candidates: Snapshot[], subject?: AskSubject): Ask {
  const askAction = useAction(api.chat.ask);
  const [state, setState] = useState<ChatState>("empty");
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [steps, setSteps] = useState<ChatStep[]>([]);
  const [seconds, setSeconds] = useState("0.0");
  const [places, setPlaces] = useState<Record<string, Snapshot>>({});
  const [servedBy, setServedBy] = useState<string | null>(null);
  const cancelled = useRef(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clearTimers = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };

  const ask = useCallback(
    (text: string) => {
      const q = text.trim();
      if (!q) return;
      cancelled.current = false;
      clearTimers();
      setQuestion(q);
      setAnswer("");
      setPlaces({});
      setServedBy(null);
      setState("steps");

      const labels = [...COPY.chat.steps];
      setSteps(labels.slice(0, 1).map((label) => ({ label, state: "active" as const })));
      let at = 0;
      STEP_MS.forEach((ms, i) => {
        at += ms;
        timers.current.push(
          setTimeout(() => {
            if (cancelled.current) return;
            setSteps(labels.slice(0, i + 2).map((label, k) => ({ label, state: (k === i + 1 ? "active" : "done") as ChatStep["state"] })));
          }, at),
        );
      });

      const started = Date.now();
      if (DEMO || !convex) {
        // Demo mode has no director to ask, and inventing an answer would be the exact thing
        // this product refuses to do elsewhere.
        timers.current.push(
          setTimeout(() => {
            if (cancelled.current) return;
            setSteps(labels.map((label) => ({ label, state: "done" as const })));
            setAnswer(COPY.chat.errorTitle);
            setState("error");
          }, 900),
        );
        return;
      }

      // The frame the viewer has open, not whatever the director happens to be showing — and a
      // country pulled up off the globe counts, which it did not until 2026-09-21.
      askAction({
        question: q,
        ...(subject?.kind === "snapshot" ? { snapshotId: subject.id as never } : {}),
        ...(subject?.kind === "story" ? { storyId: subject.id as never } : {}),
      })
        .then((r) => {
          if (cancelled.current) return;
          clearTimers();
          setSeconds(((Date.now() - started) / 1000).toFixed(1));
          setSteps(labels.map((label) => ({ label, state: "done" as const })));
          setServedBy(r.servedBy ?? null);
          if (!r.text || r.error) {
            setAnswer(r.text || COPY.chat.errorTitle);
            setState("error");
            return;
          }
          const linked = linkPlaces(r.text, candidates);
          setAnswer(linked.text);
          setPlaces(linked.places);
          setState(Object.keys(linked.places).length ? "answered" : "nochips");
        })
        .catch(() => {
          if (cancelled.current) return;
          clearTimers();
          setAnswer(COPY.chat.errorTitle);
          setState("error");
        });
    },
    [askAction, candidates, subject],
  );

  const stop = useCallback(() => {
    cancelled.current = true;
    clearTimers();
    setState("stopped");
  }, []);

  return { state, question, answer, steps, seconds, places, servedBy, ask, stop };
}
