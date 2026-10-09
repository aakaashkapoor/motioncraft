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

Embedded in the render page under private family names (`mc-sans`, `mc-mono`;
see `src/render/fonts.ts`). Full license text: [`Geist-OFL.txt`](Geist-OFL.txt).

| File | Font | License | Copyright | Source |
| ---- | ---- | ------- | --------- | ------ |
| Geist-Regular.woff2 (400) | Geist 1.7.2 | SIL OFL 1.1 | © 2023 Vercel, in collaboration with basement.studio | npm `geist@1.7.2`, `dist/fonts/geist-sans/` — https://github.com/vercel/geist-font |
| Geist-SemiBold.woff2 (600) | Geist 1.7.2 | SIL OFL 1.1 | © 2023 Vercel, in collaboration with basement.studio | npm `geist@1.7.2`, `dist/fonts/geist-sans/` — https://github.com/vercel/geist-font |
| Geist-ExtraBold.woff2 (800) | Geist | SIL OFL 1.1 | © 2023 Vercel, in collaboration with basement.studio | https://github.com/vercel/geist-font/raw/main/fonts/Geist/webfonts/Geist-ExtraBold.woff2 (the npm package has no upright ExtraBold) |
| GeistMono-Regular.woff2 (400) | Geist Mono 1.7.2 | SIL OFL 1.1 | © 2023 Vercel, in collaboration with basement.studio | npm `geist@1.7.2`, `dist/fonts/geist-mono/` — https://github.com/vercel/geist-font |
| GeistMono-SemiBold.woff2 (600) | Geist Mono 1.7.2 | SIL OFL 1.1 | © 2023 Vercel, in collaboration with basement.studio | npm `geist@1.7.2`, `dist/fonts/geist-mono/` — https://github.com/vercel/geist-font |

The font files are unmodified. motioncraft does not use the Reserved Font
Name for any derivative.
