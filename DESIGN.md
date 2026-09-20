---
name: Meanwhile
description: A live, AI-directed channel of Earth. Color is a claim — amber means on air, teal means verified live, grey means we could not verify.
colors:
  canvas: "#080b11"
  surface-1: "#10151d"
  surface-2: "#18202a"
  line: "#232d3a"
  line-strong: "#33404f"
  ink: "#e8eef4"
  ink-muted: "#94a3b3"
  accent: "#f5bd53"
  accent-ink: "#1a1204"
  live: "#43e6d4"
  success: "#5fd39a"
  danger: "#ff6f60"
typography:
  fontFamily:
    display: "Funnel Display, ui-sans-serif, system-ui, sans-serif"
    body: "Funnel Sans, ui-sans-serif, system-ui, sans-serif"
    place: "Newsreader, Georgia, serif"
    mono: "Space Mono, ui-monospace, Menlo, monospace"
  fontSize: { xs: 11px, sm: 13px, base: 15px, lg: 18px, xl: 24px, 2xl: 32px, 3xl: 44px }
  fontWeight: { regular: 400, medium: 500, semibold: 600 }
  lineHeight: { tight: 1.1, snug: 1.3, normal: 1.6 }
  letterSpacing: { display: "-0.03em", normal: "0", label: "0.14em" }
rounded: { sm: 2px, md: 6px, lg: 12px }
spacing: { base: 4px }
components:
  button-primary: { background: "{colors.ink}", color: "{colors.canvas}", rounded: "{rounded.md}", height: 40px }
  button-secondary: { background: "{colors.surface-1}", color: "{colors.ink}", border: "{colors.line}", rounded: "{rounded.md}", height: 40px }
  chip-onair: { background: "{colors.accent}", color: "{colors.accent-ink}", rounded: "{rounded.sm}" }
  chip-verified: { color: "{colors.live}", border: "{colors.live}", rounded: "{rounded.sm}" }
  chip-unverified: { color: "{colors.ink-muted}", border: "{colors.line}", rounded: "{rounded.sm}" }
---

# Overview

Meanwhile is a television channel whose only programming is the planet. An AI director scores
real webcam frames for beauty and cuts to the best one on air. The user watches; they do not query.

The design has one governing idea, and it comes from the product's actual problem rather than
from a mood board. Most "live" webcams on the internet are lying — one "live" Shibuya frame was
last modified in October 2022. Meanwhile's entire value is that it verifies before it shows you
anything. So in this interface:

**Color is a claim.**

- **Amber `#f5bd53` means ON AIR.** The director chose this frame. Nothing else in the product
  is ever amber. Not a hover, not a link, not a warning, not a logo flourish.
- **Teal `#43e6d4` means VERIFIED LIVE.** We read the source's own timestamp and it is under
  three hours old. Never applied to a frame whose age we could not confirm.
- **Grey `--ink-muted` means we cannot verify this.** Staleness and uncertainty are shown by
  the *absence* of color, never by a warning color.

There is deliberately **no `--warning` token**. A design that cannot make a claim should say
nothing rather than say something yellow. If you find yourself reaching for a warning color,
the correct answer is grey plus a sentence.

The vernacular is a broadcast control room — tally light, chyron, cut, running order, slate,
timecode — crossed with orbital observation: terminator, subsolar point, ground track.

# Colors

| Token | Value | Use |
|---|---|---|
| `--canvas` | `#080b11` | Page ground. Never pure black. |
| `--surface-1` | `#10151d` | Dock, cards, sheets. |
| `--surface-2` | `#18202a` | Raised rows, user chat bubbles, hover fills. |
| `--line` | `#232d3a` | All 1px separators and idle borders. |
| `--line-strong` | `#33404f` | Hover borders on interactive surfaces only. |
| `--ink` | `#e8eef4` | Primary text. 15.8:1 on canvas. |
| `--ink-muted` | `#94a3b3` | Secondary text **and the unverified state**. 7.1:1 on canvas. |
| `--accent` | `#f5bd53` | ON AIR only: tally dot, on-air score, on-air rail border. Never a button — no control in the product is amber. |
| `--accent-ink` | `#1a1204` | Text on amber. 11.4:1. |
| `--live` | `#43e6d4` | VERIFIED-FRESH only: freshness chips, verified polygon strokes. |
| `--success` | `#5fd39a` | Delivery confirmed. Nothing else. |
| `--danger` | `#ff6f60` | Destructive or failed. Never for staleness. |

