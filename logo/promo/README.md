# WeWrite 2.0 promotional poster

A brand-relationship poster for WeWrite 2.0. It has to say, in one look, that WeWrite is a
plugin **built on Obsidian** and that it **publishes to WeChat Official Accounts**.
The artwork is simply named **`WeWrite-2.0`** — that string is the master's `<title>` and nothing
else; there is no versioned or campaign-specific file naming to keep in sync.

| File | Purpose |
|---|---|
| `wewrite-2.0-poster-2048x1152.png` | Screen / social, 16:9 |
| `wewrite-2.0-poster-4096x2304.png` | Print, exactly 2× the above |
| `wewrite-2.0-poster.html` | The master. Self-contained — open it in a browser, nothing is loaded from disk or network. Its `<title>` is `WeWrite-2.0`. |
| `wewrite-cover-main-2.35x1-900x383.png` · `…-1800x766.png` | WeChat Official Account cover, 2.35:1 |
| `wewrite-cover-square-1x1-900x900.png` · `…-1800x1800.png` | WeChat square thumbnail, 1:1 |
| `wewrite-cover-wide-3.35x1-1283x383.png` · `…-2566x766.png` | Main cover + square side by side, 3.35:1 |
| `src/` | Everything needed to regenerate all of the above. |
| `../assets/readme-banner.png` | The banner at the top of the repository README. Generated here, committed there. |

Composition, top to bottom: the **WeWrite** wordmark with a **`2.0` plaque** sitting just off
its right edge (a visible gap, nothing connecting them) — the plaque is an **ogee** plaque: a
convex cap narrowing to a crest at top and bottom, a concave shoulder at the waist, and a convex
corner tangent to each vertical edge, plus a small outward ear at the middle of each long side,
drawn as a purple body with a thin colour band / white ring / body triple stroke; a lavender
panel holding the **Obsidian** crystal and the **WeWrite** mark side by side at equal ink height
with the word "Obsidian" along its lower edge; then a hand-drawn arrow labelled 「发布到」
pointing at the green **WeChat Official Account** swirl.

The plaque's vertical centre is aligned with the wordmark's — that is a first-class requirement,
not a by-product of the layout (the user rejected an earlier revision that sat 42px low).

## Rebuild

```bash
node logo/promo/src/build.mjs      # the poster (writes the HTML master + both PNG sizes)
node logo/promo/src/covers.mjs     # the WeChat covers + the README banner (reads the poster above)
```

`build.mjs` renders the HTML master, writes both PNG sizes, runs the layout assertions and the
artifact assertions, and exits non-zero if anything fails. Both suites print their own counts, so
the numbers cannot drift out of sync with this README (currently 36 layout and 41 artifact).
`covers.mjs` must run **after** it: it reads `wewrite-2.0-poster.html` and the 2048px PNG that
`build.mjs` just wrote, which is what keeps the covers from drifting away from the poster.
Requires Chrome — headless Chrome is the only renderer involved. No npm dependencies.

Text is set in **Microsoft YaHei** (labels, plus 「发布到」 at weight 600), Arial Black for the
plaque's 「2.0」, Segoe UI for the rest. All three ship with Windows; `verify.mjs` fails if any
font outside the whitelist appears, and `build.mjs` additionally proves the font is really
installed rather than silently substituted — see *Fonts* below.

To inspect details at true pixel scale after a change (a full-size screenshot read back at
2048px wide gets resampled and hides faceting, fringing and stroke noise):

```bash
node logo/promo/src/zoom.mjs                        # five magnified crops → src/.tmp/
node logo/promo/src/tools/gapprobe.mjs              # pixel-proof of the wordmark ↔ plaque gap
node logo/promo/src/tools/labelprobe.mjs            # plaque silhouette vs. the reference image
node logo/promo/src/tools/tagsil.mjs                # same comparison, but on the **delivered PNG**
node logo/promo/src/tools/ringprobe.mjs             # band / ring widths read off the delivered PNG
node logo/promo/src/tools/arcfit.mjs                # re-derive the plaque's arc constants from the reference
node logo/promo/src/tools/shapesheet.mjs            # side-by-side candidates for the plaque shape
node logo/promo/src/tools/contentbox.mjs <png>      # content box + row segments of any delivered PNG
node logo/promo/src/tools/lockup.mjs                # measures lockup-v's ink profile (shaft position!)
node logo/promo/src/tools/coverprobe.mjs            # pixel-proof of the three WeChat covers
node logo/promo/src/tools/bsheet.mjs                # six B layouts side by side → the 0.90 choice
```

