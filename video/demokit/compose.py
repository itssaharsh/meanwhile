#!/usr/bin/env python3
"""demokit/compose.py — the editor: time-map footage to narration, camera, cursor, captions, cards, audio.

  python3 compose.py storyboard.json [--preview]    # -> build/final.mp4 (+ captions.srt, timeline.json)
  --preview renders 960x540 @15fps for a fast check.
"""
import argparse, bisect, json, math, os, re, subprocess, sys, time
import numpy as np, cv2, soundfile as sf

cv2.setNumThreads(2)
W, H, SR = 1920, 1080, 48000


def ease_out(t):
    t = min(1, max(0, t)); return 1 - (1 - t) ** 4


def ease_io(t):
    t = min(1, max(0, t)); return 4 * t ** 3 if t < .5 else 1 - (-2 * t + 2) ** 3 / 2


def smooth(t):
    t = min(1, max(0, t)); return t * t * (3 - 2 * t)


def find_word(words, key, after=0.0):
    key = re.sub(r"\W", "", key.split()[0]).lower()
    for w in words:
        if w[1] >= after - 1e-6 and re.sub(r"\W", "", w[0]).lower().startswith(key):
            return w
    print("  warn: sync word %r not in narration" % key)
    return None


# ---------------------------------------------------------------- timeline
class Live:
    """One recorded scene: output-time <-> page-time map (ms) built from the action log."""

    def __init__(s, sc, ev, T, lead, N, words):
        s.sc, s.ev, s.T = sc, ev, T
        s.honest = sc.get("_honest", False)
        segs = []                                                # [dur_s, src0_ms, src1_ms, kind, meta]
        cur = ev["t0"]
        out = lambda: T + sum(x[0] for x in segs)
        narr0 = T + lead

        def add(a, b, speed=1.0, kind="play", meta=None):
            if b > a:
                segs.append([(b - a) / 1000 / speed, a, b, kind, meta])

        def absorb(late):                                       # speed up earlier waits to hit a sync word
            for x in reversed(segs):
                if x[3] == "wait" and late > 0:
                    r = min(late, x[0] - .35)
                    if r > 0:
                        x[0] -= r; late -= r
            return late

        wafter = 0.0
        for a in ev["actions"]:
            if a["t0"] > cur:
                add(cur, a["t0"])
            cur = a["t0"]
            if a.get("at") and a.get("key") is not None and words:
                w = find_word(words, a["at"], wafter)
                if w:
                    wafter = w[1]
                    target = narr0 + w[1] - .12
                    natural = out() + (a["key"] - a["t0"]) / 1000
                    if natural < target - .03:
                        segs.append([target - natural, cur, cur, "hold", None])
                    elif natural > target + .2:
                        left = absorb(natural - target)
                        if left > .35:
                            print("  warn: [%s] action %d lands %.1fs after '%s'" % (sc["id"], a["i"], left, a["at"]))
            if a.get("compress"):
                D = (a["t1"] - a["t0"]) / 1000
                od = D if D <= .8 else max(.7, min(sc.get("wait_max", 1.6), D / 3))
                if s.honest:                                    # rules ban speed-ups: jump-cut to the end at 1x
                    add(a["t1"] - od * 1000, a["t1"], 1.0, "play")
                else:
                    add(a["t0"], a["t1"], D / od, "wait", {"wall_s": a.get("wall_s", D)})
            elif a["do"] == "type" and a.get("type_end"):
                add(a["t0"], a["key"])
                D = (a["type_end"] - a["key"]) / 1000
                add(a["key"], a["type_end"], max(1.0, min(2.5, D / 2.5)), "type")
                add(a["type_end"], a["t1"])
            else:
                add(a["t0"], a["t1"])
            cur = a["t1"]
        add(cur, ev["t1"])
        need = narr0 + N + sc.get("tail", .45) - out()
        if need > 0:
            segs.append([need, ev["t1"], ev["t1"], "hold", "end"])
        over = out() - (narr0 + N)
        if over > 3 and not any(a["do"] == "hold" for a in ev["actions"]):
            print("  warn: [%s] footage runs %.1fs past the narration - add a sentence or trim" % (sc["id"], over))
        t = T
        s.segs = []
        for d, a, b, k, m in segs:
            s.segs.append((t, t + d, a, b, k, m)); t += d
        s.dur = t - T
        s.o0 = [x[0] for x in s.segs]

    def src(s, t):
        i = max(0, bisect.bisect_right(s.o0, t) - 1)
        o0, o1, a, b, k, m = s.segs[i]
        if b == a or o1 <= o0:
            return a, s.segs[i]
        return a + (min(t, o1) - o0) / (o1 - o0) * (b - a), s.segs[i]

    def out(s, src):
        best = None
        for o0, o1, a, b, k, m in s.segs:
            if b > a and a <= src <= b:
                t = o0 + (src - a) / (b - a) * (o1 - o0)
            elif b == a and abs(src - a) < .5 and m != "end":
                t = o1                                          # a sync hold at this instant: land after it
            else:
                continue
            best = t if best is None else max(best, t)
        return best


