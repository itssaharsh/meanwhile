#!/usr/bin/env python3
"""demokit/recon.py — understand a deployed product before planning its demo.

  python3 recon.py https://app.example.com [--out recon] [--pages 5] [--storage state.json]

Writes recon/recon.json + screenshots (viewport + full page per page, WebGL on/off comparison) and
prints a summary: title, headings, interactive elements with ready-to-use Playwright selectors,
fonts, a suggested palette, console errors, and whether WebGL must stay on (slow capture) or can be off.
"""
import argparse, asyncio, base64, json, os, re, time
from urllib.parse import urljoin, urlparse
import numpy as np, cv2
from playwright.async_api import async_playwright

ELS_JS = r"""() => {
 const vis = e => { const r = e.getBoundingClientRect(), s = getComputedStyle(e);
   return r.width > 2 && r.height > 2 && s.visibility !== 'hidden' && s.display !== 'none' && +s.opacity > 0.05; };
 const q = s => JSON.stringify(s);
 const out = [];
 for (const e of document.querySelectorAll('a,button,input,textarea,select,summary,label[for],[role=button],[role=tab],[role=link],[role=textbox],[role=slider],[role=combobox],[role=checkbox],[role=switch],[role=menuitem],[role=option],[contenteditable]:not([contenteditable=false]),[tabindex]:not([tabindex="-1"])')) {
   if (!vis(e)) continue;
   const r = e.getBoundingClientRect(), tag = e.tagName.toLowerCase();
   const txt = ((e.innerText || '').trim().split('\n')[0] || '').replace(/\s+/g, ' ').trim().slice(0, 60);
   const aria = e.getAttribute('aria-label'), ph = e.getAttribute('placeholder'), name = e.getAttribute('name');
   let sel = null;
   if (['input', 'textarea'].includes(tag)) sel = ph ? `${tag}[placeholder=${q(ph)}]` : aria ? `${tag}[aria-label=${q(aria)}]` : name ? `${tag}[name=${q(name)}]` : (e.id ? '#' + CSS.escape(e.id) : tag);
   else if (e.getAttribute('role') === 'slider' || e.isContentEditable || e.getAttribute('role') === 'textbox') sel = aria ? `[aria-label=${q(aria)}]` : (e.id ? '#' + CSS.escape(e.id) : `[role=${e.getAttribute('role') || 'textbox'}]`);
   else if (tag === 'select') sel = aria ? `select[aria-label=${q(aria)}]` : name ? `select[name=${q(name)}]` : (e.id ? '#' + CSS.escape(e.id) : 'select');
   else if (txt) sel = `text=${txt.length > 40 ? txt.slice(0, 40) : txt}`;
   else if (aria) sel = `[aria-label=${q(aria)}]`;
   else if (e.id) sel = '#' + CSS.escape(e.id);
   out.push({tag, text: txt, aria, placeholder: ph, type: e.getAttribute('type'), href: e.getAttribute('href'), sel,
             box: [Math.round(r.x), Math.round(r.y + scrollY), Math.round(r.width), Math.round(r.height)]});
 }
 return out;
}"""

INFO_JS = r"""() => {
 const cs = e => e ? getComputedStyle(e) : null;
 const h = [...document.querySelectorAll('h1,h2,h3')].filter(e => e.innerText.trim()).slice(0, 14).map(e => e.tagName + ': ' + e.innerText.trim().replace(/\s+/g, ' ').slice(0, 90));
 const m = n => (document.querySelector(`meta[name="${n}"],meta[property="${n}"]`) || {}).content || null;
 const gl = [...document.querySelectorAll('canvas')].filter(c => { try { return !!(c.getContext('webgl2') || c.getContext('webgl')) } catch (e) { return false } });
 const big = gl.filter(c => c.getBoundingClientRect().width * c.getBoundingClientRect().height > innerWidth * innerHeight * 0.25);
 return {title: document.title, description: m('description') || m('og:description'), og_image: m('og:image'),
   headings: h, text: document.body.innerText.replace(/\n{2,}/g, '\n').slice(0, 5000),
   font_heading: cs(document.querySelector('h1,h2'))?.fontFamily, font_body: cs(document.body).fontFamily,
   body_bg: cs(document.body).backgroundColor, html_bg: cs(document.documentElement).backgroundColor,
   webgl_canvases: gl.length, webgl_fullscreen: big.length,
   ui_colors: (() => { const c = {}; for (const e of document.querySelectorAll('a,button,[role=button],h1,h2,[class*=accent],[class*=primary],[class*=brand]')) {
     const s = getComputedStyle(e); for (const v of [s.color, s.backgroundColor, s.borderTopColor]) if (v && !/rgba\(.*, 0\)$/.test(v)) c[v] = (c[v] || 0) + 1; }
     return Object.entries(c).sort((a, b) => b[1] - a[1]).slice(0, 25); })(), scroll_height: document.documentElement.scrollHeight,
   links: [...document.querySelectorAll('a[href]')].map(a => a.href).filter(u => u.startsWith(location.origin)).slice(0, 60)};
}"""


