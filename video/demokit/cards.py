#!/usr/bin/env python3
"""demokit/cards.py — render every designed pixel with Chromium (real CSS typography, Google Fonts).

  python3 cards.py storyboard.json      # -> build/overlays/*.png + build/overlays/index.json

Renders: backdrop (gradient + window chrome, 2x), window mask, card layers (one PNG per [data-layer]
element so the compositor can stagger them in), caption pills, speed-up badge, cursor sprite.
"""
import asyncio, json, os, re, sys, html as H
from playwright.async_api import async_playwright

W, HGT = 1920, 1080


def geom(st):
    """Window placement in the 1920x1080 canvas (shared with compose.py)."""
    vw, vh = st.get("viewport", [1280, 720])
    cap = st.get("captions", True)
    cw = st.get("window_width", 1536 if cap else 1600)
    ch = round(cw * vh / vw)
    bar = 44
    wx = (W - cw) // 2
    wy = 62 if cap else (HGT - ch - bar) // 2          # with captions: leave a caption lane under the window
    return dict(cw=cw, ch=ch, bar=bar, wx=wx, wy=wy, r=18)


def pal(st):
    p = {"bg": ["#0b1020", "#1d2b5a", "#3b5bdb"], "accent": "#8ab4ff", "text": "#f4f6fb",
         "muted": "rgba(244,246,251,.66)", "chrome": "dark", "site_bg": "#0b1020", "font": "Inter", "display_font": None}
    p.update(st.get("palette", {}))
    p["display_font"] = p["display_font"] or p["font"]
    return p


def font_css(p):
    fams = {p["font"], p["display_font"], "Inter"}
    q = "&".join("family=%s:wght@400;500;600;700;800" % f.replace(" ", "+") for f in fams)
    return '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?%s&display=block">' % q


def page(p, body, extra=""):
    return """<!doctype html><html><head><meta charset="utf-8">%s<style>
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:%dpx;height:%dpx;background:transparent;overflow:hidden}
body{font-family:'%s','Inter','Poppins',system-ui,sans-serif;color:%s;-webkit-font-smoothing:antialiased}
.d{font-family:'%s','Inter','Poppins',system-ui,sans-serif}
%s</style></head><body>%s</body></html>""" % (font_css(p), W, HGT, p["font"], p["text"], p["display_font"], extra, body)


def bg_html(p):
    c = p["bg"] + [p["bg"][-1]] * (3 - len(p["bg"]))
    return """<div style="position:absolute;inset:0;background:
radial-gradient(55%% 75%% at 12%% 18%%,%s 0%%,transparent 70%%),
radial-gradient(60%% 80%% at 88%% 85%%,%s 0%%,transparent 70%%),
radial-gradient(40%% 50%% at 70%% 10%%,%s55 0%%,transparent 70%%),%s"></div>
<svg style="position:absolute;inset:0;opacity:.07;mix-blend-mode:overlay" width="100%%" height="100%%">
<filter id="n"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" stitchTiles="stitch"/></filter>
<rect width="100%%" height="100%%" filter="url(#n)"/></svg>""" % (c[1], c[2], p["accent"], c[0])


def chrome_html(p, g, url):
    dark = p["chrome"] == "dark"
    barbg = "#1b1e26" if dark else "#eef0f4"
    pill = "rgba(255,255,255,.07)" if dark else "rgba(0,0,0,.06)"
    fg = "rgba(255,255,255,.62)" if dark else "rgba(0,0,0,.55)"
    host = re.sub(r"^https?://", "", url).rstrip("/")
    dots = "".join('<i style="display:inline-block;width:13px;height:13px;border-radius:50%%;background:%s;margin-right:9px"></i>' % c
                   for c in ("#ff5f57", "#febc2e", "#28c840"))
    return """<div style="position:absolute;left:%dpx;top:%dpx;width:%dpx;height:%dpx;border-radius:%dpx;overflow:hidden;
background:%s;box-shadow:0 50px 120px -20px rgba(0,0,0,.55),0 18px 40px -12px rgba(0,0,0,.35),0 0 0 1px rgba(255,255,255,%s)">
<div style="height:%dpx;background:%s;display:flex;align-items:center;padding:0 18px;position:relative">%s
<div style="position:absolute;left:50%%;top:50%%;transform:translate(-50%%,-50%%);min-width:420px;height:28px;border-radius:8px;background:%s;
display:flex;align-items:center;justify-content:center;gap:8px;font:500 14px/1 'Inter',system-ui,sans-serif;color:%s;letter-spacing:.01em">
<svg width="11" height="13" viewBox="0 0 11 13"><rect x="1" y="5.5" width="9" height="7" rx="1.6" fill="%s"/><path d="M3 5.5V4a2.5 2.5 0 0 1 5 0v1.5" stroke="%s" stroke-width="1.5" fill="none"/></svg>%s</div></div></div>""" % (
        g["wx"], g["wy"], g["cw"], g["ch"] + g["bar"], g["r"], p["site_bg"], ".10" if dark else ".35",
        g["bar"], barbg, dots, pill, fg, fg, fg, H.escape(host))


