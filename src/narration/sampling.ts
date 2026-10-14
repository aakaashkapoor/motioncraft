// Picks the next speech token from the language model's logits as the
// chatterbox-tts package does for Turbo: a repetition penalty on every token
// already said, then temperature, top-k and top-p (nucleus) sampling. `u` is a
// uniform draw in [0, 1) from the caller's seeded generator, so a seed always
// picks the same tokens. Temperature 0 is greedy. Pure.

export interface SamplingOptions {
  temperature: number;
  topK: number;
  topP: number;
  repetitionPenalty: number;
}

/** The package's Turbo defaults. Greedy decoding sounded flat in the listening test. */
export const TURBO_SAMPLING: SamplingOptions = { temperature: 0.8, topK: 1000, topP: 0.95, repetitionPenalty: 1.2 };

export function pickToken(logits: ArrayLike<number>, said: Iterable<number>, u: number, options: SamplingOptions): number {
  const scores = Float64Array.from(logits);
  for (const token of new Set(said)) {
    const score = scores[token]!;
    scores[token] = score < 0 ? score * options.repetitionPenalty : score / options.repetitionPenalty;
  }
  if (options.temperature === 0) {
    let best = 0;
    for (let i = 1; i < scores.length; i++) if (scores[i]! > scores[best]!) best = i;
    return best;
  }

  const order = Array.from(scores.keys())
    .sort((a, b) => scores[b]! - scores[a]! || a - b)
    .slice(0, options.topK);
  const top = scores[order[0]!]!;
  const weights = order.map((i) => Math.exp((scores[i]! - top) / options.temperature));
  const total = weights.reduce((sum, w) => sum + w, 0);
  // The nucleus: the likeliest tokens up to and including the one whose mass reaches top-p.
  let keep = 0;
  let mass = 0;
  while (keep < weights.length) {
    mass += weights[keep++]! / total;
    if (mass >= options.topP) break;
  }
  const target = u * weights.slice(0, keep).reduce((sum, w) => sum + w, 0);
  let reached = 0;
  for (let i = 0; i < keep; i++) {
    reached += weights[i]!;
    if (target < reached) return order[i]!;
  }
  return order[keep - 1]!;
}
