// GPT-2 byte-level BPE, as Hugging Face `tokenizers` runs Chatterbox-Turbo's
// `tokenizer.json`: added tokens (`[laugh]`, `<|endoftext|>`, ...) are split out
// first, the rest is cut by GPT-2's pattern, each piece's UTF-8 bytes become
// printable characters and are merged by rank, and the template's special
// tokens are appended. Pure.

export interface TokenizerJson {
  added_tokens: { id: number; content: string }[];
  model: { vocab: Record<string, number>; merges: (string | [string, string])[] };
  post_processor?: {
    single?: ({ Sequence: { id: string } } | { SpecialToken: { id: string } })[];
    special_tokens?: Record<string, { ids: number[] }>;
  } | null;
}

/** GPT-2's pre-tokenizer pattern: contractions, letters, digits, other marks, and whitespace. */
const PATTERN = /'s|'t|'re|'ve|'m|'ll|'d| ?\p{L}+| ?\p{N}+| ?[^\s\p{L}\p{N}]+|\s+(?!\S)|\s+/gu;

/** GPT-2's byte to character table: printable bytes keep their character, the others move above 255. */
export function bytesToUnicode(): string[] {
  const table: string[] = [];
  let next = 256;
  for (let byte = 0; byte < 256; byte++) {
    const printable = (byte >= 33 && byte <= 126) || (byte >= 161 && byte <= 172) || (byte >= 174 && byte <= 255);
    table[byte] = String.fromCodePoint(printable ? byte : next++);
  }
  return table;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** The token ids of a text, ending with the template's special tokens. */
export function createBpeTokenizer(json: TokenizerJson): (text: string) => number[] {
  const { vocab } = json.model;
  const ranks = new Map<string, number>();
  json.model.merges.forEach((merge, rank) => {
    const [a, b] = typeof merge === "string" ? merge.split(" ") : merge;
    ranks.set(`${a} ${b}`, rank);
  });
  const byteChar = bytesToUnicode();
  const utf8 = new TextEncoder();
  const known = new Map<string, number[]>();
  const added = new Map(json.added_tokens.map((token) => [token.content, token.id]));
  // Longest first, so a token that contains another wins.
  const addedPattern =
    added.size === 0 ? undefined : new RegExp(`(${[...added.keys()].sort((a, b) => b.length - a.length).map(escapeRegExp).join("|")})`);

  function bpe(piece: string): number[] {
    const cached = known.get(piece);
    if (cached !== undefined) return cached;
    let parts = [...utf8.encode(piece)].map((byte) => byteChar[byte]!);
    for (;;) {
      let best = -1;
      let bestRank = Infinity;
      for (let i = 0; i < parts.length - 1; i++) {
        const rank = ranks.get(`${parts[i]} ${parts[i + 1]}`);
        if (rank !== undefined && rank < bestRank) [best, bestRank] = [i, rank];
      }
      if (best < 0) break;
      // Merge every occurrence of the best pair, left to right, as GPT-2's `bpe()` does.
      const [first, second] = [parts[best]!, parts[best + 1]!];
      const merged: string[] = [];
      for (let i = 0; i < parts.length; i++) {
        if (i < parts.length - 1 && parts[i] === first && parts[i + 1] === second) {
          merged.push(first + second);
          i++;
        } else merged.push(parts[i]!);
      }
      parts = merged;
    }
    const ids = parts.map((part) => {
      const id = vocab[part];
      if (id === undefined) throw new Error(`tokenizer: no token for "${part}" in "${piece}"`);
      return id;
    });
    known.set(piece, ids);
    return ids;
  }

  const suffix: number[] = [];
  for (const item of json.post_processor?.single ?? []) {
    if ("SpecialToken" in item) suffix.push(...(json.post_processor?.special_tokens?.[item.SpecialToken.id]?.ids ?? []));
  }

  return (text) => {
    const ids: number[] = [];
    for (const chunk of addedPattern === undefined ? [text] : text.split(addedPattern)) {
      const special = added.get(chunk);
      if (special !== undefined) ids.push(special);
      else for (const match of chunk.matchAll(PATTERN)) ids.push(...bpe(match[0]));
    }
    return [...ids, ...suffix];
  };
}
