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

## Tooling (development, rendering driver)

| Package           | Version | License    | Author / source                                         |
| ----------------- | ------- | ---------- | ------------------------------------------------------- |
| playwright-core   | 1.64.0  | Apache-2.0 | Microsoft Corporation â€” https://github.com/microsoft/playwright |
| esbuild           | 0.28.2  | MIT        | Evan Wallace â€” https://github.com/evanw/esbuild          |
| tsx               | 4.23.15 | MIT        | Hiroki Osame â€” https://github.com/privatenumber/tsx      |
| typescript        | 7.0.2   | Apache-2.0 | Microsoft Corp. â€” https://github.com/microsoft/TypeScript |
| vitest            | 5.0.3   | MIT        | Anthony Fu and contributors â€” https://github.com/vitest-dev/vitest |
| @types/node, @types/react, @types/react-dom | see package.json | MIT | DefinitelyTyped â€” https://github.com/DefinitelyTyped/DefinitelyTyped |

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

The font files are unmodified (the Geist files are only renamed, to keep
brackets out of file names). motioncraft does not use the Reserved Font
Names for any derivative.
