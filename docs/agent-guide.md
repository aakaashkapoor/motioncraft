# motioncraft agent guide

How to turn a prompt and its sources into a storyboard that renders cleanly the
first time. Read this before writing a storyboard. The design behind it is in
`docs/design.md` (the pipeline) and `docs/design-v2.md` (theme, transitions,
kit and media).

Every `json` example below is tested: it validates, passes the storyboard
checks in every aspect (9:16, 16:9 and 4:5), and renders (`tests/guide.test.ts`). Examples
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

### Word cues

A timed prop that takes a cue can start on a word of the scene's narration
instead of a fixed ms, so the motion lands as the word is said, whatever the
voice's pace. A cue is either a number (ms from the scene start) or an object:

- `word`: a word or phrase of this scene's narration. Matching ignores case and
  the punctuation around a word (`"wagyu"` matches `Wagyu,`). A phrase
  (`"split the bill"`) matches consecutive words and starts on its first.
- `occurrence` (default 1): which match, counting from 1, when the word is said
  more than once.
- `offsetMs` (default 0): added to the word's start; negative starts early.

The word is timed from the voice's own word times; with `--no-narration` or no
cached audio, from an even estimate over the scene, like the caption. Validation
is an error when the word (or that occurrence) is not in the scene's narration,
or when the scene has no narration. Here `at` starts on the second "wagyu",
100 ms early:

```json cue
{
  "narration": "Wagyu for four. Split the bill, not the wagyu.",
  "at": { "word": "wagyu", "occurrence": 2, "offsetMs": -100 }
}
```

Only these props take a cue: `BigNumber` `at`, `lines[].at` on `Headline` and
`TitleCard`, and a scene's `effects[].at` (below). `WordSwap` `cuesMs` and
`Notification` `atMs` are plain ms. A `BigNumber` word cue is checked only by
`scripts/check.ts` and the render, not by validation.

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
| `iris` | A reveal from one point: the new scene grows inside a circle with an accent ring on its edge. `origin` `{ "x", "y" }` (each 0-1 of the frame, default the center; `{ "x": 0, "y": 1 }` is the bottom-left corner) sets where it starts. Only `iris` takes `origin`. |
| `whipPan` | A fast camera whip to the next scene, blurred at the cut. Takes a `direction` like `slide` (`left` moves the content left, so the next scene enters from the right). |
| `cut` | A deliberate hard cut, such as landing on a punchline. |

