# Third-party licenses

Every third-party dependency and asset motioncraft uses, with its source,
license and author. Everything here must allow commercial use and modification
(see `AGENTS.md`). Add a row whenever a dependency or asset is added.

## Runtime (bundled into the render page)

| Package   | Version | License | Author / source                                 |
| --------- | ------- | ------- | ----------------------------------------------- |
| react     | 19.3.0  | MIT     | Meta Platforms, Inc. â€” https://github.com/facebook/react |
| react-dom | 19.3.0  | MIT     | Meta Platforms, Inc. â€” https://github.com/facebook/react |
| scheduler | 0.28.0  | MIT     | Meta Platforms, Inc. â€” https://github.com/facebook/react (dependency of react-dom) |
| prismjs   | 1.30.0  | MIT     | Lea Verou and contributors — https://github.com/PrismJS/prism (syntax highlighting for `CodeWindow`) |
| three     | 0.186.1 | MIT     | three.js authors (mrdoob and contributors) — https://github.com/mrdoob/three.js (WebGL 3D for components built on `src/kit/three/`) |

## Tooling (development, rendering driver)

| Package           | Version | License    | Author / source                                         |
| ----------------- | ------- | ---------- | ------------------------------------------------------- |
| playwright-core   | 1.64.0  | Apache-2.0 | Microsoft Corporation â€” https://github.com/microsoft/playwright |
| esbuild           | 0.28.2  | MIT        | Evan Wallace â€” https://github.com/evanw/esbuild          |
| tsx               | 4.23.15 | MIT        | Hiroki Osame â€” https://github.com/privatenumber/tsx      |
| typescript        | 7.0.2   | Apache-2.0 | Microsoft Corp. â€” https://github.com/microsoft/TypeScript |
| vitest            | 5.0.3   | MIT        | Anthony Fu and contributors â€” https://github.com/vitest-dev/vitest |
| opentype.js       | 2.0.0   | MIT        | Frederik De Bleser and contributors — https://github.com/opentypejs/opentype.js (reads fonts in the typeface build script; not bundled) |
| @types/node, @types/react, @types/react-dom, @types/prismjs, @types/three, @types/opentype.js | see package.json | MIT | DefinitelyTyped â€” https://github.com/DefinitelyTyped/DefinitelyTyped |
| @types/three's dependencies (type-only, never bundled): @tweenjs/tween.js, fflate, meshoptimizer, @types/stats.js, @types/webxr; @dimforge/rapier3d-compat | see package-lock.json | MIT; Apache-2.0 (rapier3d-compat) | installed by @types/three |

## Video encoding and MP4 muxing

- **H.264 encoding** uses the WebCodecs `VideoEncoder` built into the user's
  installed Chrome or Edge. Nothing is downloaded or bundled for it.
- **MP4 muxing** is motioncraft's own code (`src/render/mp4.ts`, Apache-2.0,
  like the rest of the project), written from the ISO/IEC 14496-12 and -15
  box layouts. No third-party muxer (such as `mp4-muxer`) and no ffmpeg is
  used.

## Assets

### Icons

| Asset | Version | License | Author / source |
| ----- | ------- | ------- | --------------- |
| Lucide icons (24, vendored in `src/icons/nodes.ts`) | 1.53.0 | ISC (some MIT, from Feather) | Lucide Icons and Contributors — https://github.com/lucide-icons/lucide; details in [icons.md](icons.md) |

### Fonts (`assets/fonts/`)

Embedded in the render page under private family names (`mc-sans`, `mc-mono`,
`mc-geist`, `mc-geist-mono`; see `src/render/fontFaces.ts`). Every file is a
variable font (one `wght` axis), so each weight the kit uses is drawn as
itself. Source Sans 3 and Source Code Pro are the defaults; Geist and Geist
Mono are an alternative a theme can choose. Full license texts:
[`SourceSans3-OFL.txt`](SourceSans3-OFL.txt),
[`SourceCodePro-OFL.txt`](SourceCodePro-OFL.txt),
[`Geist-OFL.txt`](Geist-OFL.txt).

