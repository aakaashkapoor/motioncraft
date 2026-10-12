// Word-anchored cues: a timed prop can start on a narration word instead of a
// fixed ms, resolved from the scene's word timings.

import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MotionDelay, SceneWordsContext, useSceneWords } from "../src/kit/frameContext";
import { cueErrors, resolveCue, useCueMs, type Cue } from "../src/kit/cues";
import { evenWordTimes, type TimedWord } from "../src/kit/captionWords";
import { validateCue } from "../src/storyboard/validate";

const NARRATION = "Wagyu, for four. Split the bill: wagyu again!";
// Each word starts at 100 ms per index: Wagyu 0, for 100, four 200, Split 300, the 400, bill 500, wagyu 600, again 700.
const WORDS: TimedWord[] = NARRATION.split(" ").map((text, i) => ({ text, startMs: i * 100, endMs: i * 100 + 90 }));

describe("resolveCue", () => {
  it("passes a number through", () => {
    expect(resolveCue(1234, WORDS)).toBe(1234);
  });

  it("resolves a word to its start, ignoring case and punctuation", () => {
    expect(resolveCue({ word: "four" }, WORDS)).toBe(200);
    expect(resolveCue({ word: "wagyu" }, WORDS)).toBe(0);
    expect(resolveCue({ word: "BILL" }, WORDS)).toBe(500);
    expect(resolveCue({ word: "again!" }, WORDS)).toBe(700);
  });

  it("picks the occurrence-th match", () => {
    expect(resolveCue({ word: "wagyu", occurrence: 2 }, WORDS)).toBe(600);
  });

  it("adds offsetMs, which may be negative", () => {
    expect(resolveCue({ word: "four", offsetMs: 150 }, WORDS)).toBe(350);
    expect(resolveCue({ word: "four", offsetMs: -50 }, WORDS)).toBe(150);
  });

  it("resolves a phrase of consecutive words to its first word", () => {
    expect(resolveCue({ word: "split the bill" }, WORDS)).toBe(300);
    expect(resolveCue({ word: "Four. Split" }, WORDS)).toBe(200);
  });

  it("does not match a phrase whose words are not consecutive", () => {
    expect(() => resolveCue({ word: "split bill" }, WORDS)).toThrow(/split bill/);
  });

  it("throws for a missing word, or returns the fallback when given", () => {
    expect(() => resolveCue({ word: "sushi" }, WORDS)).toThrow(/"sushi"/);
    expect(() => resolveCue({ word: "wagyu", occurrence: 3 }, WORDS)).toThrow(/wagyu/);
    expect(resolveCue({ word: "sushi" }, WORDS, 900)).toBe(900);
    expect(resolveCue({ word: "sushi" }, [], 0)).toBe(0);
  });

  it("skips tokens that are only punctuation", () => {
    const words = evenWordTimes("split — the bill", 0, 1000);
    expect(resolveCue({ word: "split the bill" }, words)).toBe(0);
  });
});

describe("cueErrors", () => {
  it("accepts a number and a word in the narration", () => {
    expect(cueErrors(500, undefined)).toEqual([]);
    expect(cueErrors(0, NARRATION)).toEqual([]);
    expect(cueErrors({ word: "wagyu", occurrence: 2, offsetMs: -100 }, NARRATION)).toEqual([]);
    expect(cueErrors({ word: "split the bill" }, NARRATION)).toEqual([]);
  });

  it("reports a bad shape", () => {
    for (const bad of [-1, Number.NaN, "wagyu", null, [], { word: "" }, { word: 3 }, { word: "!!" }, { word: "wagyu", occurrence: 0 }, { word: "wagyu", occurrence: 1.5 }, { word: "wagyu", offsetMs: "1" }, { word: "wagyu", at: 1 }, {}]) {
      expect(cueErrors(bad, NARRATION), JSON.stringify(bad)).not.toEqual([]);
    }
    expect(cueErrors({ word: "wagyu", at: 1 }, NARRATION).join()).toMatch(/at/);
  });

  it("reports a word that is not in the narration", () => {
    expect(cueErrors({ word: "sushi" }, NARRATION)).toEqual(['word "sushi" is not in this scene\'s narration']);
    expect(cueErrors({ word: "wagyu", occurrence: 3 }, NARRATION).join()).toMatch(/2 times/);
  });

  it("reports a word cue in a scene without narration", () => {
    expect(cueErrors({ word: "wagyu" }, undefined).join()).toMatch(/narration/);
  });
});

describe("validateCue", () => {
  it("prefixes each error with where the cue is", () => {
    expect(validateCue({ word: "sushi" }, NARRATION, "props.at")).toEqual(['props.at: word "sushi" is not in this scene\'s narration']);
    expect(validateCue({ word: "wagyu" }, NARRATION, "props.at")).toEqual([]);
  });
});

function Probe({ cue, fallbackMs }: { cue: Cue; fallbackMs?: number }) {
  return createElement("i", null, `${useCueMs(cue, fallbackMs)}|${useSceneWords().length}`);
}

const probe = (cue: Cue, opts: { words?: TimedWord[]; delay?: number; fallbackMs?: number } = {}) => {
  let el: ReactElement = createElement(Probe, { cue, fallbackMs: opts.fallbackMs });
  if (opts.delay !== undefined) el = createElement(MotionDelay, { ms: opts.delay }, el);
  if (opts.words !== undefined) el = createElement(SceneWordsContext.Provider, { value: opts.words }, el);
  return renderToStaticMarkup(el).replace(/<\/?i>/g, "");
};

describe("useCueMs", () => {
  it("resolves a word cue from the scene's words", () => {
    expect(probe({ word: "bill" }, { words: WORDS })).toBe(`500|${WORDS.length}`);
    expect(probe(800, { words: WORDS })).toBe(`800|${WORDS.length}`);
  });

  it("lands a word cue on the word inside a MotionDelay", () => {
    expect(probe({ word: "bill" }, { words: WORDS, delay: 200 })).toBe(`300|${WORDS.length}`);
    expect(probe(800, { words: WORDS, delay: 200 })).toBe(`800|${WORDS.length}`);
  });

  it("drawn alone, without scene words, uses the fallback (0 by default)", () => {
    expect(probe({ word: "bill" })).toBe("0|0");
    expect(probe({ word: "bill" }, { fallbackMs: 400 })).toBe("400|0");
  });
});
