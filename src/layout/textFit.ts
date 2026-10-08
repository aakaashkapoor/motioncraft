// A deterministic estimate of how much room text takes, without a DOM. Glyph
// widths are approximated by an average width per character, so the estimate
// is the same on every machine; real layout is still checked by layer 1.

/** Average glyph width as a fraction of the font size, for bold sans text (a little generous). */
export const AVG_CHAR_EM = 0.6;

export interface TextStyle {
  /** Font size in px. */
  size: number;
  /** Line height as a multiple of the font size. */
  lineHeight: number;
  /** Average glyph width in em, including any letter spacing. Defaults to `AVG_CHAR_EM`. */
  charEm?: number;
}

/** How many characters fit on one line of `width` px. Always at least 1. */
export function charsPerLine(width: number, size: number, charEm = AVG_CHAR_EM): number {
  return Math.max(1, Math.floor(width / (size * charEm)));
}

/**
 * Number of lines `text` wraps to in `width` px: greedy word wrap, with words
 * longer than a line broken across lines (like `overflow-wrap: break-word`).
 */
export function estimateLines(text: string, width: number, size: number, charEm = AVG_CHAR_EM): number {
  const max = charsPerLine(width, size, charEm);
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return 0;
  let lines = 1;
  let used = 0;
  for (const word of words) {
    const needed = used === 0 ? word.length : used + 1 + word.length;
    if (needed <= max) {
      used = needed;
      continue;
    }
    if (used > 0) lines += 1;
    lines += Math.ceil(word.length / max) - 1;
    used = word.length % max || max;
  }
  return lines;
}

/** Estimated height in px of `text` set in `style` and wrapped to `width` px. */
export function estimateTextHeight(text: string, width: number, style: TextStyle): number {
  return estimateLines(text, width, style.size, style.charEm) * style.size * style.lineHeight;
}