def build(sb, timing, events):
    scenes, T = [], 0.0
    for i, sc in enumerate(sb["scenes"]):
        typ = sc.get("type", "live")
        nar = timing.get(sc["id"])
        N = nar["dur"] if nar else 0.0
        words = nar["words"] if nar else []
        lead = sc.get("lead", .25 if i == 0 else .4)
        if scenes and "lead" not in sc and typ == "live" and scenes[-1]["type"] == "live" and scenes[-1]["words"] \
                and abs(events["scenes"][sc["id"]]["t0"] - events["scenes"][scenes[-1]["id"]]["t1"]) < 80:
            # J-cut: in continuous footage, start talking as soon as the previous line ends (no dead air)
            prev_end = scenes[-1]["narr"] + scenes[-1]["words"][-1][2]
            lead = min(lead, max(-2.5, prev_end + .35 - T))
        d = dict(id=sc["id"], type=typ, sc=sc, t0=T, narr=T + lead, N=N, words=words)
        if typ == "live":
            sc["_honest"] = sb.get("style", {}).get("honest_speed", False)
            ev = events["scenes"][sc["id"]]
            acts = [a for a in sc.get("actions", []) if not a.get("offscreen")]
            for e in ev["actions"]:
                if e["i"] < len(acts) and acts[e["i"]]["do"] == e["do"]:
                    for k in ("at", "zoom"):
                        if k in acts[e["i"]]:
                            e[k] = acts[e["i"]][k]
                        else:
                            e.pop(k, None)
                e.setdefault("key", e["t0"])
            first = next((a for a in ev["actions"] if a.get("at") and a.get("key") is not None), None)
            if first and words and "lead" not in sc:               # start talking a beat later rather than click late
                w = find_word(words, first["at"])
                if w:
                    need = (first["key"] - ev["t0"]) / 1000 - (w[1] - .12)
                    if need > lead:
                        lead = min(need, (.25 if i == 0 else .4) + 1.5)
                        d["narr"] = T + lead
            d["live"] = L = Live(sc, ev, T, lead, N, words)
            d["dur"] = L.dur
        elif typ == "clip":
            d["dur"] = max(sc.get("dur", 3.0), lead + N + sc.get("tail", .4))
        else:
            d["dur"] = max(sc.get("dur", 0), lead + N + sc.get("tail", .6), 2.0)
        d["t1"] = T + d["dur"]
        T = d["t1"]
        scenes.append(d)
    for a, b in zip(scenes, scenes[1:]):                        # continuous live->live footage = no transition
        cont = a["type"] == b["type"] == "live" and abs(events["scenes"][b["id"]]["t0"] - events["scenes"][a["id"]]["t1"]) < 80
        a["cut"] = "none" if cont else b["sc"].get("transition", "fade")
    scenes[-1]["cut"] = "end"
    return scenes, T


# ---------------------------------------------------------------- camera
class Camera:
    def __init__(s, g, st, scenes, events):
        s.g, s.st = g, st
        vw, vh = st.get("viewport", [1280, 720])
        s.k = g["cw"] / vw                                      # canvas px per css px
        s.ox, s.oy = g["wx"], g["wy"] + g["bar"]
        s.wide = (W / 2, H / 2, 1.0)
        s.ev = []                                                # (t, cx, cy, z, dur, ease)
        for d in scenes:
            if d["type"] != "live":
                continue
            L = d["live"]
            prev = [x for x in scenes if x["t1"] <= d["t0"] + 1e-6]
            if not prev or prev[-1].get("cut") != "none":
                s.ev.append((d["t0"] - .01, W / 2, H / 2, 1.0, .001, ease_out))
            for a in L.ev["actions"]:
                z = a.get("zoom")
                key = a.get("key")
                if key is None:
                    continue
                t = L.out(key) or d["t0"]
                if a["do"] == "scroll" and z is None:
                    z = "out"
                if z is None:
                    continue
                if z == "out" or z == 1:
                    s.ev.append((t - .15, W / 2, H / 2, 1.0, .9, ease_io)); continue
                b = a.get("focus_box") or a.get("box")
                if not b:
                    continue
                cx, cy, bw, bh = s.box(b)
                if z == "fit":
                    z = max(1.0, min(2.2, .78 * W / max(bw, 1), .78 * H / max(bh, 1)))
                s.ev.append((t - .35, cx, cy, float(z), 1.0, ease_out))
        s.ev.sort(key=lambda e: e[0])
        s.st_at = []
        cur = s.wide
        for i, e in enumerate(s.ev):                             # state at each event start (interrupt-safe)
            if i:
                cur = s._eval(i - 1, e[0])
            s.st_at.append(cur)
        s.times = [e[0] for e in s.ev]

    def box(s, b):
        return (s.ox + (b["x"] + b["width"] / 2) * s.k, s.oy + (b["y"] + b["height"] / 2) * s.k, b["width"] * s.k, b["height"] * s.k)

    def _eval(s, i, t):
        t0, cx, cy, z, dur, ez = s.ev[i]
        a = s.st_at[i]
        p = ez((t - t0) / dur)
        if z >= 1.2 and t > t0 + dur:
            z *= 1 + .03 * (1 - math.exp(-(t - t0 - dur) / 4))
        lz = math.log(a[2]) + (math.log(z) - math.log(a[2])) * p
        return (a[0] + (cx - a[0]) * p, a[1] + (cy - a[1]) * p, math.exp(lz))

    def at(s, t):
        i = bisect.bisect_right(s.times, t) - 1
        cx, cy, z = s.wide if i < 0 else s._eval(i, t)
        return s.clamp(cx, cy, z)

    def clamp(s, cx, cy, z):
        g = s.g
        f = smooth((z - 1) / .25)
        L = f * g["wx"]; R = W - f * g["wx"]
        T = f * g["wy"]; B = H - f * (H - g["wy"] - g["bar"] - g["ch"])
        vw, vh = W / z, H / z
        cx = (L + R) / 2 if R - L <= vw else min(max(cx, L + vw / 2), R - vw / 2)
        cy = (T + B) / 2 if B - T <= vh else min(max(cy, T + vh / 2), B - vh / 2)
        return cx, cy, z


