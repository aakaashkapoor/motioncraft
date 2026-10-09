# motioncraft design v3: life, type and centering

v2 gave motioncraft the right pieces (windows, cards, transitions, shared
elements, real media). The owner watched the v2 showcase and found it dead:
text off-center, font sizes incoherent, nothing moving once it lands. v3 keeps
the engine and the storyboard format and changes the look: fonts, one type
scale, symmetric layout, millisecond motion, a camera, and a set of "life"
animations.

**This file is the contract for every v3 task.** Sizes, weights, spacing,
safe areas and timings come from the tables below (through the theme tokens
the foundation task adds), never from numbers invented inside a component.

**Every visual task ends with a self-review:** render stills of its fixture in
both aspects, including mid-motion frames (`npx tsx scripts/stills.ts <fixture>
--out <dir> --frames ...`), open the PNGs and look at them, and fix anything
off-center, cramped, too small, or still. A task is not done because the tests
pass. The bar is the bang-motion test: if a frame could be a corporate slide
without changes, it fails.

Research behind this (2026-10-09), condensed from the owner's research notes.

## Why v2 looks dead

I rendered per-scene stills of `examples/showcase/storyboard.json` (9:16, light
theme) and read the kit. The owner's complaints all have concrete causes:

1. **"Dead": motion is timed as a fraction of the scene, then everything freezes.**
   Kit entrances are fractions of `progress`, not milliseconds: `Card` ENTER 0.25,
   `AppWindow` 0.25, `BigNumber` 0.2, `CardRow` cards done at 0.6, `ChatWindow`
   messages done at 0.78. In the showcase's 4.8-7.3 s scenes a card spends 1.2-1.8 s
   arriving (sluggish), then nothing moves until the exit. The ground is a static
   vignette and there is no camera. Every hold is a still image.
2. **"Incoherent fonts": weights that don't exist get swapped.** Only Geist 400, 600
   and 800 are bundled (`src/render/fonts.ts`), but the ramp and components ask for
   450, 500 and 700. CSS font matching picks 400 for 450/500 and **800 for 700**. So
   card titles, step labels, chat names and BigNumber (all `fontWeight: 700`) render
   in the same ExtraBold as headlines, and every "medium" subtitle renders Regular.
   Hierarchy collapses into two weights.
3. **Two type systems.** `theme.type` (the ramp: headline 128, title 88, body 52) and
   `theme.typeScale` (display 128, title 88, subtitle 64, body 52, caption 40) both
   exist; `Section` uses one, `Card`/`Caption`/others use the other, and about a dozen
   components hard-code their own weights and line heights. 16:9 gets `0.8x` sizes,
   which is backwards: on a phone held upright a 16:9 video is shown at 56% of the
   size of a 9:16 one, so 16:9 text needs to be the same px or bigger, not smaller.
4. **"Not centered": the layout is off-center and left-aligned.** The 9:16 safe area
   is asymmetric (left 54 px, right 130 px), so the content column is centered on
   x = 502, not 540: every caption and title sits 38 px left of the frame center.
   `CardFace` aligns its content `flex-start` (icon and text top-left) inside a card
   stretched to the full width, so "The prompt / A launch intro" hugs the left edge
   with an empty right half. (I checked Geist's vertical metrics: ascent 1005,
   descent 295, cap height 710, so capitals are already optically centered in the line
   box; the problem is horizontal and structural, not font metrics.)
5. **Too small and too empty on 9:16.** The pinned `AppWindow` shrinks to about 270 px
   wide with ~16 px text; the terminal is half the width; scenes park content at the
   top of the content area and leave a dead band between it and the caption.
6. **Captions sit under the platform UI.** The bottom margin is 18% (346 px), so the
   caption plate lands at about y 1450-1550. Every platform covers that strip with the
   title, channel name and subscribe button (see section 3).

The fixes are mostly design-system work plus a camera and a few kinetic components,
not engine replacement.


