import { describe, expect, it } from "vitest";
import { kokoroSynthesizer } from "../src/narration/kokoro";

describe("kokoroSynthesizer", () => {
  it("rejects an unknown voice, listing the supported ones, before touching the network", async () => {
    const synth = kokoroSynthesizer({ offline: true, cacheDir: "no-such-cache" });
    await expect(synth.speak("Hi.", "zz_nobody")).rejects.toThrow(/af_heart, af_bella, am_michael/);
  });

  // The real model: downloads ~100 MB once into ~/.cache/motioncraft.
  it.skipIf(process.env["MOTIONCRAFT_TTS_TEST"] !== "1")(
    "speaks a sentence at 24 kHz",
    async () => {
      const speech = await kokoroSynthesizer().speak("Type one prompt, and get a finished video.", "af_heart");
      expect(speech.sampleRate).toBe(24000);
      const seconds = speech.samples.length / speech.sampleRate;
      expect(seconds).toBeGreaterThan(1.5);
      expect(seconds).toBeLessThan(6);
    },
    600_000,
  );
});