`durationMs` sets the length (default 600 ms, the theme's `motion.transitionMs`);
400-900 ms reads well.

```json
{ "id": "open", "component": "TitleCard", "props": { "title": "Iris and whip pan" }, "durationMs": 3000, "transition": { "type": "iris", "durationMs": 900, "origin": { "x": 0, "y": 1 } } }
```

### Shared elements for continuity

Give an element the same `shareId` in two neighboring scenes and the transition
morphs it from its box in the first scene to its box in the second (position,
size, radius, background, opacity) while everything else uses the
presentation. Windows (`AppWindow`, `BrowserWindow`, `TerminalWindow`,
`CodeWindow`, `ChatWindow`), `VideoClip` and `Image` take a `shareId`. The usual
move: a window is the hero of one scene, then docks in a corner with `Pinned`
while the next scene's content arrives beside it. Keep the window's props the
same on both sides so its content does not jump.
A `TerminalWindow` or `PromptCard` that was typed in the first scene should set
`"typed": false` in the second, so it continues instead of re-typing.

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

### Scene effects

A scene's `effects` point at one element at the moment the narration names it:
a ring around it, a highlight band behind it, a shake (something is wrong) or a
pulse. Each effect has:

- `target` (required): a `shareId` in the scene, nested ones included. Besides
  windows, `VideoClip` and `Image`, a `Card` and a `BigNumber` take a `shareId`,
  and a `StepList` takes `shareIds` (one per step). Shots cannot target a
  single step.
- `kind` (required): `"ring"`, `"highlight"`, `"shake"` or `"pulse"`. A ring
  draws on over 400 ms and a highlight sweeps in over 300 ms; both hold until
  the scene leaves and move with the camera. A shake (360 ms) and a pulse
  (320 ms, scale to 1.06 and back) play once.
- `at` (required): a cue, a ms or a word (see "Word cues"). A ms must be before
  the scene's `durationMs`.
- `color`: `"accent"` (the default), `"positive"`, `"negative"`, `"text"` or
  `"muted"`. Only a ring and a highlight show it.
- `durationMs`: 100-2000, for a shake or a pulse.

A ring or highlight counts as a key element, so the safe-area check flags one
that pokes out of the safe area.

```json
{
  "id": "steps",
  "component": "StepList",
  "props": { "title": "Split a bill in three steps", "items": ["Scan the receipt", "Split it by item", "Settle up in one tap"], "shareIds": ["scan", "split", "settle"] },
  "narration": "Scan the receipt, then split it by item, and settle up in one tap.",
  "durationMs": 7500,
  "effects": [{ "target": "split", "kind": "ring", "at": { "word": "split" } }]
}
```

## 2. The storyboard

A storyboard is one JSON document. Top-level fields: `title`, `aspect`
(`"9:16"`, the primary format, `"16:9"` or `"4:5"`; see "Output"), `fps`
(default 30), `theme` (default `"light"`), the theme fields and brand `fonts`
in section 3, `safe`, `captionStyle`, `voice`, `voiceSpeed`, `pronounce` and
`overlays` (below), `opening` (below), and `scenes`. Each scene has an `id`
(unique), a `component` (a kit name from section 5), `props`, and optionally
`narration`, `audio` (your own recording, below), `durationMs`, `transition`,
camera `shots` and `effects` (section 1).

`opening` is `"settled"` (the default) or `"build"`. The first frame of a video
is its thumbnail on GitHub, Slack, X and most players until someone presses
play, so it should not be blank. With `settled`, the first scene's entrances
(headline, mark, and the `enter` of its content) count as finished at frame 0;
anything timed inside the scene (typing, cursor clicks, scheduled list items,
captions) still plays on its timeline, and the audio is unchanged. `build`
animates everything in from nothing. It affects only scene 1.

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
- `"tiktok"`: TikTok only. Text stays in x 120-960 between y 250 and 1520
  (the right 120 px and the bottom 400 px are TikTok's), the caption sits
  lower, and windows and card stacks are 840 px wide. Content fills more of
  the frame, and `Headline` and `CardRow` pick a larger type step where it
  fits.

16:9 has no overlaid UI (96 px at the sides, 64 px at the top and bottom), and
4:5 keeps a 64 px margin all round with no button rail (primary width 760 px),
so `safe` changes nothing in either.

```json
{ "safe": "tiktok" }
```

### Captions

Narration is burned in as a caption, a page of a few words at a time, centered
in the caption band. The word being spoken lights up in the accent and scales
up a touch, and each page pops in (scale 0.9 to 1, rising 24 px, in 170 ms).
With a voice track the words are timed from the voice itself and light up
about 100 ms ahead of being spoken; without one
(`--no-narration`) they are spread evenly over the scene, each taking time in
proportion to its length. `captionStyle` picks the look:

- `"standard"` (the default): pages of 3-6 words, one or two lines, in the
  ramp's `subtitle` at bold, on a plate of the ground color. For explainers.
- `"punch"`: pages of 1-3 big uppercase words on one line, in the ramp's
  `headline` at heavy, white letters on a dark outline. For high-energy hooks.
  A word too long for the line shrinks to fit.
- `"pill"`: pages like `punch` (1-3 words on one line, `headline` size) but
  bold and in sentence case, with an accent pill that slides behind the word
  being spoken. In the light theme a dark band sits behind the page.
- `"off"`: no caption; the narration is still the scene's length.

```json
{ "captionStyle": "punch" }
```

### Narration

Narration is spoken by default, by a voice that runs entirely on your machine.
The storyboard's `voice` picks it:

- `"af_heart"` (the default), `"af_bella"` and `"am_michael"` are the stock voices.
- The first narration downloads a pinned, hash-checked model once to
  `~/.cache/motioncraft`; after that nothing touches the network.
- Spoken audio is cached beside the storyboard in `.motioncraft/narration/`,
  so an unchanged line is never spoken twice.
- A narrated scene without `durationMs` follows its audio: a short lead, the
  audio, then a tail that leaves room for the outgoing transition. Set
  `durationMs` only when the scene's choreography needs longer.
- Captions light each word from the voice's own word times, about 100 ms ahead.
- The `narration-fit` check is an error when an explicit `durationMs` is
  shorter than lead + audio + tail. It names the total needed; lengthen the
  scene or remove `durationMs`.
- `npx tsx scripts/narrate.ts <storyboard.json>` speaks the narration ahead of
  time, so `scripts/check.ts` and `scripts/stills.ts` use the real timings.
  `scripts/render.ts` narrates by itself; `--no-narration` renders without a voice, with
  timings estimated from the word count.

```json
{ "voice": "af_bella" }
```

`voiceSpeed` sets how fast the voice talks, from 0.8 to 1.4 (default 1). A
faster voice is shorter audio, so narrated scenes without `durationMs` get
shorter. Set it in the storyboard: `scripts/narrate.ts --speed` only tries a
speed, because check, stills and render read the narration made at the
storyboard's `voiceSpeed`.

```json
{ "voiceSpeed": 1.15 }
```

Common developer terms are said right by default: `JSON`, `README`, `npm`, `npx`,
`gh`, `Node.js`, `nginx`, `kubectl`, `sudo`, `stdin` and about thirty more. The
table is `BUILTIN_PRONOUNCE` in `src/narration/terms.ts`; you do not need to list
those words yourself.

When the voice says a word wrong, add it to the top-level `pronounce` map: each
written word maps to 1 to 4 words of letters and apostrophes, separated by single
spaces, respelled the way it should sound. An entry here overrides the built-in
one for the same word. The voice says the respelling; captions keep the word as
written, timed from the start of its first spoken word to the end of its last.
Matching is exact case, word by word, with punctuation around the word kept
(`JSON:` is said "Jaysawn:"; `JSONL` and `json` are left alone). Here `JSON` is said
"Jayson" instead of the built-in "Jaysawn", and `nsh` is spelled out as N-S-H:

```json
{ "pronounce": { "JSON": "Jayson", "nsh": "N S H" } }
```

A word in neither the voice's dictionary nor the built-in table (a product or
project name like `Kokoro`) is guessed from its letters, and often said wrong.
`scripts/check.ts` warns about each one as `narration-guess`, with the sounds it
will use. Listen to the scene, and if it is wrong, add the word to `pronounce`.
Words in all caps (`API`) are spelled out letter by letter and not reported. The
warning needs the voice's dictionaries, so it appears once narration has been
downloaded.

### Your own narration audio

To use a recorded voice-over instead of the built-in voice, give the scene an
`audio` with:

- `file` (required): a `.wav` file, 16- or 24-bit PCM or 32-bit float, mono or
  stereo, any sample rate. MP3 and AAC are not supported.
- `words`: a `.json` file of word times, one entry per narration word, in ms
  from the start of the audio (format below).

Both paths are relative to the storyboard. The scene still needs its
`narration`, written as spoken: captions, word cues and checks use its text.
The audio sizes the scene like spoken narration (lead + audio + tail, and
`narration-fit` applies to an explicit `durationMs`), and `narrate.ts` skips
the scene. Captions and word cues use the words file when it has one entry per
narration word; otherwise, or without one, the words are spread evenly over the
audio and `scripts/check.ts` warns. Missing or unreadable files are `media`
errors from `scripts/check.ts`, not validation errors.

```json
{
  "id": "split",
  "component": "BigNumber",
  "props": { "value": 42, "prefix": "$", "label": "each, split evenly" },
  "narration": "Split any bill in seconds, right from your phone.",
  "audio": { "file": "audio/split.wav", "words": "audio/split.words.json" }
}
```

The words file:

```text
[
  { "text": "Split", "startMs": 200, "endMs": 452 },
  { "text": "any", "startMs": 452, "endMs": 620 },
  ...
]
```

### Overlays

`overlays` put a small persistent label in a corner of the safe area, such as
"Sponsored" or "Example bill", across chosen scenes. It stays still through
transitions and camera moves, and fades only where its run of scenes starts or
ends. At most 3, each with:

- `text` (required): at most 28 characters, drawn uppercase.
- `corner`: `"top-left"` (the default), `"top-right"`, `"bottom-left"` or
  `"bottom-right"`. Two overlays cannot share a corner on the same scene.
  Bottom corners sit above the caption band.
- `scenes`: the scene ids it shows on (default every scene).

A top corner shares its row with a `SceneFrame` or `Section` header. When a
label would sit closer than 48 px beside the scene's eyebrow or headline (in
9:16 it usually would), that scene's header and content start just below the
label instead; the label itself never moves.