## The v3 look (the contract)

### A. Fonts

| Role | Font | Weights | License |
|---|---|---|---|
| Sans (headlines, body, UI, captions) | Geist Sans, **variable** `Geist[wght].woff2` | 400 / 500 / 600 / 700 / 800 | OFL-1.1 |
| Mono (code, terminal, numbers in UI) | Geist Mono, variable | 400 / 500 / 600 | OFL-1.1 |
| Accent (one or two emphasis words) | Instrument Serif, Italic + Regular | 400 | OFL-1.1 |

Delete `typeScale`; keep one ramp. Components read sizes, weights, tracking and line
height only from it (no hard-coded `fontWeight: 700`).

### B. Type scale

Modular scale, ratio 1.25, base 48 px on 9:16 and 44 px on 16:9, rounded to 4 px.

| Step | Use | 9:16 px | 16:9 px | Weight | Tracking | Line height |
|---|---|---|---|---|---|---|
| `numeral` | BigNumber digits | 240 | 220 | 700 | -0.04 em | 0.9 |
| `hero` | 1-3 word hook, end card | 152 | 140 | 800 | -0.035 em | 0.95 |
| `display` | TitleCard title | 120 | 112 | 800 | -0.03 em | 1.0 |
| `headline` | Section headline | 96 | 88 | 700 | -0.025 em | 1.05 |
| `title` | card / window title, big list items | 76 | 72 | 700 | -0.02 em | 1.1 |
| `subtitle` | subtitles, captions (default) | 60 | 56 | 600 | -0.01 em | 1.15 |
| `body` | card body, list text, chat text | 48 | 44 | 500 | 0 | 1.3 |
| `label` | timestamps, small UI, notes | 40 | 36 | 500 | 0 | 1.3 |
| `eyebrow` | uppercase kicker | 32 | 28 | 600 | +0.08 em | 1.2 |
| `mono` | code, terminal | 40 | 36 | 450 | 0 | 1.45 |

- Captions use `subtitle` (60 px, 600-700) as the floor; the "punch" caption style uses
  `title`-`headline` (76-96 px, 800).