`gapprobe.mjs` reads the **delivered PNG** back and measures the actual distance between the two
purple objects in the title row. It derives the title row's own row range first, then finds the
longest run of background columns inside it: do **not** shortcut this to "the top half of the
canvas", because the panel's logos, the arrow and the WeChat logo all reach above y=576 and the
probe would report the empty space right of the plaque instead. It currently agrees with the
`gap` constant exactly (26px) — that agreement is itself checked: the wordmark is placed by its
*measured* ink box (`wewrite-wordmark.box.json`), so there is no hidden 5.6px of viewBox padding
inflating the constant, which is what used to make the parameter read 26px and the pixels 31px.

`tagsil.mjs` and `ringprobe.mjs` are the other two that read the delivered PNG rather than the
intermediate HTML, and that distinction earns its keep: `labelprobe` proves the *path* is right,
`gapprobe` proves the *placement* is, and neither proves the shape survived rendering. `tagsil`
closes that loop (it is what produced the 0.0036 figure), and because it measures the outermost
purple it is also the assertion that **the ear was not eaten** — an eaten ear shifts both
boundaries inward by about the ear depth. `ringprobe` reads the three layers' actual widths off
the same PNG, on the rows where the outline is analytically vertical, so a gone-wrong clip or a
stroke written as a fill cannot hide behind a plausible-looking picture.

`arcfit.mjs` is the derivation, not a check: it scans the reference's outer contour row by row and
least-squares-fits the three-arc chain under its four tangency constraints, printing the constants
that `tools/label.mjs` should contain. Run it if the reference image changes.

`shapesheet.mjs` and `bsheet.mjs` are the two "pick one" sheets — they render candidates side by
side so a choice is made by looking rather than by reading numbers. Neither decides anything on its
own: they exist so a parameter a probe produced can be sanity-checked by eye. `bsheet.mjs` also
self-checks: after rendering it re-measures its own PNG and compares each cell's four margins
against what `bCover` computed, failing non-zero on any mismatch. That check is not theoretical —
the plaque is positioned by an absolutely-positioned wrapper (`.b`, defined in `kit.mjs`), so
omitting that one CSS rule drops the plaque into normal document flow at the top-left of its cell
while the lockup keeps its own inline `position:absolute` and stays put. The page still looks like
a plausible picture of six covers; it is just wrong. That mistake was made once, and the
self-check is what caught it.

Scratch output from all of these lands in `src/.tmp/`, which is git-ignored — as do the one-off
probes written while investigating a specific defect (`refcrest.mjs`, the ink-threshold sweep that
proved the plaque's crest is a real feature rather than watercolour bleed being cut off;
`refruns.mjs`; `dump.mjs`, which prints the path's command structure so an outline refactor can be
proven byte-identical). Those are worth keeping in `.tmp/` rather than promoting: their findings
are recorded here, and they do not need to run again.

## The WeChat covers

`src/covers.mjs` produces the three covers a WeChat Official Account article needs, plus the README
banner. None of them is a generated image: every element is an existing vector (the poster master,
`logo/wewrite-lockup-v.svg`, the plaque geometry in `tools/label.mjs`), so they are reproducible,
assertable, and share the poster's tokens through `src/kit.mjs` — which is the point of that file.
If the covers had their own copy of the plaque, the two plaques sitting side by side in C would
drift apart.

- **A — 2.35:1**, the main cover. It is the poster's **content band**, not a re-layout. The band
  measures y 107..977 (`tools/contentbox.mjs`), so 2048 × 871 = **2.3513:1**. That is why 2.35 was
  the right ratio to ask for: the composition already had that shape, and the 16:9 canvas was
  padding around it. The band is measured at build time rather than hard-coded, so a layout change
  moves the crop with it.
  The band is **scaled to `1 − 2·PAD`** (`PAD = 0.07`) rather than filled edge to edge: the two
  shapes are the same ratio, so there is no crop that can buy a margin — the only way to get
  whitespace above and below is to shrink the content. That is also why A cannot reuse the poster's
  own background: once the content is inset, the poster's background would stop short of the frame,
  so every delivery image is drawn on the **canvas's own** glow (`GLOW_REL`). The assertion checks
  that A's *ink* has the poster's ink aspect ratio (1.98 both ways), not that some padding
  percentage matches — padding alone would also be satisfied by squashing the artwork.
