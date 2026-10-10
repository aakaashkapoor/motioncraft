# Plan: narration (local voice, audio-driven timing, an audio track in the MP4)

Design: `docs/design.md` workflow step 3 and Workshop decision D31: narration is
on by default; a small open text-to-speech model runs locally (downloaded on
first use, no API, no spending); the audio's timing drives scene length and
caption sync. Today `narration` is text only (captions + an estimated length)
and every MP4 is silent.

**Engine: Kokoro-82M** via `kokoro-js@1.2.1` (Apache-2.0, runs in Node on
`@huggingface/transformers`), model `onnx-community/Kokoro-82M-v1.0-ONNX`,
`dtype: "q8"`, `device: "cpu"`. Verified locally: ~3 s to load (after a one-time
~90 MB download), ~1x real time to speak, 24 kHz mono Float32 PCM, stock voices
such as `af_heart`, `af_bella`, `am_adam`. It returns **no word timings**.

Rules for every task: TypeScript, follow the repo's patterns (`AGENTS.md`),
test first, `npm run check` must pass (typecheck + all tests). Commit as
`aakaashkapoor <aakaash1308@gmail.com>` with the trailer
`Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. No ffmpeg, no cloud.
Tests that need the real model or a browser stay opt-in or skip cleanly (the
repo already skips browser tests when none is found).

---

## Task 1: Synthesis and word timings (Node)

New folder `src/narration/`:

- `wav.ts`: `encodeWav(samples: Float32Array, sampleRate: number): Uint8Array`
  (16-bit PCM mono, little-endian, correct RIFF header) and
  `decodeWav(bytes): { samples: Float32Array; sampleRate: number }` for files it
  wrote. Pure.
- `sentences.ts`: `splitSentences(text): string[]`: splits narration into
  sentences at `.`, `!`, `?` (keeping the punctuation, ignoring decimals like
  `4.8`), trimming; a text with no terminal punctuation is one sentence. Pure.
- `wordTimes.ts`: `alignWords(sentences: SpokenSentence[]): TimedWord[]`, where
  `SpokenSentence = { text: string; startMs: number; endMs: number }` (the span
  of that sentence's own audio). Inside a sentence each word gets time in
  proportion to its weight = letters and digits in the word + 1, plus an extra
  3 units after a word ending in `,` `;` `:` (a spoken pause); words follow each
  other with no gaps from `startMs` to `endMs`. Reuse `TimedWord` from
  `src/kit/captionWords.ts` (`{ text, startMs, endMs }`). Pure.
- `tts.ts`: the engine boundary.
  ```ts
  export interface Speech { samples: Float32Array; sampleRate: number }
  export interface Synthesizer { speak(text: string, voice: string): Promise<Speech> }
  export function kokoroSynthesizer(options?: { cacheDir?: string }): Synthesizer
  ```
  `kokoroSynthesizer` loads lazily on the first `speak` (dynamic
  `import("kokoro-js")`), sets `@huggingface/transformers`'s `env.cacheDir` to
  `cacheDir` (default `~/.cache/motioncraft/models`), and rejects with a clear
  message naming the valid voices when `voice` is unknown.
- `narrate.ts`:
  ```ts
  export interface SceneNarration { sceneId: string; wavPath: string; audioMs: number; words: TimedWord[] }
  export async function narrateStoryboard(storyboard: Storyboard, options: {
    synthesizer: Synthesizer; cacheDir: string; voice?: string;
  }): Promise<Record<string, SceneNarration>>
  ```
  For every scene with `narration`: split into sentences, speak each, join them
  with 250 ms of silence between sentences, write one WAV per scene to
  `<cacheDir>/<sha1(model id + voice + text)>.wav` plus a sidecar
  `<same>.json` holding `{ audioMs, words }`; reuse both when they already exist
  (no synthesis). Word times are relative to the start of the scene's audio.
  Voice: `options.voice ?? storyboard.voice ?? "af_heart"`.
- Storyboard: add optional top-level `voice?: string` to `src/storyboard/types.ts`
  and validate it as a non-empty string in `validate.ts` (unknown names are
  reported by the synthesizer, not the validator).
- `scripts/narrate.ts <storyboard.json> [--voice name]`: narrates into
  `<storyboard dir>/.motioncraft/narration/` and prints one line per scene
  (`id  3.42 s  12 words`). Add `.motioncraft/` to `.gitignore`.
- `package.json`: add `kokoro-js` `1.2.1` (exact) to dependencies.

Tests (fake `Synthesizer` returning silence of a length derived from the text):
WAV round trip and header fields; sentence splitting incl. decimals and no
punctuation; word alignment (sums, order, comma pause, no gaps); narrate writes
WAV + JSON, joins sentences with 250 ms gaps, caches (second run calls the
synthesizer zero times), honours voice precedence; validator accepts/rejects
`voice`. One real-Kokoro test that runs only when `MOTIONCRAFT_TTS_TEST=1`
(speaks one sentence, checks 24 kHz and a plausible length).

## Task 2: Scene timing and captions from the audio

- `src/render/durations.ts`: add
  `narrationDurations(storyboard, narration: Record<string, SceneNarration>, theme): Record<string, number>`:
  for each narrated scene without `durationMs`: `theme.motion.leadMs + audioMs + 500`
  (tail), rounded up to a whole frame at the storyboard fps. Keep
  `estimateDurations` for when there is no audio.
- `PageInput` (`src/render/page.tsx`): optional
  `narration?: Record<string, { words: TimedWord[] }>` (word times on the
  scene's audio clock). Pass it through to the caption.
- `src/kit/Caption.tsx`: when the scene has measured words, use them shifted by
  `theme.motion.leadMs` instead of `evenWordTimes(...)`; otherwise unchanged.
  Keep the change small: `captionTrack` gains an optional `words` argument.
- New storyboard check `narration-fit` in `src/checks/storyboard.ts`: an
  **error** when a scene sets `durationMs` shorter than `leadMs + audioMs`
  (message gives both numbers). `checkStoryboard` takes optional `narration`.
- `scripts/stills.ts` and `scripts/check.ts`: when cached narration exists for
  the storyboard (`.motioncraft/narration/` sidecars), use its durations and
  words; otherwise estimates, as today. They never synthesize.

Tests: durations (lead + audio + tail, frame rounding, explicit `durationMs`
wins); caption uses measured words (active word at a given ms) and falls back
to even times; `narration-fit` error and pass.

## Task 3: An audio track in the MP4

- Mixdown in the page (browser): an `OfflineAudioContext` at 48 kHz mono for the
  video's full length. Schedule each scene's narration WAV at
  `scene start + leadMs`, and each unmuted `VideoClip`'s audio per the existing
  `clipAudioPlan` (`src/render/media.ts`: `startMs`, `durationMs`,
  `sourceStartMs`, `rate`) at gain 0.35 under narration (1.0 when the scene has
  no narration). Files reach the page the way media already does
  (`mediaUrl` / the render session's file serving; read how `VideoClip` loads
  its `src`).
- Encode with WebCodecs `AudioEncoder`: try `mp4a.40.2` (AAC-LC) first, then
  `opus`; 48 kHz, mono, 128 kbps. Return chunks to Node like the video encoder
  does (`src/render/encode.ts`).
- `src/render/mp4.ts`: support an optional second track: `soun` handler,
  `smhd`, sample entry `mp4a` with an `esds` built from the encoder's
  `AudioSpecificConfig` (description), or `Opus` with `dOps` when Opus was
  used; its own `stts`/`stsz`/`stco`/`stsc` (audio samples can be written as one
  run after the video in `mdat`); `mvhd` duration = the longer track. Video-only
  files must stay byte-identical to today's (existing tests).
- `renderVideo` (`src/render/video.ts`): optional `narration` (the per-scene
  WAV paths + words); when present or when a clip has audio, add the audio track.
  `VideoResult` gains `audioCodec?: string`.

Tests: box-level tests for the audio track (`hdlr soun`, `esds`/`dOps`, sample
tables, `mvhd` duration); an integration test (skips without a browser) that
renders a 2-scene storyboard with a generated tone WAV as narration and checks
the MP4 has 2 tracks and the audio track's duration matches the video within
one audio frame.

## Task 4: Wire-up, docs, showcase

- `scripts/render.ts`: narrate by default (Task 1's `narrateStoryboard`,
  cache in `<storyboard dir>/.motioncraft/narration/`), then render with
  narration durations, words and the audio track. `--no-narration` keeps
  today's silent render with estimated timings. `--voice <name>` overrides.
  Print the audio codec in the summary line. Update `src/render/args.ts`.
- `examples/showcase/storyboard*.json`: add `"voice": "af_heart"`; make sure
  every scene's narration still fits (drop explicit `durationMs` on narrated
  scenes where the audio should drive length).
- `docs/agent-guide.md`: a short "Narration" section (voice field, stock voices,
  audio-driven timing, `narration-fit`, `--no-narration`). README: one line.
- Render both showcases with narration; check the scenes still look right in
  stills (`scripts/stills.ts`) since lengths changed.

Acceptance for the whole plan: `npx tsx scripts/render.ts examples/showcase/storyboard-wide.json --out out/showcase.mp4`
produces an MP4 with a voice, captions that light each word as it is spoken,
and scenes that end shortly after their narration.