- Text inside windows that are meant to be *read* never goes below `label` (40 / 36
  px). If it would, the window is a picture: zoom the camera to it (see life #4), or
  cut the text.
- 16:9 is 0.92x of 9:16, not 0.8x.

### C. Spacing, grid and 9:16 safe-area rules

- **Spacing scale (8 px base):** 8, 16, 24, 32, 48, 64, 96, 128. Card padding 40 px
  (9:16) / 32 px (16:9); gap between stacked cards 24 px; headline to content 48 px;
  eyebrow to headline 16 px.
- **Two safe profiles**, selectable in the storyboard (`safe: "shorts" | "crosspost"`):

| Zone (1080x1920) | `shorts` (default) | `crosspost` (TikTok + Reels + Shorts) |
|---|---|---|
| Top margin | 240 | 290 |
| Bottom margin (nothing readable below) | 480 -> y <= 1440 | 680 -> y <= 1240 |
| Text column | x 120-960 (840 wide, centered on 540) | x 120-880; keep centered text within x 200-880 |
| Right rail, no text | x > 900 for y 960-1600 | x > 880 everywhere |
| Hook zone | y 260-560 | y 300-560 |
| Optical center for the hero element | y ~840 (middle of 240-1440) | y ~765 |
| Caption band (last baseline) | y 1180-1400 | y 1040-1230 |

- **Center on x = 540.** Margins left and right of the *text column* are symmetric;
  the right-rail rule is a keep-out for text, not a shift of the whole layout.
- Backgrounds, ground, decorative shapes and full-bleed media ignore the safe area.
- **Fill the frame:** in 9:16 the primary visual (window, card stack, number) is
  760-840 px wide, at least 60% of the visible height is used, and the content
  block is vertically centered on the optical center, not top-anchored.
- **Cards:** single-line labels are centered (icon above, text centered). Multi-line
  cards keep left-aligned text but hug their content width (`fit-content`, max 840)
  and are centered as a block, so nothing hugs one edge with an empty half.
- **Pinned/docked elements** never shrink below 40% of the frame width; if the
  content won't fit, the pinned element becomes an icon chip instead of a tiny window.
- **16:9:** 96 px side margins, 64 px top and bottom; two-column layouts on a
  12-column grid (gutter 32 px); the hero sits on the left two-thirds line or center.

### D. Motion tokens: easing and durations (30 fps)

All kit timings move from fractions of the scene to **milliseconds from the scene
clock** (the kit already has `frameContext`); scene length decides only how long the
hold lasts.

| Token | Use | Duration | Curve |
|---|---|---|---|
| `fx.fast` | opacity, colour, highlight on/off | 150 ms (5 f) | `(0.31, 0.94, 0.34, 1)` |
| `fx` | fades, blur clearing | 200-300 ms (6-9 f) | `(0.34, 0.80, 0.34, 1)` |
| `text.in` | word/line rise | 550 ms (16 f), stagger 55 ms/word, 30 ms/char, 70 ms/line | expoOut `1-2^(-10t)` |
| `text.out` | words leave | 300 ms (9 f), stagger 20 ms | expoIn / `(0.3, 0, 0.8, 0.15)` |
| `enter` | cards, windows, chips | 600-700 ms (18-21 f), stagger 90 ms | spring stiffness 170, damping 18 (~5% overshoot) or bezier `(0.38, 1.21, 0.22, 1)` |
| `enter.hero` | the one big element per scene | 800-1000 ms (24-30 f) | spring stiffness 120, damping 20 (~3%) |
| `pop` | emphasis: highlight card, active badge | 400 ms (12 f) | spring stiffness 200, damping 14 (~15%) |
| `exit` | anything leaving | 60-75% of its entry, 300-450 ms | `(0.3, 0, 0.8, 0.15)` |
| `count` | number roll | 900-1200 ms | expoOut |
| `mark` | marker/underline sweep | 450 ms, starts 400-600 ms after text lands | `(0.33, 1, 0.68, 1)` (power3.out) |
| `shot` | camera move to a new framing | 600-900 ms | `(0.65, 0, 0.35, 1)` |
| `breathe` | camera drift during holds | whole scene | sine in-out, 1.00 -> 1.04 |
| `transition` | scene change (cut-the-curve) | 500-600 ms | power4 in/out (design-v2) |
| `beat` | hold before a payoff | 300-750 ms | n/a |

First motion of each scene starts at 100-200 ms. Nothing is still for more than
~1.5 s: if the scene's own content has settled, the camera and ground are still moving.

### E. "Life" animations to add, ranked by impact

1. **Camera rig with breathing and shots** (render layer, wraps every scene; `Pinned`,
   `Handoff`, windows). The world sits in a container 8% larger than the frame
   (overscan). Default: scale 1.00 -> 1.04 over the scene, sine in-out, direction
   alternating per scene, focus drifting <= 24 px. Storyboard `shots`:
   `[{ atMs, target: elementId | rect, fill: 0.6-0.85, durationMs: 700 }]` push to an
   element (1.4-2.2x for UI) and back to wide. Text appears after the shot lands.
   Model: motion-canvas-camera (MIT), bang-motion `shot()/frameOn()` (MIT).
2. **Ms-based timings everywhere** (all kit components). Not an effect, but the single
   biggest cure for "dead": entrances become 0.5-0.8 s regardless of scene length,
   and cascades finish in the first ~1.2 s, leaving the hold to the camera, ground and
   emphasis beats below.
3. **Kinetic headline** (`Section`, `TitleCard`, new `Headline`). Each word in an
   overflow-clipped line rises `y 100% -> 0`, `blur 8px -> 0`, `opacity 0 -> 1`,
   550 ms expoOut, stagger 55 ms; optional char mode `yPercent 60 -> 0, scaleY 1.45 ->
   1`, stagger 24 ms (bang-motion). Exit: words go up `-40%` and fade, 300 ms expoIn,
   stagger 20 ms. One word may be set in Instrument Serif Italic in the accent colour.
4. **Word-highlight captions** (`Caption`). Pages of 3-6 words (or 1-3 in `punch`
   style), centered at x 540 in the caption band, 60-64 px weight 700 (punch: 88-96 px
   800, uppercase, 14-20 px dark stroke with `paint-order: stroke`). Page enters
   `scale 0.9 -> 1, y +24 -> 0`, 170 ms; the active word turns accent and scales 1.04
   over `min(4 frames, half the word)`, optionally with a rounded accent plate behind
   it (radius 12, padding 6/12). Needs word timings from narration; fall back to an
   even split.
5. **Living ground** (`Ground`). Add `mesh` style: 3 radial blobs, 900-1200 px,
   accent and accent-tint at 10-22% alpha, blurred, each drifting +-60 px along
   `noise2D` with a 4-6 s period; `grid` style breathes scale/opacity 1.0 <-> 1.04 over
   8 s; optional grain at opacity 0.15-0.22 re-seeded at 12 fps. Deterministic.
6. **Marker / underline sweep on the key word** (`Section`, `TitleCard`, `Caption`
   punch words, `FeatureList`). An accent bar behind the word, `scaleX 0 -> 1` from
   the left, 450 ms power3.out, rotated -1.5 deg, 55% opacity (or a 6-8 px underline
   at 100%), starting 400-600 ms after the text lands. One per scene.
7. **Odometer number** (`BigNumber`). Per-digit columns roll to the target, 1000 ms
   expoOut, digit stagger 40 ms from right to left, 2-6 px vertical blur on moving
   digits, tabular numbers, `numeral` step. A bar or ring fills in the same window;
   on landing, a `pop` scale 1.0 -> 1.04 -> 1.0 and the unit fades in 150 ms later.
   Model: number-flow (MIT).
8. **Card cascade with lift** (`CardRow`, `FeatureList`, `StepList`, `Card`). Items
   enter from `y +80, scale 0.94, opacity 0` with the `enter` spring, stagger 90 ms;
   the shadow grows with the lift (blur 24 -> 64, y 8 -> 24). The highlighted item
   then `pop`s: scale 1.04, accent ring 4 px, icon chip fills with accent, and the
   others dim to 55% opacity over 200 ms. Steps light up one by one in time with the
   narration instead of all at once.
9. **Shine sweep** (`Card` highlight, `BigNumber` landing, `AppWindow` and
   `BrowserWindow` on land, end card). A diagonal band (transparent -> white 35% ->
   transparent, 30% of the element's width, skewed -20 deg) crosses once in 800 ms
   with `(0.6, 0.6, 0, 1)`, clipped to the element's radius. Once per element, never
   looped. Model: magicui `animated-shiny-text`, HyperFrames `vfx-*`.
10. **Typing with a live caret and cursor** (`TerminalWindow`, `ChatWindow` composer,
    `BrowserWindow` address bar). 30-45 characters per second with seeded jitter of
    +-30%, 200-400 ms pauses at punctuation, caret blink period 1.06 s (on 530 ms),
    output lines appear with a 120 ms `fx` fade and 8 px rise, and the window
    auto-scrolls with the `enter` spring. Optional oversized cursor (HyperFrames
    `oversized-cursor` skill): moves 600 ms ease in-out, click `scale 0.92 -> 1`.
11. **Flowing connectors** (`Arrow`, `FlowDiagram`). After `drawPath` completes, a
    10-14 px accent dot travels the path every 1.4 s (expo in-out), and the active
    node glows (shadow `0 0 0 6px accent/25%`) as the dot arrives; nodes light in
    sequence instead of all at once.
12. **Parallax depth for docked layers** (`Pinned`, `Handoff`, shared elements).
    Background layers move at 0.5x of the camera, foreground windows at 1.0x, floating
    chips at 1.15x, so a camera move or breathing shows depth. Combined with #1 this
    makes the docked chat or storyboard window feel like an object in a space rather
    than a sticker.

### F. Order of work (suggested)

1. Fonts (variable Geist + Instrument Serif), one ramp, remove hard-coded weights.
2. Safe profiles, centering on 540, caption band move, "fill the frame" layout rules.
3. Ms-based motion tokens across the kit.
4. Camera rig and living ground (life #1, #5).
5. Kinetic headline, word-highlight captions, marker (life #3, #4, #6).
6. Odometer, card cascade, shine, typing, connectors, parallax (life #7-#12).
7. Re-render the showcase and review contact sheets of settled and mid-motion frames
   (design-v2) plus a phone-sized preview with a Shorts UI overlay on top.

## Craft notes

### Short-form (9:16) best practice

#### Safe areas on 1080x1920

Platforms do not publish one number; these are the commonly used readings.

| Platform | Top | Bottom | Left | Right | Source |
|---|---|---|---|---|---|
| Instagram/Facebook Reels | 14% = 269 | 35% = 672 | 6% = 65 | 6% = 65 | Meta guidance, quoted by [Clipzi](https://clipzi.app/en/blog/shorts-tiktok-reels-safe-zones) |
| TikTok | ~240 | ~660 | ~120 | 120-240 (action column) | Clipzi (from TikTok ad overlays) |
| YouTube Shorts (ad reading) | ~288 | ~672 | ~48 | ~192 | Clipzi (Google's ad reference image) |
| YouTube Shorts (organic) | ~120 | ~300 | ~48 (subscribe button bottom-left ~80) | ~48 | [Blitzcut](https://blitzcutai.com/blog/best-caption-size-youtube-shorts-2026) |
| **Union of the three (strict)** | **290** | **680** | **120** | **200** | Clipzi: leaves a 760x950 box, x 120-880, y 290-1240 |

The organic and ad numbers disagree because ad overlays are bigger and the post
description grows upward when it is long. motioncraft today uses 154 / 346 / 54 / 130,
which is too low at the bottom for every platform.

#### Captions that perform

- **Word-level timing with an active-word highlight** is the standard
  ([HighStyle](https://www.highstyle.ai/insights/how-to-caption-short-form-videos),
  Revideo and Remotion templates). Highlight 10-15% of words in the accent; one rarer
  second accent for the single biggest word.
- **Words per page:** 1-3 very large words for high energy, or 3-6 words (one or two
  lines) for explainers. Never a full sentence. Remotion's template turns pages every
  1200 ms; Revideo uses 4 words.
- **Size at 1080 wide:** 60-75 px for standard captions, 75-95 px for bold styles,
  never under 55 px (Blitzcut); 80 px weight 700-800 in Remotion and Revideo; 120 px
  uppercase for the TikTok "punch" style.
- **Weight and contrast:** bold sans (700-800), white or near-white with a dark
  outline/shadow or a semi-opaque plate, contrast >= 4.5:1.
- **Position:** centered on x = 540, above the bottom UI, clear of faces. A
  "hook card" (<= 10 words, statement not question) for the first 3-4 s at the top of
  the safe area is the strongest sound-off pattern.
- **Text per screen** (bang-motion): one statement per shot, <= 5-6 words; a claim
  that needs more is two shots or a visual. UI mockups are the exception: they are
  read as pictures.

### Typography for video

#### Fonts and licenses

| Font | License | Verdict |
|---|---|---|
| **Geist Sans / Geist Mono** ([vercel/geist-font](https://github.com/vercel/geist-font)) | OFL-1.1 | Keep. v1.7.2 ships a variable `Geist[wght].woff2` (100-900) and has `tnum`, `case`, `ss01-ss11`. Bundling the variable file fixes the weight-swap bug at once. |
| **Instrument Serif** (regular + italic, [google/fonts ofl/instrumentserif](https://github.com/google/fonts/tree/main/ofl/instrumentserif)) | OFL-1.1 | Add as the one accent face: an italic serif word inside a sans headline ("Videos from *a prompt*") is the current launch-film look and gives contrast without a second sans. |
| Inter 4.1 ([rsms/inter](https://github.com/rsms/inter)) | OFL-1.1 | Excellent alternative; optical-size axis gives Inter Display at large sizes. No reason to switch from Geist unless a theme wants it. |
| Instrument Sans ([Instrument/instrument-sans](https://github.com/Instrument/instrument-sans)) | OFL-1.1 | Good alternate sans for a "warm editorial" theme. |
| Space Grotesk ([floriankarsten/space-grotesk](https://github.com/floriankarsten/space-grotesk)) | OFL-1.1 | Characterful display only; weak for body. Optional theme. |
| Bricolage Grotesque (google/fonts, `opsz,wdth,wght` axes) | OFL-1.1 | Punchy display for a loud "creator" theme. |
| Montserrat ([JulietaUla/Montserrat](https://github.com/JulietaUla/Montserrat)) | OFL-1.1 | The de-facto caption face (ExtraBold). Optional caption style. |
| Satoshi, General Sans, Clash Display (Fontshare / ITF) | **ITF Free Font License, not open source** | Free to use in your own videos, but the [licence](https://www.fontshare.com/licenses/itf-ffl) forbids redistribution and forbids offering the font "as a selectable font for third-party users" in a tool or template editor. **Cannot be bundled in public motioncraft.** |

#### Rules

- One family per role: Geist Sans for everything readable, Geist Mono for code and
  terminal, Instrument Serif Italic only for one or two emphasis words per scene.
- Only use weights that exist (with the variable font, any weight exists; still
  limit the system to 400, 500, 600, 700, 800).
- Weight contrast carries hierarchy: headline 700-800 versus label 500. Never two
  adjacent steps in the same weight.
- Tracking tightens with size: -0.035 em at 120 px and up, -0.025 em at 76-104 px,
  -0.015 em at 56-64 px, 0 for body, +0.08 em for uppercase eyebrows.
- Line height loosens as size drops: 0.95-1.0 for display, 1.05 for headlines,
  1.15 for titles, 1.3 for body; 1.15 for captions (tight blocks read faster).
- `text-wrap: balance` on headlines, captions and card titles (supported by the
  Chromium in Playwright 1.64); `font-variant-numeric: tabular-nums` on anything that
  counts.
- Line length: <= 16-18 characters per headline line and <= 28-32 per body line on
  9:16; <= 28 and <= 50 on 16:9.

### Animation craft: numbers from good sources

- **Split spatial from effects** (Material 3 Expressive). Position and scale may
  overshoot; opacity and colour never do. M3's
  [spring-derived beziers](https://m3.material.io/styles/motion/overview/specs):
  spatial fast `(0.42, 1.67, 0.21, 0.90)` 350 ms, default `(0.38, 1.21, 0.22, 1.00)`
  500 ms, slow `(0.39, 1.29, 0.35, 0.98)` 650 ms; effects fast
  `(0.31, 0.94, 0.34, 1.00)` 150 ms, default `(0.34, 0.80, 0.34, 1.00)` 200 ms, slow
  300 ms.
- **Classic decelerate/accelerate pairs.** M3 emphasized decelerate
  `(0.05, 0.7, 0.1, 1.0)` to enter, emphasized accelerate `(0.3, 0.0, 0.8, 0.15)` to
  leave; standard `(0.2, 0, 0, 1)`. Carbon expressive `(0.4, 0.14, 0.3, 1)`, entrance
  `(0, 0, 0.3, 1)`, exit `(0.4, 0.14, 1, 1)`. Durations grow with distance travelled.
- **Asymmetric rhythm** (bang-motion): enter firm and slower (0.7-1.3 s for hero
  elements, `power4.out`), exit fast (0.35-0.55 s, `power2.in`). Symmetric feels
  mechanical. Overlap old exits with new entrances.
- **Stagger:** 30 ms per character, 50-60 ms per word, 60-80 ms per line, 80-120 ms
  per card. Keep total cascade under ~600 ms or it reads as slow.
- **Overshoot:** 3-6% for cards and windows, 10-17% only for a single emphasis pop.
  Remotion's default spring (stiffness 100, damping 10) overshoots ~16%; damping 200
  never does.
- **Camera breathing** (bang-motion): the whole world slowly zooms 4-5% per scene with
  `sine.inOut`, alternating direction, chained without jumps. Shot changes (push to an
  element to 1.4-2.2x, 0.6-0.9 s, ease in-out) are a separate, visible layer. Text
  lands after the camera arrives.
- **Note on "no idle floating"** (design-v2): that still holds for individual
  elements bobbing. A global camera drift and a moving ground are different: they keep
  the frame alive without making text wobble. Both sources agree on that split.
- **Background motion menu** (bang-motion §7c): blurred colour blobs drifting +-60 px
  over 4-6 s; gradient position tweened over 8-15 s; grid "breathing" scale/opacity
  1.0 <-> 1.04 over 6-10 s; film grain at ~12 fps with opacity 0.2. Never a fully
  static ground.


## Sources and licenses

Licenses were checked against each repo's LICENSE / GitHub API on 2026-10-09.
"Borrow" means code can be copied into motioncraft (Apache-2.0) with attribution;
"ideas only" means study and reimplement.

| Source | License | What to take |
|---|---|---|
| [heygen-com/hyperframes](https://github.com/heygen-com/hyperframes) | Apache-2.0 (fonts/logos excluded) | 180+ catalog blocks in `docs/catalog/blocks` and `registry/blocks`: `lt-*` lower thirds (mask reveal, accent underline, soft pill), `mk-callout-highlight`, `mk-progress-stat`, `apple-money-count`, `code-typing`, `notification-cascade`, `camera-dolly-zoom`, `transitions-*` (push, blur, scale, radial, grid). Its `captions-overlay` skill: captions are an overlay, not a reserved band; at most one "embed" (giant word) per beat. Borrow. |
| [bangtutorial/bang-motion](https://github.com/bangtutorial/bang-motion) | MIT | The best "anti-PowerPoint" rule set I found (written in Indonesian): `references/anti-ppt.md` and `references/techniques.md`. Concrete GSAP recipes: char rise `yPercent 60 -> 0, scaleY 1.45 -> 1, 0.8 s power4.out, stagger 0.024 s`; exits `0.4 s power2.in, stagger 0.01`; marker highlight `scaleX 0 -> 1, 0.5 s power3.out, rotate -1.5deg`; always-on "camera breathing"; camera pushes to UI at 1.4-2.2x. Borrow freely. |
| [motion-canvas/motion-canvas](https://github.com/motion-canvas/motion-canvas), [examples](https://github.com/motion-canvas/examples), [ksassnowski/motion-canvas-camera](https://github.com/ksassnowski/motion-canvas-camera) | MIT | Generator-based choreography (`all`, `sequence`, `waitFor`), and a camera node that frames any child (zoom-to-rect, follow). The camera is the model for motioncraft's missing camera. Borrow. |
| [redotvideo/revideo](https://github.com/redotvideo/revideo) | MIT (examples repo has no license: ideas only) | [`examples/youtube-shorts`](https://github.com/redotvideo/examples/tree/main/youtube-shorts): word-level captions, 4 words per page, 80 px weight 800, 70% width box, active word coloured with a rounded plate behind it, page fade-in `min(0.1 s, half the first word)`. |
| Remotion: [template-tiktok](https://github.com/remotion-dev/template-tiktok), [Elements](https://www.remotion.dev/elements), [skills](https://github.com/remotion-dev/skills) | Remotion License (source-available, not OSI; templates ship with no license) | **Ideas only.** Numbers worth knowing: TikTok template captions 120 px max, fitted to 90% width, uppercase, 20 px black stroke with `paint-order: stroke`, active word `#39E508`, page enter `scale 0.8 -> 1, y +50 -> 0` with spring damping 200 over 5 frames, pages every 1200 ms. "Popping Word" element: 80 px Montserrat 700, active word scale 1.03 in `min(4 frames, half the word)`. Remotion's layout rule: at 1080 wide, headline >= 84 px, supporting text >= 44 px, key text >= 80 px from the sides and 100 px from top/bottom. |
| [magicuidesign/magicui](https://github.com/magicuidesign/magicui) | MIT | `text-animate` presets (blurInUp: `opacity 0, blur 10px, y 20 -> 0, 0.3 s`; stagger 0.05 s per word, 0.03 s per char, 0.06 s per line), `animated-shiny-text` (a moving gradient band, `cubic-bezier(.6,.6,0,1)`), `number-ticker` (spring damping 60, stiffness 100, `tabular-nums`), `highlighter`, `word-rotate`. Borrow. |
| [ibelick/motion-primitives](https://github.com/ibelick/motion-primitives) | MIT | Text Effect, Text Shimmer, Animated Number, Spotlight, Border Trail. Borrow. |
| [barvian/number-flow](https://github.com/barvian/number-flow) | MIT | The best open odometer: per-digit columns, digits roll the shortest way, width animates as digits are added. Borrow the digit-column approach for `BigNumber`. |
| [pqoqubbw/icons](https://github.com/pqoqubbw/icons) | MIT | Animated Lucide-style icons (each icon has a small "on enter" motion). Fits the existing Lucide set. Borrow. |
| [motiondivision/motion](https://github.com/motiondivision/motion) (Framer Motion / Motion One) | MIT | Spring and stagger conventions; `stagger(0.05, { from: "center" })`. Ideas and math only (it is clock-driven, not frame-driven). |
| [theatre-js/theatre](https://github.com/theatre-js/theatre) | core Apache-2.0, **studio AGPL-3.0** | Keyframe/sequence model is nice; do not copy studio code. |
| [airbnb/lottie-web](https://github.com/airbnb/lottie-web), [dotlottie-web](https://github.com/LottieFiles/dotlottie-web) | MIT | Deterministic playback with `goToAndStop(frame, true)`. |
| LottieFiles free animations | [Lottie Simple License](https://lottiefiles.com/page/license) | Commercial use OK, attribution optional, but the files are share-alike and the license must travel with them. Keep any in `assets/lottie/` with their license text; do not mix into Apache-2.0 code. |
| Rive | runtimes MIT; community `.riv` files carry their own licences | Check each file. Not a priority. |
| [DavidHDev/react-bits](https://github.com/DavidHDev/react-bits) | **MIT + Commons Clause** | Not open source; ideas only. |
| GSAP | Free "no charge" licence since Webflow, but not OSI | Ideas and curve names only. |
| [reactvideoeditor/remotion-templates](https://github.com/reactvideoeditor/remotion-templates), locomotion-pro | no license | Ideas only. |
| Design-system motion specs: [Material 3](https://m3.material.io/styles/motion/easing-and-duration/tokens-specs), [IBM Carbon](https://carbondesignsystem.com/elements/motion/overview/) | docs | Exact curves and durations, used in the tables below. |

The two richest borrowable sources are HyperFrames (blocks) and bang-motion (rules).
Read `bang-motion/references/anti-ppt.md` in full; its "if this frame could be a
corporate slide without changes, it fails" test is exactly the owner's complaint.
