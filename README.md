# motioncraft

An open-source agent skill that turns a prompt plus source material (a repo, notes,
a journal entry) into a short, narrated motion-graphics video: clean, code-drawn
headlines, cards, diagrams and code highlights, exported as MP4.

- **Shorts first:** 9:16 vertical, plus 16:9 widescreen.
- **Narrated by default** with a local, open text-to-speech model (Kokoro; one pinned download, then offline), and captions that light each word as it is spoken. `--no-narration` renders without a voice.
- **Checks its own work:** automatic layout checks, then the agent reviews still frames.
- **Local:** your machine, your installed browser, no accounts or cloud services.
- **Any agent:** Claude Code, GitHub Copilot CLI, OpenAI Codex.

## See it

Made with motioncraft: a coding agent wrote the storyboard, and every frame is drawn in code and narrated by a local voice.

https://github.com/user-attachments/assets/31121f52-5631-46c2-bf4a-354c359d6f23

https://github.com/user-attachments/assets/38b67e34-dff9-48f7-a354-02cc4d657d85

https://github.com/user-attachments/assets/6213f845-5a3d-4b48-8ed5-53af2bb2ec85

**Status: early development.** Nothing to use yet. The design is in
[`docs/design.md`](docs/design.md).

Built in public by [Nightshift](https://github.com/aakaashkapoor/nightshift), an
autonomous local coding loop, with an AI reviewer checking every PR.

License: [Apache-2.0](LICENSE).
