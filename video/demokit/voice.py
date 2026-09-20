#!/usr/bin/env python3
"""demokit/voice.py — narration with Kokoro (local, free) + word timings for captions and sync.

  python3 voice.py storyboard.json            # -> voice/<scene>.wav (48 kHz) + voice/timing.json
  python3 voice.py --line "text" --voice af_heart --out x.wav   # audition one line

Per scene `say` text. Inline pause: "[[0.6]]" inserts 0.6 s of silence. `pronounce` map in the storyboard
fixes brand names for the voice only (captions keep the written form).
"""
import argparse, json, os, re, sys
import numpy as np, soundfile as sf
from scipy.signal import resample_poly

MODEL_DIR = os.path.expanduser("~/.cache/demokit/kokoro")
SR = 48000
_k = None


def kokoro():
    global _k
    if _k is None:
        from kokoro_onnx import Kokoro
        _k = Kokoro(os.path.join(MODEL_DIR, "kokoro-v1.0.onnx"), os.path.join(MODEL_DIR, "voices-v1.0.bin"))
    return _k


def spoken(text, pron):
    for k, v in (pron or {}).items():
        text = re.sub(r"\b%s\b" % re.escape(k), v, text)
    return text


def sentences(text):
    return [x for x in re.split(r"(?<=[.!?])\s+", text.strip()) if x]


def weight(w):
    return max(1, len(re.sub(r"[^\w]", "", w))) + 4 * len(re.findall(r"\d", w))


def synth(text, voice, speed, pron):
    """-> audio(48k float32), words [[word, start, end]] in seconds (display words)."""
    k = kokoro()
    a, sr, tim = k.create_timed(spoken(text, pron), voice=voice, speed=speed, lang="en-us")
    a = resample_poly(a, 2, 1).astype(np.float32) if sr == 24000 else a
    # phoneme stream -> sentence spans (by . ! ?)
    spans, cur = [], None
    for t in tim:
        if t.phoneme.strip() and cur is None:
            cur = t.start
        if t.phoneme in ".!?" and cur is not None:
            spans.append((cur, t.start)); cur = None
    if cur is not None:
        spans.append((cur, tim[-1].end if tim else len(a) / SR))
    sents = sentences(text)
    if len(spans) != len(sents):                       # fall back to one span for the whole line
        spans = [(tim[0].start if tim else 0, tim[-1].end if tim else len(a) / SR)]
        sents = [text]
    words = []
    for (s0, s1), sent in zip(spans, sents):
        ws = sent.split()
        tot = sum(weight(w) for w in ws)
        t = s0
        for w in ws:
            d = (s1 - s0) * weight(w) / tot
            words.append([w, round(t, 3), round(t + d, 3)])
            t += d
    return a, words


def render_line(text, voice, speed, pron):
    parts = re.split(r"\[\[([\d.]+)\]\]", text)
    audio, words, t = [], [], 0.0
    for i, p in enumerate(parts):
        if i % 2 == 1:
            n = int(float(p) * SR)
            audio.append(np.zeros(n, np.float32)); t += n / SR
            continue
        if not p.strip():
            continue
        a, ws = synth(p.strip(), voice, speed, pron)
        words += [[w, round(s + t, 3), round(e + t, 3)] for w, s, e in ws]
        audio.append(a); t += len(a) / SR
    return (np.concatenate(audio) if audio else np.zeros(1, np.float32)), words


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("storyboard", nargs="?")
    ap.add_argument("--line"); ap.add_argument("--voice", default="af_heart")
    ap.add_argument("--speed", type=float, default=1.0); ap.add_argument("--out", default="line.wav")
    o = ap.parse_args()
    if o.line:
        a, w = render_line(o.line, o.voice, o.speed, {})
        sf.write(o.out, a, SR); print("%.2fs" % (len(a) / SR), w); return
    sb = json.load(open(o.storyboard))
    base = os.path.dirname(os.path.abspath(o.storyboard))
    st = sb.get("style", {})
    voice, speed, pron = st.get("voice", "af_heart"), st.get("speed", 0.94), sb.get("pronounce", {})
    os.makedirs(os.path.join(base, "voice"), exist_ok=True)
    timing, total, words_total = {}, 0.0, 0
    for sc in sb["scenes"]:
        if not sc.get("say"):
            continue
        a, words = render_line(sc["say"], sc.get("voice", voice), sc.get("speed", speed), pron)
        pk = np.abs(a).max()
        if pk > 0:
            a = a / pk * 0.89
        path = os.path.join(base, "voice", sc["id"] + ".wav")
        sf.write(path, a, SR)
        d = len(a) / SR
        timing[sc["id"]] = {"wav": path, "dur": round(d, 3), "words": words}
        n = len(re.sub(r"\[\[[\d.]+\]\]", "", sc["say"]).split())
        total += d; words_total += n
        print("%-14s %5.2fs  %3d words  %4.0f wpm" % (sc["id"], d, n, 60 * n / max(d, .1)))
    for sc in sb["scenes"]:                         # optional extra voices, e.g. the "user" speaking into a mic
        for a in sc.get("actions", []):
            if a.get("mic_say"):
                au, _ = render_line(a["mic_say"], a.get("mic_voice", "am_michael"), 1.0, pron)
                au = np.concatenate([np.zeros(int(1.3 * SR)), au / max(1e-6, np.abs(au).max()) * .8, np.zeros(int(.8 * SR))])
                p = os.path.join(base, a.get("mic_file", "mic.wav"))
                sf.write(p, (au * 32767).astype(np.int16), SR, subtype="PCM_16")
                print("mic utterance -> %s (%.1fs; hold >= %.0f ms)" % (p, len(au) / SR, len(au) / SR * 1000 + 1500))
    json.dump(timing, open(os.path.join(base, "voice", "timing.json"), "w"), indent=1)
    print("TOTAL narration %.1fs, %d words, %.0f wpm" % (total, words_total, 60 * words_total / max(total, .1)))


if __name__ == "__main__":
    main()
