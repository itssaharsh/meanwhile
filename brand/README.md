# Meanwhile — brand

## The mark

A disc cut by the terminator: the lit side amber, the night limb teal. It is the subject, the
mechanic and the claim in one shape — a planet, lit by the true position of the sun, with
**amber ON AIR** against **teal VERIFIED**. Two flat fills on a 36-unit disc survive small sizes
better than any stroked alternative, and it tiles into every square deliverable without redrawing.

Two rejected candidates and why, so nobody re-litigates them: a spliced disc ("Cut") read as a
rendering artefact at 16px and never centred in a square tile; a framed shot with a tally bar
("Tally") closed up into a filled box with a hat, and was one tweak away from an inbox icon.

Honest limit of the chosen mark: below about 12px the night side anti-aliases away and it
degrades to an amber disc. That is why `icon.svg` bleeds the disc to r=22 instead of r=18, and
why the wordmark ships a solid-amber tittle variant under 28px.

## Files

| File | Goes to | Notes |
|---|---|---|
| `logo-mark.svg` | anywhere | r=18 on the 48 grid, for lockups |
| `icon.svg` | `app/icon.svg` | r=22 so it holds a 16px tab; night side flips near-black on light chrome |
| `apple-icon.svg` | raster source | 180×180, 20px padding, solid ground |
| `icon-512.svg` | raster source | full-bleed ground, source for 192 and 512 |
| `icon-maskable-512.svg` | raster source | disc 320, 44px spare inside the 409px safe circle |
| `wordmark.css` + `wordmark.html` | global css / header | the `i`'s tittle **is** the mark |
| `glyphs/*.svg` | icon component | 24×24, 2px stroke, round caps — metric-compatible with Lucide/Tabler |
| `manifest.ts` | `app/manifest.ts` | |
| `opengraph-image.tsx` | `app/opengraph-image.tsx` | needs 4 ttf files in `app/fonts/` |

## Glyphs

`envelope-arc` send-this · `track-to-ring` fly-to · `dot-between-arcs` on-air ·
`clock-before-three` verified-fresh

The shared gesture across the set is the limb arc — the same curvature is the envelope crease,
the ground track, the tally spill and the clock face.

`dot-between-arcs` lights by adding `fill="currentColor"` to the centre circle only; nothing else
changes. `clock-before-three` is a timestamp, not a checkmark, and the hand sits deliberately
before three — the freshness window. The product's claim is "we read the source timestamp", so
the glyph shows a timestamp. Paint it `#43e6d4` when verified, grey when the source sends none.

## Raster export

```bash
npm i -D sharp png-to-ico
node -e "
const sharp=require('sharp'),fs=require('fs');
const r=(i,o,s)=>sharp(i,{density:600}).resize(s,s).flatten({background:'#080b11'}).png({compressionLevel:9}).toFile(o);
(async()=>{
  await r('brand/apple-icon.svg','app/apple-icon.png',180);
  await r('brand/icon-512.svg','public/icon-192.png',192);
  await r('brand/icon-512.svg','public/icon-512.png',512);
  await r('brand/icon-maskable-512.svg','public/icon-maskable-512.png',512);
  await r('brand/icon-512.svg','/tmp/ico-32.png',32);
  await r('brand/icon-512.svg','/tmp/ico-16.png',16);
  fs.writeFileSync('app/favicon.ico', await require('png-to-ico')(['/tmp/ico-16.png','/tmp/ico-32.png']));
})();"
```

All rasters: PNG-24, opaque `#080b11`, sRGB. `apple-icon.png` gets **no alpha** and **no rounded
corners** — iOS masks it itself.

Theme colour: `<meta name="theme-color" content="#080b11">`, or in `app/layout.tsx`:
`export const viewport: Viewport = { themeColor: '#080b11' }`

## OG image

`opengraph-image.tsx` is a control-room slate: tally and timecode on the rail, a framed limb shot
with a chyron carrying the place name and the score, and a running order beside it whose last row
is honestly grey with `NO TIMESTAMP` — the thesis, stated in the artwork.

Needs `FunnelDisplay-SemiBold.ttf`, `FunnelSans-Medium.ttf`, `Newsreader-SemiBold.ttf`,
`SpaceMono-Regular.ttf` in `app/fonts/`. **ttf/otf/woff only — `next/og` cannot parse woff2.**
Flexbox only, no grid.

Swap the four `RUNNING_ORDER` entries for the real director state at build time and the card
stops being art and becomes a screenshot, which is the better version of it.

## Font note

`ı` (U+0131) lives in Funnel Display's **latin-ext** subset. If you self-host or subset the font,
keep that range or the wordmark loses its letter.
