#!/usr/bin/env python3
"""demokit/qa.py — objective checks on build/final.mp4 before anyone sees it.

  python3 qa.py storyboard.json [--asr]      # -> build/qa.json + build/sheet_*.jpg contact sheets

Checks: duration vs target, loudness (-14 LUFS, TP <= -1), frozen video > 3 s, black frames,
narration gaps > 2.5 s (dead air), words/minute, and with --asr a Whisper transcript of the final
mix compared to the script (catches mispronounced brand names and music drowning the voice).
"""
import argparse, json, os, re, subprocess, sys
import numpy as np, cv2


def sh(cmd):
    return subprocess.run(cmd, capture_output=True, text=True).stderr


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("storyboard"); ap.add_argument("--asr", action="store_true")
    ap.add_argument("--video", default="build/final.mp4"); ap.add_argument("--every", type=float, default=4.0)
    o = ap.parse_args()
    base = os.path.dirname(os.path.abspath(o.storyboard))
    sb = json.load(open(o.storyboard))
    vid = os.path.join(base, o.video)
    rep, issues = {}, []
    dur = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", vid], capture_output=True, text=True).stdout)
    rep["duration"] = round(dur, 2)
    tgt = sb["project"].get("target_seconds")
    cap = sb["project"].get("max_seconds", 180)
    if dur > cap:
        issues.append("OVER LIMIT: %.1fs > %ss" % (dur, cap))
    if tgt and abs(dur - tgt) > max(6, .1 * tgt):
        issues.append("duration %.1fs is off target %ss" % (dur, tgt))
    e = sh(["ffmpeg", "-hide_banner", "-nostats", "-i", vid, "-af", "ebur128=peak=true", "-f", "null", "-"])
    I = re.findall(r"I:\s+(-?[\d.]+) LUFS", e); TP = re.findall(r"Peak:\s+(-?[\d.]+) dBFS", e)
    rep["lufs"] = float(I[-1]) if I else None; rep["true_peak"] = float(TP[-1]) if TP else None
    if rep["lufs"] is not None and abs(rep["lufs"] + 14) > 1.5:
        issues.append("loudness %.1f LUFS (want -14)" % rep["lufs"])
    fz = sh(["ffmpeg", "-hide_banner", "-i", vid, "-vf", "freezedetect=n=0.0015:d=3", "-map", "0:v", "-f", "null", "-"])
    fr = [(float(a), float(b)) for a, b in zip(re.findall(r"freeze_start: ([\d.]+)", fz), re.findall(r"freeze_end: ([\d.]+)", fz))]
    rep["frozen"] = fr
    for a, b in fr:
        issues.append("static picture %.1f-%.1fs (%.1fs) - add motion, a zoom, or cut" % (a, b, b - a))
    bk = sh(["ffmpeg", "-hide_banner", "-i", vid, "-vf", "blackdetect=d=0.4:pix_th=0.06", "-map", "0:v", "-f", "null", "-"])
    blacks = [(float(a), float(b)) for a, b in re.findall(r"black_start:([\d.]+) black_end:([\d.]+)", bk)]
    rep["black"] = [x for x in blacks if x[0] > .5 and x[1] < dur - 1]
    for a, b in rep["black"]:
        issues.append("black frames %.1f-%.1fs" % (a, b))
    tl = json.load(open(os.path.join(base, "build", "timeline.json")))
    timing = json.load(open(os.path.join(base, "voice", "timing.json")))
    speech = []
    for d in tl:
        for w in timing.get(d["id"], {}).get("words", []):
            speech.append((d["narr"] + w[1], d["narr"] + w[2]))
    speech.sort()
    gaps, last = [], 0.0
    silent_ok = {d["id"] for d in tl if any(a.get("do") == "hold" for a in next(s for s in sb["scenes"] if s["id"] == d["id"]).get("actions", []))}
    for a, b in speech:
        if a - last > 2.5:
            if not any(d["id"] in silent_ok and d["t0"] < a and d["t1"] > last for d in tl):
                gaps.append((round(last, 1), round(a, 1)))
        last = max(last, b)
    rep["narration_gaps"] = gaps
    for a, b in gaps:
        issues.append("no narration %.1f-%.1fs (%.1fs dead air)" % (a, b, b - a))
    nw = sum(len(timing[k]["words"]) for k in timing)
    rep["wpm_overall"] = round(60 * nw / dur)
    # contact sheets
    cap_ = cv2.VideoCapture(vid)
    tiles, t = [], 0.0
    while t < dur:
        cap_.set(cv2.CAP_PROP_POS_MSEC, t * 1000)
        ok, f = cap_.read()
        if ok:
            f = cv2.resize(f, (640, 360), interpolation=cv2.INTER_AREA)
            cv2.rectangle(f, (0, 0), (92, 34), (0, 0, 0), -1)
            cv2.putText(f, "%5.1f" % t, (6, 25), cv2.FONT_HERSHEY_SIMPLEX, .8, (80, 255, 255), 2)
            tiles.append(f)
        t += o.every
    sheets = []
    for k in range(0, len(tiles), 12):
        grp = tiles[k:k + 12]
        while len(grp) % 3:
            grp.append(np.zeros_like(tiles[0]))
        p = os.path.join(base, "build", "sheet_%d.jpg" % (k // 12))
        cv2.imwrite(p, np.vstack([np.hstack(grp[i:i + 3]) for i in range(0, len(grp), 3)]), [cv2.IMWRITE_JPEG_QUALITY, 82])
        sheets.append(p)
    rep["sheets"] = sheets
    if o.asr:
        from faster_whisper import WhisperModel
        m = WhisperModel(os.environ.get("DEMOKIT_ASR", "base.en"), device="cpu", compute_type="int8")
        segs, _ = m.transcribe(vid, language="en", word_timestamps=False)
        heard = " ".join(s.text for s in segs)
        norm = lambda x: re.sub(r"[^a-z0-9 ]", " ", x.lower()).split()
        said = []
        for s in sb["scenes"]:
            said += norm(re.sub(r"\[\[[\d.]+\]\]", "", s.get("say", "")))
        hn = norm(heard)
        skip = set(norm(sb["project"].get("name", "") + " " + " ".join(sb.get("pronounce", {}))))  # invented words
        import difflib
        sm = difflib.SequenceMatcher(a=said, b=hn, autojunk=False)
        miss, diffs = 0, []
        for op, i1, i2, j1, j2 in sm.get_opcodes():
            if op in ("replace", "delete"):
                a_ = [w for w in said[i1:i2] if w not in skip]
                b_ = " ".join(hn[j1:j2])
                # ignore pure formatting differences: "assembly ai" vs "assemblyai", "2" vs "two"
                NUM = r"(?:\d+|zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|twenty|thirty|forty|fifty|hundred|thousand|percent)"
                if a_ and all(re.fullmatch(NUM, w) for w in a_ + b_.split()):
                    continue                                    # "ten" vs "10": formatting, not pronunciation
                if a_ and "".join(a_) != b_.replace(" ", ""):
                    miss += len(a_)
                    diffs.append("said '%s' -> heard '%s'" % (" ".join(said[i1:i2]), b_))
        cover = 1 - miss / max(1, len(said))
        rep["asr_text"] = heard
        rep["asr_mismatches"] = diffs
        rep["asr_word_coverage"] = round(cover, 3)
        if cover < .9:
            issues.append("only %.0f%% of script words recognised by ASR - voice unclear or music too loud" % (100 * cover))
        real = [d for d in diffs if len(d) < 90]
        if real:
            issues.append("check pronunciation (ASR mismatches, some may be harmless): " + "; ".join(real[:8]))
    rep["issues"] = issues
    json.dump(rep, open(os.path.join(base, "build", "qa.json"), "w"), indent=1)
    print(json.dumps({k: v for k, v in rep.items() if k != "asr_text"}, indent=1))


if __name__ == "__main__":
    main()