Elevation on this dark canvas is built with the surface ladder, never with shadows. A shadow
appears only under the mobile bottom sheet, where a real edge is lifting off the page.

Accent budget: amber must stay under 5% of lit pixels. If two things on screen are amber, one
of them is wrong — there is only ever one frame on air.

Data-viz, if any is ever added: `--live`, then Okabe–Ito, never encoding by color alone.

# Typography

Four roles, and the fourth is the point.

| Role | Family | Used for |
|---|---|---|
| `--ff-display` | Funnel Display 600 | UI headings, the station ident, big numerals. Tracking `-0.03em`. |
| `--ff-body` | Funnel Sans 400/500 | Narration, descriptions, all running text. 15px/1.6, measure ≤ 60ch. |
| `--ff-place` | Newsreader 600 | **Place names only.** Nothing else, anywhere. |
| `--ff-mono` | Space Mono 400 | Scores, timecodes, ages, ids, stage lines, uppercase labels at `+0.14em`. Always `tabular-nums`. |

Restricting Newsreader to place names is the typographic version of the color rule. The place
name is the only emotional content in the interface — everything else is instrumentation — so
it gets the only editorial voice. A serif used everywhere is decoration; a serif used on exactly
one noun is an argument.

Headings get `text-wrap: balance`; running text gets `text-wrap: pretty`. Body text is never
below 15px, and mobile inputs are 16px so iOS does not zoom. Curly quotes, real ellipses, a real
minus sign, and a non-breaking space between every number and its unit.

# Layout

4px base unit. Rhythm comes from the contrast between tight gaps inside a group (4–8px) and
generous gaps between groups (32–64px). Uniform 24px padding everywhere is a tell; do not do it.

Three fixed regions, and two of them never unmount:

```
TopBar 56  ·  never unmounts, never freezes
Globe      ·  persistent canvas, never unmounts, never freezes
Dock 380   ·  slides in from the right; mobile = bottom sheet, snaps [0, 62vh, 92vh]
Rail 132   ·  horizontal, snap-scrolling; mobile = 96px peek strip
```

The load-bearing rule of the whole design: **when a panel opens, the channel keeps running
behind it.** If the director cuts while the dock is open, the chyron flips, the globe flies and
the rail re-ranks, all visible past the dock. An interface that hides its own subject while you
read about the subject has failed.

# Elevation & depth

Surface ladder only: `--canvas` → `--surface-1` → `--surface-2`. One 1px `--line` border does
the separating. Exactly one shadow exists in the product, under the mobile sheet:
`0 -8px 32px -8px rgb(0 0 0 / .55)`.

No `backdrop-blur`. No glass. No glow. No neon. The globe is the only luminous object on screen
and it stays that way.

# Shapes

Three radii and each has a job: `2px` for chips and tags, `6px` for buttons, inputs and frames,
`12px` for the mobile sheet's top corners. A child's radius equals its parent's minus the
padding. Never one radius on everything.

# Components

Full specs live in `UI-SPEC.md` (C-01 through C-12) with every state, transition and
acceptance case. `DESIGN.md` defines only the tokens those specs reference.

# Do's and don'ts

**Do**
- Make every color a claim you can defend from a timestamp.
- Say "age not verifiable" when it isn't, in grey, and move on.
- Let the channel keep running behind every panel.
- Show named stages during a wait, with counts that add up.
- Use `tabular-nums` on every number that changes or aligns.

**Don't**
- Use amber for anything other than on air. Not hover, not focus, not links, not warnings.
- Use teal on a frame whose age you have not confirmed from the source.
- Introduce a warning color. Grey plus a sentence is the warning.
- Use `backdrop-blur`, glass panels, glows or neon.
- Use emoji as icons. The signature glyph set in `brand/glyphs/` covers the product's own verbs.
- Use a generic spinner. Named steps, or a skeleton shaped like the real layout.
- Let the UI wait on the globe canvas to render. Rail and TopBar paint first.
- Use `--ff-place` on anything that is not the name of a place.
- Animate anything but `transform`, `opacity`, `filter: blur(≤4px)` and `clip-path`.
- Put a login wall, a loader or an empty state between someone and the first frame.
