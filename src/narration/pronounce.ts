// A `pronounce` map: a written word is spoken as one to four other words, while
// captions keep the word as written. The plan counts the spoken words of each
// written word, so the voice's word times can be merged back onto the caption's.

/** A word with the punctuation before and after it set aside: `(JSON):` is `(`, `JSON`, `):`. */
const WORD = /^([\p{P}\p{S}]*)(.*?)([\p{P}\p{S}]*)$/u;

function spokenAs(word: string, pronounce: Readonly<Record<string, string>>): { key: string; said: string } | undefined {
  if (Object.hasOwn(pronounce, word)) return { key: word, said: pronounce[word]! };
  const [, before = "", core = "", after = ""] = WORD.exec(word) ?? [];
  if (core !== "" && Object.hasOwn(pronounce, core)) return { key: core, said: `${before}${pronounce[core]!}${after}` };
  return undefined;
}

/**
 * `text` with each whitespace-separated word the map names replaced by how it is spoken (exact case),
 * and for each written word, how many spoken words it became.
 */
export function spokenPlan(text: string, pronounce: Readonly<Record<string, string>> | undefined): { text: string; counts: number[] } {
  const counts: number[] = [];
  const spoken = text
    .split(/(\s+)/)
    .map((part) => {
      if (part === "" || /^\s+$/.test(part)) return part;
      const said = pronounce === undefined ? undefined : spokenAs(part, pronounce)?.said;
      counts.push(said === undefined ? 1 : said.split(" ").length);
      return said ?? part;
    })
    .join("");
  return { text: spoken, counts };
}

/** `text` with each whitespace-separated word the map names replaced by how it is spoken (exact case). */
export function sayAs(text: string, pronounce: Readonly<Record<string, string>> | undefined): string {
  return spokenPlan(text, pronounce).text;
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