# ---------------------------------------------------------------- renderer
def load_rgba(p):
    im = cv2.imread(p, cv2.IMREAD_UNCHANGED)
    if im.shape[2] == 3:
        im = np.dstack([im, np.full(im.shape[:2], 255, np.uint8)])
    return im


def over(dst, rgba, x, y, alpha=1.0):
    """Alpha-composite rgba onto dst at integer x,y (clipped)."""
    h, w = rgba.shape[:2]
    x0, y0, x1, y1 = max(0, x), max(0, y), min(dst.shape[1], x + w), min(dst.shape[0], y + h)
    if x1 <= x0 or y1 <= y0 or alpha <= 0:
        return
    src = rgba[y0 - y:y1 - y, x0 - x:x1 - x]
    a = src[:, :, 3:4].astype(np.float32) * (alpha / 255.0)
    roi = dst[y0:y1, x0:x1]
    roi[:] = (src[:, :, :3] * a + roi * (1 - a)).astype(np.uint8)


class Renderer:
    def __init__(s, base, sb, scenes, events, ovl, preview=False):
        s.base, s.sb, s.scenes, s.ev, s.o = base, sb, scenes, events, ovl
        s.st = sb.get("style", {})
        s.g = ovl["geom"]
        od = os.path.join(base, "build", "overlays")
        s.backdrop = cv2.imread(os.path.join(od, "backdrop.png"))
        s.bg2 = cv2.imread(os.path.join(od, "bg.png"))
        s.mask2 = cv2.imread(os.path.join(od, "winmask.png"), cv2.IMREAD_GRAYSCALE)
        s.cursor = load_rgba(os.path.join(od, "cursor.png"))
        s.badge = load_rgba(os.path.join(od, "badge.png"))
        s.hot = ovl["cursor_hotspot"]
        s.cam = Camera(s.g, s.st, scenes, events)
        s.frames = np.array([f[0] for f in events["frames"]]) if events else np.zeros(1)
        s.files = [f[1] for f in events["frames"]] if events else []
        s.fdir = os.path.join(base, "rec", "frames")
        s.cache, s.bdcache = {}, (None, None, None)
        cur = np.array(events["cursor"]) if events else np.zeros((1, 4))
        s.cur = cur
        lm = np.zeros(len(cur), int)
        for i in range(1, len(cur)):
            lm[i] = i if abs(cur[i, 1] - cur[i - 1, 1]) + abs(cur[i, 2] - cur[i - 1, 2]) > .5 else lm[i - 1]
        s.lastmove = lm
        s.clicks = events.get("clicks", []) if events else []
        s.layers = {k: [dict(l, img=load_rgba(l["png"])) for l in v] for k, v in ovl["cards"].items()}
        s.caps = []
        for d in scenes:
            for c in ovl["captions"].get(d["id"], []):
                s.caps.append(dict(c, t0=d["narr"] + c["start"], t1=d["narr"] + c["end"] + .15, img=load_rgba(c["png"])))
        s.caps.sort(key=lambda c: c["t0"])
        for a, b in zip(s.caps, s.caps[1:]):
            if b["t0"] - a["t1"] < .35:
                a["t1"] = b["t0"]

    # -- source frames
    def frame(s, src_ms):
        i = int(np.searchsorted(s.frames, src_ms + .5, "right") - 1)
        i = min(max(i, 0), len(s.frames) - 1)
        a = s.img(s.files[i])
        if i + 1 < len(s.frames) and s.files[i + 1] != s.files[i]:
            gap = s.frames[i + 1] - s.frames[i]
            if gap > 45:                                         # sparse (wall-clock) capture: cross-blend
                f = (src_ms - s.frames[i]) / gap
                if f > .02:
                    return cv2.addWeighted(a, 1 - f, s.img(s.files[i + 1]), f, 0)
        return a

    def img(s, n):
        if n not in s.cache:
            if len(s.cache) > 6:
                s.cache.pop(next(iter(s.cache)))
            s.cache[n] = cv2.imread(os.path.join(s.fdir, "%06d.jpg" % n))
        return s.cache[n]

    # -- camera-warped backdrop (cached while the camera is still)
    def backdrop_at(s, cx, cy, z):
        key = (round(cx, 2), round(cy, 2), round(z, 4))
        if s.bdcache[0] == key:
            return s.bdcache[1].copy(), s.bdcache[2]
        M = np.float32([[z / 2, 0, W / 2 - z * cx], [0, z / 2, H / 2 - z * cy]])
        bd = cv2.warpAffine(s.backdrop, M, (W, H), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
        s.bdcache = (key, bd, M)
        return bd.copy(), M

    def live(s, L, t, override_t=None):
        src, seg = L.src(t)
        cx, cy, z = s.cam.at(t)
        if seg[4] == "hold" and seg[5] == "end" and L.sc.get("push", True):
            z *= 1 + .03 * smooth((t - seg[0]) / max(.5, seg[1] - seg[0]))
        g = s.g
        out, _ = s.backdrop_at(cx, cy, z)
        fr = s.frame(src)
        SW = fr.shape[1]
        k = z * g["cw"] / SW
        tx = (g["wx"] - cx) * z + W / 2
        ty = (g["wy"] + g["bar"] - cy) * z + H / 2
        still = s.bdcache[0] == getattr(s, "_lastkey", None)
        s._lastkey = s.bdcache[0]
        if k < .97:
            sm = cv2.resize(fr, (round(fr.shape[1] * k), round(fr.shape[0] * k)), interpolation=cv2.INTER_AREA)
            if still or abs(tx - round(tx)) + abs(ty - round(ty)) < .02:
                xi, yi = int(round(tx)), int(round(ty))
                h, w = sm.shape[:2]
                x0, y0, x1, y1 = max(0, xi), max(0, yi), min(W, xi + w), min(H, yi + h)
                out[y0:y1, x0:x1] = sm[y0 - yi:y1 - yi, x0 - xi:x1 - xi]
            else:
                cv2.warpAffine(sm, np.float32([[1, 0, tx], [0, 1, ty]]), (W, H), dst=out, flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_TRANSPARENT)
        else:
            cv2.warpAffine(fr, np.float32([[k, 0, tx], [0, k, ty]]), (W, H), dst=out, flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_TRANSPARENT)
        # rounded bottom corners
        r = int(math.ceil(g["r"] * z)) + 2
        bot = int(ty + g["ch"] * z)
        bd = s.bdcache[1]
        M = s.bdcache[2]
        for xc in (int(tx), int(tx + g["cw"] * z) - r):
            x0, y0 = max(0, xc), max(0, bot - r)
            x1, y1 = min(W, xc + r), min(H, bot + 1)
            if x1 > x0 and y1 > y0:
                Mp = M.copy(); Mp[0, 2] -= x0; Mp[1, 2] -= y0
                m = cv2.warpAffine(s.mask2, Mp, (x1 - x0, y1 - y0), flags=cv2.INTER_LINEAR).astype(np.float32)[:, :, None] / 255
                out[y0:y1, x0:x1] = (out[y0:y1, x0:x1] * m + bd[y0:y1, x0:x1] * (1 - m)).astype(np.uint8)
        s.draw_cursor(out, src, t, L, cx, cy, z)
        return out

    def to_screen(s, vx, vy, cx, cy, z):
        c = s.cam
        return (c.ox + vx * c.k - cx) * z + W / 2, (c.oy + vy * c.k - cy) * z + H / 2

    def draw_cursor(s, out, src, t, L, cx, cy, z):
        cur = s.cur
        i = int(np.searchsorted(cur[:, 0], src, "right") - 1)
        if i < 0:
            return
        j = min(i + 1, len(cur) - 1)
        f = 0 if j == i or cur[j, 0] == cur[i, 0] else min(1, (src - cur[i, 0]) / (cur[j, 0] - cur[i, 0]))
        vx = cur[i, 1] + (cur[j, 1] - cur[i, 1]) * f
        vy = cur[i, 2] + (cur[j, 2] - cur[i, 2]) * f
        idle = (src - cur[s.lastmove[i], 0]) / 1000
        alpha = cur[i, 3] * (1 - smooth((idle - 1.8) / .5))
        sx, sy = s.to_screen(vx, vy, cx, cy, z)
        for c in s.clicks:                                          # click ripple
            co = L.out(c[0])
            if co is not None and 0 <= t - co <= .5:
                p = (t - co) / .5
                rx, ry = s.to_screen(c[1], c[2], cx, cy, z)
                rad = (12 + 30 * ease_out(p)) * z ** .5
                ov = out.copy()
                cv2.circle(ov, (int(rx), int(ry)), int(rad), (255, 255, 255), max(2, int(3 * z ** .5)), cv2.LINE_AA)
                a = .55 * (1 - p)
                cv2.addWeighted(ov, a, out, 1 - a, 0, dst=out)
        if alpha <= .01:
            return
        press = 1.0
        for c in s.clicks:
            co = L.out(c[0])
            if co is not None and -.02 <= t - co <= .18:
                press = .84
        sc = 34 * z ** .55 / 120 * press
        key = round(sc, 3)
        spr = s.cache.get(("cur", key))
        if spr is None:
            spr = cv2.resize(s.cursor, None, fx=sc, fy=sc, interpolation=cv2.INTER_AREA)
            s.cache[("cur", key)] = spr
        over(out, spr, int(sx - s.hot[0] * sc), int(sy - s.hot[1] * sc), alpha)

    def card(s, d, t):
        out = s.clip(d, t) if d["type"] == "clip" else s.bgframe(t - d["t0"])
        lay = s.layers.get(d["id"], [])
        vis = 1.0
        if lay and d["type"] == "clip":                            # headline over brand-tinted blurred footage, then reveal
            hold = d["sc"].get("title_hold", min(2.6, d["dur"] * .55))
            r = 0.0 if d["sc"].get("reveal", True) is False else smooth((t - d["t0"] - hold) / .6)
            vis = 1 - r
            if r < 1:
                out = cv2.addWeighted(out, r, s.tint(out, t - d["t0"]), 1 - r, 0)
        for l in lay:
            if "ts" not in l:
                l["ts"] = d["t0"] + .2 + .13 * l["idx"]
                if l.get("at") and d["words"]:
                    w = find_word(d["words"], l["at"])
                    if w:
                        l["ts"] = d["narr"] + w[1] - .1
            ts = l["ts"]
            p = (t - ts) / .6
            if p <= 0:
                continue
            e = ease_out(p)
            over(out, l["img"], int(l["x"]), int(l["y"] + 26 * (1 - e) - 30 * (1 - vis)), min(1, p * 1.6) * vis)
        if d["type"] == "card":
            z = 1 + .035 * (t - d["t0"]) / max(d["dur"], 1)
            M = np.float32([[z, 0, W / 2 * (1 - z)], [0, z, H / 2 * (1 - z)]])
            out = cv2.warpAffine(out, M, (W, H), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
        return out

    def tint(s, fr, t):
        sm = cv2.resize(fr, (W // 8, H // 8), interpolation=cv2.INTER_AREA)
        sm = cv2.GaussianBlur(sm, (0, 0), 2.2)
        bl = cv2.resize(sm, (W, H), interpolation=cv2.INTER_LINEAR)
        return cv2.addWeighted(bl, .30, s.bgframe(t), .70, 0)

    def thumbnail(s):
        """Brand-tinted aha footage + the hook headline, no captions (text over sharp UI text reads badly)."""
        d = next((x for x in s.scenes if x["type"] == "clip" and s.layers.get(x["id"])), None)
        if d is None:
            return s.render(min(1.4, s.scenes[-1]["t1"] / 2), captions=False)
        out = s.tint(s.clip(d, d["t1"] - .05), 0)
        for l in s.layers[d["id"]]:
            over(out, l["img"], int(l["x"]), int(l["y"]))
        return out

    def bgframe(s, t):
        z = 1.0 + .015 * t / 10
        M = np.float32([[z / 2, 0, W / 2 - z * W / 2], [0, z / 2, H / 2 - z * H / 2]])
        return cv2.warpAffine(s.bg2, M, (W, H), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)

    def clip(s, d, t):
        sc = d["sc"]
        mk = s.ev["marks"].get(sc["from"])
        src_scene = next(x for x in s.scenes if x["type"] == "live" and
                         (x["id"] == sc["from"] or (mk is not None and x["live"].ev["t0"] <= mk <= x["live"].ev["t1"])))
        L = src_scene["live"]
        base_src = (mk if mk is not None else L.ev["t0"]) + sc.get("offset", 0) * 1000
        src = base_src + (t - d["t0"]) * 1000
        to = L.out(min(src, L.ev["t1"])) or L.segs[-1][1]
        return s.live(L, to)

    def caption_y(s, c):
        h = c["img"].shape[0]
        wb = s.g["wy"] + s.g["bar"] + s.g["ch"]
        low = wb + (H - wb - h) / 2 if H - wb > h + 16 else H - 40 - h
        for tt in (c["t0"] + .2, (c["t0"] + c["t1"]) / 2):
            d = next((x for x in s.scenes if x["t0"] <= tt < x["t1"]), None)
            if not d or d["type"] != "live":
                continue
            cx, cy, z = s.cam.at(tt)
            if z < 1.1:
                continue
            L = d["live"]
            src = L.src(tt)[0]
            i = int(np.searchsorted(s.cur[:, 0], src, "right") - 1)
            ys = []
            if i >= 0 and s.cur[i, 3]:
                ys.append(s.to_screen(s.cur[i, 1], s.cur[i, 2], cx, cy, z)[1])
            k = bisect.bisect_right(s.cam.times, tt) - 1
            if k >= 0:
                ys.append((s.cam.ev[k][2] - cy) * z + H / 2)
            if any(y > low - 40 for y in ys):
                return 36                                           # action is under the caption lane: go top
        return low

    def scene_frame(s, d, t):
        if d["type"] == "live":
            return s.live(d["live"], min(max(t, d["t0"]), d["t1"] - 1e-3))
        return s.card(d, min(max(t, d["t0"]), d["t1"] - 1e-3))

    def render(s, t, captions=True):
        idx = next((i for i, d in enumerate(s.scenes) if d["t0"] <= t < d["t1"]), len(s.scenes) - 1)
        d = s.scenes[idx]
        out = s.scene_frame(d, t)
        X = .22                                                      # half crossfade
        if d["cut"] == "fade" and t > d["t1"] - X and idx + 1 < len(s.scenes):
            n = s.scenes[idx + 1]
            a = smooth((t - (d["t1"] - X)) / (2 * X))
            out = cv2.addWeighted(out, 1 - a, s.scene_frame(n, n["t0"]), a, 0)
        elif idx > 0 and s.scenes[idx - 1]["cut"] == "fade" and t < d["t0"] + X:
            p = s.scenes[idx - 1]
            a = smooth((t - (d["t0"] - X)) / (2 * X))
            out = cv2.addWeighted(s.scene_frame(p, p["t1"] - 1e-3), 1 - a, out, a, 0)
        if d["type"] == "live":                                      # honest speed-up badge
            src, seg = d["live"].src(t)
            if seg[4] == "wait" and seg[1] - seg[0] >= .5 and seg[5]["wall_s"] >= 2 and seg[5]["wall_s"] / (seg[1] - seg[0]) > 1.8:
                p = min((t - seg[0]) / .2, (seg[1] - t) / .2, 1)
                over(out, s.badge, W - s.badge.shape[1] - 36, 36, max(0, p))
        for c in (s.caps if captions else []):
            if c["t0"] <= t < c["t1"]:
                a = min(1, (t - c["t0"]) / .12, (c["t1"] - t) / .12)
                if "y" not in c:
                    c["y"] = s.caption_y(c)
                over(out, c["img"], int(W / 2 - c["img"].shape[1] / 2), int(c["y"]), a)
        end = s.scenes[-1]["t1"]
        if t < .25:
            out = (out * smooth(t / .25)).astype(np.uint8)
        if t > end - .6:
            out = (out * smooth((end - t) / .6)).astype(np.uint8)
        return out


# ---------------------------------------------------------------- audio
def tone(sr, dur, f0, f1=None, noise=0.0, decay=30.0):
    n = int(sr * dur); t = np.arange(n) / sr
    f = f0 if f1 is None else f0 + (f1 - f0) * t / dur
    x = np.sin(2 * np.pi * np.cumsum(np.full(n, f) if np.isscalar(f) else f) / sr)
    if noise:
        x = x * (1 - noise) + np.random.default_rng(1).standard_normal(n) * noise
    env = np.minimum(1, t / .003) * np.exp(-t * decay)
    return (x * env).astype(np.float32)


def whoosh(sr, dur=.45):
    n = int(sr * dur); rng = np.random.default_rng(2)
    x = rng.standard_normal(n).astype(np.float32)
    from scipy.signal import butter, sosfilt
    out = np.zeros(n, np.float32)
    for k in range(8):                                               # sweeping band-pass
        a, b = k * n // 8, (k + 1) * n // 8
        fc = 400 + 3200 * (k / 7)
        sos = butter(2, [fc * .7, fc * 1.3], "bandpass", fs=sr, output="sos")
        out[a:b] = sosfilt(sos, x)[a:b]
    env = np.sin(np.pi * np.arange(n) / n) ** 2
    return out * env


def mix(base, sb, scenes, events, total, timing):
    st = sb.get("style", {})
    n = int(total * SR) + SR
    voice = np.zeros(n, np.float32); fx = np.zeros(n, np.float32)

    def put(buf, x, t, g=1.0):
        i = int(t * SR)
        if i < 0 or i >= n:
            return
        m = min(len(x), n - i)
        buf[i:i + m] += x[:m] * g

    for d in scenes:
        if d["id"] in timing and st.get("narration", "voice") != "captions_only":
            a, sr = sf.read(timing[d["id"]]["wav"], dtype="float32")
            put(voice, a if a.ndim == 1 else a.mean(1), d["narr"])
    for d in scenes:
        if d["type"] != "live":
            continue
        L = d["live"]
        for a in L.ev["actions"]:
            if a["do"] == "hold" and st.get("mic"):
                mic, sr = sf.read(os.path.join(base, st["mic"]), dtype="float32")
                t = L.out(a["hold_start_vt"])
                if t is not None:
                    put(voice, mic if mic.ndim == 1 else mic.mean(1), t + st.get("mic_offset", .15), .9)
    if st.get("sfx", True):
        click = tone(SR, .06, 2600, noise=.35, decay=70)
        key = tone(SR, .03, 3800, noise=.6, decay=140)
        for d in scenes:
            if d["type"] == "live":
                L = d["live"]
                for c in events["clicks"]:
                    t = L.out(c[0])
                    if t is not None and d["t0"] <= t < d["t1"]:
                        put(fx, click, t, .22)
                for k in events["keys"]:
                    t = L.out(k)
                    if t is not None and d["t0"] <= t < d["t1"]:
                        put(fx, key, t, .05 + .03 * np.random.rand())
            if d["type"] == "card" and d["t0"] > 0:
                put(fx, whoosh(SR), d["t0"] - .2, .06)
    music = np.zeros(n, np.float32)
    mp = st.get("music", "calm")
    if mp in ("calm", "chill", "upbeat"):                               # CC0 tracks fetched by setup.sh
        mp = os.path.expanduser("~/.cache/demokit/music/%s.mp3" % mp)
    elif mp and mp != "none":
        mp = mp if os.path.isabs(mp) else os.path.join(base, mp)
    if mp and os.path.exists(mp):
        raw = subprocess.run(["ffmpeg", "-v", "error", "-i", mp, "-ac", "1", "-ar", str(SR), "-f", "f32le", "-"], capture_output=True).stdout
        m = np.frombuffer(raw, np.float32).copy()
        m = m[int(st.get("music_start", 0) * SR):]
        while len(m) < n:                                          # loop with a 2 s crossfade
            xf = 2 * SR
            m = np.concatenate([m[:-xf], m[-xf:] * np.linspace(1, 0, xf) + m[:xf] * np.linspace(0, 1, xf), m[xf:]])
        m = m[:n]
        m /= max(1e-6, np.sqrt(np.mean(m[:int(total * SR)] ** 2)))
        # duck under narration: target -20 dB below voice while talking, -13 dB in the gaps
        act = np.zeros(n // 480 + 1, np.float32)
        for d in scenes:
            for w in d["words"]:
                act[int((d["narr"] + w[1] - .15) * 100):int((d["narr"] + w[2] + .25) * 100)] = 1
            if d["type"] == "live":
                for a in d["live"].ev["actions"]:
                    if a["do"] == "hold":
                        h0, h1 = d["live"].out(a["hold_start_vt"]), d["live"].out(a["hold_end_vt"] - 1)
                        if h0 and h1:
                            act[int(h0 * 100):int(h1 * 100)] = 1
        g = np.zeros_like(act); v = 0.0
        for i, x in enumerate(act):                               # attack 150 ms, release 700 ms
            v += (x - v) * (1 - math.exp(-1 / (15 if x > v else 70)))
            g[i] = v
        vr = np.sqrt(np.mean(voice[voice != 0] ** 2)) if np.any(voice) else .1
        if not np.any(voice):
            g[:] = 0                                            # no voice: music is the only bed, no ducking
        lvl = vr * 10 ** (st.get("music_db", -15) / 20)
        duck = 10 ** (-8 / 20)
        gain = np.interp(np.arange(n) / 480, np.arange(len(g)), lvl * (1 - g * (1 - duck)))
        env = np.minimum(1, np.arange(n) / (1.5 * SR)) * np.clip((total * SR - np.arange(n)) / (2.2 * SR), 0, 1)
        music = m * gain * env
    mixd = voice + fx + music
    mixd = mixd[:int(total * SR)]
    out = os.path.join(base, "build", "mix_raw.wav")
    sf.write(out, np.stack([mixd, mixd], 1), SR, subtype="FLOAT")
    return out


def loudnorm(inp, outp, I=-14.0):
    r = subprocess.run(["ffmpeg", "-hide_banner", "-i", inp, "-af", "loudnorm=I=%s:TP=-1.5:LRA=11:print_format=json" % I, "-f", "null", "-"],
                       capture_output=True, text=True).stderr
    js = json.loads(r[r.rindex("{"):r.rindex("}") + 1])
    af = ("loudnorm=I=%s:TP=-1.5:LRA=11:measured_I=%s:measured_TP=%s:measured_LRA=%s:measured_thresh=%s:offset=%s:linear=true"
          % (I, js["input_i"], js["input_tp"], js["input_lra"], js["input_thresh"], js["target_offset"]))
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", inp, "-af", af, "-ar", str(SR), outp], check=True)


# ---------------------------------------------------------------- main
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("storyboard"); ap.add_argument("--preview", action="store_true")
    ap.add_argument("--from", dest="t_from", type=float, default=0); ap.add_argument("--to", type=float)
    ap.add_argument("--still", type=float, nargs="*", help="only write PNG stills at these times")
    o = ap.parse_args()
    base = os.path.dirname(os.path.abspath(o.storyboard))
    sb = json.load(open(o.storyboard))
    timing = json.load(open(os.path.join(base, "voice", "timing.json")))
    evp = os.path.join(base, "rec", "events.json")
    events = json.load(open(evp)) if os.path.exists(evp) else {"scenes": {}, "frames": [], "marks": {}, "clicks": [], "keys": [], "cursor": []}
    ovl = json.load(open(os.path.join(base, "build", "overlays", "index.json")))
    scenes, total = build(sb, timing, events)
    bd = os.path.join(base, "build")
    print("timeline %.1fs:" % total)
    for d in scenes:
        print("  %-14s %-5s %6.2f -> %6.2f  (%.1fs, narration %.1fs)  cut=%s" % (d["id"], d["type"], d["t0"], d["t1"], d["dur"], d["N"], d.get("cut")))
    json.dump([{k: v for k, v in d.items() if k in ("id", "type", "t0", "t1", "narr", "N", "cut")} for d in scenes],
              open(os.path.join(bd, "timeline.json"), "w"), indent=1)
    R = Renderer(base, sb, scenes, events, ovl, o.preview)
    if o.still is not None:
        for t in o.still:
            p = os.path.join(bd, "still_%06.2f.png" % t)
            cv2.imwrite(p, R.render(t)); print(p)
        return
    with open(os.path.join(bd, "captions.srt"), "w") as f:
        for i, c in enumerate(R.caps):
            ts = lambda x: "%02d:%02d:%02d,%03d" % (x // 3600, x % 3600 // 60, x % 60, (x * 1000) % 1000)
            f.write("%d\n%s --> %s\n%s\n\n" % (i + 1, ts(c["t0"]), ts(c["t1"]), c["text"]))
    fps = 15 if o.preview else sb.get("style", {}).get("fps", 30)
    ow, oh = (960, 540) if o.preview else (W, H)
    t1 = o.to or total
    vid = os.path.join(bd, "video_preview.mp4" if o.preview else "video.mp4")
    enc = subprocess.Popen(["ffmpeg", "-y", "-v", "error", "-f", "rawvideo", "-pix_fmt", "bgr24", "-s", "%dx%d" % (ow, oh), "-r", str(fps), "-i", "-",
                            "-c:v", "libx264", "-preset", "veryfast" if o.preview else "medium", "-crf", "23" if o.preview else "17",
                            "-pix_fmt", "yuv420p", "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", vid], stdin=subprocess.PIPE)
    n = int((t1 - o.t_from) * fps)
    t_start = time.time()
    for i in range(n):
        t = o.t_from + i / fps
        fr = R.render(t)
        if o.preview:
            fr = cv2.resize(fr, (ow, oh), interpolation=cv2.INTER_AREA)
        enc.stdin.write(fr.tobytes())
        if i % (fps * 10) == 0:
            el = time.time() - t_start
            print("  %5.1fs / %.1fs  (%.0f ms/frame)" % (t, t1, 1000 * el / max(i, 1)), flush=True)
    enc.stdin.close(); enc.wait()
    th = sb.get("style", {}).get("thumbnail_t")
    cv2.imwrite(os.path.join(bd, "thumbnail.png"), R.render(th, captions=False) if th is not None else R.thumbnail())
    with open(os.path.join(bd, "script.md"), "w") as f:                  # teleprompter / submission notes
        f.write("# %s — demo script (%.0fs)\n\n" % (sb["project"].get("name", ""), total))
        for d in scenes:
            f.write("**%s** `%d:%04.1f` %s\n\n" % (d["id"], d["t0"] // 60, d["t0"] % 60, d["sc"].get("say", "*(no narration)*")))
    raw = mix(base, sb, scenes, events, total, timing)
    wav = os.path.join(bd, "mix.wav")
    loudnorm(raw, wav)
    final = os.path.join(bd, "final_preview.mp4" if o.preview else "final.mp4")
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", vid, "-ss", str(o.t_from), "-i", wav, "-map", "0:v", "-map", "1:a", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k",
                    "-shortest", "-movflags", "+faststart", final], check=True)
    print("done in %.0fs -> %s" % (time.time() - t_start, final))


if __name__ == "__main__":
    main()
