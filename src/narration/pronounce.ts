// A storyboard's `pronounce` map: a written word is spoken as another, while
// captions keep the word as written. One word in, one word out, so the voice's
// word times still line up with the caption's words.

/** A word with the punctuation before and after it set aside: `(JSON):` is `(`, `JSON`, `):`. */
const WORD = /^([\p{P}\p{S}]*)(.*?)([\p{P}\p{S}]*)$/u;

function spokenAs(word: string, pronounce: Readonly<Record<string, string>>): { key: string; said: string } | undefined {
  if (Object.hasOwn(pronounce, word)) return { key: word, said: pronounce[word]! };
  const [, before = "", core = "", after = ""] = WORD.exec(word) ?? [];
  if (core !== "" && Object.hasOwn(pronounce, core)) return { key: core, said: `${before}${pronounce[core]!}${after}` };
  return undefined;
}

/** `text` with each whitespace-separated word the map names replaced by how it is spoken (exact case). */
export function sayAs(text: string, pronounce: Readonly<Record<string, string>> | undefined): string {
  if (pronounce === undefined || Object.keys(pronounce).length === 0) return text;
  return text
    .split(/(\s+)/)
    .map((part) => (part === "" || /^\s+$/.test(part) ? part : (spokenAs(part, pronounce)?.said ?? part)))
    .join("");
}

/** The entries of the map that `text` uses, sorted by key. */
export function pronunciationsIn(text: string, pronounce: Readonly<Record<string, string>> | undefined): [string, string][] {
  if (pronounce === undefined) return [];
  const keys = new Set<string>();
  for (const word of text.split(/\s+/)) {
    const hit = word === "" ? undefined : spokenAs(word, pronounce);
    if (hit !== undefined) keys.add(hit.key);
  }
  return [...keys].sort().map((key) => [key, pronounce[key]!]);
}
