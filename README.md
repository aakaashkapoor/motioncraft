# motioncraft

An open-source agent skill that turns a prompt plus source material (a repo, notes,
a journal entry) into a short, narrated motion-graphics video: clean, code-drawn
headlines, cards, diagrams and code highlights, exported as MP4.

- **Shorts first:** 9:16 vertical, plus 16:9 widescreen.
- **Narrated by default** with a local, open text-to-speech model (Chatterbox-Turbo, or Kokoro voices; one pinned download, then offline), and captions that light each word as it is spoken. `--no-narration` renders without a voice.
- **Checks its own work:** automatic layout checks, then the agent reviews still frames.
- **Local:** your machine, your installed browser, no accounts or cloud services.
- **Any agent:** Claude Code, GitHub Copilot CLI, OpenAI Codex.

## See it

Made with motioncraft: a coding agent wrote the storyboard, and every frame is drawn in code and narrated by a local voice.

https://github.com/user-attachments/assets/31121f52-5631-46c2-bf4a-354c359d6f23

https://github.com/user-attachments/assets/38b67e34-dff9-48f7-a354-02cc4d657d85

https://github.com/user-attachments/assets/6213f845-5a3d-4b48-8ed5-53af2bb2ec85

## Embed in a web page

`npx tsx scripts/page.ts <storyboard.json> --out <file.html>` exports the
storyboard as one self-contained HTML page that draws it live in the browser:
crisp at any size, no MP4. Nothing is spoken: scenes take their estimated
lengths and the page has no audio. The frame is scaled to fit the window,
centered, with the first scene's ground around it. Captions follow
`captionStyle`; set `"captionStyle": "off"` for a page. Local media (an
`Image`, a `VideoClip`, a `logo`, a scene's `audio` file) is refused for now:
the page could not load it from disk.

The host page drives it with `postMessage`:

- `{ type: "motioncraft:seek", ms }` shows the frame at `ms` (clamped). Seeks
  faster than frames draw are coalesced; a seek stops playback.
- `{ type: "motioncraft:play", loop?, fromMs? }` plays in real time, from
  `fromMs` or where it is.
- `{ type: "motioncraft:pause" }` stops.
- Once fonts are loaded and frame 0 is drawn, the page posts
  `{ type: "motioncraft:ready", fps, totalFrames, durationMs, width, height }`
  to its parent.

A scroll-driven host:

```html
<div id="track" style="height:300vh">
  <iframe id="mc" src="showcase.html" style="position:sticky;top:0;width:100%;height:100vh;border:0"></iframe>
</div>
<script>
  const mc = document.getElementById("mc");
  let durationMs = 0;
  addEventListener("message", (e) => {
    if (e.source === mc.contentWindow && e.data?.type === "motioncraft:ready") durationMs = e.data.durationMs;
  });
  addEventListener("scroll", () => {
    const track = document.getElementById("track");
    const progress = Math.min(1, Math.max(0, -track.getBoundingClientRect().top / (track.offsetHeight - innerHeight)));
    if (durationMs > 0) mc.contentWindow.postMessage({ type: "motioncraft:seek", ms: progress * durationMs }, "*");
  });
</script>
```

For a loop instead, send `{ type: "motioncraft:play", loop: true }` on ready.

**Status: early development.** Nothing to use yet. The design is in
[`docs/design.md`](docs/design.md).

Built in public by [Nightshift](https://github.com/aakaashkapoor/nightshift), an
autonomous local coding loop, with an AI reviewer checking every PR.

License: [Apache-2.0](LICENSE).
