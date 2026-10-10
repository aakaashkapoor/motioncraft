# Showcase

motioncraft introducing itself with the v3 kit, in the light theme, to the
bar of the owner's reference (`docs/design-v3.md`): `storyboard.json` (9:16)
and `storyboard-wide.json` (16:9), the same story in about 42 s.

    npx tsx scripts/check.ts examples/showcase/storyboard.json
    npx tsx scripts/render.ts examples/showcase/storyboard.json --out showcase.mp4

The scenes:

1. `hook`: "Videos from a prompt" lands word by word over a prompt card that
   types itself in.
2. `plan`: the prompt card carries over (shared element `prompt`) and an arrow
   draws from it into the `storyboard.json` window, whose lines come in one by
   one. In 9:16 the handoff is the whole scene, with no header, so the card
   and the window stay big enough to read.
3. `steps`: four step cards lift in and the accent walks to step 4.
4. `ask`: a chat; Maya's message types into the composer, the app replies, a
   cursor clicks "Render", it resolves to "Approved", and the reply lifts out
   as a floating card (beside the window in 16:9, below it in 9:16).
5. `render`: the lifted card becomes the terminal (shared element `render`),
   which types its command and prints its output.
6. `checks`: list rows build one by one and the accent walks down them.
7. `stat`: an odometer rolls to 100%.
8. `end`: the logo mark and name, one line, the accent line, and the prompt
   card typing again.

Each content scene uses `SceneFrame` (eyebrow, headline, footer). Window text
is always laid out at its own ramp step (a `CodeWindow` and a
`TerminalWindow`, never a window scaling a nested component down), so nothing
meant to be read drops below the label step. Scene lengths are what the
readability check asks for the words on screen, and each scene's highlight
walk fills its hold, so nothing is still for more than about 1.5 s.

`media/` holds the v2 showcase's sample clip and the storyboard that made it:

    npx tsx scripts/render.ts examples/showcase/media/sample.storyboard.json --out examples/showcase/media/sample.mp4