def mask_html(g):
    return """<div style="position:absolute;left:%dpx;top:%dpx;width:%dpx;height:%dpx;background:#fff;
border-radius:0 0 %dpx %dpx"></div>""" % (g["wx"], g["wy"] + g["bar"], g["cw"], g["ch"], g["r"], g["r"])


def esc(s):
    return H.escape(str(s or ""))


def card_html(c, p):
    kind = c.get("layout", "title")
    acc = p["accent"]
    wrap = '<div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:0 200px;gap:%s">%s</div>'
    L = lambda k, inner, style="", at=None: '<div data-layer="%s" %s style="%s">%s</div>' % (k, 'data-at="%s"' % esc(at) if at else "", style, inner)
    kicker = lambda t: L("kicker", esc(t), "font-weight:600;font-size:24px;line-height:1;letter-spacing:.22em;text-transform:uppercase;color:%s" % acc) if t else ""
    title = lambda t, size=None: L("title", esc(t), "font-size:%dpx;font-weight:750;line-height:1.04;letter-spacing:-.025em;text-wrap:balance;max-width:1400px" % (size or (96 if len(t) <= 26 else 80 if len(t) <= 44 else 64))) if t else ""
    sub = lambda t: L("sub", esc(t), "font-weight:500;font-size:34px;line-height:1.35;color:%s;max-width:1200px;text-wrap:balance" % p["muted"]) if t else ""
    if kind == "html":
        return c["html"]
    if kind == "title":
        return wrap % ("26px", kicker(c.get("kicker")) + '<div class="d">' + title(c.get("title")) + "</div>" + sub(c.get("sub")))
    if kind == "stat":
        v = L("value", esc(c["value"]), "font-size:210px;font-weight:800;line-height:1;letter-spacing:-.04em;background:linear-gradient(180deg,%s,%s);-webkit-background-clip:text;color:transparent" % (p["text"], acc))
        return wrap % ("18px", kicker(c.get("kicker")) + '<div class="d">' + v + "</div>" + L("label", esc(c.get("label")), "font-weight:600;font-size:44px;line-height:1.2;max-width:1300px;text-wrap:balance") + sub(c.get("sub")))
    if kind == "list":
        items = "".join(L("item%d" % i, '<span style="display:inline-flex;width:54px;height:54px;border-radius:14px;background:%s22;color:%s;align-items:center;justify-content:center;font-weight:700;font-size:26px;line-height:1;margin-right:26px;flex:none">%s</span><span>%s</span>' % (acc, acc, esc(it.get("icon", i + 1)), esc(it["text"])),
                          "display:flex;align-items:center;font-weight:600;font-size:42px;line-height:1.2;text-align:left", it.get("at"))
                        for i, it in enumerate(c["items"]))
        return '<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center"><div style="display:flex;flex-direction:column;gap:34px;max-width:1300px">%s%s<div style="display:flex;flex-direction:column;gap:28px;margin-top:14px">%s</div></div></div>' % (
            kicker(c.get("kicker")), '<div class="d">' + title(c.get("title"), 72) + "</div>", items)
    if kind == "flow":
        n = len(c["nodes"])
        parts = []
        for i, nd in enumerate(c["nodes"]):
            parts.append(L("node%d" % i, '<div style="font-weight:700;font-size:34px;line-height:1.15">%s</div><div style="font-weight:500;font-size:22px;line-height:1.35;color:%s;margin-top:10px">%s</div>' % (esc(nd["label"]), p["muted"], esc(nd.get("sub"))),
                           "width:%dpx;padding:30px 26px;border-radius:22px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.14);text-align:center;box-shadow:0 20px 50px -20px rgba(0,0,0,.5)" % min(340, 1500 // n - 60), nd.get("at")))
            if i < n - 1:
                parts.append(L("arrow%d" % i, '<svg width="56" height="24" viewBox="0 0 56 24"><path d="M2 12h46m-10-9 10 9-10 9" stroke="%s" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>' % acc, "display:flex", c["nodes"][i + 1].get("at")))
        return wrap % ("54px", kicker(c.get("kicker")) + '<div class="d">' + title(c.get("title"), 64) + "</div>" + '<div style="display:flex;align-items:center;gap:18px">%s</div>' % "".join(parts) + sub(c.get("sub")))
    if kind == "end":
        url = L("url", esc(c.get("url")), "font-weight:600;font-size:30px;line-height:1;padding:18px 30px;border-radius:999px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.16)") if c.get("url") else ""
        meta = L("meta", esc(c.get("meta")), "font-weight:500;font-size:24px;line-height:1.4;color:%s;letter-spacing:.02em" % p["muted"]) if c.get("meta") else ""
        return wrap % ("30px", '<div class="d">' + title(c.get("title"), 120) + "</div>" + sub(c.get("sub")) + url + meta)
    raise ValueError("unknown card layout %r" % kind)


FUNC = {"a", "an", "the", "of", "to", "and", "or", "in", "on", "for", "with", "your", "my", "at", "by", "is", "it", "that", "from", "as"}


def caption_chunks(words, maxc=40):
    """Phrase-sized captions: break at punctuation, never after a function word, no one-word orphans."""
    out, cur = [], []
    for w in words:
        cur.append(w)
        n = len(" ".join(x[0] for x in cur))
        end = w[0][-1:]
        if end in ".?!:" or (end in ",;—" and n >= 16) or n >= maxc:
            if n >= maxc and end not in ".?!:,;—":
                k = len(cur) - 1                                  # back off function words at the break
                while k > 1 and re.sub(r"\W", "", cur[k - 1][0]).lower() in FUNC:
                    k -= 1
                out.append(cur[:k]); cur = cur[k:]
            else:
                out.append(cur); cur = []
    if cur:
        out.append(cur)
    merged = []
    for ch in out:                                                 # merge orphans into a neighbour
        txt = " ".join(x[0] for x in ch)
        if merged and (len(ch) == 1 or len(txt) < 10) and len(" ".join(x[0] for x in merged[-1])) + len(txt) < maxc + 10 \
                and merged[-1][-1][0][-1:] not in ".?!":
            merged[-1] = merged[-1] + ch
        else:
            merged.append(ch)
    if len(merged) > 1 and len(merged[-1]) == 1:
        merged[-2] = merged[-2] + merged.pop()
    return [{"text": " ".join(x[0] for x in ch).rstrip(".,;:"), "start": ch[0][1], "end": ch[-1][2]} for ch in merged]


async def shoot_layers(pg, html_src, path_prefix, dsf_page):
    await pg.set_content(html_src, wait_until="networkidle")
    await pg.evaluate("document.fonts.ready")
    els = await pg.query_selector_all("[data-layer]")
    layers = []
    for i, el in enumerate(els):
        name = await el.get_attribute("data-layer") or str(i)
        at = await el.get_attribute("data-at")
        await pg.evaluate("(e)=>{document.querySelectorAll('[data-layer]').forEach(x=>x.style.visibility=x===e?'visible':'hidden')}", el)
        b = await el.bounding_box()
        pad = 40
        clip = {"x": max(0, b["x"] - pad), "y": max(0, b["y"] - pad), "width": min(W, b["width"] + 2 * pad), "height": min(HGT, b["height"] + 2 * pad)}
        p = "%s_%02d_%s.png" % (path_prefix, i, re.sub(r"\W", "", name))
        await pg.screenshot(path=p, clip=clip, omit_background=True)
        layers.append({"png": p, "x": clip["x"], "y": clip["y"], "name": name, "idx": i, "at": at})
    return layers


async def main(sbp):
    sb = json.load(open(sbp))
    base = os.path.dirname(os.path.abspath(sbp))
    st = sb.get("style", {})
    p, g = pal(st), geom(st)
    od = os.path.join(base, "build", "overlays")
    os.makedirs(od, exist_ok=True)
    tpath = os.path.join(base, "voice", "timing.json")
    timing = json.load(open(tpath)) if os.path.exists(tpath) else {}
    idx = {"geom": g, "palette": p, "cards": {}, "captions": {}}
    async with async_playwright() as pw:
        b = await pw.chromium.launch()
        hi = await b.new_page(viewport={"width": W, "height": HGT}, device_scale_factor=2)
        await hi.set_content(page(p, bg_html(p) + chrome_html(p, g, sb["project"]["url"])), wait_until="networkidle")
        await hi.evaluate("document.fonts.ready")
        await hi.screenshot(path=os.path.join(od, "backdrop.png"))
        await hi.set_content(page(p, bg_html(p)), wait_until="networkidle")
        await hi.screenshot(path=os.path.join(od, "bg.png"))
        await hi.set_content(page(p, '<div style="position:absolute;inset:0;background:#000"></div>' + mask_html(g)))
        await hi.screenshot(path=os.path.join(od, "winmask.png"))
        lo = await b.new_page(viewport={"width": W, "height": HGT}, device_scale_factor=1)
        for sc in sb["scenes"]:
            if sc.get("card"):
                layers = await shoot_layers(lo, page(p, card_html(sc["card"], p)), os.path.join(od, "card_" + sc["id"]), 1)
                idx["cards"][sc["id"]] = layers
                print("card %-12s %d layers" % (sc["id"], len(layers)))
        if st.get("captions", True):
            cap_css = ".c{position:absolute;left:50%%;bottom:0;transform:translateX(-50%%);white-space:nowrap;padding:14px 28px;border-radius:16px;" \
                      "background:rgba(8,10,16,.72);color:#fff;font-weight:600;font-size:38px;line-height:1.2;letter-spacing:-.005em;" \
                      "box-shadow:0 10px 30px rgba(0,0,0,.35);backdrop-filter:blur(8px)}"
            n = 0
            for sid, t in timing.items():
                chunks = caption_chunks(t["words"])
                for k, c in enumerate(chunks):
                    await lo.set_content(page(p, '<div data-layer="cap" class="c">%s</div>' % esc(c["text"]), cap_css))
                    await lo.evaluate("document.fonts.ready")
                    el = await lo.query_selector(".c")
                    bb = await el.bounding_box()
                    pth = os.path.join(od, "cap_%s_%02d.png" % (sid, k))
                    await el.screenshot(path=pth, omit_background=True)
                    c.update(png=pth, w=bb["width"], h=bb["height"])
                    n += 1
                idx["captions"][sid] = chunks
            print("captions: %d" % n)
        await lo.set_content(page(p, '<div class="c" style="position:absolute;right:0;top:0;padding:10px 18px;border-radius:999px;background:rgba(8,10,16,.72);color:#fff;font-weight:600;font-size:24px;line-height:1;display:flex;gap:10px;align-items:center">'
                                     '<svg width="22" height="16" viewBox="0 0 22 16"><path d="M1 1l9 7-9 7zM11 1l9 7-9 7z" fill="#fff"/></svg><span id="t">sped up</span></div>'))
        el = await lo.query_selector(".c")
        await el.screenshot(path=os.path.join(od, "badge.png"), omit_background=True)
        cur = await b.new_page(viewport={"width": 120, "height": 120}, device_scale_factor=2)
        await cur.set_content('<html><body style="margin:0;background:transparent"><svg style="position:absolute;left:20px;top:20px;filter:drop-shadow(0 3px 5px rgba(0,0,0,.45))" width="44" height="60" viewBox="0 0 22 30">'
                              '<path d="M1.5 1.5v22.2l5.3-5.1 3.4 8.1 3.7-1.6-3.4-7.9h7.4z" fill="#111" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg></body></html>')
        await cur.screenshot(path=os.path.join(od, "cursor.png"), omit_background=True)
        await b.close()
    idx["cursor_hotspot"] = [23 * 2, 23 * 2]  # px in cursor.png (2x) where the arrow tip sits
    json.dump(idx, open(os.path.join(od, "index.json"), "w"), indent=1)
    print("overlays -> %s" % od)


if __name__ == "__main__":
    asyncio.run(main(sys.argv[1]))
