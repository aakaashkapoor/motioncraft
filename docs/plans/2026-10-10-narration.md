# Plan: narration (local voice, audio-driven timing, an audio track in the MP4)

Design: `docs/design.md` workflow step 3 and Workshop decision D31: narration is
on by default; a small open text-to-speech model runs locally (downloaded on
first use, no API, no spending); the audio's timing drives scene length and
caption sync. Today `narration` is text only (captions + an estimated length)
and every MP4 is silent.

**Engine: Kokoro-82M**, run directly with `onnxruntime-node` (MIT). Fully local:
the model and dictionaries download once (pinned and sha256-checked, per
`AGENTS.md`) into `~/.cache/motioncraft/`; after that everything runs offline.
**Not** `kokoro-js` (its `phonemizer` dependency is eSpeak NG compiled to WASM,
GPL-3.0) and **not** `@huggingface/transformers` (pulls `sharp`/libvips, LGPL).
Pronunciation comes from Kokoro's own English dictionaries (misaki, Apache-2.0).
Verified locally: about 3 s to load, about real time to speak, 24 kHz mono. It
returns **no word timings**, so Task 1 derives them.

Rules for every task: TypeScript, follow the repo's patterns (`AGENTS.md`),
test first, `npm run check` must pass (typecheck + all tests). Commit as
`aakaashkapoor <aakaash1308@gmail.com>` with the trailer
`Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. No ffmpeg, no cloud.
Tests that need the real model or a browser stay opt-in or skip cleanly (the
repo already skips browser tests when none is found).

---

## Task 1: Local voice (Kokoro on onnxruntime-node) and word timings

New folder `src/narration/`, one responsibility per file:

- `assets.ts`: the pinned files and a fetcher.
  ```ts
  export interface PinnedFile { url: string; sha256: string; bytes: number; path: string /* relative to cacheDir */ }
  export const KOKORO_REVISION = "1939ad2a8e416c0acfeecc08a694d14ef25f2231"; // onnx-community/Kokoro-82M-v1.0-ONNX
  export const MISAKI_REVISION = "fba1236595f2d2bf21d414ba6e57d25256afada3";  // hexgrad/misaki
  export async function ensureFile(file: PinnedFile, cacheDir: string, options?: { offline?: boolean; fetch?: typeof fetch }): Promise<string>
  ```
  Model files (`https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX/resolve/<rev>/<path>`):
  - `onnx/model_quantized.onnx`: 92361116 bytes, sha256 `fbae9257e1e05ffc727e951ef9b9c98418e6d79f1c9b6b13bd59f5c9028a1478`
  - `tokenizer.json`: 3497 bytes, sha256 `77a02c8e164413299b4b4c403b14f8e0e1c1b727db4d46a09d6327b861060a34`
  - voices, each 522240 bytes: `voices/af_heart.bin` `d583ccff3cdca2f7fae535cb998ac07e9fcb90f09737b9a41fa2734ec44a8f0b`;
    `voices/af_bella.bin` `f69d836209b78eb8c66e75e3cda491e26ea838a3674257e9d4e5703cbaf55c8b`;
    `voices/am_michael.bin` `1d1f21dd8da39c30705cd4c75d039d265e9bc4a2a93ed09bc9e1b1225eb95ba1`

  Dictionaries (`https://raw.githubusercontent.com/hexgrad/misaki/<rev>/misaki/data/<name>`):
  - `us_gold.json`: 3000469 bytes, sha256 `dc414872a49a28ae6c141463d502fd945f3b2fde040484fdc47d00cc4612686f`
  - `us_silver.json`: 3099517 bytes, sha256 `de8f67be911bb6c659187b4a65fd966b6a30e56350e0f790d763210b053ac475`

  `ensureFile` returns the cached path when the file exists with the right size
  and hash; otherwise it downloads (Node `fetch`, injectable for tests) to a temp
  file, verifies, and renames into place. A hash mismatch is an error naming the
  file. `offline: true` never touches the network and errors with "run once
  online to download <file>". Default cache dir: `~/.cache/motioncraft`
  (`os.homedir()` + `node:path`). Record both sources in `licenses/` (Kokoro-82M
  model: Apache-2.0, hexgrad; misaki dictionaries: Apache-2.0, hexgrad).
- `normalize.ts`: text cleanup before pronunciation, ported from kokoro-js's
  English normalizer (Apache-2.0; credit it in a comment): curly quotes to
  straight, `Dr.`/`Mr.`/`Ms.`/`Mrs.`, years (`1990s`), times (`9:41`), money
  (`$12.50`), decimals (`4.8` becomes "4 point 8"), ranges (`2-3` becomes "2 to
  3"), thousands separators. Then integers become words (`42` becomes
  "forty-two", up to billions). Pure.
