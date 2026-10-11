// Trims the silence a voice leaves around each spoken piece, so word times
// line up with the sound and the gap between sentences is the one we add. Pure.

/** A sample this loud or louder (full scale is 1) is speech. */
const SPEECH_LEVEL = 0.01;
const LEAD_MARGIN_MS = 30;
const TAIL_MARGIN_MS = 60;

/** The sound of a piece with its margins: how many of the kept samples are margin at each end. */
export interface Trimmed {
  samples: Float32Array;
  /** Samples of margin before the first sound. */
  leadSamples: number;
  /** Samples of margin after the last sound. */
  tailSamples: number;
  /** The index in the original buffer where the kept samples begin. */
  startSample: number;
}

/**
 * `samples` without their leading and trailing silence, keeping 30 ms before
 * the first sound and 60 ms after the last (clamped to the buffer). All-silent
 * input gives an empty buffer.
 */
export function trimSilence(samples: Float32Array, sampleRate: number): Trimmed {
  let first = 0;
  while (first < samples.length && Math.abs(samples[first]!) < SPEECH_LEVEL) first++;
  if (first === samples.length) return { samples: new Float32Array(0), leadSamples: 0, tailSamples: 0, startSample: 0 };
  let last = samples.length - 1;
  while (Math.abs(samples[last]!) < SPEECH_LEVEL) last--;

  const start = Math.max(0, first - Math.round((LEAD_MARGIN_MS * sampleRate) / 1000));
  const end = Math.min(samples.length, last + 1 + Math.round((TAIL_MARGIN_MS * sampleRate) / 1000));
  return { samples: samples.slice(start, end), leadSamples: first - start, tailSamples: end - (last + 1), startSample: start };
}
