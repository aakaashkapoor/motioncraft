# motioncraft: notes for coding agents

Read `docs/design.md` (the pipeline) and `docs/design-v2.md` (the design system, transitions, kit and media) first.

## Rules

- **TypeScript, strict.** Source in `src/`, scripts in `scripts/`, tests in `tests/`.
- **Test first.** Write the failing test (vitest), then the code. Keep pure logic
  (timing, layout, validation, checks) in plain functions that are easy to test.
- **`npm run check` must pass** (typecheck + tests) before anything is committed.
- **Cross-platform.** The main developer is on Windows. Use `node:path`, never
  hard-coded `/` or `\` separators, and no shell-specific scripts.
- **Everything runs locally.** No network calls at runtime, except downloading a
  pinned, hash-checked model on first use. No telemetry.
- **Browser:** use `playwright-core` with the user's installed Chrome or Edge
  (`channel: "chrome"` or `"msedge"`). Never download a browser.
- **Every frame is code-drawn.** No AI-generated images or footage.
- **Licenses (hard rule).** Every dependency and asset must allow commercial use
  and modification: MIT, Apache-2.0, BSD, ISC, SIL OFL (fonts), CC0, or CC-BY
  with attribution recorded. Never GPL/AGPL, CC-BY-NC, CC-BY-ND or "personal use
  only". Record every third-party asset in `licenses/` (source, license, author).
  Pin dependency versions exactly.
- **Aspect ratios.** Every visual component must lay out correctly in both 9:16
  (1080×1920, primary) and 16:9 (1920×1080). Never hard-code one shape.
- **Dependencies:** add them with `npm install --save-exact <pkg>`, then run
  `npm ci`. A second `npm install` can silently delete the Windows native
  binding the test runner needs (npm/cli#4828); `npm ci` restores it.
- Keep files small and focused: one responsibility per file.
- npm prints the warning "Unknown project config onnxruntime-node-install-cuda". It is
  expected; do not remove that line from `.npmrc` (it stops a CUDA download).

## Porting a HyperFrames primitive

We port motion designs from HyperFrames (HeyGen, Apache-2.0) into our own React
engine. Source is pinned to commit `2905162d925fc87fb8242e24ed0bbf025d307ea1`:
`https://github.com/heygen-com/hyperframes/blob/2905162d925fc87fb8242e24ed0bbf025d307ea1/registry/components/<name>/`
(`<name>.html`, `README.md`, `demo.html`). Record each ported item in
`licenses/README.md` under "Ported motion designs".

1. **Port the design, not the code.** Read the pinned source and port the
   layout, choreography, timings and easing. Rewrite it as a React kit component
   on the scene clock. Never add GSAP, anime.js, three.js or any HyperFrames
   package as a dependency, and never load scripts from a CDN.
2. **Map GSAP eases to our engine:** `power1` = quad, `power2` = cubic,
   `power3` = quart, `power4` = quint, `expo` = `expoIn`/`expoOut`,
   `back.out` = `easeOutBack`, `sine` = sine; `.in`/`.out`/`.inOut` as named.
   Prefer the theme's motion tokens (`theme.motion.*`, `arrive`, `tween`, `fade`,
   `cascadeStep` in `src/kit/motion.ts`) when the source's timing is within ~20%
   of a token; keep the source's own number only when the move depends on it.
3. **Time everything in ms from the scene clock (`useSceneTime`)**, so a longer
   scene only lengthens the hold. First move at 100-200 ms; exit fast and land on
   the last frame (the rules `tests/kit-ms-timing.test.tsx` enforces).
4. **Colors, fonts, sizes and spacing come from the theme and the type ramp**
   (`docs/design-v3.md`), never from the source's hex values. HyperFrames' rule
   matches ours: the accent marks one element; other series and placeholders are
   monochrome steps of the ink.
5. **Lay out in both 9:16 (1080x1920) and 16:9 (1920x1080)** from
   `area`/`contentArea`, and work nested inside a `Section`.
6. **Deterministic:** no `Math.random`, no `Date`. Use `src/engine/random.ts`
   with a seed from the props.
7. **Registering a new component** means: add it to `kit` in `src/kit/index.ts`;
   add a sample to `SAMPLES` in `tests/kit-ms-timing.test.tsx`; nest it in
   `tests/fixtures/section-nesting.json` and `section-nesting-wide.json`; add a
   fixture pair `tests/fixtures/<kebab-name>.json` and `<kebab-name>-wide.json`;
   give it a `####` heading and a tested `json` example under the right group in
   `docs/agent-guide.md` section 5.
8. **Look before you finish.** Render stills of your fixture pair
   (`npx tsx scripts/stills.ts tests/fixtures/<name>.json --out <tmp> --per-scene`,
   and the wide one), including mid-motion frames, open the PNGs and fix anything
   off-center, clipped, cramped or still (the design-v3 self-review).
