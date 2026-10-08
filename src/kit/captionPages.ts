// Splits caption text into pages that each fit in a few lines, so a long
// narration is shown a page at a time instead of being cut off. Pure and
// deterministic: line fit is estimated by character count, not measured.

export interface CaptionLimits {
  /** Characters that fit on one line, spaces included. */
  maxCharsPerLine: number;
  /** Lines per page. */
  maxLines: number;
}

// A page may end early at a break only if it keeps at least this share of the
// words that would fit, so breaks never leave a page nearly empty.
const MIN_BREAK_FILL = 0.5;
const SENTENCE_END = /[.!?…]["'”’)\]]*$/;
const CLAUSE_END = /[,;:–—]["'”’)\]]*$/;

/** How many lines `words` take when wrapped greedily at word boundaries. */
function lineCount(words: readonly string[], maxCharsPerLine: number): number {
  let lines = 0;
  let width = 0;
  for (const word of words) {
    if (lines > 0 && width + 1 + word.length <= maxCharsPerLine) {
      width += 1 + word.length;
    } else {
      // A word longer than a line still gets a line of its own; words are never split.
      lines += 1;
      width = word.length;
    }
  }
  return lines;
}

/** The last break position in (start, end] whose word matches `pattern` and fills enough of the page. */
function lastBreak(words: readonly string[], start: number, end: number, pattern: RegExp): number | undefined {
  const minEnd = start + Math.ceil((end - start) * MIN_BREAK_FILL);
  for (let k = end; k >= minEnd; k--) {
    if (pattern.test(words[k - 1]!)) return k;
  }
  return undefined;
}

/**
 * Splits `text` into pages of at most `maxLines` lines of `maxCharsPerLine`
 * characters. Breaks only between words, and every word appears exactly once,
 * in order. Each page is as full as possible, except that it ends early at a
 * sentence break, or failing that a clause break, when one is close to the end.
 */
export function pageCaption(text: string, { maxCharsPerLine, maxLines }: CaptionLimits): string[] {
  if (!(maxCharsPerLine >= 1) || !(maxLines >= 1)) {
    throw new Error(`caption limits must be at least 1 (got ${maxCharsPerLine} chars x ${maxLines} lines)`);
  }
  const words = text.split(/\s+/).filter(Boolean);
  const pages: string[] = [];
  let start = 0;
  while (start < words.length) {
    let end = start + 1;
    while (end < words.length && lineCount(words.slice(start, end + 1), maxCharsPerLine) <= maxLines) end++;
    if (end < words.length) {
      end = lastBreak(words, start, end, SENTENCE_END) ?? lastBreak(words, start, end, CLAUSE_END) ?? end;
    }
    pages.push(words.slice(start, end).join(" "));
    start = end;
  }
  return pages;
}

/** The page to show at `progress` (0..1) through a scene; pages get equal time. */
export function pageAt<T>(pages: readonly T[], progress: number): T | undefined {
  if (pages.length === 0) return undefined;
  const index = Number.isFinite(progress) ? Math.floor(progress * pages.length) : 0;
  return pages[Math.min(Math.max(index, 0), pages.length - 1)];
}
