# Third-party licenses

Every third-party dependency and asset motioncraft uses, with its source,
license and author. Everything here must allow commercial use and modification
(see `AGENTS.md`). Add a row whenever a dependency or asset is added.

## Runtime (bundled into the render page)

| Package   | Version | License | Author / source                                 |
| --------- | ------- | ------- | ----------------------------------------------- |
| react     | 19.3.0  | MIT     | Meta Platforms, Inc. — https://github.com/facebook/react |
| react-dom | 19.3.0  | MIT     | Meta Platforms, Inc. — https://github.com/facebook/react |
| scheduler | 0.28.0  | MIT     | Meta Platforms, Inc. — https://github.com/facebook/react (dependency of react-dom) |

## Tooling (development, rendering driver)

| Package           | Version | License    | Author / source                                         |
| ----------------- | ------- | ---------- | ------------------------------------------------------- |
| playwright-core   | 1.64.0  | Apache-2.0 | Microsoft Corporation — https://github.com/microsoft/playwright |
| esbuild           | 0.28.2  | MIT        | Evan Wallace — https://github.com/evanw/esbuild          |
| tsx               | 4.23.15 | MIT        | Hiroki Osame — https://github.com/privatenumber/tsx      |
| typescript        | 7.0.2   | Apache-2.0 | Microsoft Corp. — https://github.com/microsoft/TypeScript |
| vitest            | 5.0.3   | MIT        | Anthony Fu and contributors — https://github.com/vitest-dev/vitest |
| @types/node, @types/react, @types/react-dom | see package.json | MIT | DefinitelyTyped — https://github.com/DefinitelyTyped/DefinitelyTyped |

## Video encoding and MP4 muxing

- **H.264 encoding** uses the WebCodecs `VideoEncoder` built into the user's
  installed Chrome or Edge. Nothing is downloaded or bundled for it.
- **MP4 muxing** is motioncraft's own code (`src/render/mp4.ts`, Apache-2.0,
  like the rest of the project), written from the ISO/IEC 14496-12 and -15
  box layouts. No third-party muxer (such as `mp4-muxer`) and no ffmpeg is
  used.

## Assets

| Asset | Version | License | Author / source |
| ----- | ------- | ------- | --------------- |
| Lucide icons (24, vendored in `src/icons/nodes.ts`) | 1.53.0 | ISC (some MIT, from Feather) | Lucide Icons and Contributors — https://github.com/lucide-icons/lucide; details in [icons.md](icons.md) |

Otherwise every frame is drawn in code with the system's fonts.
