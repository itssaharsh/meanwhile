#!/usr/bin/env python3
"""demokit/run.py — execute a storyboard's live actions in Chromium.

  python3 run.py storyboard.json --probe            # fast real-time dry run, screenshot after every action
  python3 run.py storyboard.json                    # lockstep virtual-time recording -> rec/frames/*.jpg + rec/events.json

Lockstep: page time only advances when we tick, and every tick captures one frame, so output is a
perfect 30 fps no matter how slow the page renders (WebGL on CPU, heavy React, etc.).
"""
import argparse, asyncio, base64, json, math, os, random, sys, time
from playwright.async_api import async_playwright

HIDE_CSS = """nextjs-portal,#vercel-live-feedback,vercel-live-feedback,[data-nextjs-toast],#__next-build-watcher,
.intercom-lightweight-app,#crisp-chatbox,#hubspot-messages-iframe-container,#CybotCookiebotDialog,#onetrust-banner-sdk,
.cc-window,.cookie-banner,#cookie-banner,[aria-label="cookie banner"]{display:none!important}
*{scrollbar-width:none!important}::-webkit-scrollbar{display:none!important}"""


def ease_io(t):
    return 4 * t * t * t if t < .5 else 1 - (-2 * t + 2) ** 3 / 2


class Rec:
    def __init__(s, sb, base, probe=False):
        s.sb, s.base, s.probe = sb, base, probe
        s.st = sb.get("style", {})
        s.fps = s.st.get("fps", 30)
        s.step = 1000.0 / s.fps
        s.vw, s.vh = s.st.get("viewport", [1280, 720])
        s.dsf = s.st.get("dsf", 2)
        s.vt = 0.0                       # virtual ms since recording start
        s.frames, s.cur, s.clicks, s.waits, s.keys = [], [], [], [], []
        s.marks, s.scenes, s.camera, s.report = {}, {}, [], []
        s.cursor, s.cvis = (s.vw * .62, s.vh * .78), False
        s.capture, s.last_wall = False, time.time()
        s.rnd = random.Random(7)
        s.inflight, s.last_net = 0, time.time()
        s.out = os.path.join(base, "probe" if probe else "rec")
        if os.path.isdir(s.out):
            import shutil
            shutil.rmtree(s.out)                                # never mix old frames/screenshots with new ones
        os.makedirs(os.path.join(s.out, "frames"), exist_ok=True)

    # ---------- browser ----------
    async def start(s, pw):
        st = s.st
        args = ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream",
                "--autoplay-policy=no-user-gesture-required", "--hide-scrollbars", "--lang=en-US",
                "--force-device-scale-factor=%s" % s.dsf, "--window-size=%d,%d" % (s.vw, s.vh)]
        # WebGL on a CPU-only box renders at ~1 fps; off by default (recon.py checks the site still looks right)
        args += ["--disable-gpu", "--disable-software-rasterizer", "--disable-3d-apis"] if not st.get("gpu", False) \
            else ["--enable-unsafe-swiftshader"]
        if st.get("mic"):
            args.append("--use-file-for-fake-audio-capture=%s%%noloop" % os.path.abspath(os.path.join(s.base, st["mic"])))
        s.browser = await pw.chromium.launch(args=args)
        kw = dict(no_viewport=True,  # native DPR from --force-device-scale-factor => crisp 2x screencast frames
                  color_scheme=st.get("color_scheme", "no-preference"), ignore_https_errors=True, locale="en-US")
        if st.get("storage_state"):
            kw["storage_state"] = os.path.join(s.base, st["storage_state"])
        s.ctx = await s.browser.new_context(**kw)
        try:
            await s.ctx.grant_permissions(["microphone", "camera", "clipboard-read", "clipboard-write"],
                                          origin=s.sb["project"]["url"])
        except Exception:
            pass
        await s.ctx.add_init_script("(()=>{const f=()=>{const e=document.createElement('style');e.textContent=%s;"
                                    "(document.head||document.documentElement).appendChild(e)};"
                                    "document.readyState==='loading'?document.addEventListener('DOMContentLoaded',f):f()})()"
                                    % json.dumps(HIDE_CSS + st.get("css", "")))
        s.page = await s.ctx.new_page()
        s.page.on("request", lambda r: s._inc(1))
        s.page.on("requestfinished", lambda r: s._inc(-1))
        s.page.on("requestfailed", lambda r: s._inc(-1))
        s.cdp = await s.ctx.new_cdp_session(s.page)
        s.ev = asyncio.Event()
        s.cdp.on("Emulation.virtualTimeBudgetExpired", lambda e: s.ev.set())
        s.q = asyncio.Queue()
        s.cdp.on("Page.screencastFrame", s._on_frame)
        s.nfile, s.slow = 0, []

    def _on_frame(s, e):
        s.q.put_nowait(e["data"])
        asyncio.ensure_future(s.cdp.send("Page.screencastFrameAck", {"sessionId": e["sessionId"]}))

    async def start_capture(s):
        await s.cdp.send("Emulation.setVirtualTimePolicy", {"policy": "pause"})
        await s.cdp.send("Page.startScreencast", {"format": "jpeg", "quality": 92,
                                                   "maxWidth": int(s.vw * s.dsf), "maxHeight": int(s.vh * s.dsf)})
        # 1px heartbeat so every tick yields a fresh compositor frame (no ambiguity between "unchanged" and "slow")
        await s.page.evaluate("""()=>{if(window.__dk)return;const d=document.createElement('div');
          d.style.cssText='position:fixed;left:0;top:0;width:1px;height:1px;z-index:2147483647;pointer-events:none;opacity:.02;background:#000;animation:__dkp 1s linear infinite';
          const st=document.createElement('style');st.textContent='@keyframes __dkp{from{transform:translateX(0)}to{transform:translateX(1px)}}';
          document.documentElement.appendChild(st);document.documentElement.appendChild(d);
          let k=0;window.__dk=()=>{k^=1;d.style.background=k?'#010101':'#000'}}""")
        # ^ the running animation keeps the compositor producing frames under paused page time (static pages
        #   otherwise stop drawing, and frame-aligned input such as mousemove never gets dispatched)

    def _inc(s, d):
        s.inflight = max(0, s.inflight + d)
        s.last_net = time.time()

    # ---------- clock ----------
    async def tick(s, ms=None, capture=True):
        ms = ms or s.step
        grab = s.capture and capture and not s.probe
        if s.probe:
            await asyncio.sleep(min(ms, 40) / 1000)
        else:
            if grab:
                while not s.q.empty():
                    s.q.get_nowait()
                await s.cdp.send("Runtime.evaluate", {"expression": "window.__dk&&__dk()"})
            s.ev.clear()
            await s.cdp.send("Emulation.setVirtualTimePolicy", {"policy": "advance", "budget": ms})
            try:
                await asyncio.wait_for(s.ev.wait(), 30)
            except asyncio.TimeoutError:
                print("warn: virtual time budget did not expire in 30s", file=sys.stderr)
        s.vt += ms
        s.last_wall = time.time()
        if grab:
            t = time.time()
            try:
                data = await asyncio.wait_for(s.q.get(), 4.0)
                with open(os.path.join(s.out, "frames", "%06d.jpg" % s.nfile), "wb") as f:
                    f.write(base64.b64decode(data))
                s.nfile += 1
            except asyncio.TimeoutError:
                s.slow.append(round(s.vt))          # no new frame: reuse the previous file
            s.frames.append([round(s.vt, 2), max(0, s.nfile - 1)])
        s.cur.append([round(s.vt, 1), round(s.cursor[0], 1), round(s.cursor[1], 1), int(s.cvis)])

    async def tick_wall(s):
        """Advance page time by the real time that passed (for mic/media/network), 33..250 ms."""
        el = (time.time() - s.last_wall) * 1000
        await s.tick(max(s.step, min(250.0, el)))

    async def pump(s, coro, wall=True, timeout=45):
        """Run a Playwright call while ticking so rAF/timer-dependent calls never deadlock."""
        task = asyncio.ensure_future(coro)
        for _ in range(3):
            await asyncio.sleep(0)
        t0 = time.time()
        while not task.done():
            await (s.tick_wall() if wall else s.tick())
            await asyncio.sleep(0)
            if time.time() - t0 > timeout:
                task.cancel()
                raise TimeoutError("timed out: %r" % coro)
        return task.result()

    async def inp(s, coro, tick_after=False):
        """Dispatch input. Chrome aligns some input to animation frames, so with paused page time an
        awaited mouse.move can wait forever; fire it, tick until it lands (each tick is a real frame)."""
        task = asyncio.ensure_future(coro)
        for _ in range(3):
            await asyncio.sleep(0)
        if tick_after:
            await s.tick()
        n = 0
        while not task.done():
            await s.tick(); n += 1
            await asyncio.sleep(0)
            if n > 300:
                task.cancel(); raise TimeoutError("input never dispatched")
        return task.result()

    # ---------- helpers ----------
    def loc(s, sel):
        return s.page.locator(sel).filter(visible=True).first

    async def box(s, sel, scroll=True):
        loc = s.loc(sel)
        await s.pump(loc.wait_for(state="visible", timeout=20000))
        b = await s.pump(loc.bounding_box())
        if scroll and b and (b["y"] < 0 or b["y"] + b["height"] > s.vh):
            y = await s.page.evaluate("scrollY")
            await s.smooth_scroll(max(0, y + b["y"] - s.vh * .3), 900)
            b = await s.pump(loc.bounding_box())
        return b

    async def smooth_scroll(s, y1, ms=1100, container=None):
        get = "scrollY" if not container else "document.querySelector(%s).scrollTop" % json.dumps(container)
        y0 = await s.page.evaluate(get)
        n = max(2, int(ms / s.step))
        for i in range(1, n + 1):
            y = y0 + (y1 - y0) * ease_io(i / n)
            if container:
                await s.page.evaluate("(a)=>{document.querySelector(a[0]).scrollTop=a[1]}", [container, y])
            else:
                await s.page.evaluate("(y)=>window.scrollTo({top:y,behavior:'instant'})", y)
            await s.tick()

    async def move(s, x, y, ms=None):
        x0, y0 = s.cursor
        d = math.hypot(x - x0, y - y0)
        if d < 2:
            return
        ms = ms or max(380, min(950, 300 + 120 * math.log2(1 + d / 40)))
        n = max(3, round(ms / s.step))
        bow = s.rnd.uniform(-.14, .14) * d
        nx, ny = -(y - y0) / d, (x - x0) / d
        cx, cy = (x0 + x) / 2 + nx * bow, (y0 + y) / 2 + ny * bow
        s.cvis = True
        pend = []
        for i in range(1, n + 1):
            t = ease_io(i / n)
            px = (1 - t) ** 2 * x0 + 2 * (1 - t) * t * cx + t * t * x
            py = (1 - t) ** 2 * y0 + 2 * (1 - t) * t * cy + t * t * y
            s.cursor = (px, py)
            pend = [t for t in pend if not t.done()]
            if len(pend) > 6:                                   # page is lagging: let it catch up
                await s.inp(asyncio.gather(*pend))
                pend = []
            pend.append(asyncio.ensure_future(s.page.mouse.move(px, py)))
            await asyncio.sleep(0)
            await s.tick()
        if pend:
            await s.inp(asyncio.gather(*pend))

    def aim(s, b, a):
        """A natural landing point inside the element (not dead centre)."""
        fx = .5 if b["width"] < 60 else s.rnd.uniform(.38, .55)
        fy = .5 if b["height"] < 40 else s.rnd.uniform(.4, .6)
        if a.get("aim"):
            fx, fy = a["aim"]
        return b["x"] + b["width"] * fx, b["y"] + b["height"] * fy

    async def press_at(s, x, y, hold_ms=110):
        await s.inp(s.page.mouse.down())
        s.clicks.append([round(s.vt, 1), round(x, 1), round(y, 1)])
        for _ in range(max(1, round(hold_ms / s.step))):
            await s.tick()
        await s.inp(s.page.mouse.up())

    # ---------- actions ----------
    async def act(s, a, ev):
        do = a["do"]
        sel = a.get("sel")
        if do == "goto":
            await s.pump(s.page.goto(a["url"], wait_until=a.get("until", "load"), timeout=60000))
            ev["compress"] = True
        elif do in ("click", "move", "hover", "dblclick"):
            b = await s.box(sel) if sel else {"x": a["x"], "y": a["y"], "width": 1, "height": 1}
            ev["box"] = b
            x, y = s.aim(b, a)
            await s.move(x, y, a.get("move_ms"))
            await s.tick(); await s.tick()
            ev["key"] = round(s.vt, 1)
            if do == "click":
                await s.press_at(x, y)
            elif do == "dblclick":
                await s.inp(s.page.mouse.dblclick(x, y))
                s.clicks.append([round(s.vt, 1), round(x, 1), round(y, 1)])
            for _ in range(3):
                await s.tick()
        elif do == "drag":                                   # kanban cards, sliders, canvas strokes
            b = await s.box(sel) if sel else {"x": a["x"], "y": a["y"], "width": 1, "height": 1}
            ev["box"] = b
            x, y = s.aim(b, a)
            await s.move(x, y)
            await s.tick()
            ev["key"] = round(s.vt, 1)
            await s.inp(s.page.mouse.down())
            s.clicks.append([round(s.vt, 1), round(x, 1), round(y, 1)])
            for _ in range(4):
                await s.tick()
            t = a["to"]
            if isinstance(t, str):
                tb = await s.box(t, scroll=False)
                tx, ty = tb["x"] + tb["width"] / 2, tb["y"] + tb["height"] / 2
            else:
                tx, ty = t
            await s.move(tx, ty, a.get("ms", 900))
            for _ in range(3):
                await s.tick()
            await s.inp(s.page.mouse.up())
            for _ in range(6):
                await s.tick()
        elif do == "hold":                                   # push-to-talk etc: press, keep page time = real time
            b = await s.box(sel)
            ev["box"] = b
            x, y = s.aim(b, a)
            await s.move(x, y)
            await s.tick()
            ev["key"] = round(s.vt, 1)
            await s.inp(s.page.mouse.down())
            s.clicks.append([round(s.vt, 1), round(x, 1), round(y, 1)])
            t0 = time.time()
            ev["hold_start_vt"] = round(s.vt, 1)
            ms = a.get("ms", "auto")
            if ms == "auto":                                   # mic file length + 1.5 s
                import wave
                with wave.open(os.path.join(s.base, s.st["mic"])) as w:
                    ms = w.getnframes() / w.getframerate() * 1000 + 1500
            while (time.time() - t0) * 1000 < ms:
                await s.tick_wall()
            await s.inp(s.page.mouse.up())
            ev["hold_end_vt"] = round(s.vt, 1)
        elif do == "type":
            if sel:
                b = await s.box(sel)
                ev["box"] = b
                x, y = s.aim(b, a)
                await s.move(x, y)
                await s.tick()
                await s.press_at(x, y)
                if a.get("clear", True):
                    await s.inp(s.page.keyboard.press("Control+A"))
                    await s.inp(s.page.keyboard.press("Backspace"))
                await s.tick(); await s.tick()
            s.cvis = False
            ev["key"] = round(s.vt, 1)
            txt = a["text"]
            if a.get("paste"):
                await s.inp(s.page.keyboard.insert_text(txt))
                await s.tick()
            else:
                per = 1000.0 / a.get("cps", 18 if len(txt) < 60 else 30)
                acc = 0.0
                for ch in txt:
                    if ch == "\n":
                        await s.inp(s.page.keyboard.press("Shift+Enter"))
                    elif ord(ch) < 128:
                        await s.inp(s.page.keyboard.type(ch))
                    else:
                        await s.inp(s.page.keyboard.insert_text(ch))
                    s.keys.append(round(s.vt, 1))
                    acc += per * s.rnd.uniform(.6, 1.5) * (1.8 if ch in " ,." else 1)
                    while acc >= s.step:
                        await s.tick(); acc -= s.step
            ev["type_end"] = round(s.vt, 1)
            if a.get("enter"):
                for _ in range(6):
                    await s.tick()
                await s.inp(s.page.keyboard.press("Enter"))
                s.keys.append(round(s.vt, 1))
                ev["enter_vt"] = round(s.vt, 1)
            for _ in range(3):
                await s.tick()
        elif do == "press":
            await s.inp(s.page.keyboard.press(a["key"]))
            s.keys.append(round(s.vt, 1))
            ev["key"] = round(s.vt, 1)
            for _ in range(3):
                await s.tick()
        elif do == "select":
            b = await s.box(sel)
            ev["box"] = b
            x, y = s.aim(b, a)
            await s.move(x, y)
            ev["key"] = round(s.vt, 1)
            await s.press_at(x, y)
            await s.pump(s.loc(sel).select_option(a["value"]))
            for _ in range(4):
                await s.tick()
        elif do == "upload":
            await s.pump(s.page.locator(sel).first.set_input_files(os.path.join(s.base, a["file"])))
        elif do == "scroll":
            to = a.get("to", "bottom")
            if isinstance(to, (int, float)):
                y1 = float(to)
            elif to in ("bottom", "top"):
                y1 = 0 if to == "top" else await s.page.evaluate("document.documentElement.scrollHeight-innerHeight")
            else:
                b = await s.pump(s.loc(to).bounding_box())
                y1 = max(0, await s.page.evaluate("scrollY") + b["y"] - s.vh * a.get("offset", .15))
            ev["key"] = round(s.vt, 1)
            s.cvis = s.cvis and a.get("keep_cursor", True)
            await s.smooth_scroll(y1, a.get("ms", 1200), a.get("container"))
        elif do == "wait":                                   # compressible: sped up in the edit, labelled honestly
            t0, n = time.time(), 0
            f = a.get("for", 1000)
            ev["compress"] = not (isinstance(f, (int, float)) and f < 1500)
            while True:
                n += 1
                if n <= 30:
                    await s.tick()                            # first second at full frame rate
                else:
                    await s.tick_wall()
                if isinstance(f, (int, float)):
                    if (time.time() - t0) * 1000 >= f and n > 3:
                        break
                elif f == "idle":                      # no request started/finished for `quiet` s (ignores open sockets)
                    if time.time() - s.last_net > a.get("quiet", 1.2) and n > 15:
                        break
                elif n % 3 == 0:
                    try:
                        if await s.pump(s.page.locator(f).filter(visible=True).count(), timeout=10):
                            break
                    except Exception:
                        pass
                if time.time() - t0 > a.get("timeout", 60000) / 1000:
                    raise TimeoutError("wait for %r timed out" % f)
            ev["wall_s"] = round(time.time() - t0, 1)
            for _ in range(a.get("settle", 12)):
                await s.tick()
        elif do == "pause":
            for _ in range(max(1, round(a.get("ms", 1000) / s.step))):
                await s.tick()
        elif do == "camera":                                  # no page interaction; compositor moves the camera
            b = None
            if a.get("focus"):
                b = await s.pump(s.loc(a["focus"]).bounding_box())
            ev["box"] = b
            ev["key"] = round(s.vt, 1)
        elif do == "eval":
            ev["result"] = str(await s.pump(s.page.evaluate(a["js"])))[:2000]
        elif do == "mark":
            s.marks[a["name"]] = round(s.vt, 1)
        elif do == "hide_cursor":
            s.cvis = False
        else:
            raise ValueError("unknown action %r" % do)
        if a.get("focus") and do != "camera":
            try:
                ev["focus_box"] = await s.pump(s.loc(a["focus"]).bounding_box(), timeout=10)
            except Exception:
                pass

    async def run_actions(s, actions, scene_id):
        for i, a in enumerate(actions):
            ev = {"i": i, "do": a["do"], "t0": round(s.vt, 1)}
            cap = s.capture
            if a.get("offscreen"):
                s.capture = False
            try:
                await s.act(a, ev)
                ev["ok"] = True
            except Exception as e:
                ev["ok"] = False
                ev["error"] = repr(e)[:300]
                print("[%s #%d %s] FAILED: %s" % (scene_id, i, a["do"], e), file=sys.stderr)
                if not s.probe:
                    raise
            s.capture = cap
            ev["t1"] = round(s.vt, 1)
            if "zoom" in a and "key" not in ev:
                ev["key"] = ev["t0"]
            for k in ("at", "zoom", "focus", "sel", "text", "caption"):
                if k in a:
                    ev[k] = a[k]
            s.events_cur.append(ev)
            if s.probe:
                p = os.path.join(s.out, "%s_%02d_%s.png" % (scene_id, i, a["do"]))
                await s.page.screenshot(path=p, scale="css")
                s.report.append({"scene": scene_id, "i": i, "do": a["do"], "ok": ev["ok"],
                                 "error": ev.get("error"), "box": ev.get("box"), "shot": p, "result": ev.get("result")})
                if "result" in ev:
                    print("  eval %s #%d -> %s" % (scene_id, i, ev["result"]))

    async def main(s):
        async with async_playwright() as pw:
            await s.start(pw)
            s.events_cur = []
            await s.page.goto(s.sb["project"]["url"], wait_until="domcontentloaded", timeout=90000)
            try:
                await s.page.wait_for_load_state("networkidle", timeout=15000)
            except Exception:
                pass
            await s.run_actions(s.sb.get("setup", []), "setup")
            if not s.probe:
                await s.start_capture()
            s.capture = True
            for sc in s.sb["scenes"]:
                if sc.get("type", "live") != "live":
                    continue
                s.events_cur = []
                pre = [a for a in sc.get("actions", []) if a.get("offscreen")]
                main_acts = [a for a in sc.get("actions", []) if not a.get("offscreen")]
                if pre:
                    await s.run_actions(pre, sc["id"] + "_pre")
                await s.tick()                               # first frame of the scene
                t0 = s.vt
                await s.run_actions(main_acts, sc["id"])
                for _ in range(int(sc.get("tail_ms", 400) / s.step)):
                    await s.tick()
                s.scenes[sc["id"]] = {"t0": round(t0, 1), "t1": round(s.vt, 1), "actions": s.events_cur}
                print("scene %-14s %6.2fs of footage, %d frames so far" % (sc["id"], (s.vt - t0) / 1000, len(s.frames)))
            await s.browser.close()
        out = dict(fps=s.fps, dsf=s.dsf, viewport=[s.vw, s.vh], frames=s.frames, cursor=s.cur, clicks=s.clicks,
                   keys=s.keys, marks=s.marks, scenes=s.scenes)
        name = "report.json" if s.probe else "events.json"
        json.dump(out if not s.probe else {"actions": s.report, "scenes": s.scenes}, open(os.path.join(s.out, name), "w"))
        if s.probe:
            bad = [r for r in s.report if not r["ok"]]
            print("probe: %d actions, %d failed -> %s" % (len(s.report), len(bad), os.path.join(s.out, name)))
            for r in bad:
                print("  FAIL %s #%d %s: %s" % (r["scene"], r["i"], r["do"], r["error"]))
        else:
            print("recorded %d frames / %d files (%.1fs page time), %d ticks without a new frame -> %s"
                  % (len(s.frames), s.nfile, s.vt / 1000, len(s.slow), s.out))


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("storyboard")
    ap.add_argument("--probe", action="store_true")
    ap.add_argument("--scene", help="only this live scene (probe/debug)")
    o = ap.parse_args()
    sb = json.load(open(o.storyboard))
    if o.scene:
        sb["scenes"] = [x for x in sb["scenes"] if x["id"] == o.scene]
    t = time.time()
    asyncio.run(Rec(sb, os.path.dirname(os.path.abspath(o.storyboard)), o.probe).main())
    print("took %.0fs" % (time.time() - t))
