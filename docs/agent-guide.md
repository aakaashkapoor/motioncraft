# motioncraft agent guide

How to turn a prompt and its sources into a storyboard that renders cleanly the
first time. Read this before writing a storyboard. The design behind it is in
`docs/design.md` (the pipeline) and `docs/design-v2.md` (theme, transitions,
kit and media).

Every `json` example below is tested: it validates, passes the storyboard
checks in both 9:16 and 16:9, and renders (`tests/guide.test.ts`). Examples
marked **Incorrect** show a mistake on purpose.

## 1. Plan before you write

### One idea per scene

A scene says one thing: a claim, a number, a step list, a demo. If you need the
word "and" to describe what a scene shows, it is two scenes. Short scenes are
fine; the vertical format wants them. Open with a hook in the first two seconds
(a `TitleCard` or a `BigNumber` usually does it).

### Time windows against the narration

Write the narration first, one or two sentences per scene, then size each scene
to its line:

- Narration is spoken at about 150 words per minute (2.5 words a second) plus
  0.6 s of breathing room. A scene with narration and no `durationMs` takes its
  length from the narration, so leave `durationMs` out unless you need the scene
  to hold longer.
- On-screen text needs reading time: at least 1.5 s plus 0.25 s per word of
  scene text (captions are not counted). The readability check enforces it.
- A scene without narration must set `durationMs`. A scene built around a
  `VideoClip` can use `"durationMs": "clip"` to last as long as the clip.
- Motion is timed in milliseconds from the scene's start, never as a share of
  the scene: a component's first motion comes about 150 ms in, a cascade (cards,
  list rows, headline words) lands in about the first 1.2 s, and a fast exit
  (300-450 ms) lands on the scene's last frame. A longer scene only holds
  longer, so the point lands while the line is still being spoken.
- Things that play out keep their pace: a terminal types about 30 ms a
  character, a chat message takes about 650 ms (typing, then arriving). Give
  the scene that long plus a beat; if it is too short, they speed up to finish
  before the exit.
- A transition overlaps the two scenes it joins. Total length is the sum of the
  scenes minus the sum of the transitions, so a 600 ms transition takes 600 ms
  out of the scenes on both sides of it.

### A transition for every boundary

Choose a `transition` on every scene except the last. Leaving it out falls back
to the theme default (`slide`), and the storyboard check warns, because the
choice should be deliberate:

| `type` | Use it for |
| --- | --- |
| `slide` | The next step in a sequence. Both scenes travel the same way (`direction`: `left` by default, `right`, `up`, `down`); keep one direction for a whole film. |
| `fade` | A change of subject, or anywhere a shared element is the star (the morph reads best over a fade). |
| `zoomBlur` | An energetic reveal: the old scene scales up and blurs out, the new one sharpens in. Use sparingly. |
| `wipe` | A before/after or a hard change of section. Takes a `direction`. |
| `cut` | A deliberate hard cut, such as landing on a punchline. |