| File | Font | License | Copyright | Source |
| ---- | ---- | ------- | --------- | ------ |
| SourceSans3VF-Upright.ttf.woff2 (`wght` 200-900) | Source Sans 3 3.052 | SIL OFL 1.1 | © 2010-2024 Adobe (http://www.adobe.com/), with Reserved Font Name 'Source' | release 3.052R, `WOFF2/VF/` — https://github.com/adobe-fonts/source-sans |
| SourceCodeVF-Upright.ttf.woff2 (`wght` 200-900) | Source Code Pro 1.026 (VF) | SIL OFL 1.1 | © 2023 Adobe (http://www.adobe.com/), with Reserved Font Name 'Source' | release 2.042R-u/1.062R-i/1.026R-vf, `WOFF2/VF/` — https://github.com/adobe-fonts/source-code-pro |
| Geist-Variable.woff2 (`wght` 100-900) | Geist 1.800 | SIL OFL 1.1 | © 2023 Vercel, in collaboration with basement.studio | `fonts/Geist/webfonts/Geist[wght].woff2` on `main` (downloaded 2026-10-09), renamed — https://github.com/vercel/geist-font |
| GeistMono-Variable.woff2 (`wght` 100-900) | Geist Mono 1.700 | SIL OFL 1.1 | © 2023 Vercel, in collaboration with basement.studio | `fonts/GeistMono/webfonts/GeistMono[wght].woff2` on `main` (downloaded 2026-10-09), renamed — https://github.com/vercel/geist-font |
| Geist-Bold.ttf (`wght` 700, static; source of the 3D-text typeface, not embedded in the page) | Geist 1.800 (same version as Geist-Variable.woff2) | SIL OFL 1.1 | Copyright 2024 The Geist Project Authors (the repository's `OFL.txt` at that commit: the same OFL 1.1 text as [`Geist-OFL.txt`](Geist-OFL.txt) apart from this newer copyright line and the openfontlicense.org URL; no Reserved Font Name) | `fonts/Geist/ttf/Geist-Bold.ttf` at commit `10dc7658f13c38a474cde201bb09a4617267545b` (downloaded 2026-10-14), unmodified — https://raw.githubusercontent.com/vercel/geist-font/10dc7658f13c38a474cde201bb09a4617267545b/fonts/Geist/ttf/Geist-Bold.ttf; SHA-256 `3f21f02b827228c3f0c5fb230d027b5a1a263013618e8052bc1b3c5692812c88` |
| Geist-Bold.typeface.json (3D text) | Geist 1.800, Bold | SIL OFL 1.1 | as Geist-Bold.ttf (no Reserved Font Name) | Derived from Geist-Bold.ttf above by `scripts/build-typeface.ts`: its outlines for printable ASCII plus common punctuation and currency converted to three.js typeface JSON. Loaded by `src/kit/three/fonts3d.ts`; not a web font. |

The WOFF2 and TTF font files are unmodified (the variable Geist files are
only renamed, to keep brackets out of file names). `Geist-Bold.typeface.json` is a Modified
Version under the OFL: it is distributed under the same license
([`Geist-OFL.txt`](Geist-OFL.txt)) and is never sold on its own. Geist
declares no Reserved Font Name, so the derivative may keep the name. For the
Source fonts, motioncraft does not use the Reserved Font Names for any
derivative.

## Ported motion designs

| Source | Commit | License | Author | Ported items |
| ------ | ------ | ------- | ------ | ------------ |
| HyperFrames | `2905162d925fc87fb8242e24ed0bbf025d307ea1` | Apache-2.0 | HeyGen and contributors — https://github.com/heygen-com/hyperframes | `chart-story`, `kinetic-type-swap`, `scramble-reveal`, `before-after-wipe`, `vox-annotate`, `svg-stroke-trace`, `whiteboard-ink`, `native-notification-pop`, `caption-pill-karaoke`, `iris-reveal`, `whip-pan-cut` |

The designs and timings were adapted into motioncraft's own React code; no HyperFrames code, GSAP or other runtime is bundled.

## Local narration (voice)

| Item | Version | License | Author / source |
| ---- | ------- | ------- | --------------- |
| onnxruntime-node | 1.21.0 | MIT | Microsoft Corporation — https://github.com/microsoft/onnxruntime (runs the voice model; its dependencies are MIT, ISC, BSD-3-Clause, BlueOak-1.0.0 or MIT OR CC0-1.0) |
| Kokoro-82M voice model (`model_quantized.onnx` from the timestamped export at revision dd4401a, which also returns per-phoneme durations; `tokenizer.json` and `voices/*.bin` at revision 1939ad2) | dd4401a / 1939ad2 | Apache-2.0 | hexgrad — https://huggingface.co/hexgrad/Kokoro-82M, ONNX exports https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX and https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX-timestamped. Downloaded once, size- and SHA-256-checked, into `~/.cache/motioncraft`; never bundled. |
| misaki pronunciation dictionaries (`us_gold.json`, `us_silver.json`) | revision fba1236 | Apache-2.0 | hexgrad — https://github.com/hexgrad/misaki. Downloaded and checked the same way. |
| Pronunciation rules (`src/narration/phonemes.ts`: context rules, `apply_stress`, special cases and stem rules) | n/a | Apache-2.0 | Ported from misaki `en.py` (https://github.com/hexgrad/misaki, hexgrad). |
| English text normalizer (`src/narration/normalize.ts`) and the `generate_from_ids` port (`src/narration/kokoro.ts`: style row and model inputs) | n/a | Apache-2.0 | Ported from kokoro-js (https://github.com/hexgrad/kokoro, hexgrad). kokoro-js itself is not a dependency (its phonemizer bundles GPL eSpeak NG). |

`.npmrc` sets `onnxruntime-node-install-cuda=skip`: onnxruntime-node's install script would otherwise download unpinned CUDA binaries on Linux x64, which breaks the pinned-downloads-only rule in `AGENTS.md`. If npm stops honouring this (npm 12+), set `ONNXRUNTIME_NODE_INSTALL_CUDA=skip` in the environment on Linux and in CI.
