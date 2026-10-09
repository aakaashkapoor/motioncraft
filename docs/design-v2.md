# motioncraft design v2: a real design system, clean transitions, real video

v1 proved the pipeline (storyboard → frames → checks → MP4). Its look is flat:
system fonts, plain dark background, every scene is text fading in, and no
transitions. v2 gives motioncraft a design system, motion primitives, transitions
that carry elements from one scene to the next, a component kit, and real
video and image layers.

## Principles

1. **Defaults, not rules.** Themes and tokens are good defaults. Anything a user
   asks for must be possible: light or dark, a different palette, heavy use of
   the accent color, other fonts. Checks enforce *readability* (contrast, safe
   areas, reading time), never taste.
2. **Continuity.** Scenes don't just cut. Something carries the eye across:
   a shared element that morphs into its next position, or a cut that lands in
   the middle of a motion.
3. **One clear idea per scene,** laid out by a small, consistent grammar.
4. **Real media is first-class.** Footage, screen recordings and images sit
   alongside code-drawn graphics, frame-accurate.
5. **Deterministic.** Same storyboard, same pixels. No `Math.random`, no wall
   clock, and no frame captured before fonts and media are ready.

## 1. Theme and tokens

A theme is a plain object of tokens. The storyboard can override any of them.

- **Color roles:** `ground` (background, may be a gradient), `surface` (cards),
  `surfaceAlt`, `text`, `textMuted`, `textSubtle`, `accent`, `accentText`,
  `border`, `shadow`. Neutrals are tinted, never pure #000 or #fff.
- **Ground styles:** `solid`, `vignette` (a soft radial gradient), `grid`
  (a faint dot grid) and `noise` (subtle grain, seeded). The theme picks one by
  default.
- **Accent intensity:** `subtle` (one accent element per scene, the default),
  `bold` (accent headlines, accent cards) and `full` (accent as the ground).
  Requests like "lots of orange" map here.
- **Type:** bundled open fonts (SIL OFL, in `assets/fonts/` and recorded in
  `licenses/`): a sans (Geist or Source Sans 3) and a mono (Geist Mono). The ramp:
  `eyebrow`, `headline`, `title`, `body`, `caption`, `mono`, each with size, weight,
  tracking and line height for both 9:16 and 16:9. Headlines are heavy with tight
  tracking (-0.02em); eyebrows are small and muted.
- **Shape and depth:** radius scale, card shadow (soft and long), hairline borders.
- **Motion tokens:** the default easing (expo-out), spring presets, standard
  durations (enter, exit, transition) and stagger step.
- **Built-in themes:** `light` (warm light-grey ground, white cards, one accent),
  `dark` (deep tinted ground, raised surfaces) and `neutral` (the v1 look, kept
  for compatibility).

## 2. Motion primitives (engine)

- `spring({ frame, fps, config, durationInFrames?, delay? })`: a damped
  harmonic oscillator. Presets: `smooth` (no bounce, the default), `snappy`,
  `gentle`, `bouncy`. `measureSpring` gives the time to settle.
- `Easing.bezier(x1, y1, x2, y2)`, plus `expoOut`/`expoIn` (the house curves).
- `interpolate` with multiple keyframes, an easing per segment, extrapolation
  modes, and `interpolateColors`.
- `stagger(index, { start, step })` for choreographing groups.
- `drawPath(progress, pathLength)` → stroke dash values, for lines that draw
  themselves.
- `random(seed)` and `noise2D(seed, x, y)`, deterministic.

## 3. Transitions between scenes

The timeline supports **overlapping scenes**. A transition of N frames between
A and B renders both. Total length = sum of scenes − sum of transitions. Each
side gets `{ progress, direction: "in" | "out" }`.

- **Presentations:** `cut`, `fade`, `slide` (both scenes travel in one direction,
  and the cut lands mid-motion), `zoomBlur` (the old scene scales up and blurs
  out, the new one scales down from about 0.8x and sharpens) and `wipe`.
