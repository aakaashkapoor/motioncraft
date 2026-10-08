# motioncraft: notes for coding agents

Read `docs/design.md` first. It's the design this code implements.

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
