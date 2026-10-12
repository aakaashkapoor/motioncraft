// Reads pixels back out of a rendered MP4 the way a viewer sees them: the
// browser's own <video> element decodes the frame (honouring the stream's
// range and matrix) and draws it to a canvas. Compared against the PNG still
// of the same frame, that shows whether the colour survived the encode.

import { readFile } from "node:fs/promises";
import { neutralTheme } from "../src/index";
import { withRenderPage } from "../src/render/session";

export type Rgb = [number, number, number];

/** The RGB at each of `points` in frame `frame` of the MP4 and in the PNG, decoded in the browser. */
export async function framePixels(
  mp4Path: string,
  pngPath: string,
  frame: number,
  fps: number,
  points: readonly (readonly [number, number])[],
): Promise<{ video: Rgb[]; png: Rgb[] }> {
  const [mp4, png] = await Promise.all([readFile(mp4Path), readFile(pngPath)]);
  return withRenderPage(
    {
      storyboard: { title: "decode", aspect: "16:9", fps, theme: "neutral", scenes: [{ id: "a", component: "TitleCard", props: { title: "x" }, durationMs: 100 }] },
      theme: neutralTheme,
      durations: {},
    },
    (page) =>
      page.evaluate(
        // No named inner functions: tsx would wrap them in a `__name` helper the page does not have.
        async ({ mp4, png, time, points }) => {
          const video = document.createElement("video");
          video.muted = true;
          video.src = URL.createObjectURL(await (await fetch(`data:video/mp4;base64,${mp4}`)).blob());
          await new Promise((resolve, reject) => {
            video.onloadeddata = resolve;
            video.onerror = () => reject(new Error(`video failed to load: ${video.error?.message}`));
          });
          video.currentTime = time;
          await new Promise((resolve) => (video.onseeked = resolve));
          const still = await createImageBitmap(await (await fetch(`data:image/png;base64,${png}`)).blob());
          const result: Record<"video" | "png", [number, number, number][]> = { video: [], png: [] };
          for (const [key, source, width, height] of [
            ["video", video, video.videoWidth, video.videoHeight],
            ["png", still, still.width, still.height],
          ] as const) {
            const context = new OffscreenCanvas(width, height).getContext("2d", { willReadFrequently: true })!;
            context.drawImage(source, 0, 0, width, height);
            for (const [x, y] of points) {
              const [r, g, b] = context.getImageData(x, y, 1, 1).data;
              result[key].push([r!, g!, b!]);
            }
          }
          return result;
        },
        // Mid-frame, so the seek lands on exactly this frame.
        { mp4: mp4.toString("base64"), png: png.toString("base64"), time: (frame + 0.5) / fps, points },
      ),
  );
}
