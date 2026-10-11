// English text to a Kokoro phoneme string, using misaki's US dictionaries
// (gold first, then silver). A word in neither is spelled out when it is an
// acronym, else sounded out by simple letter-to-sound rules. Short words are
// read in context (right to left), as misaki does. Pure.

import { normalizeText } from "./normalize";

/** A dictionary entry: one pronunciation, or one per part of speech. */
export type LexiconEntry = string | Readonly<Record<string, string>>;
export type Lexicon = Readonly<Record<string, LexiconEntry>>;

const PUNCTUATION = new Set([";", ":", ",", ".", "!", "?"]);
/** Words, then punctuation to keep, then dashes and ellipses that read as a pause. */
const TOKEN = /[A-Za-z]+(?:'[A-Za-z]+)*|[;:,.!?]|[—–…]/g;

/** Where a word sits: whether the next spoken word starts with a vowel (null: punctuation or the end), and the word before it. */
interface Context {
  nextVowel: boolean | null;
  previous: string;
}
const NO_CONTEXT: Context = { nextVowel: false, previous: "" };

/** Words after which a word is read as a noun, or as a verb (a stand-in for misaki's tagger). */
const NOUN_CUES = new Set("a an the this that these those my your our their his her its every each some any no".split(" "));
const VERB_CUES = new Set("to i you we they he she it can will would should could must may might do does did don't won't".split(" "));

function pick(entry: LexiconEntry | undefined, context: Context): string | undefined {
  if (entry === undefined || typeof entry === "string") return entry;
  const values = Object.values(entry).filter((value): value is string => typeof value === "string");
  const get = (key: string): string | undefined =>
    Object.hasOwn(entry, key) && typeof entry[key] === "string" ? entry[key] : undefined;
  if (Object.hasOwn(entry, "None")) {
    return (context.nextVowel === null ? get("None") : get("DEFAULT")) ?? get("DEFAULT") ?? values[0];
  }
  if (NOUN_CUES.has(context.previous)) {
    const noun = get("NN") ?? get("NOUN");
    if (noun !== undefined) return noun;
  } else if (VERB_CUES.has(context.previous)) {
    const verb = get("VB") ?? get("VERB");
    if (verb !== undefined) return verb;
  }
  return get("DEFAULT") ?? values[0];
}

function lookup(lexicon: Lexicon, word: string, context: Context): string | undefined {
  for (const key of [word, word.toLowerCase()]) {
    if (Object.hasOwn(lexicon, key)) {
      const found = pick(lexicon[key], context);
      if (found !== undefined && found !== "") return found;
    }
  }
  return undefined;
}

const VOWELS = "AIOQWYaiuæɑɒɔəɛɜɪʊʌᵻ";
const CONSONANTS = "bdfhjklmnpstvwzðŋɡɹɾʃʒʤʧθ";
const CONTEXT_BREAKS = ";:,.!?—…";

/** misaki's apply_stress: restress `ps` for a word of the given prominence. */
function applyStress(ps: string, stress: number): string {
  const has = (set: string): boolean => [...ps].some((c) => set.includes(c));
  const restress = (text: string): string => {
    const chars = [...text];
    const keyed = chars.map((c, i): [number, string] => [i, c]);
    for (let i = 0; i < chars.length; i++) {
      if (!"ˌˈ".includes(chars[i]!)) continue;
      const j = chars.findIndex((c, k) => k >= i && VOWELS.includes(c));
      if (j >= 0) keyed[i] = [j - 0.5, chars[i]!];
    }
    return keyed.sort((x, y) => x[0] - y[0]).map(([, c]) => c).join("");
  };
  if (stress < -1) return ps.replaceAll("ˈ", "").replaceAll("ˌ", "");
  if (stress === -1 || ((stress === 0 || stress === -0.5) && ps.includes("ˈ"))) {
    return ps.replaceAll("ˌ", "").replaceAll("ˈ", "ˌ");
  }
  if ((stress === 0 || stress === 0.5 || stress === 1) && !has("ˌˈ")) {
    return has(VOWELS) ? restress(`ˌ${ps}`) : ps;
  }
  if (stress >= 1 && !ps.includes("ˈ") && ps.includes("ˌ")) return ps.replaceAll("ˌ", "ˈ");
  if (stress > 1 && !has("ˌˈ")) return has(VOWELS) ? restress(`ˈ${ps}`) : ps;
  return ps;
}

/** Vowel-ish phonemes after which a stem-final t flaps, as in misaki. */
const US_TAUS = "AIOWYiuæɑəɛɪɹʊʌ";

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

export interface WordPhonemes {
  /** The full phoneme string. */
  phonemes: string;
  /** Per input word: its phonemes' [start, end) in `phonemes`, punctuation excluded; start === end when it has none. */
  spans: { start: number; end: number }[];
}

export function createWordPhonemizer(gold: Lexicon, silver: Lexicon): (words: readonly string[]) => WordPhonemes {
  const find = (word: string, context: Context = NO_CONTEXT): string | undefined =>
    lookup(gold, word, context) ?? lookup(silver, word, context);

  const known = (word: string): boolean => find(word) !== undefined;

  // The stem rules below are ported from misaki (misaki/en.py, Apache-2.0).
  const withSuffix = (word: string): string | undefined => {
    let stem: string | undefined;
    if (/'s$/i.test(word)) stem = word.slice(0, -2);
    else if (/[^s]s$/i.test(word) && known(word.slice(0, -1))) stem = word.slice(0, -1);
    else if (word.length > 4 && /es$/i.test(word) && known(word.slice(0, -2))) stem = word.slice(0, -2);
    else if (/ies$/i.test(word) && known(`${word.slice(0, -3)}y`)) stem = `${word.slice(0, -3)}y`;
    if (stem === undefined) return undefined;
    const base = find(stem);
    return base === undefined ? undefined : base + suffixSound(base);
  };

  const stemEd = (word: string): string | undefined => {
    if (word.length < 4 || !/d$/i.test(word)) return undefined;
    let stem: string | undefined;
    if (!/dd$/i.test(word) && known(word.slice(0, -1))) stem = word.slice(0, -1);
    else if (word.length > 4 && /ed$/i.test(word) && !/eed$/i.test(word) && known(word.slice(0, -2))) stem = word.slice(0, -2);
    const base = stem === undefined ? undefined : find(stem);
    if (base === undefined) return undefined;
    const phones = [...base];
    const last = phones.at(-1) ?? "";
    if ("pkfθʃsʧ".includes(last)) return `${base}t`;
    if (last === "d") return `${base}ᵻd`;
    if (last !== "t") return `${base}d`;
    if (phones.length < 2) return `${base}ɪd`;
    if (US_TAUS.includes(phones.at(-2) ?? "")) return `${phones.slice(0, -1).join("")}ɾᵻd`;
    return `${base}ᵻd`;
  };

  const stemIng = (word: string): string | undefined => {
    if (word.length < 5 || !/ing$/i.test(word)) return undefined;
    const head = word.slice(0, -3);
    let stem: string | undefined;
    if (word.length > 5 && known(head)) stem = head;
    else if (known(`${head}e`)) stem = `${head}e`;
    else if (word.length > 5 && /([bcdgklmnprstvxz])\1ing$|cking$/i.test(word) && known(word.slice(0, -4))) stem = word.slice(0, -4);
    const base = stem === undefined ? undefined : find(stem);
    if (base === undefined) return undefined;
    const phones = [...base];
    if (phones.length > 1 && phones.at(-1) === "t" && US_TAUS.includes(phones.at(-2) ?? "")) {
      return `${phones.slice(0, -1).join("")}ɾɪŋ`;
    }
    return `${base}ɪŋ`;
  };

  // Not in misaki: a long word made of two known words, with one primary stress.
  const compound = (word: string): string | undefined => {
    if (word.length < 6) return undefined;
    for (let i = 3; i <= word.length - 3; i++) {
      const first = find(word.slice(0, i));
      const second = find(word.slice(i));
      if (first !== undefined && second !== undefined) return first + second.replaceAll("ˈ", "ˌ");
    }
    return undefined;
  };

  const spellOut = (word: string): string =>
    [...word].map((letter) => find(letter) ?? soundOut(letter)).join("");

  /** misaki's get_special_case. */
  const special = (word: string, context: Context): string | undefined => {
    if (word === "a" || word === "A") return "ɐ";
    if (word === "an" || word === "An") return "ɐn";
    if (word === "the" || word === "The") return context.nextVowel === true ? "ði" : "ðə";
    if (word === "to" || word === "To") {
      return context.nextVowel === null ? find("to") : context.nextVowel ? "tʊ" : "tə";
    }
    if (word === "in" || word === "In") return context.nextVowel === null ? "ˈɪn" : "ɪn";
    if (word === "I") return "ˌI";
    return undefined;
  };

  const pronounce = (word: string, context: Context): string => {
    const fixed = special(word, context);
    if (fixed !== undefined) return fixed;
    const found = find(word, context) ?? withSuffix(word) ?? stemEd(word) ?? stemIng(word) ?? compound(word);
    if (found === undefined) return /^[A-Z]{2,}$/.test(word) ? spellOut(word) : soundOut(word);
    if (word === word.toLowerCase()) return found;
    return applyStress(found, word === word.toUpperCase() ? 2 : 0.5);
  };

  const contextAfter = (phonemes: string, previous: boolean | null): boolean | null => {
    for (const c of phonemes) {
      if (VOWELS.includes(c)) return true;
      if (CONSONANTS.includes(c)) return false;
      if (CONTEXT_BREAKS.includes(c)) return null;
    }
    return previous;
  };

  return (words) => {
    interface Slot {
      text: string;
      owner: number;
      phonemes: string;
    }
    const slots: Slot[] = [];
    words.forEach((word, owner) => {
      for (const [text] of normalizeText(word).matchAll(TOKEN)) slots.push({ text, owner, phonemes: "" });
    });
    const isBreak = (text: string): boolean => PUNCTUATION.has(text) || text === "…" || text === "—" || text === "–";

    // Right to left, as misaki does, so each word knows what follows it.
    let nextVowel: boolean | null = null;
    for (let i = slots.length - 1; i >= 0; i--) {
      const slot = slots[i]!;
      if (isBreak(slot.text)) {
        nextVowel = null;
        continue;
      }
      const previous = slots[i - 1]?.text.toLowerCase() ?? "";
      const raw = pronounce(slot.text, { nextVowel, previous });
      slot.phonemes = raw.replaceAll("ɾ", "T").replaceAll("ʔ", "t");
      nextVowel = contextAfter(raw, nextVowel);
    }

    let out = "";
    const spans = words.map(() => ({ start: -1, end: -1 }));
    for (const slot of slots) {
      if (PUNCTUATION.has(slot.text)) {
        out += slot.text;
      } else if (slot.text === "…") {
        out += ".";
      } else if (slot.text === "—" || slot.text === "–") {
        out += ",";
      } else if (slot.phonemes !== "") {
        if (out !== "") out += " ";
        const span = spans[slot.owner]!;
        if (span.start < 0) span.start = out.length;
        out += slot.phonemes;
        span.end = out.length;
      }
    }
    // A word with no sounds of its own sits at the end of what precedes it.
    let at = 0;
    for (const span of spans) {
      if (span.start < 0) {
        span.start = at;
        span.end = at;
      } else {
        at = span.end;
      }
    }
    return { phonemes: out, spans };
  };
}

export function createPhonemizer(gold: Lexicon, silver: Lexicon): (text: string) => string {
  const phonemizeWords = createWordPhonemizer(gold, silver);
  return (text) => phonemizeWords(normalizeText(text).split(/\s+/).filter((word) => word !== "")).phonemes;
}