def rgbhex(v):
    m = re.findall(r"[\d.]+", v)
    return "#%02x%02x%02x" % tuple(int(float(x)) for x in m[:3]) if len(m) >= 3 else None


def palette(png, ui_colors=()):
    im = cv2.imread(png)
    sm = cv2.resize(im, (160, 90), interpolation=cv2.INTER_AREA).reshape(-1, 3).astype(np.float32)
    _, lab, cen = cv2.kmeans(sm, 6, None, (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 20, 1), 3, cv2.KMEANS_PP_CENTERS)
    cnt = np.bincount(lab.ravel(), minlength=6)
    cols = []
    for c, n in sorted(zip(cen, cnt), key=lambda x: -x[1]):
        b, g, r = [int(x) for x in c]
        hsv = cv2.cvtColor(np.uint8([[[b, g, r]]]), cv2.COLOR_BGR2HSV)[0, 0]
        cols.append({"hex": "#%02x%02x%02x" % (r, g, b), "share": round(float(n) / len(lab), 3), "sat": int(hsv[1]), "val": int(hsv[2])})
    dom = cols[0]
    dark = dom["val"] < 110
    acc = max(cols, key=lambda c: c["sat"] * (c["val"] > 60))
    vivid = []
    for v, n in ui_colors:                                  # accent from real UI colours (buttons, links, headings)
        hx = rgbhex(v)
        if hx:
            b, g, r = int(hx[5:7], 16), int(hx[3:5], 16), int(hx[1:3], 16)
            h = cv2.cvtColor(np.uint8([[[b, g, r]]]), cv2.COLOR_BGR2HSV)[0, 0]
            if h[1] > 90 and h[2] > 120:
                vivid.append((int(h[1]) * int(h[2]) * (1 + min(n, 5)), hx))
    if vivid:
        acc = {"hex": max(vivid)[1]}
    return {"clusters": cols, "theme": "dark" if dark else "light", "suggested": {
        "site_bg": dom["hex"], "accent": acc["hex"], "chrome": "dark" if dark else "light",
        "bg": [c["hex"] for c in sorted(cols, key=lambda c: c["val"])[:3]] if dark else ["#0b1020", "#1d2b5a", acc["hex"]]}}


async def capture_cost(pw, url, gpu):
    args = ["--force-device-scale-factor=2", "--window-size=1280,720", "--hide-scrollbars"]
    args += ["--enable-unsafe-swiftshader"] if gpu else ["--disable-gpu", "--disable-software-rasterizer", "--disable-3d-apis"]
    b = await pw.chromium.launch(args=args)
    ctx = await b.new_context(no_viewport=True)
    pg = await ctx.new_page()
    shot = "home_%s.png" % ("gpu" if gpu else "nogpu")
    img = None
    try:
        await pg.goto(url, wait_until="load", timeout=60000)
        await pg.wait_for_timeout(2500)
        img = await pg.screenshot(timeout=60000, scale="css")
        cdp = await ctx.new_cdp_session(pg)
        ev = asyncio.Event(); cdp.on("Emulation.virtualTimeBudgetExpired", lambda e: ev.set())
        q = asyncio.Queue()
        cdp.on("Page.screencastFrame", lambda e: (q.put_nowait(1), asyncio.ensure_future(cdp.send("Page.screencastFrameAck", {"sessionId": e["sessionId"]}))))
        await cdp.send("Emulation.setVirtualTimePolicy", {"policy": "pause"})
        await cdp.send("Page.startScreencast", {"format": "jpeg", "quality": 80, "maxWidth": 2560, "maxHeight": 1440})
        t, n = time.time(), 8
        for i in range(n):
            await pg.mouse.move(400 + i * 30, 300)
            ev.clear(); await cdp.send("Emulation.setVirtualTimePolicy", {"policy": "advance", "budget": 33.3})
            await asyncio.wait_for(ev.wait(), 12)
            try:
                await asyncio.wait_for(q.get(), 5)
            except asyncio.TimeoutError:
                pass
        return (time.time() - t) / n, img, shot
    except Exception as e:
        return 99.0, img, shot
    finally:
        await b.close()


