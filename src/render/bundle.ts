// Bundles the render page with esbuild into one self-contained HTML string:
// no dev server, no files on disk, nothing fetched at load time.

import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { fontFaceCss } from "./fonts";
import { INPUT_ELEMENT_ID, ROOT_ELEMENT_ID, type PageInput } from "./page";

const HERE = dirname(fileURLToPath(import.meta.url));

let script: Promise<string> | undefined;

/** The page's JavaScript, bundled once per process. */
export function pageScript(): Promise<string> {
  script ??= build({
    stdin: {
      contents: 'import { mountPage } from "./page";\nmountPage();\n',
      loader: "tsx",
      resolveDir: HERE,
      sourcefile: "entry.tsx",
    },
    bundle: true,
    write: false,
    format: "iife",
    platform: "browser",
    target: "es2022",
    jsx: "automatic",
    minify: true,
    legalComments: "none",
    logLevel: "silent",
    define: { "process.env.NODE_ENV": '"production"' },
  }).then((result) => result.outputFiles[0]!.text);
  return script;
}

/** Makes text safe to place inside a <script> element. */
function escapeScript(text: string): string {
  return text.replace(/<\/(script)/gi, "<\\/$1").replace(/<!--/g, "<\\!--");
}

/** JSON that cannot close its <script> element early. */
function embedJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

/** Assembles the HTML document from a bundled script, the page input and extra CSS (the fonts). */
export function pageHtml(js: string, input: PageInput, css = ""): string {
  return [
    "<!doctype html>",
    '<html><head><meta charset="utf-8">',
    `<style>html,body{margin:0;padding:0;overflow:hidden}${css}</style>`,
    "</head><body>",
    `<div id="${ROOT_ELEMENT_ID}"></div>`,
    `<script id="${INPUT_ELEMENT_ID}" type="application/json">${embedJson(input)}</script>`,
    `<script>${escapeScript(js)}</script>`,
    "</body></html>",
  ].join("");
}

/** The complete render page for `input`, as a single HTML string. */
export async function bundlePage(input: PageInput): Promise<string> {
  const [js, css] = await Promise.all([pageScript(), fontFaceCss()]);
  return pageHtml(js, input, css);
}
