// The stock voices a storyboard may name. Free of Node imports so the
// storyboard validator can use it; `assets.ts` pins a voice file for each.

export const STOCK_VOICES = ["af_heart", "af_bella", "am_michael"] as const;

export type StockVoice = (typeof STOCK_VOICES)[number];
