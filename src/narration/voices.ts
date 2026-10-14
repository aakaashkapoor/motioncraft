// The stock voices a storyboard may name. Free of Node imports so the
// storyboard validator can use it. Chatterbox voices come first (the default
// is one); `assets.ts` pins a voice file for each Kokoro voice.

export const CHATTERBOX_VOICES = ["chatterbox"] as const;
export const KOKORO_VOICES = ["af_heart", "af_bella", "am_michael"] as const;
export const STOCK_VOICES = [...CHATTERBOX_VOICES, ...KOKORO_VOICES] as const;

export type StockVoice = (typeof STOCK_VOICES)[number];

export function isChatterboxVoice(voice: string): boolean {
  return (CHATTERBOX_VOICES as readonly string[]).includes(voice);
}
