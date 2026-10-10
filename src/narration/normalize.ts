// Text cleanup before pronunciation: quotes, titles, years, times, money,
// decimals, ranges and numbers become plain words. Pure.
//
// The rules are ported from the English text normalizer in kokoro-js
// (https://github.com/hexgrad/kokoro, Apache-2.0, hexgrad), which in turn
// follows misaki. The espeak-specific steps are left out.

const ONES = [
  "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve",
  "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen",
];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
const SCALES: [number, string][] = [
  [1e9, "billion"],
  [1e6, "million"],
  [1e3, "thousand"],
];

/** Words for 0..999, such as "three hundred forty-two". */
function belowThousand(n: number): string {
  const parts: string[] = [];
  if (n >= 100) parts.push(`${ONES[Math.floor(n / 100)]} hundred`);
  const rest = n % 100;
  if (rest > 0 || n === 0) {
    if (rest < 20) parts.push(ONES[rest]!);
    else parts.push(rest % 10 === 0 ? TENS[rest / 10]! : `${TENS[Math.floor(rest / 10)]}-${ONES[rest % 10]}`);
  }
  return parts.join(" ");
}

/** Words for an integer string; numbers of a trillion or more are read digit by digit. */
function integerWords(digits: string): string {
  const n = Number(digits);
  if (digits.length > 12 || !Number.isSafeInteger(n)) return [...digits].map((d) => ONES[Number(d)]).join(" ");
  if (n < 1000) return belowThousand(n);
  const parts: string[] = [];
  let rest = n;
  for (const [size, name] of SCALES) {
    if (rest >= size) {
      parts.push(`${belowThousand(Math.floor(rest / size))} ${name}`);
      rest %= size;
    }
  }
  if (rest > 0) parts.push(belowThousand(rest));
  return parts.join(" ");
}

/** "ninety" and "ten" become "nineties" and "tens"; other words just take an s. */
function pluralize(word: string): string {
  return /y$/.test(word) ? `${word.slice(0, -1)}ies` : `${word}s`;
}

/** A year, a time or a plain decimal, as words with the rest left for later. */
function yearTimeOrDecimal(match: string): string {
  if (match.includes(".")) return match;
  if (match.includes(":")) {
    const [hour, minute] = match.split(":").map(Number) as [number, number];
    if (minute === 0) return `${hour} o'clock`;
    return minute < 10 ? `${hour} oh ${minute}` : `${hour} ${minute}`;
  }
  const year = parseInt(match.slice(0, 4), 10);
  if (year < 1100 || year % 1000 < 10) return match;
  const head = match.slice(0, 2);
  const tail = parseInt(match.slice(2, 4), 10);
  const plural = match.endsWith("s") ? "s" : "";
  if (year % 1000 >= 100 && year % 1000 <= 999) {
    if (tail === 0) return `${head} hundred${plural}`;
    if (tail < 10) return `${head} oh ${tail}${plural}`;
  }
  return `${head} ${tail}${plural}`;
}

function money(match: string): string {
  const unit = match[0] === "$" ? "dollar" : "pound";
  const amount = match.slice(1);
  if (Number.isNaN(Number(amount))) return `${amount} ${unit}s`;
  if (!amount.includes(".")) return `${amount} ${unit}${amount === "1" ? "" : "s"}`;
  const [whole, fraction] = amount.split(".") as [string, string];
  const cents = parseInt(fraction.padEnd(2, "0"), 10);
  const small = match[0] === "$" ? (cents === 1 ? "cent" : "cents") : cents === 1 ? "penny" : "pence";
  return `${whole} ${unit}${whole === "1" ? "" : "s"} and ${cents} ${small}`;
}

function decimal(match: string): string {
  const [whole, fraction] = match.split(".") as [string, string];
  return `${whole} point ${[...fraction].join(" ")}`;
}

export function normalizeText(text: string): string {
  return text
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[^\S \n]/g, " ")
    .replace(/ {2,}/g, " ")
    .replace(/\bD[Rr]\.(?= [A-Z])/g, "Doctor")
    .replace(/\b(?:Mr\.|MR\.(?= [A-Z]))/g, "Mister")
    .replace(/\b(?:Ms\.|MS\.(?= [A-Z]))/g, "Miss")
    .replace(/\b(?:Mrs\.|MRS\.(?= [A-Z]))/g, "Mrs")
    .replace(/\betc\.(?! [A-Z])/gi, "etc")
    .replace(/\d*\.\d+|\b\d{4}s?\b|(?<!:)\b(?:[1-9]|1[0-2]):[0-5]\d\b(?!:)/g, yearTimeOrDecimal)
    .replace(/(?<=\d),(?=\d)/g, "")
    .replace(/[$£]\d+(?:\.\d+)?(?: hundred| thousand| (?:[bm]|tr)illion)*\b|[$£]\d+\.\d\d?\b/gi, money)
    .replace(/\d*\.\d+/g, decimal)
    .replace(/(?<=\d)-(?=\d)/g, " to ")
    .replace(/\d+s?\b/g, (match) =>
      match.endsWith("s") ? pluralize(integerWords(match.slice(0, -1))) : integerWords(match),
    )
    .trim();
}
