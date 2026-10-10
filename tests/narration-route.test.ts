import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Page, Route } from "playwright-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { narrationUrl } from "../src/kit/mediaSource";
import { routeNarration } from "../src/render/media";

let dir: string;
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "motioncraft-route-"));
});
afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

interface Fulfilled {
  status?: number;
  headers?: Record<string, string>;
  body?: string | Buffer;
}

/** Runs the route handler `routeNarration` installs for one request URL. */
async function request(narration: Parameters<typeof routeNarration>[1], url: string): Promise<{ pattern: string; fulfilled: Fulfilled }> {
  let installed: { pattern: string; handler: (route: Route) => Promise<void> } | undefined;
  const page = { route: async (pattern: string, handler: (route: Route) => Promise<void>) => void (installed = { pattern, handler }) } as unknown as Page;
  await routeNarration(page, narration);
  let fulfilled: Fulfilled = {};
  await installed!.handler({ request: () => ({ url: () => url }), fulfill: async (options: Fulfilled) => void (fulfilled = options) } as unknown as Route);
  return { pattern: installed!.pattern, fulfilled };
}

describe("routeNarration", () => {
  it("serves the WAV of a narrated scene, and nothing else", async () => {
    const wav = join(dir, "a.wav");
    await writeFile(wav, Buffer.from("RIFFdata"));
    const secret = join(dir, "secret.txt");
    await writeFile(secret, "secret");
    const narration = { intro: { wavPath: wav } };

    const hit = await request(narration, narrationUrl("intro.wav"));
    expect(hit.pattern).toBe("https://motioncraft.localhost/narration/**");
    expect(hit.fulfilled.status).toBe(200);
    expect(hit.fulfilled.headers).toMatchObject({ "content-type": "audio/wav" });
    expect(hit.fulfilled.body).toEqual(Buffer.from("RIFFdata"));

    for (const url of [
      narrationUrl("outro.wav"),
      narrationUrl("secret.txt"),
      narrationUrl(secret),
      narrationUrl("../secret.txt"),
      narrationUrl("__proto__"),
      "https://motioncraft.localhost/narration/",
    ]) {
      const miss = await request(narration, url);
      expect(miss.fulfilled.status, url).toBe(404);
    }
  });
});
