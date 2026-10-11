// English text to a Kokoro phoneme string, using misaki's US dictionaries
// (gold first, then silver). A word in neither is spelled out when it is an
// acronym, else sounded out by simple letter-to-sound rules. Short words are
// read in context (right to left), as misaki does. Pure.
//
// Text is normalized exactly once, here: `createWordPhonemizer` groups the
// display words whose normalization depends on a neighbour, normalizes each
// group, and walks the resulting spoken tokens in `phonemizeTokens`.

import { normalizeText } from "./normalize";

/** A dictionary entry: one pronunciation, or one per part of speech. */
export type LexiconEntry = string | Readonly<Record<string, string>>;
export type Lexicon = Readonly<Record<string, LexiconEntry>>;

/** A dotted acronym, then words, then punctuation to keep, then dashes and ellipses that read as a pause. */
const TOKEN = /(?:[A-Za-z]\.){2,}|[A-Za-z]+(?:'[A-Za-z]+)*|[;:,.!?]|[—–…]/g;
const DOTTED = /^(?:[A-Za-z]\.){2,}$/;
/** Each token that reads as a pause, and the mark it is emitted as. */
const BREAKS: ReadonlyMap<string, string> = new Map([
  [";", ";"], [":", ":"], [",", ","], [".", "."], ["!", "!"], ["?", "?"], ["…", "."], ["—", ","], ["–", ","],
]);

/** Where a word sits: whether the next spoken word starts with a vowel (null: punctuation or the end), and the word before it. */
interface Context {
  nextVowel: boolean | null;
  /** The word before it, lowercased. */
  previous: string;
}
/** For a lookup with no neighbours (a stem, a letter): `nextVowel` is false, not null, so a "None" entry is not taken as sitting at a clause end. */
const DEFAULT_CONTEXT: Context = { nextVowel: false, previous: "" };

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
  // NN and VB mirror misaki's tags; the real dictionaries use NOUN and VERB.
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

function capitalize(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

/** Whether the word after one with these `phonemes` starts with a vowel; `previous` is the answer for the word after that. */
function contextAfter(phonemes: string, previous: boolean | null): boolean | null {
  for (const c of phonemes) {
    if (VOWELS.includes(c)) return true;
    if (CONSONANTS.includes(c)) return false;
    if (CONTEXT_BREAKS.includes(c)) return null;
  }
  return previous;
}

/** A spoken token and the display word (or group) it belongs to. */
interface Token {
  text: string;
  owner: number;
}

export interface WordPhonemes {
  /** The full phoneme string. */
  phonemes: string;
  /** Per input word: its phonemes' [start, end) in `phonemes`, punctuation excluded; start === end when it has none. */
  spans: { start: number; end: number }[];
}

export function createWordPhonemizer(gold: Lexicon, silver: Lexicon): (words: readonly string[]) => WordPhonemes {
  const find = (word: string, context: Context = DEFAULT_CONTEXT): string | undefined =>
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

  /** misaki's get_special_case; the words also count in all caps. */
  const special = (word: string, context: Context): string | undefined => {
    if (word === "I") return "ˌI";
    const lower = word.toLowerCase();
    if (word !== lower && word !== word.toUpperCase() && word !== capitalize(lower)) return undefined;
    if (lower === "a") return "ɐ";
    if (lower === "an") return "ɐn";
    if (lower === "the") return context.nextVowel === true ? "ði" : "ðə";
    if (lower === "to") return context.nextVowel === null ? find("to") : context.nextVowel ? "tʊ" : "tə";
    if (lower === "in") return context.nextVowel === null ? "ˈɪn" : "ɪn";
    return undefined;
  };

  const pronounce = (word: string, context: Context): string => {
    if (DOTTED.test(word)) return spellOut(word.replaceAll(".", "").toUpperCase());
    const fixed = special(word, context);
    if (fixed !== undefined) return fixed;
    const found = find(word, context) ?? withSuffix(word) ?? stemEd(word) ?? stemIng(word) ?? compound(word);
    if (found === undefined) return /^[A-Z]{2,}$/.test(word) ? spellOut(word) : soundOut(word);
    if (word === word.toLowerCase()) return found;
    return applyStress(found, word === word.toUpperCase() ? 2 : 0.5);
  };

  /** The right-to-left walk over normalized tokens; returns one span per owner, `owners` in all. */
  const phonemizeTokens = (tokens: readonly Token[], owners: number): WordPhonemes => {
    const slots = tokens.map((token) => ({ ...token, phonemes: "" }));
    // A dotted acronym ends a sentence only when it ends the text.
    const last = slots.at(-1);
    if (last !== undefined && DOTTED.test(last.text)) slots.push({ text: ".", owner: last.owner, phonemes: "" });

    // Right to left, as misaki does, so each word knows what follows it.
    let nextVowel: boolean | null = null;
    for (let i = slots.length - 1; i >= 0; i--) {
      const slot = slots[i]!;
      if (BREAKS.has(slot.text)) {
        nextVowel = null;
        continue;
      }
      const previous = slots[i - 1]?.text.toLowerCase() ?? "";
      const raw = pronounce(slot.text, { nextVowel, previous });
      slot.phonemes = raw.replaceAll("ɾ", "T").replaceAll("ʔ", "t");
      nextVowel = contextAfter(raw, nextVowel);
    }

    let out = "";
    const spans = Array.from({ length: owners }, () => ({ start: -1, end: -1 }));
    for (const slot of slots) {
      const mark = BREAKS.get(slot.text);
      if (mark !== undefined) {
        out += mark;
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

  return (words) => {
    // Normalize each run of display words that normalize together, once.
    const groupOf: number[] = [];
    const tokens: Token[] = [];
    let groups = 0;
    for (let first = 0; first < words.length; groups++) {
      let last = first;
      while (last + 1 < words.length && dependsOnNext(words, first, last)) last++;
      for (const [text] of normalizeText(words.slice(first, last + 1).join(" ")).matchAll(TOKEN)) {
        tokens.push({ text, owner: groups });
      }
      for (let w = first; w <= last; w++) groupOf.push(groups);
      first = last + 1;
    }
    const { phonemes, spans } = phonemizeTokens(tokens, groups);
    // Every display word of a group gets the span of the whole group.
    return { phonemes, spans: groupOf.map((group) => ({ ...spans[group]! })) };
  };
}

const TITLE = /(?<![A-Za-z0-9_])(?:dr|mr|ms|mrs)\.$/i;
const ETC = /(?<![A-Za-z0-9_])etc\.$/i;
const CAPITALIZED = /^[A-Z]/;
const MONEY = /^[$£€][\d.,]+$/;
const SCALE = /^(?:hundred|thousand|million|billion|trillion)[.,;:!?]*$/i;

/**
 * Whether the group that began at `words[first]` and reaches `words[last]` also
 * takes in the next word, because the normalizer looks across the space: a
 * title or "etc." before a capital, or an amount before "million" and the like.
 */
function dependsOnNext(words: readonly string[], first: number, last: number): boolean {
  const word = words[last]!;
  const next = words[last + 1]!;
  if ((TITLE.test(word) || ETC.test(word)) && CAPITALIZED.test(next)) return true;
  if (!SCALE.test(next) || !MONEY.test(words[first]!)) return false;
  return words.slice(first + 1, last + 1).every((w) => SCALE.test(w));
}

export function createPhonemizer(gold: Lexicon, silver: Lexicon): (text: string) => string {
  const phonemizeWords = createWordPhonemizer(gold, silver);
  return (text) => phonemizeWords(text.split(/\s+/).filter((word) => word !== "")).phonemes;
}