`durationMs` sets the length (default 600 ms, the theme's `motion.transitionMs`);
400-900 ms reads well.

### Shared elements for continuity

Give an element the same `shareId` in two neighboring scenes and the transition
morphs it from its box in the first scene to its box in the second (position,
size, radius, background, opacity) while everything else uses the
presentation. Windows (`AppWindow`, `BrowserWindow`, `TerminalWindow`,
`CodeWindow`, `ChatWindow`), `VideoClip` and `Image` take a `shareId`. The usual
move: a window is the hero of one scene, then docks in a corner with `Pinned`
while the next scene's content arrives beside it. Keep the window's props the
same on both sides so its content does not jump.

### The camera: shots and breathing

Each scene's content sits under a camera; the caption stays fixed. Two things
move it:

- **Shots** (a scene's `shots`) push in to one element and back. A shot starts
  at `atMs` and frames its `target`: a `shareId` in the scene, a rect
  `{ "x", "y", "width", "height" }` in frame px, or `"wide"` to pull back to
  the whole frame. The camera moves on the theme's `shot` token (750 ms, ease
  in-out; the shot's own `durationMs` overrides it) until the target fills
  `fill` of the frame (0.6-0.85, default 0.75), centered where a scene's main
  block goes and never past the content area, and holds until the next shot.
  The target is framed as it is laid out when the shot lands.
  List shots in time order. Use them deliberately, at most a push and a pull
  per scene: the usual one makes a docked `Pinned` window full size, so its
  text can be read. Land the shot before the narration talks about what it
  shows.
- **Breathing** is a slow drift over the whole scene: scale 1.00 -> 1.02,
  sine in-out, drifting 16 px on screen, in on one scene and out on the next.
  It is off in the built-in themes; switch it on with
  `"themeOverrides": { "motion": { "breathe": { "on": true } } }`.

`Pinned` and `Handoff` draw on parallax layers, so a camera move shows depth:
a docked window sits back (it follows 0.5x of the camera's motion), content
moves with the camera, and chips and a `Handoff`'s source float nearer
(1.15x). Shared elements morph through the camera, so a window carried into a
scene lands where the camera shows it. The checks judge every frame with the
breathing held still. While the camera is on a shot (pushing in, holding,
pulling back), what lies outside the shot is not judged there; the wide
frames around the shot judge it.

```json
{
  "id": "read",
  "component": "Pinned",
  "props": {
    "pinned": { "component": "ChatWindow", "props": { "channel": "launches", "shareId": "chat", "messages": [{ "author": "Maya Chen", "time": "9:41 AM", "text": "Ready for review." }] } },
    "content": { "component": "Card", "props": { "icon": "check", "title": "Reviewed" } }
  },
  "shots": [
    { "atMs": 1500, "target": "chat" },
    { "atMs": 4500, "target": "wide" }
  ],
  "narration": "Up close, the thread is easy to read.",
  "durationMs": 6000
}
```

**Incorrect:** a shot onto an element the scene does not draw, filling more
of the frame than a shot may.

```json incorrect
{
  "id": "read",
  "component": "ChatWindow",
  "props": { "channel": "launches", "messages": [{ "author": "Maya Chen", "time": "9:41 AM", "text": "Ready for review." }] },
  "shots": [{ "atMs": 1500, "target": "chat", "fill": 0.95 }],
  "durationMs": 6000
}
```

## 2. The storyboard

A storyboard is one JSON document. Top-level fields: `title`, `aspect`
(`"9:16"`, the primary format, or `"16:9"`), `fps` (default 30), `theme`
(default `"light"`), the theme fields in section 3, `safe` (below), and
`scenes`. Each scene has an `id` (unique), a `component` (a kit name from
section 5), `props`, and optionally `narration`, `durationMs`, `transition`
and camera `shots` (section 1).

```json
{
  "title": "Why our renders got faster",
  "aspect": "9:16",
  "theme": "light",
  "scenes": [
    {
      "id": "hook",
      "component": "BigNumber",
      "props": { "value": 42, "suffix": "%", "label": "faster renders" },
      "narration": "Our renders got forty-two percent faster this month.",
      "transition": { "type": "slide" }
    },
    {
      "id": "how",
      "component": "Section",
      "props": {
        "eyebrow": "What changed",
        "headline": "Three fixes",
        "content": {
          "component": "CardRow",
          "props": {
            "cards": [
              { "icon": "zap", "title": "Cached fonts" },
              { "icon": "box", "title": "Smaller bundle" },
              { "icon": "clock", "title": "Fewer waits" }
            ],
            "highlight": 0
          }
        }
      },
      "narration": "Three small fixes did it. Caching fonts mattered most.",
      "transition": { "type": "fade", "durationMs": 700 }
    },
    {
      "id": "end",
      "component": "TitleCard",
      "props": { "title": "Ship faster", "subtitle": "Try it today" },
      "narration": "Try it today."
    }
  ]
}
```

### Safe areas and layout

Layout is automatic, and you never place anything by hand. Every component
centers on the frame's center line (x = 540 in 9:16). A scene's main block sits
on the optical center of the safe area (y 840 in 9:16), not at the top of it.
Windows and card stacks are the primary width (760 px in 9:16), and the
narration caption sits in a band above the platform's own captions and
buttons. In 9:16, `safe` picks which platform UI the frame keeps clear of:

- `"shorts"` (the default): YouTube Shorts. Text stays in x 120-960 between
  y 240 and 1440, and off the like/share rail (x > 900 for y 960-1600).
- `"crosspost"`: safe on TikTok, Reels and Shorts at once. Text stays in
  x 200-880 between y 290 and 1240. This leaves less room: a docked window
  becomes an icon chip, and long text steps down sooner.

16:9 has no overlaid UI (96 px at the sides, 64 px at the top and bottom), so
`safe` changes nothing there.

```json
{ "safe": "crosspost" }
```

## 3. Theme and overrides

Themes are defaults, not rules. Anything the user asks for must be possible;
the checks enforce readability (contrast, safe areas, reading time), never
taste.

### Built-in themes

- `light` (the default): a flat warm-grey ground (`#e6e7df`), pure white cards
  with a soft wide shadow and 28 px corners, pale chips (`#f1f2ea`), near-black
  text and one orange accent (`#fb5a1f`), set in Source Sans 3.
- `dark`: deep tinted ground, raised surfaces, a soft blue accent, over the
  living `mesh` ground.
- `neutral`: the v1 look (system fonts), kept for compatibility.

Text set in the accent (a kicker, a highlighted step, `bold` headlines) is the
accent deepened just enough to read at WCAG AA, so the light theme's orange
shows as a burnt orange in text and as itself in fills, rings and icons.

### The vocabulary

- `theme`: pick the base.
- `accent`: a hex color for the one highlight color. A readable `accentText`
  (text on accent fills) is picked for you.
- `accentIntensity`: how much accent the video uses. `subtle` (one accent
  element per scene, the default), `bold` (accent headlines and cards) or
  `full` (the accent becomes the ground).
- `themeOverrides`: any token of the theme, deep-merged over it:
  - `colors`: the roles `ground`, `surface`, `surfaceAlt`, `text`, `textMuted`,
    `textSubtle`, `accent`, `accentText`, `border`, `shadow` (hex only). Keep
    neutrals tinted, never pure `#000000` or `#ffffff`.
  - `ground.style`: `solid` (flat, the light theme's), `vignette`, `grid` (a
    faint dot grid that breathes, 1.00 -> 1.04 over 8 s), `noise` (still
    grain) or `mesh` (three soft blobs of the accent and a tint of it drifting
    over the ground; the dark theme's). The mesh keeps text readable on its
    own: on a light ground it becomes a gentle warm light, because the muted
    text has little contrast to spare. `ground.grain`: film grain over any
    style, `0` (off, the default) or an opacity of 0.15-0.22; it changes 12
    times a second. `ground.mesh` (`blobs`, `minPx`/`maxPx`,
    `minAlpha`/`maxAlpha`) shapes the blobs.
  - `fonts.display`, `fonts.body`, `fonts.mono`: CSS font stacks. Only the
    bundled fonts are guaranteed to be present: `mc-sans` (Source Sans 3, the
    default sans), `mc-mono` (Source Code Pro, the default mono), and `mc-geist`
    and `mc-geist-mono` (Geist and Geist Mono, an alternative). All four are
    variable fonts, so every weight is drawn as itself. There is no serif;
    emphasis is weight or the accent color.
  - `type`: the type ramp (below). Override a step per aspect, e.g.
    `{ "type": { "headline": { "9:16": { "size": 104 } } } }`.
  - `weights`: the five weights, `regular` 400, `medium` 500, `semibold` 600,
    `bold` 700, `heavy` 800. Ramp steps carry their own; components use these
    for emphasis inside a step (a highlighted item, a name in a chat).
  - `spacing`: the 8 px scale, `xxs` 8, `xs` 16, `sm` 24, `md` 32, `lg` 48,
    `xl` 64, `xxl` 96, `xxxl` 128.
  - `radius` (`sm`, `md`, `lg`, `pill`), `cardShadow` (`y`, `blur`, `opacity`),
    `hairline`.
  - `motion`: `transition` and `transitionMs` (the defaults for boundaries),
    `leadMs` (when a scene's first motion starts, 150), `cascadeMs` (when a
    cascade has landed, 1200), and one token per kind of motion (design v3,
    table D), each with an `ms` duration and a `curve`: `fx.fast`, `fx`,
    `text.in`, `text.char` (a headline's characters, with `staggerMs`),
    `text.out`, `enter` (cards, windows, chips; with `staggerMs`),
    `enter.hero`, `pop`, `count`, `mark` (the marker sweep: `delayMs` after
    the text lands, a bar at `opacity` tilted `tiltDeg`, or an underline
    `underlinePx` thick), `shot` (with the default `fill`), `beat`; `breathe`
    is the camera's drift (`on`, `scale`, `curve`, `driftPx`; off unless `on`
    is true); `exit` takes a `share` of the entry within `minMs`-`maxMs`;
    `flow` is the dot that runs along a drawn connector (one trip per `ms`, a
    `dotPx` dot, and a `glowPx` ring of the accent at `glowOpacity` on the
    node it reaches; `"ms": 0` turns it off); `typing` is text typed with a
    caret (`cps` keystrokes a second on average, each gap varied by up to
    `jitter` of itself, a `pauseMinMs`-`pauseMaxMs` pause after a comma or
    full stop, a caret that blinks every `blinkMs`, and a printed line that
    fades in over its `ms`); `drift` moves the mesh blobs (up
    to `px` from home, each looping in `minMs`-`maxMs`), `grid.breathe` the
    grid (`ms`, `scale`, `curve`) and `grainFps` the grain. A `curve` is a name (`"linear"`, `"expoOut"`,
    `"expoIn"`, `"expoInOut"`, `"sineInOut"`, `"power4InOut"`), a
    cubic bezier `[x1, y1, x2, y2]`, or a spring `{ "stiffness": 170,
    "damping": 18 }`. Position and scale may overshoot; opacity and color
    never do.

### The type ramp

Every piece of text in the kit is set in one step of one ramp, with that
step's size, weight, tracking and line height; nothing else picks a size.
Components that need to fit long text step down the ramp (a long title goes
from `display` to `headline` to `title`), so sizes always stay on it. 16:9 is
about 0.92x of 9:16, never smaller: a 16:9 video is shown smaller on a phone.

| Step | Used for | 9:16 px | 16:9 px | Weight | Tracking | Line height |
| --- | --- | --- | --- | --- | --- | --- |
| `numeral` | `BigNumber` digits | 240 | 220 | 700 | -0.04 em | 0.9 |
| `hero` | a 1-3 word hook, an end card | 152 | 140 | 800 | -0.035 em | 0.95 |
| `display` | `TitleCard` title | 120 | 112 | 800 | -0.03 em | 1.0 |
| `headline` | `Section` headline | 96 | 88 | 700 | -0.025 em | 1.05 |
| `title` | card and window titles, list titles | 76 | 72 | 700 | -0.02 em | 1.1 |
| `subtitle` | subtitles, captions | 60 | 56 | 600 | -0.01 em | 1.15 |
| `body` | card body, list and chat text | 48 | 44 | 500 | 0 | 1.3 |
| `label` | timestamps, window chrome, notes | 40 | 36 | 500 | 0 | 1.3 |
| `eyebrow` | uppercase kicker, badges | 32 | 28 | 600 | +0.08 em | 1.2 |
| `mono` | code and terminal | 40 | 36 | 450 | 0 | 1.45 |

Headlines, captions and card titles are balanced across their lines
(`text-wrap: balance`); numbers use tabular figures. Small marks (kickers,
badges, step numbers) use `eyebrow`; anything meant to be read is `label` or
larger. Terminals and code windows shrink their `mono` text only as far as
their lines need to fit.

Colors come from these tokens. Components draw with theme roles, so do not put
your own hex colors in props: the theme-color check warns on any color in props
that is not one of the theme's (or the storyboard's own overrides). Where a prop
takes a color, pass a role name such as `"accent"`, or leave it out.

### Honoring requests

| The user says | Write |
| --- | --- |
| "use a dark theme" | `"theme": "dark"` |
| "light and clean" | `"theme": "light"`, `"themeOverrides": { "ground": { "style": "solid" } }` |
| "a moving background" / "more alive" | `"themeOverrides": { "ground": { "style": "mesh" } }` (add `"grain": 0.18` for film grain) |
| "make it orange" | `"accent": "#ff6a00"` |
| "lots of orange" | `"accent": "#ff6a00"`, `"accentIntensity": "bold"` |
| "an orange background" | `"accent": "#ff6a00"`, `"accentIntensity": "full"` |
| "our brand colors are navy and gold" | `"themeOverrides": { "colors": { "ground": "#14213d", ... } }` and `"accent": "#fca311"`, then let the contrast check confirm the text reads |
| "snappier" | `"themeOverrides": { "motion": { "transitionMs": 400, "enter": { "ms": 450 }, "fx": { "ms": 200 } } }` |
| "rounder" / "sharper" | `"themeOverrides": { "radius": { "md": 40 } }` / `{ "radius": { "md": 8 } }` |
| "use Geist" | `"themeOverrides": { "fonts": { "display": "mc-geist, sans-serif", "body": "mc-geist, sans-serif", "mono": "mc-geist-mono, monospace" } }` |
| "bigger headlines" | `"themeOverrides": { "type": { "headline": { "9:16": { "size": 104 }, "16:9": { "size": 96 } } } }` |

"Use a dark theme, with lots of orange":

```json
{ "theme": "dark", "accent": "#ff6a00", "accentIntensity": "bold" }
```

Geist instead of Source Sans 3, with heavier headlines:

```json
{
  "theme": "light",
  "themeOverrides": {
    "fonts": { "display": "mc-geist, sans-serif", "body": "mc-geist, sans-serif", "mono": "mc-geist-mono, monospace" },
    "type": { "headline": { "9:16": { "weight": 800 }, "16:9": { "weight": 800 } } }
  }
}
```

Brand colors on a light base:

```json
{
  "theme": "light",
  "accent": "#fca311",
  "themeOverrides": {
    "colors": { "ground": "#f3f1ec", "text": "#14213d", "textMuted": "#3d4a63" },
    "ground": { "style": "grid" }
  }
}
```

## 4. Checks

Run `npx tsx scripts/check.ts <storyboard.json>` after writing the storyboard
and after every fix. Storyboard checks run first, then the frame checks.

- **Storyboard checks.**
  - `transition` (warn): a boundary has no chosen transition.
  - `theme-color` (warn): a color in props is not a theme token or a color the
    storyboard set (`accent`, `themeOverrides.colors`).
  - `media` (error): a `VideoClip` or `Image` file is missing or unreadable.
    Paths resolve from the storyboard's folder. Frames are not checked until
    these are fixed.
- **Frame checks** on the start, middle and end of every scene: `overflow`
  (text clipped or off frame), `safe-area` (inside the `safe` profile's UI-free
  zone, with text also off the 9:16 button rail), `contrast` (WCAG) and
  `readability` (time on screen for the words shown). `type-scale` (warn)
  reports rendered text whose size is not a step of the type ramp; text a
  terminal or code window shrank to fit is allowed. `centering` (warn, 9:16)
  reports a scene whose main block (its cards, windows and text blocks
  together, without the caption) is more than 8 px off the frame's center line.

Warnings do not fail the run, but treat them as mistakes unless you meant it.

## 5. Component catalog

Every component takes the storyboard props listed here; `progress`, `theme`,
`aspect` and `area` are supplied by the renderer. All of them lay out in both
9:16 and 16:9. Icons are names from the bundled set: `chat`, `terminal`,
`code`, `check`, `shield`, `cloud`, `laptop`, `box`, `play`, `search`, `file`,
`user`, `users`, `lock`, `zap`, `chart`, `clock`, `globe`, `mail`,
`git-branch`, `settings`, `star`, `arrow-right`, `sparkles` (and the rest of
`ICON_NAMES`). Components that hold another component (`Section`, the windows,
`Pinned`) take it as `{ "component": ..., "props": ... }`.

### Text and data

#### `TitleCard`

A title with an optional `kicker` above and `subtitle` below. Openers, chapter
cards and endings. The lines land one after another; the title lands as a
whole unless `titleMotion` says `"words"` or `"chars"` (see `Headline`), and
takes `emphasis`, `mark` and `markStyle` like a `Headline`.

```json
{
  "id": "open",
  "component": "TitleCard",
  "props": { "kicker": "Field notes", "title": "Ship on Fridays", "subtitle": "Without the fear" },
  "narration": "Here is how we ship on Fridays without the fear."
}
```

#### `Headline`

One line of big text on its own: a hook, an end line, or a statement in
another component's slot. Set at `hero` and stepped down the ramp until it
fits (`role` starts it lower: `display`, `headline` or `title`).

- `motion`: how it lands. `"whole"` (default) rises and fades in as one line;
  `"words"` rises word by word through a clipped line, each word clearing a
  blur, for hooks and end cards; `"chars"` rises character by character.
  Words leave upward at the end of the scene.
- `emphasis`: one or two words set in the accent, as a phrase (`"a prompt"`)
  or a list (`["Ship", "Friday"]`).
- `mark`: one key word that an accent bar sweeps under once the text has
  landed; `markStyle` `"bar"` (default) or `"underline"`. One mark per scene,
  never on an emphasized word. `Section`, `SceneFrame` and `TitleCard` take
  the same three props for their headline.

```json
{
  "id": "hook",
  "component": "Headline",
  "props": { "text": "Videos from a prompt", "motion": "words", "emphasis": "prompt" },
  "narration": "Videos, from a single prompt."
}
```

#### `Caption`

One line of large text, paged when long. Narration is captioned
automatically; use `Caption` only for a text-only beat.

```json
{
  "id": "quote",
  "component": "Caption",
  "props": { "text": "Small steps, every day." },
  "durationMs": 2500
}
```

#### `BigNumber`

A number that counts up, with `prefix`, `suffix`, `decimals` and a `label`.

```json
{
  "id": "stat",
  "component": "BigNumber",
  "props": { "value": 3.5, "decimals": 1, "suffix": "x", "label": "more deploys a week" },
  "narration": "We now deploy three and a half times as often."
}
```

#### `StepList`

2-6 short steps in order, with an optional `title`, a `highlight` index drawn
in the accent, and `marker` `"number"` (default) or `"dot"`.

```json
{
  "id": "steps",
  "component": "StepList",
  "props": { "title": "Release day", "items": ["Freeze", "Test", "Ship"], "highlight": 2 },
  "narration": "Freeze, test, then ship."
}
```

#### `FlowDiagram`

2-4 labels joined by arrows, in flow order, with an optional `caption`.
Once it has built, a dot runs down each arrow in turn and the node it reaches
lights up, one node at a time, for as long as the scene holds.

```json
{
  "id": "flow",
  "component": "FlowDiagram",
  "props": { "nodes": ["Commit", "Build", "Deploy"], "caption": "Every push, automatically" },
  "narration": "Every push is built and deployed automatically."
}
```

### Layout

#### `Section`

The standard frame for explanatory scenes: an optional `eyebrow`, a heavy
`headline`, a `content` slot holding any component, and an optional `note`.
Content sits beside the headline in 16:9 and below it in 9:16;
`"contentWidth": "wide"` gives it more room in 16:9. The headline rises word
by word; `headlineMotion` (`"whole"`, `"words"`, `"chars"`), `emphasis`,
`mark` and `markStyle` work as in `Headline`. For the reference look, with
the header centered on top in both aspects, use `SceneFrame`.

```json
{
  "id": "section",
  "component": "Section",
  "props": {
    "eyebrow": "Step 2",
    "headline": "Test in parallel",
    "content": { "component": "StepList", "props": { "items": ["Unit", "Integration", "Visual"], "marker": "dot" } },
    "note": "About four minutes in total"
  },
  "narration": "Then every suite runs in parallel, in about four minutes."
}
```

#### `SceneFrame`

The scene frame of the reference look: a grey `eyebrow` (sentence case) and a
bold `headline` centered at the top, in the same place on every scene; the
`content` component centered in the room below; and a takeaway `footer`
centered at the bottom. The same in 9:16 and 16:9. The header lands first (the
headline as a whole by default), the content builds as the headline lands,
then the footer lands. `headlineMotion`, `emphasis`, `mark` and `markStyle`
work as in `Headline`. Give every content scene of a video the same frame.

```json
{
  "id": "how",
  "component": "SceneFrame",
  "props": {
    "eyebrow": "How it works",
    "headline": "Three steps to a video",
    "content": {
      "component": "CardRow",
      "props": { "cards": [{ "icon": "chat", "title": "Prompt" }, { "icon": "code", "title": "Plan" }, { "icon": "play", "title": "Render" }] }
    },
    "footer": "All on your machine",
    "mark": "video"
  },
  "narration": "Three steps: a prompt, a plan and a render, all on your machine."
}
```

#### `Pinned`

Docks one component (`pinned`) at 40% of the frame width while `content`
fills the rest at its own size. `corner` (`topLeft`, `topRight` (default),
`bottomLeft`, `bottomRight`) picks the spot: a column at that side in 16:9; in
9:16 the dock is centered at the top or the bottom. Where docking at that size
would crowd out the content (a short area, the `crosspost` profile), the
pinned component becomes an icon chip with its title instead of a tiny window.
Built for shared elements: with the default `"arrive": "settled"` the pinned
component is already in place, because it morphs in from the previous scene;
use `"animate"` when nothing morphs into it. Under a moving camera the docked
window sits back and the content in front; a shot onto the docked window's
`shareId` brings it up to full size (section 1).

```json
{
  "id": "pinned",
  "component": "Pinned",
  "props": {
    "arrive": "animate",
    "pinned": { "component": "TerminalWindow", "props": { "lines": [{ "prompt": true, "text": "npm test" }, { "text": "42 passed" }] } },
    "content": { "component": "FeatureList", "props": { "items": [{ "icon": "check", "text": "All green" }, { "icon": "clock", "text": "Under a minute" }] } }
  },
  "narration": "All forty-two tests pass in under a minute."
}
```

### Windows

Generic app chrome, never a real product's brand. Each takes a `shareId`.

#### `AppWindow`

A window with a `title` (and `chrome`: `"traffic"` or `"minimal"`) holding any
component as `content`.

```json
{
  "id": "app",
  "component": "AppWindow",
  "props": {
    "title": "Weekly report",
    "shareId": "report",
    "content": { "component": "BigNumber", "props": { "value": 128, "label": "orders today" } }
  },
  "narration": "The dashboard shows a hundred and twenty-eight orders today."
}
```

#### `BrowserWindow`

An address bar with a `url`, optional `tabs` and `activeTab`, and any `content`
in the page area. With `"typeUrl": true` the address bar types the url once the
window has arrived, and the page loads when it is entered (`seed` changes the
typing rhythm).

```json
{
  "id": "browser",
  "component": "BrowserWindow",
  "props": {
    "url": "example.com/pricing",
    "typeUrl": true,
    "content": { "component": "TitleCard", "props": { "title": "Simple pricing", "subtitle": "One plan" } }
  },
  "narration": "Pricing is one simple plan."
}
```

#### `TerminalWindow`

Typed commands (`"prompt": true`) and program output, line by line. Each
command types behind a live caret at a human pace (a little uneven, pausing
after punctuation), and its output fades in once it has been typed. Text stays
at the mono size: a long session scrolls the window rather than shrinking it.
`seed` (a number or string) changes the typing rhythm; the same seed types the
same way on every render.

```json
{
  "id": "terminal",
  "component": "TerminalWindow",
  "props": {
    "title": "deploy",
    "lines": [
      { "prompt": true, "text": "npm run deploy" },
      { "text": "Building..." },
      { "text": "Deployed in 38s" }
    ]
  },
  "narration": "One command deploys in under forty seconds."
}
```

#### `CodeWindow`

Syntax-highlighted `code` in a Prism `language` (default `typescript`), with a
`title`, `highlightLines` (1-based; the rest dim), `reveal` (lines arrive one
by one) and `lineNumbers` (default true).

```json
{
  "id": "code",
  "component": "CodeWindow",
  "props": {
    "title": "retry.ts",
    "language": "typescript",
    "code": "export async function retry(task, times = 3) {\n  for (let i = 0; i < times; i++) {\n    try { return await task(); } catch {}\n  }\n}",
    "highlightLines": [3]
  },
  "narration": "The fix is a small retry loop."
}
```

#### `ChatWindow`

A team chat: a `channel`, `messages` that arrive one by one (`author`, `time`,
`text`, optional `badge`, `reactions`, `highlight`, `avatar`, `typed`), an
optional `sidebar` (shown in 16:9) and floating `cards` that slide in
afterwards. Avatars get theme colors by author; leave `avatar.color` out. A
message normally arrives after a typing indicator; a `"typed": true` one (the
viewer's own) types into the composer first, then is sent. `seed` changes the
typing rhythm.

```json
{
  "id": "chat",
  "component": "ChatWindow",
  "props": {
    "channel": "#releases",
    "sidebar": { "workspace": "Acme", "channels": ["#general", "#releases"] },
    "messages": [
      { "author": "Dana", "time": "4:58 PM", "text": "Friday deploy?", "typed": true },
      { "author": "Deploy Bot", "badge": "APP", "time": "5:01 PM", "text": "v2.4 is live", "reactions": [{ "emoji": "🎉", "count": 3 }], "highlight": true }
    ]
  },
  "narration": "Friday at five, the bot says version two point four is live."
}
```

### Connectors and cards

#### `Arrow`

A line that draws itself from `from` to `to`: points in frame px
(`{ "x": ..., "y": ... }`, keep them inside both frame shapes if the storyboard
might be rendered in both) or `{ "anchor": "<shareId>" }` for an element in the
same scene. `curve` bends it, `color` is a theme role (default `"accent"`),
`label` sits at the middle. It sweeps in from the scene's lead; `window`
(`[start, end]` as fractions of the scene) draws it later, for a v2 storyboard.
Once drawn, an accent dot flows along it every 1.4 s.

```json
{
  "id": "arrow",
  "component": "Arrow",
  "props": { "from": { "x": 240, "y": 300 }, "to": { "x": 820, "y": 760 }, "curve": 0.3, "label": "next", "color": "accent" },
  "durationMs": 2500
}
```

#### `Handoff`

One thing handed to another: a source component `from` (a prompt `Card`, say)
and a receiver `to` (a window), joined by an `Arrow` that draws from one into
the other, with an optional `label`. The source arrives, the arrow draws, then
the receiver arrives. Side by side in 16:9, stacked in 9:16, so no points to
work out. Give the receiver a `shareId` to carry it into the next scene.
Under a moving camera the source floats a little nearer than the receiver.

```json
{
  "id": "handoff",
  "component": "Handoff",
  "props": {
    "from": { "component": "Card", "props": { "icon": "chat", "title": "The prompt", "subtitle": "Explain our deploys" } },
    "to": { "component": "AppWindow", "props": { "title": "Plan", "shareId": "plan", "content": { "component": "StepList", "props": { "items": ["Hook", "Steps", "Ending"] } } } },
    "label": "plan"
  },
  "narration": "A one-line prompt becomes a three-scene plan."
}
```

#### `Card`

One card: `icon`, `title`, `subtitle`, an optional `step` number, and
`highlighted` for the accent fill. A title alone is a label, centered under its
icon. With a subtitle the text stays left-aligned and the card hugs it,
centered as a block.

```json
{
  "id": "card",
  "component": "Card",
  "props": { "icon": "shield", "title": "Signed builds", "subtitle": "Every artifact", "highlighted": true },
  "narration": "Every build is signed."
}
```

#### `CardRow`

2-6 cards arriving staggered, with an optional `highlight` index lit in the
accent after they land.

```json
{
  "id": "cards",
  "component": "CardRow",
  "props": {
    "cards": [
      { "icon": "laptop", "title": "Write", "step": 1 },
      { "icon": "check", "title": "Review", "step": 2 },
      { "icon": "cloud", "title": "Ship", "step": 3 }
    ],
    "highlight": 1
  },
  "narration": "Write, review, ship. Review is where it matters."
}
```

#### `FeatureList`

2-6 rows of `icon` plus `text`, with an optional `title`.

```json
{
  "id": "features",
  "component": "FeatureList",
  "props": {
    "title": "What you get",
    "items": [
      { "icon": "zap", "text": "Fast builds" },
      { "icon": "lock", "text": "Private by default" },
      { "icon": "globe", "text": "Runs anywhere" }
    ]
  },
  "narration": "Fast builds, private by default, and it runs anywhere."
}
```

### Media

Real footage and images, from local files. `src` is relative to the
storyboard's folder. Both take `fit` (`"cover"`, the default, or `"contain"`)
and a `shareId`, and can sit full frame or inside a window's `content`.

#### `VideoClip`

`trimStartMs` and `trimEndMs` pick the part of the file, `rate` sets the speed,
`muted` leaves its audio out of the mix. Supported: `.mp4`, `.m4v`, `.mov`,
`.webm`. With `"durationMs": "clip"` the scene lasts as long as the clip.

```json
{
  "id": "demo",
  "component": "AppWindow",
  "props": {
    "title": "Live demo",
    "content": { "component": "VideoClip", "props": { "src": "media/demo.mp4", "trimStartMs": 1000, "trimEndMs": 5000, "fit": "contain" } }
  },
  "durationMs": "clip"
}
```

#### `Image`

An image with a `focus` point (`x`, `y` from 0 to 1), an optional slow Ken
Burns move (`zoom`: a scale or `{ "from", "to" }`; `pan`: `{ "x", "y" }` as
fractions of the box) and `alt`. Supported: `.png`, `.jpg`, `.jpeg`, `.webp`,
`.gif`, `.avif`, `.svg`.

```json
{
  "id": "photo",
  "component": "Image",
  "props": { "src": "media/team.jpg", "alt": "The team at launch", "focus": { "x": 0.6, "y": 0.4 }, "zoom": { "from": 1, "to": 1.12 } },
  "narration": "The whole team was there for launch day."
}
```

### A shared-element pair

The hero window docks in the corner while the cards arrive. Same `shareId`,
same props, a `fade` between them:

```json
{
  "title": "Shared element: the report docks",
  "aspect": "16:9",
  "scenes": [
    {
      "id": "hero",
      "component": "AppWindow",
      "props": {
        "title": "Weekly report",
        "shareId": "report",
        "content": { "component": "BigNumber", "props": { "value": 42, "suffix": "%", "label": "faster" } }
      },
      "narration": "Renders got forty-two percent faster.",
      "transition": { "type": "fade", "durationMs": 900 }
    },
    {
      "id": "why",
      "component": "Pinned",
      "props": {
        "pinned": {
          "component": "AppWindow",
          "props": {
            "title": "Weekly report",
            "shareId": "report",
            "content": { "component": "BigNumber", "props": { "value": 42, "suffix": "%", "label": "faster" } }
          }
        },
        "content": {
          "component": "CardRow",
          "props": { "cards": [{ "icon": "zap", "title": "Cached fonts" }, { "icon": "box", "title": "Smaller bundle" }], "highlight": 0 }
        }
      },
      "narration": "Two changes made the difference."
    }
  ]
}
```

## 6. Common mistakes

### Two ideas in one scene

**Incorrect:** a list that mixes the problem, the fix and the result, with one
line of narration racing through all of it.

```json incorrect
{
  "id": "everything",
  "component": "StepList",
  "props": { "title": "Builds, fonts, results and next steps", "items": ["Builds were slow", "We cached fonts", "Now 42% faster", "Next: images", "Then: video", "Hiring!"] },
  "durationMs": 3000
}
```

**Correct:** one scene per idea, each with its own line.

```json
{
  "title": "One idea per scene",
  "aspect": "9:16",
  "scenes": [
    { "id": "problem", "component": "TitleCard", "props": { "title": "Builds were slow" }, "narration": "Our builds were slow.", "transition": { "type": "slide" } },
    { "id": "fix", "component": "Card", "props": { "icon": "zap", "title": "Cache the fonts" }, "narration": "So we cached the fonts.", "transition": { "type": "slide" } },
    { "id": "result", "component": "BigNumber", "props": { "value": 42, "suffix": "%", "label": "faster" }, "narration": "Now they are forty-two percent faster." }
  ]
}
```

### Leaving the boundaries to chance

**Incorrect:** no `transition`, so every boundary silently takes the default
and the check warns.

```json incorrect
{
  "title": "No transitions",
  "aspect": "9:16",
  "scenes": [
    { "id": "a", "component": "TitleCard", "props": { "title": "Part one" }, "durationMs": 2000 },
    { "id": "b", "component": "TitleCard", "props": { "title": "Part two" }, "durationMs": 2000 }
  ]
}
```

**Correct:** a chosen transition on every boundary but the last.

```json
{
  "title": "Chosen transitions",
  "aspect": "9:16",
  "scenes": [
    { "id": "a", "component": "TitleCard", "props": { "title": "Part one" }, "durationMs": 2000, "transition": { "type": "wipe", "direction": "up" } },
    { "id": "b", "component": "TitleCard", "props": { "title": "Part two" }, "durationMs": 2000 }
  ]
}
```

### Inventing colors in props

**Incorrect:** hex colors made up on the spot. They ignore the theme, may not
read on it, and the theme-color check warns.

```json incorrect
{
  "id": "chat",
  "component": "ChatWindow",
  "props": { "channel": "#team", "messages": [{ "author": "Ana", "time": "9:00", "text": "Done!", "avatar": { "initials": "A", "color": "#e91e63" } }] },
  "durationMs": 3000
}
```

**Correct:** leave the color to the theme. To change the palette, change the
theme (section 3), not the props.

```json
{
  "id": "chat",
  "component": "ChatWindow",
  "props": { "channel": "#team", "messages": [{ "author": "Ana", "time": "9:00", "text": "Done!", "highlight": true }] },
  "durationMs": 3000
}
```

### "Lots of orange" as orange props

**Incorrect:** painting individual elements orange instead of telling the
theme.

```json incorrect
{
  "title": "Orange by hand",
  "aspect": "9:16",
  "scenes": [
    { "id": "a", "component": "Arrow", "props": { "from": { "x": 200, "y": 300 }, "to": { "x": 800, "y": 900 }, "color": "#ff6a00" }, "durationMs": 2000 }
  ]
}
```

**Correct:** set the accent and how much of it to use; every component follows.

```json
{
  "title": "Orange by theme",
  "aspect": "9:16",
  "accent": "#ff6a00",
  "accentIntensity": "bold",
  "scenes": [
    { "id": "a", "component": "Arrow", "props": { "from": { "x": 200, "y": 300 }, "to": { "x": 800, "y": 900 }, "color": "accent" }, "durationMs": 2000 }
  ]
}
```

### "Dark theme" as pure black

**Incorrect:** overriding the light theme with pure black and white. Neutrals
should be tinted, the surfaces and muted text no longer match, and contrast
breaks in places.

```json incorrect
{ "theme": "light", "themeOverrides": { "colors": { "ground": "#000000", "text": "#ffffff" } } }
```

**Correct:** use the built-in dark theme, which sets every role together.

```json
{ "theme": "dark" }
```

### Narration longer than the scene

**Incorrect:** a fixed `durationMs` far shorter than its line (24 words need
about ten seconds).

```json incorrect
{
  "id": "rushed",
  "component": "TitleCard",
  "props": { "title": "Faster builds" },
  "narration": "We spent the last three months rewriting the build pipeline from scratch so that every single change ships to production in under five minutes flat.",
  "durationMs": 2000
}
```

**Correct:** let the narration set the length (leave out `durationMs`), and
trim the line to what the scene shows.

```json
{
  "id": "paced",
  "component": "TitleCard",
  "props": { "title": "Faster builds" },
  "narration": "Every change now ships in under five minutes."
}
```

### A shared element that does not match

**Incorrect:** the two windows carry different `shareId`s (and different
titles), so nothing morphs; the window just disappears and reappears.

```json incorrect
{
  "title": "Broken pair",
  "aspect": "9:16",
  "scenes": [
    { "id": "a", "component": "AppWindow", "props": { "title": "Report", "shareId": "report" }, "durationMs": 3000, "transition": { "type": "fade" } },
    { "id": "b", "component": "Pinned", "props": { "pinned": { "component": "AppWindow", "props": { "title": "Report v2", "shareId": "report-small" } } }, "durationMs": 3000 }
  ]
}
```

**Correct:** the same `shareId` and the same props on both sides (see the
shared-element pair in section 5).

```json
{
  "title": "Matching pair",
  "aspect": "9:16",
  "scenes": [
    { "id": "a", "component": "AppWindow", "props": { "title": "Report", "shareId": "report" }, "durationMs": 3000, "transition": { "type": "fade" } },
    { "id": "b", "component": "Pinned", "props": { "pinned": { "component": "AppWindow", "props": { "title": "Report", "shareId": "report" } } }, "durationMs": 3000 }
  ]
}
```

### Media paths that are not there

**Incorrect:** an absolute path from another machine, or a file nobody copied
in. The media check fails before any frame is drawn.

```json incorrect
{ "id": "clip", "component": "VideoClip", "props": { "src": "C:/Users/someone/Desktop/final_v3.mp4" }, "durationMs": "clip" }
```

**Correct:** copy the file next to the storyboard (a `media/` folder) and refer
to it relatively.

```json
{ "id": "clip", "component": "VideoClip", "props": { "src": "media/final.mp4", "trimEndMs": 4000 }, "durationMs": "clip" }
```

### Icons that do not exist

**Incorrect:** an icon name guessed from another icon set. Rendering fails with
the list of known names.

```json incorrect
{ "id": "card", "component": "Card", "props": { "icon": "rocket-launch", "title": "Launch" }, "durationMs": 2000 }
```

**Correct:** a name from the bundled set (section 5).

```json
{ "id": "card", "component": "Card", "props": { "icon": "sparkles", "title": "Launch" }, "durationMs": 2000 }
```
