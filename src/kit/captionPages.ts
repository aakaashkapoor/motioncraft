// Splits caption text into pages that each fit in a few lines, so a long
// narration is shown a page at a time instead of being cut off. Pure and
// deterministic: line fit is estimated by character count, not measured.

export interface CaptionLimits {
  /** Characters that fit on one line, spaces included. */
  maxCharsPerLine: number;
  /** Lines per page. */
  maxLines: number;
  /** Most words on a page. No limit when absent. */
  maxWords?: number;
  /** Fewest words on a page, wherever the text is long enough to allow it. 1 when absent. */
  minWords?: number;
}

/** A page as a range of words: from `start` up to, not including, `end`. */
export interface PageRange {
  start: number;
  end: number;
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

/**
 * The last break position in (start, fit] whose word matches `pattern`, fills
 * enough of the page and leaves at least `minWords` for the pages after it.
 */
function lastBreak(words: readonly string[], start: number, fit: number, pattern: RegExp, minWords: number): number | undefined {
  const minEnd = start + Math.max(minWords, Math.ceil((fit - start) * MIN_BREAK_FILL));
  for (let k = fit; k >= minEnd; k--) {
    if (words.length - k >= minWords && pattern.test(words[k - 1]!)) return k;
  }
  return undefined;
}

/**
 * Splits `words` into pages of at most `maxLines` lines of `maxCharsPerLine`
 * characters and at most `maxWords` words. Breaks only between words, and
 * every word is on exactly one page, in order. Each page is as full as
 * possible, except that it ends early at a sentence break, or failing that a
 * clause break, when one is close to the end; and the words up to the end
 * of the sentence are spread evenly over the pages they need, so no page has
 * fewer than `minWords` where it can be helped.
 */
export function pageRanges(words: readonly string[], limits: CaptionLimits): PageRange[] {
  const { maxCharsPerLine, maxLines, maxWords = Infinity, minWords = 1 } = limits;
  if (!(maxCharsPerLine >= 1) || !(maxLines >= 1) || !(maxWords >= 1) || !(minWords >= 1)) {
    throw new Error(`caption limits must be at least 1 (got ${maxCharsPerLine} chars x ${maxLines} lines, ${minWords}-${maxWords} words)`);
  }
  const pages: PageRange[] = [];
  let start = 0;
  while (start < words.length) {
    let fit = start + 1;
    while (fit < words.length && fit - start < maxWords && lineCount(words.slice(start, fit + 1), maxCharsPerLine) <= maxLines) fit++;
    let end = fit;
    if (fit < words.length) {
      // Spread the words up to the end of this sentence evenly over as few pages as they need.
      let sentenceEnd = fit + 1;
      while (sentenceEnd < words.length && !SENTENCE_END.test(words[sentenceEnd - 1]!)) sentenceEnd++;
      const left = sentenceEnd - start;
      const pagesLeft = Number.isFinite(maxWords) ? Math.ceil(left / maxWords) : 1;
      const even = start + Math.ceil(left / pagesLeft);
      end = lastBreak(words, start, fit, SENTENCE_END, minWords) ?? lastBreak(words, start, fit, CLAUSE_END, minWords) ?? Math.min(fit, even);
      // A page too long for the line limits may still leave a stub; take words back from it.
      if (words.length - end < minWords && words.length - minWords - start >= minWords) end = words.length - minWords;
    }
    pages.push({ start, end });
    start = end;
  }
  return pages;
}

/** `pageRanges` of the words in `text`, each page as its text. */
export function pageCaption(text: string, limits: CaptionLimits): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  return pageRanges(words, limits).map(({ start, end }) => words.slice(start, end).join(" "));
}

/** The page to show at `progress` (0..1) through a scene; pages get equal time. */
export function pageAt<T>(pages: readonly T[], progress: number): T | undefined {
  if (pages.length === 0) return undefined;
  const index = Number.isFinite(progress) ? Math.floor(progress * pages.length) : 0;
  return pages[Math.min(Math.max(index, 0), pages.length - 1)];
}
