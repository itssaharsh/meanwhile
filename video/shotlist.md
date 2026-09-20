# Meanwhile — shot list for a self-recorded screen capture

Use this if the sandbox recording is too slow or too choppy. Your machine has a real GPU, so the
globe runs at 60 fps for you and the footage will look markedly better than anything this
environment can produce.

**Record:** `https://honorable-opossum-473.convex.site/` at **1280×720** (or 1920×1080 and I'll
crop), browser in dark mode, no extensions visible, cursor visible. macOS: ⇧⌘5. Windows: Win+G.
OBS is ideal if you have it — set 30 fps, capture the browser window only.

**Before you start:** open the site once and let it fully load, then hard-refresh so the textures
are cached. Leave it on `/` (the landing). Have the browser window sized so the running order at
the bottom shows at least 6 tiles.

Don't narrate. I have the voice track. Just drive the UI at the pace below — a beat slower than
feels natural. If you fumble a step, pause 3 seconds and redo that step; I'll cut it.

| # | t | do this | dwell |
|---|---|---|---|
| 1 | 0:00 | Sit on the **landing page**. Don't touch anything. Let the globe turn. | 6 s |
| 2 | 0:06 | Move the cursor slowly over the **live preview card** on the right. Don't click. | 3 s |
| 3 | 0:09 | Click **Start watching** | — |
| 4 | 0:10 | Sit on the channel. Cursor still. Let the globe turn and the chyron sit. | 7 s |
| 5 | 0:17 | Move the cursor up to the **top bar** and rest under the freshness line. | 3 s |
| 6 | 0:20 | Click the **first tile** in the running order | — |
| 7 | 0:21 | Let the story panel open. Hover the **teal freshness chip**. | 6 s |
| 8 | 0:27 | Hover a **different tile** so its "PUT THIS ON AIR" label appears. | 3 s |
| 9 | 0:30 | Click that tile. Watch the chyron change and the chair chip appear. | 7 s |
| 10 | 0:37 | Click the **News** tab | — |
| 11 | 0:38 | Let it load. Scroll the news list down slowly, then back up. | 9 s |
| 12 | 0:47 | Click the **Ask** tab | — |
| 13 | 0:48 | Type `Where is the sun right now?` and press Enter | — |
| 14 | 0:52 | Let the answer stream in. Don't touch anything. | 12 s |
| 15 | 1:04 | Click **Story** tab, then click the globe and **drag to spin** it slowly. | 8 s |
| 16 | 1:12 | Click a **country** on the globe (try Japan, Italy or Norway). | 10 s |
| 17 | 1:22 | Let the country fetch run its named stages and land on a frame. | 8 s |
| 18 | 1:30 | Stop. | — |

That's ~90 seconds of raw footage. I'll cut it to 150 s with the card sections, hold shots where
the narration needs room, and add the camera moves and zooms in the edit.

**Send me:** the raw file (any format ffmpeg reads — .mov, .mp4, .mkv). Drop it anywhere in the
repo, or tell me the path.

**What I already have ready for it:**

- `voice/*.wav` — 11 narration lines, 120 s total, af_heart at 0.86
- `build/overlays/` — the hook, problem, tech and end cards, plus 57 caption pills
- `storyboard.json` — the full script and timing
- music bed, loudness normalisation to −14 LUFS, and the QA pass

Once your file lands I can have `final.mp4` back in about ten minutes.
