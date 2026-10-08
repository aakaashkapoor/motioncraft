# motioncraft: design


## What it is

An open-source agent skill that turns a prompt plus source material (a repo, notes,
a journal entry) into a short animated video: clean, product-launch-style motion
graphics (headlines, cards, diagrams that build, code being highlighted, arrows,
charts), narrated, with burned-in captions, exported as MP4.

- **Every frame is code-drawn** (React layouts and typography). No AI-generated
  images or footage.
- **Everything runs locally.** No cloud services, accounts or API keys beyond the
  user's own AI agent.
- **Agent-neutral.** It works with any agent that can run commands and a browser:
  Claude Code, GitHub Copilot CLI, OpenAI Codex. The scripts also work by hand.

## Shape: a rich skill with bundled tools

```
motioncraft/
  SKILL.md                 the workflow the agent follows
  reference/               engine API, scene catalog, design system,
                           storyboard format, critique checklist, theming guide
  engine/                  small React frame engine (deterministic: frame → pixels)
  kit/                     design kit: scene components (title, cards, diagram,
                           code highlight, arrow flow, terminal, chart, mock window)
  themes/neutral/          the default theme
  scripts/                 preview · stills · check · narrate · render
  licenses/                manifest of every third-party asset and its license
```

## The workflow (one video)

1. **Storyboard.** From the prompt and the sources, the agent writes a storyboard:
   the scene list, what each scene shows, narration lines, and timing. The agent
   checks it against the storyboard checklist and continues. It asks the human
   only when it's unsure (new format, sensitive topic).
2. **Scenes.** Each scene is React built on the kit's components. The agent writes
   a new component only when nothing in the kit fits.
3. **Narration** (on by default; `--no-narration` turns it off). A local open
   text-to-speech model voices the lines; the timing of the audio drives scene
   lengths. Captions come from the same text, burned in by default.
4. **Stills.** Render key frames per scene (start, middle, end of each beat).
5. **Check, layer 1: scripts (no AI).** Text overflow or clipping, contrast,
   content inside platform safe zones (Shorts UI on the right and bottom), minimum
   time on screen to read, narration/scene sync, total length limits. Fail → fix →
   re-render stills.
6. **Check, layer 2: AI review of the stills.** Only after layer 1 passes: does
   it look good, is it clear, does the hook land in the first seconds, does it match
   the storyboard? Every problem found here is a candidate for a new layer-1 check.
7. **Render** the MP4 and hand it to the human.

## Formats

- **9:16 vertical (Shorts, Reels, TikTok) is the primary target**, plus **16:9**
  widescreen. Both at 1080p, both in v1.
- Every kit component lays itself out for the frame's aspect ratio. Nothing is
  hard-coded to one shape.
- Vertical defaults: captions on, a hook in the first 2 seconds, short scenes,
  under the platform's length limit.

## Themes

A theme sets colors, fonts, motion style (easing, pacing) and an intro/outro.
The engine ships one clean neutral theme. Making a new theme must be easy and
documented well enough that someone with an AI agent can build their own look
from the theming guide alone.

## Rendering (local, light)

- Frames are rendered in the user's existing Chrome/Edge, driven by Playwright.
  Nothing extra is downloaded.
- Encoding uses the browser's built-in WebCodecs encoder plus a small MP4 writer.
  No ffmpeg.
- Text-to-speech: a small open model run locally, downloaded on first use,
  version-pinned and hash-checked.

## Licenses

The engine is open source and must stay usable commercially. Every dependency and
asset must allow commercial use and modification: **MIT, Apache-2.0, BSD, ISC,
SIL OFL (fonts), CC0, or CC-BY with attribution recorded.** Not allowed:
GPL/AGPL, CC-BY-NC, CC-BY-ND, "free for personal use". Every asset is listed in
`licenses/` with its source and license. The design kit is built from free, open
sources (icon sets, fonts, shapes) under these rules.

## Prior art (ideas, not code)

Motion Canvas (MIT) and Revideo (MIT) for code-driven explainer animation; Manim
(MIT) for diagrams that build step by step; Remotion for React-to-video ideas
(not open source for companies: learn from it, don't depend on it).

## v1 is done when

It produces two test videos:
1. a 30–45 s **vertical Short** from a written journal entry (narration, captions,
   hook, neutral theme);
2. a 1–2 min **widescreen explainer of motioncraft itself**, made from its own repo.

Both pass layer-1 and layer-2 checks, both are produced by **two different agents**
(Claude and Copilot), and the owner would be happy to post them.

## How it gets built

Code is written by Nightshift; the driving agent reviews every PR with
`nightshift-babysit` before it merges. That review includes looking at rendered
stills for visual work.

## Out of scope for v1

Voice cloning and custom voices, AI-generated imagery, a hosted or paid version,
live preview UI beyond a simple local preview page, languages other than English.
