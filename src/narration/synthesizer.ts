// The voice the scripts speak with: Chatterbox for Chatterbox voices, Kokoro for
// the rest. Each engine loads its model on first use, so a storyboard that only
// uses Kokoro never downloads Chatterbox. Chatterbox borrows the same Kokoro for
// its word times.

import { chatterboxSynthesizer } from "./chatterbox";
import { kokoroSynthesizer, type Synthesizer } from "./kokoro";
import { isChatterboxVoice } from "./voices";

/** Speaks each voice with the engine it belongs to. */
export function routeVoice(chatterbox: Synthesizer, kokoro: Synthesizer): Synthesizer {
  return { speak: (text, voice, speed) => (isChatterboxVoice(voice) ? chatterbox : kokoro).speak(text, voice, speed) };
}

export function voiceSynthesizer(options: { cacheDir?: string; offline?: boolean } = {}): Synthesizer {
  const kokoro = kokoroSynthesizer(options);
  return routeVoice(chatterboxSynthesizer({ ...options, timing: kokoro }), kokoro);
}