- **Shared elements (the key feature).** Any element can carry a `shareId`. When
  A and B both contain an element with the same `shareId`, the transition morphs
  it from its box and style in A to its box and style in B (position, size,
  radius, background, opacity), springing with the transition timing. The
  element's content cross-fades inside the moving box. Everything else uses the
  scene presentation. Example: a chat window shrinks from the hero into the
  corner while the next scene's cards arrive around it.
- The storyboard sets a transition per scene boundary (`transition: { type,
  durationMs }`), and the theme sets the default (`slide`, about 600 ms).

## 4. Layout grammar

`Section` is the standard frame for explanatory scenes: an optional `eyebrow`
(small, muted), a `headline` (big, heavy), a content slot, and an optional
`note` (one quiet line at the bottom). It adapts to the aspect ratio: content
sits beside the headline in 16:9 and below it in 9:16. Components fill the slot
and lay themselves out with flexbox inside the content area.

## 5. Component kit

Each component takes `{ progress, theme, aspect }` plus its props, animates in
with the motion tokens, supports `shareId`, and has 9:16 and 16:9 layouts.

- **Windows:** `ChatWindow` (sidebar with channels, messages appearing one by
  one with avatars, names, timestamps, app badges and reactions; generic, not
  any real product's brand), `TerminalWindow` (typed commands and output),
  `BrowserWindow` (address bar plus any content), `AppWindow` (generic chrome
  holding any child, such as a video), `CodeWindow` (syntax-highlighted code,
  line highlights).
- **Connectors:** `Arrow` (straight or curved, drawn with `drawPath`, with an
  arrowhead that appears at the end) between any two anchored elements or points.
- **Cards:** `Card` (icon, title, subtitle), `CardRow` (cards arriving staggered
  with one highlighted in the accent), `FeatureList` (icon plus line items).
- **Text:** `Headline` (word-by-word rise), `Callout`, `Quote`.
- **Data:** `BigNumber` (v1, restyled), `BarCompare`, `ProgressRing`.
- **Media:** `VideoClip`, `Image` (see section 6).
- **Icons:** a bundled permissively licensed line-icon set (for example Lucide, ISC).

## 6. Real video and images

- `VideoClip` props: `src` (a local file), `trimStartMs`, `trimEndMs`, `fit`
  (cover or contain), `rate`, `muted`, and placement: full frame, or inside a
  window or card via the slot.
- Frame-accurate rendering: for each output frame the page seeks the video
  element to the exact media time and waits until that frame is decoded and
  painted before capture. A scene can take its length from the clip.
- Images: `Image` with fit, focal point and a slow Ken Burns pan/zoom option.
- Audio from clips is kept for the narration/mixing work (it isn't rendered by
  v2's silent MP4 path, but the timing is stored).
- A render readiness gate covers fonts, images and video frames. The renderer
  never captures early, and fails with a clear error after a timeout.

## 7. Agent guidance

`docs/agent-guide.md`: how to plan a video (one idea per scene, time windows
against the narration, a transition chosen for every boundary, shared elements
for continuity), the theme override vocabulary, and Incorrect/Correct examples.
New checks: every boundary has a transition, no invented colors outside theme
tokens unless the storyboard overrides them, video files exist and are readable.

## Build order (for Nightshift)

Wave 1 (parallel, separate folders): theme and tokens · fonts and the readiness
gate · motion primitives · icon set.
Wave 2: overlapping-scene transitions (timeline and page) · `Section` layout ·
`Card`/`CardRow`/`FeatureList` · `Arrow`.
Wave 3: shared-element transitions · `ChatWindow` · `TerminalWindow`/
`CodeWindow` · `BrowserWindow`/`AppWindow` · `VideoClip`/`Image`.
Wave 4: agent guide and checks · a new showcase in both aspect ratios.
