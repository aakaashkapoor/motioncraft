// English text to a Kokoro phoneme string, using misaki's US dictionaries
// (gold first, then silver). A word in neither is spelled out when it is an
// acronym, else sounded out by simple letter-to-sound rules. Pure.

/** A dictionary entry: one pronunciation, or one per part of speech. */
export type LexiconEntry = string | Readonly<Record<string, string>>;
export type Lexicon = Readonly<Record<string, LexiconEntry>>;

const PUNCTUATION = new Set([";", ":", ",", ".", "!", "?"]);
/** Words, then punctuation to keep, then dashes and ellipses that read as a pause. */
const TOKEN = /[A-Za-z]+(?:'[A-Za-z]+)*|[;:,.!?]|[—–…]/g;

function pick(entry: LexiconEntry | undefined): string | undefined {
  if (entry === undefined || typeof entry === "string") return entry;
  const values = Object.values(entry).filter((value): value is string => typeof value === "string");
  return Object.hasOwn(entry, "DEFAULT") && typeof entry["DEFAULT"] === "string" ? entry["DEFAULT"] : values[0];
}

function lookup(lexicon: Lexicon, word: string): string | undefined {
  for (const key of [word, word.toLowerCase()]) {
    if (Object.hasOwn(lexicon, key)) {
      const found = pick(lexicon[key]);
      if (found !== undefined && found !== "") return found;
    }
  }
  return undefined;
}

/** The sound a plural or possessive s takes after `phonemes`, as misaki chooses it. */
function suffixSound(phonemes: string): string {
  const last = [...phonemes].at(-1) ?? "";
  if ("szʃʒʧʤ".includes(last)) return "ᵻz";
  if ("ptkfθ".includes(last)) return "s";
  return "z";
}

// Letter-to-sound for words in no dictionary: longest match first.
const GRAPHEMES: [string, string][] = [
  ["tion", "ʃən"], ["sion", "ʒən"], ["igh", "I"], ["tch", "ʧ"], ["dge", "ʤ"],
  ["sh", "ʃ"], ["ch", "ʧ"], ["th", "θ"], ["ph", "f"], ["ng", "ŋ"], ["ck", "k"], ["qu", "kw"], ["wh", "w"],
  ["kn", "n"], ["wr", "ɹ"], ["gh", ""],
  ["ee", "i"], ["ea", "i"], ["oo", "u"], ["ou", "W"], ["ow", "W"], ["oi", "Y"], ["oy", "Y"],
  ["ai", "A"], ["ay", "A"], ["oa", "O"], ["ie", "i"],
  ["ar", "ɑɹ"], ["er", "ɜɹ"], ["ir", "ɜɹ"], ["ur", "ɜɹ"], ["or", "ɔɹ"],
  ["a", "æ"], ["b", "b"], ["c", "k"], ["d", "d"], ["e", "ɛ"], ["f", "f"], ["g", "ɡ"], ["h", "h"], ["i", "ɪ"],
  ["j", "ʤ"], ["k", "k"], ["l", "l"], ["m", "m"], ["n", "n"], ["o", "ɑ"], ["p", "p"], ["q", "k"], ["r", "ɹ"],
  ["s", "s"], ["t", "t"], ["u", "ʌ"], ["v", "v"], ["w", "w"], ["x", "ks"], ["y", "j"], ["z", "z"],
];
const VOWEL_SOUNDS = /[æɛɪɑʌiuAIOWYɔɜ]/u;

function soundOut(word: string): string {
  let text = word.toLowerCase().replace(/'/g, "");
  if (text.length > 2 && /[^aeiouy]e$/.test(text)) text = text.slice(0, -1); // silent final e
  let out = "";
  for (let i = 0; i < text.length; ) {
    const match = GRAPHEMES.find(([letters]) => text.startsWith(letters, i));
    if (match === undefined) {
      i++;
    } else {
      out += match[1];
      i += match[0].length;
    }
  }
  const stressAt = out.search(VOWEL_SOUNDS);
  return stressAt < 0 ? out : `${out.slice(0, stressAt)}ˈ${out.slice(stressAt)}`;
}

export function createPhonemizer(gold: Lexicon, silver: Lexicon): (text: string) => string {
  const find = (word: string): string | undefined => lookup(gold, word) ?? lookup(silver, word);

  const withSuffix = (word: string): string | undefined => {
    const stem = /'s$/i.test(word) ? word.slice(0, -2) : /[^'s]s$/i.test(word) ? word.slice(0, -1) : undefined;
    if (stem === undefined) return undefined;
    const base = find(stem);
    return base === undefined ? undefined : base + suffixSound(base);
  };

  const spellOut = (word: string): string =>
    [...word].map((letter) => find(letter) ?? soundOut(letter)).join("");

  const pronounce = (word: string): string =>
    find(word) ?? withSuffix(word) ?? (/^[A-Z]{2,}$/.test(word) ? spellOut(word) : soundOut(word));

  return (text) => {
    let out = "";
    for (const [token] of text.matchAll(TOKEN)) {
      if (PUNCTUATION.has(token)) {
        out += token;
      } else if (token === "…") {
        out += ".";
      } else if (token === "—" || token === "–") {
        out += ",";
      } else {
        const phonemes = pronounce(token);
        if (phonemes !== "") out += `${out === "" ? "" : " "}${phonemes}`;
      }
    }
    return out;
  };
}