- `phonemes.ts`: English text to a Kokoro phoneme string.
  `export function createPhonemizer(gold: Lexicon, silver: Lexicon): (text: string) => string`.
  Tokenize into words and punctuation. Look each word up (exact, then lowercase,
  then without a trailing `'s`/`s` plus a `z` sound, as misaki does) in gold, then
  silver. Dictionary values are either a string or an object keyed by part of
  speech: use the `DEFAULT` key, else the first value. Words found nowhere: an
  all-caps acronym is spelled out (look up each letter); anything else gets a
  simple letter-to-sound pass (map common graphemes to the phoneme set; it only
  has to be intelligible). Keep `; : , . ! ?` as they are; words separated by
  single spaces. Pure.
- `tokenizer.ts`: `encodePhonemes(phonemes: string, vocab: Record<string, number>): number[]`.
  Drop characters not in the vocab, one id per character, wrap with id `0` at
  both ends (tokenizer.json's `TemplateProcessing`, `$` = 0), cap at 510 ids.
  `vocab` is `tokenizer.json`'s `model.vocab`. Pure.
- `kokoro.ts`: the model.
  ```ts
  export interface Speech { samples: Float32Array; sampleRate: number }
  export interface Synthesizer { speak(text: string, voice: string): Promise<Speech> }
  export function kokoroSynthesizer(options?: { cacheDir?: string; offline?: boolean }): Synthesizer
  ```
  Lazily on the first `speak`: `ensureFile` everything, then load the ONNX
  session (`onnxruntime-node`, `InferenceSession.create(path)`), the vocab, the
  dictionaries and the voice file (raw little-endian Float32, rows of 256).
  Per call: normalize, phonemize, encode ids. Style row = `min(max(ids.length - 2, 0), 509)`;
  style = the floats `[row*256, row*256 + 256)`. Run with inputs `input_ids`
  (int64 `[1, n]`), `style` (float32 `[1, 256]`) and `speed` (float32 `[1]`,
  1.0); output `waveform` is 24 kHz mono. An unknown voice is an error listing
  the supported voices (the three above). This ports kokoro-js's
  `generate_from_ids` (Apache-2.0; credit it).
- `wav.ts`: `encodeWav(samples, sampleRate): Uint8Array` (16-bit PCM mono,
  little-endian RIFF) and `decodeWav(bytes)`. Pure.
- `sentences.ts`: `splitSentences(text): string[]` at `.` `!` `?` (keep the
  mark; ignore decimals like `4.8` and abbreviations like `Dr.`); text with no
  terminal mark is one sentence. Pure.
- `wordTimes.ts`: `alignWords(sentences: { text: string; startMs: number; endMs: number }[]): TimedWord[]`
  (reuse `TimedWord` from `src/kit/captionWords.ts`). Inside a sentence, each
  word's share of the time is proportional to its weight: letters and digits + 1,
  plus 3 extra units after a word ending in `,` `;` `:`. No gaps. Pure.
- `narrate.ts`:
  ```ts
  export interface SceneNarration { sceneId: string; wavPath: string; audioMs: number; words: TimedWord[] }
  export async function narrateStoryboard(storyboard: Storyboard, options: {
    synthesizer: Synthesizer; outDir: string; voice?: string;
  }): Promise<Record<string, SceneNarration>>
  ```
  For each scene with `narration`: split into sentences, speak each, join with
  250 ms of silence, then write
  `<outDir>/<sha1([NARRATION_CACHE_VERSION, KOKORO_REVISION, MISAKI_REVISION, voice, text].join("\0"))>.wav`
  (`NARRATION_CACHE_VERSION = 2`, exported) and a sidecar `.json`
  `{ audioMs, words }` (word times from the start of the scene's audio). Reuse
  both when present and the sidecar has the right shape (no synthesis).
  A sentence whose phoneme estimate (one per normalized character) exceeds ~400
  is split again at `,` `;` `:`, then at spaces (`pieces.ts`); the pieces are
  spoken back to back with no extra gap, and words are aligned over each piece's
  own span. A piece over 510 phonemes throws `sentence too long to speak (N
  phonemes, max 510): "<first words>…"`. Each spoken piece is trimmed of the
  silence the voice leaves around it (`silence.ts`: samples under 0.01 are silence;
  30 ms kept before the first sound and 60 ms after the last), so word times match
  the sound and the gap between sentences is the 250 ms we add. Voice:
  `options.voice ?? storyboard.voice ?? "af_heart"`.
- Storyboard: optional top-level `voice?: string` in `src/storyboard/types.ts`,
  validated in `validate.ts` as one of the stock voices (`src/narration/voices.ts`: `af_heart`, `af_bella`, `am_michael`).
- `scripts/narrate.ts <storyboard.json> [--offline]` (no `--voice`: the voice comes from the storyboard): narrates
  into `<storyboard dir>/.motioncraft/narration/` and prints `id  3.42 s  12 words`
  per scene. Add `.motioncraft/` to `.gitignore`.
- `package.json`: `npm install --save-exact onnxruntime-node@1.21.0`, then
  `npm ci` (see `AGENTS.md`).

Tests (no network and no model; inject fakes): `ensureFile` with a fake fetch
(cache hit, download and verify, hash mismatch, offline miss); normalizer cases;
phonemizer with a tiny in-memory lexicon (gold before silver, part-of-speech
objects, plural `s`, acronym fallback, an unknown word gives non-empty
phonemes); tokenizer (unknown characters dropped, 0 at both ends, cap); WAV round
trip; sentences; word alignment; narrate with a fake `Synthesizer` (WAV + JSON
written, 250 ms gaps, a cache hit calls the synthesizer zero times, voice
precedence); validator `voice`. One real end-to-end test, only when
`MOTIONCRAFT_TTS_TEST=1`: speaks "Type one prompt, and get a finished video."
with `af_heart` and expects 24 kHz and 1.5 to 6 s of audio.

## Task 2: Scene timing and captions from the audio

- `src/render/durations.ts`: add
  `narrationDurations(storyboard, narration: Record<string, SceneNarration>, theme): Record<string, number>`:
  for each narrated scene without `durationMs`: `theme.motion.leadMs + audioMs + tail`,
  where the tail is `narrationTailMs` (`max(500, outgoing transition ms + 250)`, 500 for a cut
  or the last scene), rounded up to a whole frame at the storyboard fps. Keep
  `estimateDurations` for when there is no audio.
- `PageInput` (`src/render/page.tsx`): optional
  `narration?: Record<string, { words: TimedWord[] }>` (word times on the
  scene's audio clock). Pass it through to the caption.
- `src/kit/Caption.tsx`: when the scene has measured words, use them shifted by
  `theme.motion.leadMs` instead of `evenWordTimes(...)`; otherwise unchanged.
  Keep the change small: `captionTrack` gains an optional `words` argument.
- New storyboard check `narration-fit` in `src/checks/storyboard.ts`: an
  **error** when a scene sets `durationMs` shorter than `leadMs + audioMs + narrationTailMs` (tail = max(500, outgoing transition ms + 250), so voices never overlap across a transition)
  (message gives both numbers). `checkStoryboard` takes optional `narration`.
- `scripts/stills.ts` and `scripts/check.ts`: when cached narration exists for
  the storyboard (`.motioncraft/narration/` sidecars), use its durations and
  words; otherwise estimates, as today. They never synthesize.

Tests: durations (lead + audio + tail, frame rounding, explicit `durationMs`
wins); caption uses measured words (active word at a given ms) and falls back
to even times; `narration-fit` error and pass.

## Task 3: An audio track in the MP4

Context from Tasks 1-2: per scene, `SceneNarration { sceneId, wavPath, audioMs, words }`
(`src/narration/types.ts`); `prepareMedia` passes the page only
`PageNarration` (`{ words }` per scene); narrated scene lengths are
`leadMs + audioMs + narrationTailMs(...)`, so a scene's voice always ends before
the next scene's voice starts. Local media reaches the page through Playwright
routes on the fake origin `https://motioncraft.localhost/media/...`
(`src/kit/mediaSource.ts`, `routeMedia` in `src/render/media.ts`); nothing is
fetched from the network.

- **Serve narration WAVs** the same way: a route on
  `https://motioncraft.localhost/narration/<file>.wav` answering only the WAV
  files of this render's narration (404 for anything else). Widen
  `PageNarration` per scene to `{ words, audioMs?, src? }` where `src` is that
  served URL (never a disk path). (As built, the page only needs the words, so
  `PageNarration` stayed `{ words }`; the WAVs are served for the mix, and the
  audio plan carries the URLs.) Pure URL helpers next to `mediaUrl`
  (`narrationUrl`, `narrationFile`).
- **Audio plan (Node, pure):** `src/render/audioPlan.ts`:
  `audioPlan(storyboard, timeline, theme, narration, clipAudio): AudioPlan`,
  `AudioPlan = { durationMs; sampleRate: 48000; sources: AudioSource[] }`,
  `AudioSource = { src (served URL); startMs; durationMs; sourceStartMs; rate; gain }`.
  Narration: at `scene start + leadMs`, gain 1.0, its full `audioMs`. Unmuted
  `VideoClip` audio from the existing `clipAudioPlan` (`startMs`, `durationMs`,
  `sourceStartMs`, `rate`): gain 0.35 when the clip's scene has narration, else
  1.0. `durationMs` = the video's length. Empty `sources` = no audio track.
- **Mix and encode in the page:** a page function (alongside the video encoder
  in `src/render/encode.ts` or a new `src/render/audioEncode.ts`) that takes the
  plan, fetches each `src`, `decodeAudioData`s it, schedules it in an
  `OfflineAudioContext` (48 kHz, mono, length = plan duration) with its
  offset/gain/rate/trim, renders, then encodes with WebCodecs `AudioEncoder`:
  try `{ codec: "mp4a.40.2", sampleRate: 48000, numberOfChannels: 1, bitrate: 128000 }`
  first (check `AudioEncoder.isConfigSupported`), else `opus`. Return to Node
  the codec string, the decoder config `description` (AudioSpecificConfig for
  AAC; for Opus build `dOps` from the encoder's config/description or the
  standard Opus header defaults), and the chunks (data, timestamp, duration),
  base64 like the video chunks. The encoder delay is handled with an edit list
  (`elst`): for AAC, the priming is measured by encoding and decoding an impulse
  (0 samples in the Chrome used here, which compensates itself); for Opus the
  PreSkip stays in `dOps` only, with `elst` media_time 0, because Chrome's
  ffmpeg-based demuxer already applies it. If neither codec is supported, throw a clear
  error naming the browser (like `UnsupportedCodecError`).
- **MP4 writer** (`src/render/mp4.ts`): an optional second track. `soun`
  handler (`hdlr`), `smhd`, sample entry `mp4a` + `esds` (from the
  AudioSpecificConfig) or `Opus` + `dOps`, sample rate as the media timescale,
  `stts` from chunk durations, `stsz`, `stco`, `stsc`; audio samples written as
  one run after the video samples in `mdat`. `mvhd` duration = the longer
  track; `tkhd` track ids 1 (video) and 2 (audio), audio `tkhd` volume 1.0.
  **Video-only output must stay byte-identical to today's** (keep or add a test
  that pins it).
- **`renderVideo`** (`src/render/video.ts`): optional `narration` (the
  per-scene `SceneNarration`s). Build the plan; when it has sources, mix,
  encode and add the audio track. `VideoResult` gains `audioCodec?: string`;
  `result.audio` (today's `clipAudioPlan`) can be replaced by the plan.

Tests: `audioPlan` (narration offsets = scene start + lead, gains, clip under
narration at 0.35, muted clips excluded, no sources = no track); narration URL
helpers and the route (only this render's WAVs); MP4 box tests for the audio
track (`hdlr soun`, `esds`/`dOps` contents, sample tables, `mvhd` duration,
two `trak`s) and the video-only byte-identity test; one browser integration
test (skips without a browser like the existing ones) that renders a 2-scene
storyboard with a generated 440 Hz tone WAV as each scene's narration and checks
the MP4 has two tracks, the audio track's codec, and that its duration matches
the video within one audio frame (decode the file's audio in the page with
WebCodecs `AudioDecoder` or `decodeAudioData` on the MP4 to confirm it plays).

## Task 4: Wire-up, docs, showcase

- `scripts/render.ts`: narrate by default (Task 1's `narrateStoryboard` with `kokoroSynthesizer()`,
  cache in `<storyboard dir>/.motioncraft/narration/`), then render with
  narration durations, words and the audio track. `--no-narration` keeps
  today's silent render with estimated timings. The voice comes from the
  storyboard (`voice`, default `af_heart`); there is no `--voice` flag.
  Print the audio codec in the summary line. Update `src/render/args.ts`.
- `examples/showcase/storyboard*.json`: add `"voice": "af_heart"`. The showcases keep
  their explicit `durationMs` values, because the choreography (cursor click, typing,
  highlight walks) is timed inside them; raise a scene's `durationMs` only when
  `narration-fit` reports an error.
- `docs/agent-guide.md`: a short "Narration" section (voice field, stock voices,
  audio-driven timing, `narration-fit`, `--no-narration`). README: one line.
- Render both showcases with narration; check the scenes still look right in
  stills (`scripts/stills.ts`) since lengths changed.

Acceptance for the whole plan: `npx tsx scripts/render.ts examples/showcase/storyboard-wide.json --out out/showcase.mp4`
produces an MP4 with a voice, captions that light each word as it is spoken,
and scenes that end shortly after their narration.