- **B — 1:1**, the square thumbnail. `wewrite-lockup-v.svg` is the subject, with the same `2.0`
  plaque now hanging off the **pen shaft** — the vertical stem of the mark — rather than off the
  wordmark's right edge. That single change is what makes the square work: with the plaque beside
  the wordmark the group measured ~1.42:1 and the frame was left with a wide empty band, whereas
  beside the shaft it is **0.99:1**, so the group is centred with even margins on all four sides.
  The plaque's vertical placement follows from the same decision: its bottom sits on the mark's
  ink bottom (`lk.mark.bot`), because a plaque centred on the shaft alone would drop into the
  shaft-to-wordmark gap and read as detached.
  The shaft's position is **measured, not hard-coded**: `tools/lockup.mjs` renders the lockup on a
  transparent background, finds the row band that is a single continuous run inside the mark
  region (the shaft — it tapers at the foot, so a naive walk-up from the ink bottom stops after
  one row), and normalises everything by ink height. A constant would let the plaque overlap the
  wings the day the logo changes. The plaque keeps the poster's own plaque-to-wordmark proportion
  (`TAG_RATIO = 178/142`) times `B_TAG_SCALE = 0.90`, at the poster's gap (`B_GAP = 0.10` in ink
  heights). 0.90 comes from a rendered sheet of six variants (`tools/bsheet.mjs`): at 1.0 the
  plaque's inner edge crowds the pen's wing, and the plaque starts reading as a second object of
  the mark's own mass; at 0.80 the plaque has become small enough that the wordmark dominates it.
  The delivered PNG measures **75px** of clearance between the plaque and the nearest ink to its
  left (`tools/coverprobe.mjs`). Note the ring is *not* a factor in this choice — band and ring
  widths are fractions of the plaque's ink height, so they scale with it and read the same at any
  size.
- **C — 3.35:1**, A and B side by side = 2.35 + 1. Its width is derived as `A + A.height`, so 3.35
  is structural rather than a third number to keep in sync.

C's only real risk is the seam. If each half carried its own background, the two radial glows would
each be centred in their own box and the join would show a step. So the glow is defined **once** on
C's whole canvas and the poster's own background is switched off with a CSS override. That override
is the reason `covers.mjs` re-reads the delivered `wewrite-2.0-poster.html` rather than duplicating
the markup. The join measures a maximum channel difference of **1**.