The frame checks warn (`overlay`) when a scene's own text runs under a label,
or when a label crowds the scene's eyebrow or headline (closer than 48 px
beside it, or 16 px above or below).

```json
{
  "title": "Overlay corner tags",
  "aspect": "9:16",
  "overlays": [{ "text": "Example bill", "corner": "top-left", "scenes": ["intro"] }],
  "scenes": [
    { "id": "intro", "component": "Headline", "props": { "text": "Split any bill" }, "durationMs": 3000, "transition": { "type": "fade" } },
    { "id": "outro", "component": "Headline", "props": { "text": "No more math" }, "durationMs": 3000 }
  ]
}
```

### Output

`aspect` (required) picks the frame:

- `"9:16"` (1080x1920, the primary format): Shorts, TikTok and Reels.
- `"16:9"` (1920x1080): a landscape video; type is about 0.92x of 9:16.
- `"4:5"` (1080x1350): feed posts and carousels. It is tall, so every
  component uses its 9:16 layout (a `BarChart` turns horizontal, a
  `BeforeAfter` stacks), at 9:16's type sizes, in a 952 px column with 64 px
  margins and no button rail.

```json
{
  "title": "A feed post",
  "aspect": "4:5",
  "scenes": [
    { "id": "hook", "component": "Headline", "props": { "text": "Split any bill" }, "durationMs": 3000, "transition": { "type": "fade" } },
    { "id": "total", "component": "BigNumber", "props": { "value": 42, "prefix": "$", "label": "each" }, "durationMs": 3000 }
  ]
}
```