async def main(o):
    os.makedirs(o.out, exist_ok=True)
    rep = {"url": o.url, "pages": []}
    async with async_playwright() as pw:
        b = await pw.chromium.launch(args=["--disable-gpu", "--hide-scrollbars", "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"])
        kw = dict(viewport={"width": 1280, "height": 720}, device_scale_factor=1, ignore_https_errors=True)
        if o.storage:
            kw["storage_state"] = o.storage
        ctx = await b.new_context(**kw)
        pg = await ctx.new_page()
        errs, bad = [], []
        pg.on("console", lambda m: m.type == "error" and errs.append(m.text[:160]))
        pg.on("response", lambda r: r.status >= 400 and bad.append("%d %s" % (r.status, r.url[:120])))
        todo, seen = [o.url], set()
        while todo and len(rep["pages"]) < o.pages:
            u = todo.pop(0)
            k = u.split("#")[0].rstrip("/")
            if k in seen:
                continue
            seen.add(k)
            t0 = time.time()
            try:
                await pg.goto(u, wait_until="load", timeout=60000)
                try:
                    await pg.wait_for_load_state("networkidle", timeout=12000)
                except Exception:
                    pass
            except Exception as e:
                rep["pages"].append({"url": u, "error": str(e)[:200]}); continue
            await pg.wait_for_timeout(1200)
            n = len(rep["pages"])
            info = await pg.evaluate(INFO_JS)
            els = await pg.evaluate(ELS_JS)
            vp = os.path.join(o.out, "p%d_view.png" % n)
            await pg.screenshot(path=vp)
            fp = os.path.join(o.out, "p%d_full.png" % n)
            await pg.screenshot(path=fp, full_page=True, clip={"x": 0, "y": 0, "width": 1280, "height": min(info["scroll_height"], 7000)})
            info.update(url=pg.url, load_s=round(time.time() - t0, 1), view=vp, full=fp, elements=els)
            rep["pages"].append(info)
            if n == 0:
                rep["palette"] = palette(vp, info.get("ui_colors", []))
                todo += [l for l in info["links"] if urlparse(l).path not in ("", "/")][: o.pages * 2]
        rep["console_errors"] = list(dict.fromkeys(errs))[:15]
        rep["http_errors"] = list(dict.fromkeys(bad))[:15]
        await b.close()
        home = rep["pages"][0] if rep["pages"] else {}
        if home.get("webgl_canvases"):
            cg, img_g, sg = await capture_cost(pw, o.url, True)
            cn, img_n, sn = await capture_cost(pw, o.url, False)
            for img, s in ((img_g, sg), (img_n, sn)):
                if img:
                    open(os.path.join(o.out, s), "wb").write(img)
            rep["capture"] = {"gpu_on_s_per_frame": round(cg, 2), "gpu_off_s_per_frame": round(cn, 2),
                              "compare": [os.path.join(o.out, sg), os.path.join(o.out, sn)]}
            rep["capture"]["recommend_gpu"] = bool(home.get("webgl_fullscreen") == 0 and cg < .5)
    json.dump(rep, open(os.path.join(o.out, "recon.json"), "w"), indent=1)
    # ---- summary
    for p in rep["pages"]:
        if p.get("error"):
            print("PAGE ERROR", p["url"], p["error"]); continue
        print("\n== %s  (%s, %.1fs load, %dpx tall)" % (p["url"], p["title"], p["load_s"], p["scroll_height"]))
        print("   headings:", " | ".join(p["headings"][:8]))
        print("   fonts: heading=%s body=%s   webgl canvases=%d" % (p["font_heading"], p["font_body"], p["webgl_canvases"]))
        print("   interactive (y, selector):")
        for e in p["elements"][:60]:
            fold = "  (below fold: scroll first)" if e["box"][1] > 700 else ""
            print("     %5d  %-55s %s%s" % (e["box"][1], e["sel"] or "?", ("[" + e["tag"] + (" " + e["type"] if e["type"] else "") + "]"), fold))
        print("   screenshots:", p["view"], p["full"])
    print("\npalette suggestion:", json.dumps(rep.get("palette", {}).get("suggested")))
    if rep.get("capture"):
        c = rep["capture"]
        print("WebGL: %.2fs/frame with GPU emulation vs %.2fs without -> recommend gpu=%s (compare %s)" % (
            c["gpu_on_s_per_frame"], c["gpu_off_s_per_frame"], c["recommend_gpu"], " vs ".join(c["compare"])))
    if rep["console_errors"] or rep["http_errors"]:
        print("console errors:", rep["console_errors"][:5], "\nhttp errors:", rep["http_errors"][:5])


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("url"); ap.add_argument("--out", default="recon"); ap.add_argument("--pages", type=int, default=4)
    ap.add_argument("--storage")
    asyncio.run(main(ap.parse_args()))