The glow is `GLOW_REL`, written in **percentages** (`60.547% 57.292%`, i.e. the old absolute
`1240px 660px` divided by the poster's 2048×1152) because the four delivery canvases are very
different sizes: an absolute-px radius sized for the 16:9 poster floods the 383px-tall covers and
almost vanishes on the 1800px ones. `kit.mjs` exports both, and `covers.mjs` asserts the two stay in
that ratio so they cannot drift apart.

`tools/coverprobe.mjs` checks what a parameter assertion cannot: that A really does carry top and
bottom padding (and symmetrically), that B's group box is near-square (within 4%) with even margins,
that B's plaque is separated from the shaft by a real gap **and that the component it measured is
the plaque** (its aspect comes back 1.418, the plaque's own ratio), and that C's right half measures
exactly B scaled to 383 — i.e. that C is one composition and not two pictures pushed together.

Three measurement details in that probe are worth keeping:

- **Ink threshold 14, not 20.** Scaled down, the poster's light-purple frame (`#E3D6F9`) has its
  edges averaged away; at 20 the probe reports a false 125/122 left/right asymmetry on A where the
  truth is 122/122.
- **B's clearance is measured with connected components**, not by sampling the rightmost ink per
  row. The plaque's upper edge is narrower than its middle, so row-sampling under-samples it and
  reports the widest rows only. `components()` (4-neighbour flood fill) picks out the plaque as the
  right-most blob and then walks rows for the nearest approach to the ink on its left: **75px at
  y = 554**, against the wordmark, well clear of the 20px floor.
- **What counts as "the edge" has to be derived, not assumed.** The first version of the banner
  check took "the top half of the canvas" as its sampling band; that band contains the panel's
  logos, the arrow and the WeChat swirl, so it reported the wrong margin. The rule is: if a probe
  takes "some segment", say how that segment is defined.

## How the layout is built

`src/build.mjs` is the single source of truth. The whole composition comes from the `L`
constant table near the middle of the file: change a number there, run the command above,
get new artwork. Nothing is hand-positioned in an editor.

Six things are computed rather than eyeballed, because they were wrong when eyeballed:

1. **Symmetry.** The user asked for a balanced, symmetric composition. Margins, gaps and
   the shared centre line of the three main elements are asserted at the bottom of
   `build.mjs`, not judged by looking.
2. **"Equal height" for the two logos.** Obsidian's crystal is near-square, the WeWrite mark
   is wide. Setting both to the same ink height looks lopsided but is in fact correct —
   `src/tools/inkarea.mjs` measures the ink-area ratio at **0.990**. Do not "fix" this by
   scaling one of them down.
3. **The glyph heights of third-party SVG.** Obsidian's official file mixes relative path
   commands, so reading min/max off the `d` string yields nonsense (a box larger than the
   canvas). `src/tools/measure-svg.mjs` renders it on a transparent background and measures
   the real ink box instead. Current value: `57.75 0.25 454.25 511.75` in a 512×512 viewBox.
4. **Ink boxes of text, not advance widths.** 「发布到」 is centred on the arrow's geometric
   centre and must not run into the arrowhead, so its real ink extent matters — the em box,
   the advance width and the ink box are three different numbers. `src/tools/textink.mjs`
   renders the string on a transparent background and measures the ink; `build.mjs` uses the
   measurement for both positioning and the clearance assertion. Measured, 「发布到」 in
   YaHei Semi-Bold 600 is 116.5×38.5 at 40px — which is why the size is 40 and not 44: at 42px
   the clearance to the arrowhead drops to 11.75px and the assertion (≥12px) fails.
5. **The plaque's silhouette, by fitting it to the reference image.** The user supplied a
   reference (a watercolour painting) and asked for that shape. Its silhouette is extracted by
   pixel probe, normalised by ink height, and compared row by row against a rendered candidate;
   `src/tools/labelprobe.mjs` reports the mean deviation, so "getting the shape right" is a
   number to push down rather than a judgement call. The current outline is a tangent chain of
   three arcs (cap / shoulder / corner) fitted by `src/tools/arcfit.mjs`; the fitted values are
   half-width 0.6032, ear protrusion 0.1058, radii 0.3790 / 0.9191 / 0.1674, cap-to-shoulder
   direction −112.2°, ear half-height 0.155 and ear sharpness 0.75 — **all relative to the ink
   height**, not the body height, so they can be compared with the probe's output without
   conversion. Mean deviation: 0.0036 of the ink height, measured end-to-end on the delivered PNG.
   Two things here are method rather than taste. (a) The contour must be scanned **row by row**:
   sampling it in blocks smooths the fastest curvature away, and that hid the crest for a whole
   round — it is exactly what made the shape read as "too simple". (b) Every parameter is swept and
   accepted only at an **interior** optimum: kb 0.55 / 0.65 / **0.75** / 0.90 score 0.0047 / 0.0030
   / **0.0025** / 0.0043 in the ear region, so 0.75 is a genuine minimum rather than the edge of the
   explored range.
6. **The wordmark's ink box, before aligning anything to it.** The vertical centre of the plaque
   has to match the wordmark's, and the wordmark's *viewBox* is not quite its ink box (0.5px of
   padding on the left, 1.3px on the right). `tools/measure-svg.mjs` measures the real box and
   `build.mjs` uses it as the viewBox, so "right edge of the wordmark" means the ink edge. Both
   the alignment and the gap constant depend on this; without it the gap reads 26px in the
   source and 31px on the canvas.

## Assets and their colours

- **Obsidian** — `src/assets/obsidian-gradient.svg` is Obsidian's official logo file, used
  unmodified (the two `radialGradient`s are theirs; the poster does not redraw them). Only the
  element ids get an `obs-` prefix, because inlining a file with ids like `logo-top-left` would
  collide with the rest of the page. Obsidian and the Obsidian logo are trademarks of Dynalist Inc.
- **WeChat Official Account** — `src/assets/wechat-mp.svg` is traced from the official logo
  bitmap (`src/tools/trace-ref.mjs`, a self-contained PNG decoder + marching-squares tracer).
  The green is a **measured pixel value, `#00cc7a`** — not the widely quoted `#07C160`, which
  is a different colour from the official artwork. The poster uses the measured one, and
  `src/verify.mjs` asserts both that it is present and that `#07C160` is not.
- **WeWrite** — the already-finalised, font-outlined SVGs from `logo/`
  (`wewrite-mark-tight.svg`, `wewrite-wordmark.svg`), reused as-is.

## Rules to keep

- **No pure black.** WeWrite's mark and wordmark use a purple gradient (`#8B5CF6` →
  `#5B22C9`), label text uses `#2E2544`. `src/verify.mjs` fails if `#000` or `#17171B`
  reappears anywhere in the artwork. (`<mask>` interiors are exempt — `#000`/`#fff` there are
  channel values, not paint — so the check strips masks first. The poster no longer generates
  any mask itself, but third-party assets may carry one.)
- **Fonts must come from a verified list.** Missing fonts are substituted silently, so a
  layout can look "fine" while using the wrong typeface. `verify.mjs` checks every
  `font-family` declaration — in CSS *and* in SVG presentation attributes — against
  Arial Black / Segoe UI / Microsoft YaHei / HarmonyOS Sans SC. On top of that whitelist,
  `build.mjs` tests that the font is *actually installed* by rendering the same probe string in
  the font and in a deliberately non-existent font name and comparing ink boxes: a silent
  fallback makes the two identical. **Do not** use `document.fonts.check()` — on this machine it
  returns `true` for every name, including fonts that do not exist.
  (A handwritten face, `FZShuTi`, was used for 「发布到」 in an earlier revision; the user
  rejected it and the whitelist no longer accepts it, so a regression to handwriting fails.)
- **Hand-drawn means imprecise geometry, not a noise filter.** An earlier revision displaced
  the arrow edges with `feTurbulence` + `feDisplacementMap`; the user asked for that wobble to
  go. Hand-drawn and shaky are different axes:
  - *shaky* = high-frequency edge noise → looks like a bad signal;
  - *hand-drawn* = the shape itself is not exact → the two barbs are different heights, the
    tip sits 5px off the axis, the tail flares wider than the head end, long edges bow out a
    few pixels, and every corner is rounded because a marker has width.
  So `handPath()` builds the arrow from vertices + per-vertex corner radii + per-edge bow,
  and the lines stay clean vectors. `verify.mjs` asserts there is no `feTurbulence` or
  `feDisplacementMap` anywhere in the artifact.
- **A frame must contain its own ink. A viewBox is not a crop tool.** `wewrite-lockup-v.svg` declared
  `viewBox="0 0 112.002 116.76"` while the wordmark's real ink ran to **113.174** — so every consumer
  that let the SVG clip (an `<img>`, a CSS background, anything without `overflow:visible`) sliced
  the trailing **`e`** off into a flat vertical edge. `preserveAspectRatio="meet"` does not save you:
  it letterboxes, it never un-clips. The bug survived a long time because `logo/index.html` sets
  `overflow:visible`, so the one page everyone looked at was the one place it could not appear — a
  page-level accident hiding a file-level defect. The frame is now `0 0 114.2 116.76` (1.03 units of
  margin past the ink), propagated to the five `sizes/*.svg` and the four embeds in `logo/index.html`.
  Getting there needed the measured box, not the declared one: `tools/measure-svg.mjs` renders the
  artwork transparent and decodes the PNG, which is the only way to see that the ink runs 1% wider
  than a `d`-string or glyph bbox suggests.
  Two guard rails, because the fix is three files deep:
  - `tools/lockup.mjs` renders the lockup inside a viewBox **expanded by `PAD_U = 8` units on all
    four sides**. Overflow therefore still paints, and becomes a fact the build can assert — if the
    ink crosses the *true* viewBox by more than `TOL = 0.15` units, `covers.mjs` throws with the
    overflow in units. Rendering at the declared frame instead would have clipped the evidence along
    with the ink, and the assertion would have passed on the broken file.
  - `tools/coverprobe.mjs` compares the delivered wordmark's **ink aspect ratio** against the
    material's (`4.7197` vs `4.7210`, −0.03%). An aspect ratio is the shape's own property, so this
    holds whether or not anyone agrees on where the frame or the margin is — unlike a "does the ink
    touch the right edge" check, which a re-designed layout can invalidate for the wrong reason.
  Both were verified by control group, not by observing green: restoring the old viewBox makes
  `covers.mjs` exit 1 ("右 1.253 单位") and the degraded probe report `4.6720` (−1.04%). A guard that
  has never failed is not known to work.
  On margin width: the first fix (`113.6`, 0.43 units) left the probe's own tolerance at ~2.8px,
  inside the ±1px antialiasing noise, so a pass would not have meant anything. 114.2 puts it at
  ~8.2px.
- **The plaque is an ogee plaque with side ears, and it is *not* attached.** Earlier designs are
  deliberately not coming back:
  - a **hang tag** (chamfered corner, punched hole, dashed stitch, and a rope threaded through
    the hole) — the user asked for a different shape, and once the rope went, the hole became a
    hole with no rope in it: a hole, a stitch and a grommet are one vocabulary, so either all of
    them are there or none;
  - the **rope** itself, which tied the tag to the wordmark's ink — "不好看", removed;
  - a **plain rounded square** — the user's response was "the shape is too simple";
  - a **parabola + carve-circle** outline and any **other silhouette** (circle, ticket with side
    notches, bookmark with a V notch, double-chamfered square) — all rendered side by side by
    `tools/shapesheet.mjs` before being superseded by the reference-image fit below.

  The current geometry comes from `tools/label.mjs`: each half is a **tangent chain of three arcs**
  — a convex cap (the narrow crest), a concave shoulder (the waist) and a convex corner tangent to
  the vertical edge — plus two quadratic curves per ear. The parameters are not eyeballed.
  `src/tools/arcfit.mjs` scans the reference's outer contour row by row and least-squares-fits the
  three arcs under four constraints (apex on the midline, cap centre on the midline, two external
  tangencies, corner tangent to the edge); residual 0.0029 of the ink height ≈ 0.5px on the
  reference. Measured end-to-end on the delivered PNG (`src/tools/tagsil.mjs`) the mean deviation
  from the reference silhouette is **0.0036 of the ink height** — the previous outline scored
  0.0285, and that is why it read as "too simple": it sampled the contour in blocks, and block
  extrema smooth away the fastest curvature, which is exactly the crest. Row-by-row scanning is
  what exposed it, and a threshold sweep (`src/.tmp/refcrest.mjs`) is what proves the crest is
  real and not watercolour bleed being cut off. Only the **outer** contour is fit — the reference's
  interior paint fragments into a dozen pieces at any threshold.

  **The band and ring are strokes clipped to the outline, not insets of it.** The earlier version
  re-filled the outline shrunk by the band width, then again by band+ring. An inset of an arc is
  an arc, but an inset of the **ear** — a quadratic curve — has no analytic form; the workaround
  ("pin the control point to the edge line") under-reported how deep the ear survives, so the
  innermost layer lost its ear completely and the white ring piled up into a blob at both tips.
  Strokes have constant perpendicular width by definition, so band and ring are exact for any ear
  shape, and the fitted ear (71° tip, against the reference's measured 60–70°) survives untouched.
  `src/tools/ringprobe.mjs` measures the result on the delivered PNG: 6px band and 5px ring on the
  vertical edges (parameters 6.59 and 5.52), widening to 11px at the ear = 6.59/sin(36.9°) — the
  uniform-stroke law, and no blob. The ring is still thinner than the reference suggests (0.068 of
  the ink height, not the measured 0.085) because watercolour bleeding inflates stroke widths; that
  is now an aesthetic choice rather than a constraint.

  Five relationships are asserted: the plaque does not cover the wordmark, the gap is between
  8 and 40px, the plaque's ink centre equals the wordmark's ink centre, no `hangRope` element
  survives, and the outline is 8 convex + 4 concave arcs plus 4 ear quadratics — together with the
  chain's tangency residuals, the ear tip angle, and the three layers being a fill plus two
  clipped strokes. A shape change should change these assertions, not delete them.

## Caveat for real print

Text is set in system fonts and rasterised at render time. That is correct for screen use and
for most print at these sizes, but a large-format run that needs outlined vectors would
require converting the text to paths first — ask if that becomes a requirement.