For a carousel or still posts, `npx tsx scripts/stills.ts <storyboard.json>
--out <dir> --slides` writes one finished PNG per scene, `<dir>/<NN>-<id>.png`
(`NN` is the scene's position, so `03-total.png`). Each is the scene's settled
last frame before its transition, with captions off and the camera wide.
`--slides hook,total` picks scenes by id. It cannot be combined with `--frames`
or `--per-scene`.

`scripts/render.ts` keeps the MP4 under a size budget: `--max-mb <n>` (default
`9.5`, under GitHub's 10 MB per video) lowers the video bitrate to fit the
video's length, never above the usual 8 Mbps. The summary line shows the budget
and the bitrate. If the file still comes out over budget, it is kept and the
script exits 1; very long videos warn up front that the budget can't be met.
`--max-mb 0` turns the budget off.

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
    `textSubtle`, `accent`, `accentText`, `border`, `shadow`, and `positive`
    and `negative` (good and bad marks, with `positiveText` and `negativeText`
    for text on them) (hex only). Keep neutrals tinted, never pure `#000000` or
    `#ffffff`. `positive` and `negative` are used by `BigNumber` `color`, scene
    `effects` `color` and `Arrow` `color`; they must reach 3:1 on the ground
    and surface (their text 4.5:1 on them, picked for you if you leave it out),
    or the theme throws when the storyboard is checked or rendered.
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
    emphasis is weight or the accent color. A stack may name only bundled
    fonts, brand fonts declared in `fonts` (below), CSS generic families and
    the system fonts of the built-in stacks; any other family (`"Inter"`) is a
    validation error.
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
    `enter.hero`, `pop` (to `scale`, 1.04), `count` (each digit's roll, the
    next digit `staggerMs` later, blurred `blurMinPx`-`blurMaxPx` while it
    moves, the unit `unitDelayMs` after the landing), `mark` (the marker
    sweep: `delayMs` after the text lands, a bar at `opacity` tilted
    `tiltDeg`, or an underline `underlinePx` thick), `shot` (with the default
    `fill`), `beat`; `breathe` is the camera's drift (`on`, `scale`, `curve`,
    `driftPx`; off unless `on` is true); `exit` takes a `share` of the entry
    within `minMs`-`maxMs`; `shine` is the band of light that crosses an
    element once (`widthShare` of its width, leaning `skewDeg`, white at
    `opacity`; `"ms": 0` turns it off); `flow` is the dot that runs along a
    drawn connector (one trip per `ms`, a `dotPx` dot, and a `glowPx` ring of
    the accent at `glowOpacity` on the node it reaches; `"ms": 0` turns it
    off); `typing` is text typed with a caret (`cps` keystrokes a second on
    average, each gap varied by up to `jitter` of itself, a
    `pauseMinMs`-`pauseMaxMs` pause after a comma or full stop, a caret that
    blinks every `blinkMs`, and a printed line that fades in over its `ms`);
    `drift` moves the mesh blobs (up to `px` from home, each looping in
    `minMs`-`maxMs`), `grid.breathe` the grid (`ms`, `scale`, `curve`) and
    `grainFps` the grain. A `curve` is a name (`"linear"`, `"expoOut"`,
    `"expoIn"`, `"expoInOut"`, `"sineInOut"`, `"power4InOut"`), a
    cubic bezier `[x1, y1, x2, y2]`, or a spring `{ "stiffness": 170,
    "damping": 18 }`. Position and scale may overshoot; opacity and color
    never do. `caption` moves the captions: a page enters over `ms` from
    `fromScale` and `risePx` below its place, and the spoken word scales to
    `wordScale` over `wordMs` (or half the word, if shorter).
  - `caption`: how the spoken word stands out, `highlight` `"color"` (the
    default: the accent color) or `"plate"` (a rounded accent plate behind it,
    reaching `platePadY` and `platePadX` px past the word); `strokePx`, the
    punch style's outline (16).

Deeper good and bad colors on the light theme:

```json
{ "themeOverrides": { "colors": { "positive": "#0f7a3d", "negative": "#b42318" } } }
```

### Brand fonts

To set the video in the brand's own font, declare its file in the top-level
`fonts`, then name it in `themeOverrides.fonts`. Each entry is one file:

- `name` (required): the family name you use in `themeOverrides.fonts`. Not a
  bundled font's name or a CSS generic family.
- `file` (required): a `.woff2`, `.woff`, `.ttf` or `.otf` file, relative to
  the storyboard.
- `license` (required): `"OFL-1.1"`, `"Apache-2.0"`, `"MIT"`, `"CC0-1.0"` or
  `"UFL-1.0"`. Never a GPL or personal-use font.
- `weights`: `[min, max]` from 1 to 1000 (default `[400, 400]`); a variable
  font gives its range.
- `italic`: `true` for an italic face (default `false`).

A family split over several files (regular, bold, italic) is several entries
with the same `name` and weights that do not overlap. The bundled sans (or
mono) and the system stack are added after a brand font, so a missing glyph
still draws. `scripts/check.ts` reports a missing or broken font file as a
`brand-font` error, and warns whenever a brand font is used: text fitting
measures the bundled fonts, so open the stills and look for text that
overflows or wraps badly.

```json
{
  "fonts": [{ "name": "Splitly Sans", "file": "media/brand-sans.woff2", "license": "OFL-1.1", "weights": [100, 900] }],
  "themeOverrides": { "fonts": { "display": "Splitly Sans", "body": "Splitly Sans" } }
}
```

### The type ramp

Every piece of text in the kit is set in one step of one ramp, with that
step's size, weight, tracking and line height; nothing else picks a size.
Components that need to fit long text step down the ramp (a long title goes
from `display` to `headline` to `title`), so sizes always stay on it. 16:9 is
about 0.92x of 9:16, never smaller: a 16:9 video is shown smaller on a phone.
4:5 uses the 9:16 sizes.

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
| "use our brand font" | `"fonts": [{ "name": "Brand Sans", "file": "media/brand-sans.woff2", "license": "OFL-1.1" }]` and `"themeOverrides": { "fonts": { "display": "Brand Sans", "body": "Brand Sans" } }` |
| "green for good, red for bad" | `"themeOverrides": { "colors": { "positive": "#0f7a3d", "negative": "#b42318" } }`, then `"color": "positive"` on a `BigNumber` |
| "make it a TikTok" | `"aspect": "9:16"`, `"safe": "tiktok"` |
| "for an Instagram feed post" / "a carousel" | `"aspect": "4:5"`; for still slides, `scripts/stills.ts --slides` |
| "talk a bit faster" | `"voiceSpeed": 1.15` |

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

If the storyboard has narration, run `npx tsx scripts/narrate.ts <storyboard.json>`
first, so the checks (and `scripts/stills.ts`) use the real audio timing and not
estimates. Then run `npx tsx scripts/check.ts <storyboard.json>` after writing
the storyboard and after every fix. Storyboard checks run first, then the frame
checks.

- **Storyboard checks.**
  - `transition` (warn): a boundary has no chosen transition.
  - `theme-color` (warn): a color in props is not a theme token or a color the
    storyboard set (`accent`, `themeOverrides.colors`).
  - `media` (error): a `VideoClip` or `Image` file, a `TitleCard` or `EndCard`
    `logo`, or a scene's `audio` file or words file is missing or unreadable.
    Paths resolve from the storyboard's folder. Frames are not checked until
    these are fixed. It warns when an `audio` scene has no words file, or its
    words do not match the narration.
  - `brand-font` (error): a `fonts` file is missing or is not a font file.
    (warn): a brand font is in use, so look at the stills for text that
    overflows.
  - `narration-fit` (error): a scene's `durationMs` is shorter than its lead
    + narration audio + tail (needs the narration spoken first). Lengthen the
    scene or remove `durationMs`.
  - `narration-guess` (warn): a narration word the voice will guess from its
    letters. Listen to it; if it is wrong, add it to `pronounce`.
  - `receipt-total` (warn): a `Receipt`'s items and summary rows do not add up
    to its total (or its items to a "Subtotal" row).
  - `headline-lines` (warn): a `Headline` or `TitleCard` line lands after the
    scene starts to leave. Cue it earlier or lengthen the scene.
- **Frame checks** on the start, middle and end of every scene: `overflow`
  (text clipped or off frame), `safe-area` (inside the `safe` profile's UI-free
  zone, with text also off the 9:16 button rail), `contrast` (WCAG) and
  `readability` (time on screen for the words shown). `type-scale` (warn)
  reports rendered text whose size is not a step of the type ramp; text a
  terminal or code window shrank to fit is allowed. `overlay` (warn) reports
  scene text that runs under an `overlays` label, or a label that crowds the
  scene's eyebrow or headline. `centering` (warn, 9:16 and 4:5)
  reports a scene whose main block (its cards, windows and text blocks
  together, without the caption) is more than 8 px off the frame's center line.
  `opening` (warn) renders frame 0 and reports it when it shows no text (the
  caption does not count), since that blank frame is the thumbnail GitHub,
  Slack and social apps show before play; use `opening: settled` or put text on
  the first frame.

Warnings do not fail the run, but treat them as mistakes unless you meant it.

## 5. Component catalog

Every component takes the storyboard props listed here; `progress`, `theme`,
`aspect` and `area` are supplied by the renderer. All of them lay out in 9:16,
16:9 and 4:5. Icons are names from the bundled set: `chat`, `terminal`,
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
takes `emphasis`, `mark` and `markStyle` like a `Headline`. `lines` replaces
`title` with 2-4 lines that land one at a time, each on its own cue (see
`Headline`); the subtitle waits for them.

`logo` puts a small image mark above the kicker: a `.png`, `.jpg`, `.jpeg`,
`.svg` or `.webp` file, its path relative to the storyboard's folder like a
media `src`. The `media` check reports it when the file is missing. The logo
pops in first, then the lines follow.

```json
{
  "id": "open",
  "component": "TitleCard",
  "props": { "kicker": "Field notes", "title": "Ship on Fridays", "subtitle": "Without the fear" },
  "narration": "Here is how we ship on Fridays without the fear."
}
```

#### `ExtrudedTitle`

The 3D opener or end-card title: a word in beveled 3D letters that flip up one
by one, swing so the studio light runs across the bevels, and settle face-on
and readable by about 1.6 s. `text` is one line of 1-24 characters (basic
Latin letters, digits and punctuation); it fills the width in 9:16 and 4:5 and
about 70% of it in 16:9, and a long word gets smaller rather than wrapping.
`finish` is `glossy` (default), `matte` or `chrome`; `accentLetters` (indices
into `text`) draws those letters in the accent; `subtitle` is a flat line that
fades in under the word once it settles. One word per scene: for a headline
sentence use `TitleCard` or `Headline`.

```json
{
  "id": "open",
  "component": "ExtrudedTitle",
  "props": { "text": "motioncraft", "subtitle": "Prompt in, video out", "accentLetters": [0] },
  "narration": "This is motioncraft."
}
```

#### `EndCard`

The calm closing card from the owner's reference: a logo mark (`icon`, default
`play`) with the product `name`, one `line` under it, an `accent` line in the
accent under that, and an optional `card` carried in below, usually the
opening `PromptCard` again. Centered in both aspects; the mark sits beside the
name in 16:9 and above it in 9:16. The lines land one after another, then the
card arrives.

