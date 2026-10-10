// Splits narration into sentences at . ! ? so each is spoken on its own. Pure.

const ABBREVIATIONS = new Set([
  "mr", "mrs", "ms", "dr", "prof", "sr", "jr", "st", "mt", "vs", "etc", "inc", "ltd", "co", "no", "e.g", "i.e",
]);
const TERMINAL = new Set([".", "!", "?"]);
const CLOSERS = new Set(['"', "'", ")", "]", "”", "’"]);

/** Abbreviations that are also ordinary words count only when this follows them. */
const NEEDS_NEXT: Record<string, RegExp> = { no: /^\d/, st: /^[A-Z]/, mt: /^[A-Z]/, co: /^[A-Z]/ };

/** True when the "." at `index` ends an abbreviation such as "Dr" rather than a sentence. */
function isAbbreviation(text: string, index: number): boolean {
  let start = index;
  while (start > 0 && !/\s/.test(text[start - 1]!)) start--;
  const word = text.slice(start, index).replace(/^["'(“]+/, "").toLowerCase();
  if (!ABBREVIATIONS.has(word)) return false;
  const needs = Object.hasOwn(NEEDS_NEXT, word) ? NEEDS_NEXT[word] : undefined;
  return needs === undefined || needs.test(text.slice(index + 1).trimStart());
}

/** The sentences of `text`, each keeping its closing mark. Text with no mark is one sentence. */
export function splitSentences(text: string): string[] {
  const sentences: string[] = [];
  let start = 0;
  let i = 0;
  while (i < text.length) {
    if (!TERMINAL.has(text[i]!)) {
      i++;
      continue;
    }
    let end = i + 1;
    while (end < text.length && (TERMINAL.has(text[end]!) || CLOSERS.has(text[end]!))) end++;
    const atBreak = end >= text.length || /\s/.test(text[end]!);
    if (atBreak && !(text[i] === "." && end === i + 1 && isAbbreviation(text, i))) {
      sentences.push(text.slice(start, end));
      start = end;
    }
    i = end;
  }
  sentences.push(text.slice(start));
  return sentences.map((sentence) => sentence.trim()).filter((sentence) => sentence !== "");
}
