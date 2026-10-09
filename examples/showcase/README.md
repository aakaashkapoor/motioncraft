# Showcase

motioncraft introducing itself with the v2 kit, in the light theme:
`storyboard.json` (9:16) and `storyboard-wide.json` (16:9), the same scenes.

    npx tsx scripts/check.ts examples/showcase/storyboard.json
    npx tsx scripts/render.ts examples/showcase/storyboard.json --out showcase.mp4

Shared elements: the chat window docks above the cards (`ask` to `plan`), and
the `storyboard.json` window the prompt hands off to docks above the terminal
(`prompt` to `render`); in 16:9 both dock in the top-right corner. Docked, a
window keeps 40% of the frame width.

`media/sample.mp4`, the clip in the `demo` scene, was made with motioncraft
itself from `media/sample.storyboard.json`:

    npx tsx scripts/render.ts examples/showcase/media/sample.storyboard.json --out examples/showcase/media/sample.mp4