```json
{
  "id": "end",
  "component": "EndCard",
  "props": {
    "name": "motioncraft",
    "line": "Prompt in, video out",
    "accent": "Open source",
    "card": { "component": "PromptCard", "props": { "text": "A launch video for motioncraft" } }
  },
  "narration": "motioncraft. Prompt in, video out."
}
```

`logo` draws an image in the mark instead of the icon, with the same file
rules as `TitleCard`'s: relative to the storyboard's folder, checked by the
`media` check. Set `logo` or `icon`, not both. `cta` adds a call to action
under the lines: an accent pill with a `label` (at most 32 characters) and an
optional small `note` under it. The pill pops in after the last line and
pulses once; a `card` waits for it.

```json
{
  "id": "end",
  "component": "EndCard",
  "props": {
    "name": "Splitly",
    "logo": "media/logo.svg",
    "line": "Split your next bill",
    "accent": "Free forever",
    "cta": { "label": "Download free · iOS & Android", "note": "Link in bio" }
  },
  "narration": "Split your next bill. It is free, forever.",
  "durationMs": 6000
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
- `lines`: 2-4 lines in place of `text`, landing one at a time, each with
  `motion`. A line's `at` is when it starts: ms from the scene's start or a
  word cue (see "Word cues"). A line without `at` follows the line before it.
  Cues must increase. Each line stays on one row: the text steps down the
  type ramp until every line fits the column on one row, so keep lines short
  (in 9:16 about 18 characters still sit at the `title` step); a line too long
  for one row at any step wraps. With `lines`, `emphasis` is a line index
  (that line in the accent), and `mark` sweeps under its word in the first
  line that has it. `TitleCard` takes `lines` too; `Section`, `SceneFrame`
  and `EndCard` do not. `scripts/check.ts` warns when a line lands after the
  scene starts to leave.

```json
{
  "id": "hook",
  "component": "Headline",
  "props": { "text": "Videos from a prompt", "motion": "words", "emphasis": "prompt" },
  "narration": "Videos, from a single prompt."
}
```

Line by line, each line on the word that says it:

```json
{
  "id": "hook",
  "component": "Headline",
  "props": {
    "lines": [
      { "text": "Dinner was $184.", "at": { "word": "Dinner" } },
      { "text": "Four friends.", "at": { "word": "Four friends" } },
      { "text": "Who owes what?", "at": { "word": "Who owes" } }
    ],
    "motion": "words",
    "emphasis": 2
  },
  "narration": "Dinner was a hundred and eighty four dollars. Four friends. Who owes what?"
}
```

#### `Caption`

Text a page of a few words at a time, the word being spoken lit in the accent
(see "Captions" in section 2), with an optional `captionStyle` (`"standard"`,
`"punch"` or `"pill"`). Narration is captioned automatically; use `Caption` only for a
text-only beat.

```json
{
  "id": "quote",
  "component": "Caption",
  "props": { "text": "Small steps, every day." },
  "durationMs": 2500
}
```

#### `BigNumber`

A number that rolls into place like an odometer, with `prefix`, `suffix`,
`decimals` and a `label`. Its digits roll in from the right, an accent bar
fills under it, and as it lands it pops, a shine crosses it and the `suffix`
(the unit) fades in. `color` is `"accent"` (default), `"positive"` or
`"negative"`, deepened in the text until it reads; `shareId` makes it a target
for scene `effects`.

```json
{
  "id": "stat",
  "component": "BigNumber",
  "props": { "value": 3.5, "decimals": 1, "suffix": "x", "label": "more deploys a week" },
  "narration": "We now deploy three and a half times as often."
}
```

To show a change, give the old value as `from` (it must differ from `value`).
At `at` (default 600 ms; takes a word cue) a line strikes through the old
value, the number counts to `value` over 900 ms, then pops. `fromStyle`
`"strike"` (default) keeps the struck value small and muted above the new
one; `"replace"` fades it out before the count. `fromStyle` and `at` need
`from`. Keep `at` early: the change takes about 1.2 s after it (1.4 s for
`replace`) and must land before the scene starts to leave, or the render
stops. Validation does not check `at`; `scripts/check.ts` does (a word not in
the narration, a strike that lands too late).

```json
{
  "id": "fees",
  "component": "BigNumber",
  "props": { "value": 4.5, "from": 2.25, "decimals": 2, "prefix": "$", "fromStyle": "replace", "color": "negative", "at": { "word": "doubled" }, "label": "Card fees per payment" },
  "narration": "Card fees doubled overnight, and nobody told you.",
  "durationMs": 4500
}
```

#### `StepList`

2-6 short steps in order, with an optional `title`, a `highlight` index drawn
in the accent, and `marker` `"number"` (default) or `"dot"`. `shareIds` (one
per step) make single steps targets for scene `effects`.

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

#### `LayerStack3D`

An architecture or system diagram in 3D: 2-6 layers (`layers`, the top
layer first) drawn as isometric plates that arrive as one stack, separate
top first and hold apart, a label beside each plate. A layer has a `label`
(1-24 characters), an optional `note` (up to 40) and an optional `icon`
painted on its plate. `highlight` is a layer's index, drawn in the accent;
`collapse: true` rejoins the plates in the last 700 ms before the exit.
Apart and labelled by about 1.5 s. Labels sit right of the stack in 16:9
and below-right of each plate in 9:16 and 4:5; keep notes short in a
`Section` slot (four layers with notes fit there). For steps in order, use
`FlowDiagram` or `StepList`.

```json
{
  "id": "stack",
  "component": "LayerStack3D",
  "props": {
    "layers": [
      { "label": "UI", "note": "What people tap", "icon": "laptop" },
      { "label": "API", "note": "Auth and routing", "icon": "code" },
      { "label": "Queue", "note": "Jobs run later", "icon": "clock" },
      { "label": "Database", "note": "Every record", "icon": "box" }
    ],
    "highlight": 1
  },
  "durationMs": 6000,
  "narration": "Requests come in through the API."
}
```

#### `Annotate`

A sentence with one phrase marked by hand and a short note pointing at it, for
the point a viewer should remember. `text` is one or two lines (`\n` breaks
it); `mark` is a phrase that occurs in `text` exactly, case included, on one
line; `note` is at most 40 characters. `markStyle` is `"underline"` (default),
`"circle"` or `"highlight"`; `notePosition` is `"below"` (default) or
`"above"`; `seed` varies the strokes. The sentence lands, the mark draws over
the phrase from about 700 ms, then a line draws to the note; settled by about
1.4 s.

```json
{
  "id": "note",
  "component": "Annotate",
  "props": { "text": "Ship the story, not the spec", "mark": "story", "note": "what people remember" },
  "narration": "Ship the story, not the spec. The story is what people remember."
}
```

#### `ScrambleText`

A short line that decodes out of random characters, in the mono font: a
command, a code name, a reveal. `text` is 1-40 characters on one line (it
shrinks to fit, never wraps). `style` is `"clean"` (default) or `"terminal"`
(a framed prompt with a blinking caret); `label` is a small line that fades
in once the text has locked; `seed` varies the wrong characters. In 9:16 the
line takes the largest of the hero, display and headline steps it fits at (a
`terminal` line spans the primary width); 16:9 uses the headline step. It
scrambles from 150 ms, then locks left to right, done by about 1.7 s.

```json
{
  "id": "decode",
  "component": "ScrambleText",
  "props": { "text": "npm run render", "style": "terminal", "label": "Renders on your machine" },
  "narration": "One command renders the whole video on your machine."
}
```

#### `WordSwap`

One line with a slot that rolls through words ("Ship faster", "smarter",
"together"). `options` holds 2-6 one-line words, shown in order and settling on
the last, in the accent; `prefix` and `suffix` are the still text around the
slot. `cuesMs` sets when each swap starts: one ascending ms value per option
after the first, from the scene's start. They are plain ms, not word cues.
Left out, the swaps spread so the last lands by 60% of the scene, at least
450 ms apart. The slot is as wide as the word it shows and eases to the next
word's width as it swaps, so the line re-centres during each swap (and only
then) and a short last word leaves no gap. The line is set in the largest of
the hero, display and headline steps it fits at with its widest option, so a
short line is a hero line; a long one shrinks from the headline step.

```json
{
  "id": "swap",
  "component": "WordSwap",
  "props": { "prefix": "Built for", "options": ["teams", "launches", "everyone"], "cuesMs": [900, 1600] },
  "narration": "Built for teams, for launches, for everyone.",
  "durationMs": 4000
}
```

#### `Receipt`

An itemized bill that prints in line by line on a tilted paper card, in the
mono font. `items` (1-12) each have a `label`, an `amount` and an optional
`note` under the label; `summary` adds up to 4 rows such as Subtotal, Tax and
Tip; `total` has an `amount` and a `label` (default "Total"). `title` is the
merchant line, `highlight` an item index marked in the accent, `tilt` the
angle in degrees (-4 to 4, default -2). Amounts use `prefix` (default `"$"`),
`suffix` and `decimals` (default 2). The total pops last, by about 2.2 s.
In 9:16 the card spans the primary width; the tilted card, corners included,
stays inside its slot, so a long receipt in a short slot steps its text down.
`scripts/check.ts` warns when the items and summary do not add up to the
total; a row labelled Subtotal is checked against the items, not added again.

```json
{
  "id": "bill",
  "component": "Receipt",
  "props": {
    "title": "Trattoria Roma",
    "items": [
      { "label": "Margherita pizza", "amount": 14.5 },
      { "label": "Truffle pasta", "amount": 22 },
      { "label": "Caesar salad", "amount": 11.25, "note": "no croutons" }
    ],
    "summary": [{ "label": "Subtotal", "amount": 47.75 }, { "label": "Tip", "amount": 8 }],
    "total": { "amount": 55.75 },
    "highlight": 1
  },
  "narration": "Here is the bill. The truffle pasta was the big one.",
  "durationMs": 6000
}
```

### Charts

`DonutChart`, `BarChart` and `LineChart` share one vocabulary. `data` is a
list of `{ "label", "value" }` items (1-12, each value 0 or more). One item may
set `"emphasis": true` to take the accent; with none, the largest value takes
it. The rest are shades of the ink. Values are shown with `prefix`, `suffix`
and `decimals` (default 0), with thousands separators (`$1,250`). Each takes
an optional `title`, can sit in a `Section`'s content, and fades out at the
scene's exit. None takes a cue.

#### `DonutChart`

Shares of a whole: `data` (1-8 items, at least one above 0) as ring segments
clockwise from 12 o'clock, with a legend. `center` (`{ "value", "label" }`)
is the text in the hole; by default it is the emphasized item's percent and
label. A number in `center.value` counts up, prefix and unit kept
(`"$3.25M"`). The ring sweeps in from 300 ms, settled by about 1.9 s. The
legend sits beside the ring in 16:9 and below it in 9:16 and 4:5.

```json
{
  "id": "share",
  "component": "DonutChart",
  "props": {
    "title": "Market share, 2026",
    "data": [{ "label": "Acme", "value": 42, "emphasis": true }, { "label": "Globex", "value": 27 }, { "label": "Initech", "value": 19 }, { "label": "Other", "value": 12 }],
    "suffix": "%"
  },
  "narration": "Acme now holds forty-two percent of the market.",
  "durationMs": 6000
}
```

#### `BarChart`

Values side by side: bars grow in a cascade and their values count up,
landed by about 1.2 s. `orientation` is `"vertical"` (the 16:9 default) or
`"horizontal"` (the 9:16 and 4:5 default). `max` is the full length (default:
a round number at or above the largest value); larger values stop at full
length. `variant` `"progress"` draws one labelled track per item instead,
always horizontal, filling to `max` (default 100), for completion and scores.

```json
{
  "id": "revenue",
  "component": "BarChart",
  "props": {
    "title": "Revenue by month, 2026",
    "data": [{ "label": "Jan", "value": 480 }, { "label": "Feb", "value": 720 }, { "label": "Mar", "value": 1250, "emphasis": true }, { "label": "Apr", "value": 960 }, { "label": "May", "value": 610 }],
    "prefix": "$"
  },
  "narration": "March was our best month, at twelve hundred and fifty dollars.",
  "durationMs": 6000
}
```

#### `LineChart`

A trend: `data` (2-12 points, left to right) as a line that draws from 150 ms
over 1.2 s, each point popping as the line reaches it. The emphasized point
gets an accent chip with its value, and the last point shows its value too;
settled by about 1.85 s. `areaFill` (default `true`) shades under the line.
`max` is the top of the axis and must be at least the largest value.

```json
{
  "id": "signups",
  "component": "LineChart",
  "props": {
    "title": "Monthly signups, 2026",
    "data": [{ "label": "Jan", "value": 1200 }, { "label": "Feb", "value": 1850 }, { "label": "Mar", "value": 1540 }, { "label": "Apr", "value": 3120, "emphasis": true }, { "label": "May", "value": 2680 }, { "label": "Jun", "value": 3460 }]
  },
  "narration": "Signups jumped in April and kept climbing.",
  "durationMs": 6000
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

#### `BeforeAfter`

Two states of one thing in one card, revealed by a wipe. `before` and `after`
are components (`{ "component": ..., "props": ... }`). The card shows
`before`, then an accent divider sweeps across to show `after` and comes to
rest at `split` (0.2-0.8 of the way, default 0.5), by about 2 s. `direction`
is `"horizontal"` (the 16:9 default, `after` from the left) or `"vertical"`
(the 9:16 and 4:5 default, `after` from the top). `beforeLabel` and
`afterLabel` (default "Before" and "After"; `""` hides one) are the chips.
Each side lays out in its own half, which is short in 9:16, so keep each side
small: two list items, not three. Two full-frame `Image`s give the classic
photo wipe.

```json
{
  "id": "compare",
  "component": "BeforeAfter",
  "props": {
    "before": { "component": "StepList", "props": { "items": ["Animate by hand", "Export again"] } },
    "after": { "component": "StepList", "props": { "items": ["Write one prompt", "Render"], "highlight": 1 } },
    "beforeLabel": "By hand",
    "afterLabel": "With motioncraft"
  },
  "narration": "Before, every change meant animating by hand. Now it is one prompt and a render.",
  "durationMs": 7000
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
same way on every render. A window carried into the next scene by a `shareId`
should set `"typed": false` there (as `PromptCard` does), so it shows every
line complete and continues instead of re-typing.

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

#### `CodeSlab3D`

The hero shot for developer videos: syntax-highlighted `code` (1-14 lines) on
a lit, beveled 3D slab that rises from below and behind, turns through space
and settles face-on and readable by about 1.6 s, then drifts very slowly
through the hold. `language` (default `ts`), `highlightLines` (1-based; each
gets an accent band that sweeps in once the slab settles) and `title` (a
filename tab on the slab). The code stays at the mono type step while lines
are short: about 26 characters in 9:16 and 4:5, 50 in 16:9; longer lines shrink
it. One snippet per scene, no typing or scrolling: for code that types in or
dims around a highlight, use `CodeWindow`.

```json
{
  "id": "slab",
  "component": "CodeSlab3D",
  "props": {
    "title": "area.ts",
    "code": "function area(r: number) {\n  if (r < 0) return 0;\n  return Math.PI * r * r;\n}",
    "highlightLines": [3]
  },
  "narration": "The whole feature is three lines of code."
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

The interface moment from the owner's reference: a message can carry
`actions` (buttons; the first is the filled one), and a `cursor` moves to one
by its `id` and clicks it (`atMs`, the click, defaults to a beat after the
message lands). The buttons then resolve to the action's `resolved` text with
a check. A message with `lift` leaves the window at `lift.atMs` (default: once
the cursor has gone) and settles as a floating card: in 16:9 beside the window,
which waits centered and slides aside as the card reflows into the room next to
it; in 9:16 below the window, which closes up over the message, so the card
never covers the composer. Give it a `shareId` and the next scene's element with
the same `shareId` takes it over. `lift` and `cards` don't mix. All times are
ms on the chat's own clock. A chat with a click needs about 10 s on screen.

```json
{
  "id": "approve",
  "component": "ChatWindow",
  "props": {
    "channel": "deploys",
    "messages": [
      { "author": "Monitor", "badge": "ALERT", "time": "2:14 PM", "text": "Checkout errors are up to 2.3%.", "highlight": true },
      {
        "author": "Deploy Bot", "badge": "APP", "time": "2:15 PM", "text": "Hotfix 2.4.1 is ready to roll out.",
        "actions": [{ "id": "approve", "label": "Approve", "resolved": "Approved by Maya Chen" }, { "id": "reject", "label": "Reject" }],
        "shareId": "deploy",
        "lift": { "atMs": 7200 }
      }
    ],
    "cursor": { "target": "approve", "atMs": 5000 }
  },
  "narration": "The bot has a hotfix ready, and one click ships it.",
  "durationMs": 10500
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

#### `StrokeTrace`

An icon or line drawing that draws itself stroke by stroke behind an accent
pen dot, for a mark that builds or a hand-drawn idea. Give exactly one of
`icon` (a bundled icon name) or `paths` (1-12 SVG path strings in a 24 x 24
box). `label` rises in under the drawing once it is drawn; `fill` (default
`false`) fills closed shapes with a pale accent; `"nib": false` hides the pen
dot. It draws from 150 ms over 1.4 s, settled by about 1.8 s.

```json
{
  "id": "house",
  "component": "StrokeTrace",
  "props": { "paths": ["M3 11 12 3l9 8v10H3Z", "M10 21v-6h4v6"], "fill": true, "label": "Home, drawn by hand" },
  "narration": "Every line of it is drawn in code.",
  "durationMs": 4000
}
```

#### `Handoff`

One thing handed to another: a source component `from` (a prompt `Card`, say)
and a receiver `to` (a window), joined by an `Arrow` that draws from one into
the other, with an optional `label`. The source arrives, the arrow draws, then
the receiver arrives. Side by side in a wide 16:9 area, always stacked in 9:16,
so no points to work out. `fromShare` (0.2-0.5) gives the source more of the
area when it needs it, such as a `PromptCard` in 9:16. Give the receiver a
`shareId` to carry it into the next scene. A window that fills its box (an
`AppWindow`) meets the arrow exactly; a shorter one (`CodeWindow`) centers in it.
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
centered as a block. `shareId` makes it a target for scene `effects`.

```json
{
  "id": "card",
  "component": "Card",
  "props": { "icon": "shield", "title": "Signed builds", "subtitle": "Every artifact", "highlighted": true },
  "narration": "Every build is signed."
}
```

#### `PromptCard`

The prompt itself, on a wide white card under a small "Prompt" `label` (with
an `icon`). Once the card lands, a caret blinks and the `text` types in, then a
shine crosses the card; `"typed": false` shows it whole. A `shareId` carries
it across a boundary (a prompt typed in the hook becomes a `Handoff`'s `from`
in the next scene). Its text steps down the ramp to fit, never below `label`.

```json
{
  "id": "prompt",
  "component": "PromptCard",
  "props": { "text": "A launch video for motioncraft", "shareId": "prompt" },
  "narration": "Type one prompt, and get a finished video."
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

#### `Notification`

Phone-style banners that drop in from the top: an alert, a message, a "done".
`notifications` holds 1-3 banners in drop order (the newest lands on top and
pushes the others down), each with `app`, `title`, an optional one-line
`body`, an `icon` (default `zap`) and a `time`. `content` is a component drawn
behind them, laid out at full size in the whole slot (in a `Section` too), so
the banners overlay its top. `atMs` gives each banner's drop time, one per banner, in order;
they are plain ms, not word cues. By default the first drops at 400 ms, then
one every 900 ms. Full width in 9:16 and 4:5, a column at the right in 16:9.

```json
{
  "id": "ping",
  "component": "Notification",
  "props": {
    "notifications": [
      { "app": "Deploys", "title": "Deploy finished", "body": "web-app is live on production", "icon": "check", "time": "2m ago" },
      { "app": "Messages", "title": "New message from Maya", "body": "Is the intro ready to ship?", "icon": "chat", "time": "now" }
    ],
    "content": { "component": "TerminalWindow", "props": { "lines": [{ "prompt": true, "text": "npm run deploy" }, { "text": "done in 4.2s" }] } }
  },
  "narration": "The deploy finishes, and the questions start right away.",
  "durationMs": 7500
}
```

#### `OrbitCard3D`

One feature card in 3D, for a premium feature-highlight beat: the card orbits
a softly lit sphere of dots, the camera drifting with it, and lands in front,
face-on and readable by about 1.8 s, its round window framing the turning
sphere. `title` (1-32 characters), an optional `subtitle` (up to 60) and
`icon`, and `dots`, the sphere's point count (400-4000, default 1600). The
primary width in 9:16 and 4:5, about 45% of the content width in 16:9. One
card only: for several, use `CardRow`.

```json
{
  "id": "checked",
  "component": "OrbitCard3D",
  "props": { "icon": "check", "title": "Checked every frame", "subtitle": "Layout, contrast and timing" },
  "narration": "Every frame is checked before it ships."
}
```

### Media

Real footage and images, from local files. `src` is relative to the
storyboard's folder. Both take `fit` (`"cover"`, the default, or `"contain"`)
and a `shareId`, and can sit full frame or inside a window's `content`.

#### `VideoClip`

`trimStartMs` and `trimEndMs` pick the part of the file, `rate` sets the speed,
`muted` leaves its audio out of the mix. Clip audio at a `rate` other than 1
changes pitch (it is resampled, not time-stretched). Supported: `.mp4`, `.m4v`, `.mov`,
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
