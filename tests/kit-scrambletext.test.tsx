// ScrambleText: a line of wrong glyphs that locks into the target string left
// to right, each character in a fixed-width slot so the line never jitters.

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SceneClockContext, ScrambleText, contentArea, lightTheme, scrambleTextAccent, scrambleTextTiming, type Aspect, type ScrambleTextProps } from "../src/index";

const FPS = 30;
const FRAMES = 150;
const msOf = (frame: number) => (frame * 1000) / FPS;
const frameAt = (ms: number) => Math.ceil((ms * FPS) / 1000);

type Props = Omit<ScrambleTextProps, "progress" | "theme" | "aspect">;

function draw(props: Props, frame: number, aspect: Aspect = "9:16"): string {
  return renderToStaticMarkup(
    <SceneClockContext.Provider value={{ fps: FPS, frame, frames: FRAMES }}>
      <ScrambleText {...props} progress={frame / (FRAMES - 1)} theme={lightTheme} aspect={aspect} />
    </SceneClockContext.Provider>,
  );
}

interface Slot {
  char: string;
  state: string;
  width: string;
  color: string;
}

function slots(html: string): Slot[] {
  return [...html.matchAll(/<span data-scramble-slot="(\w+)" style="([^"]*)">([^<]*)<\/span>/g)].map(([, state, style, char]) => ({
    char: char!.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">"),
    state: state!,
    width: /width:([^;]+)/.exec(style!)![1]!,
    color: /color:([^;]+)/.exec(style!)![1]!,
  }));
}

const shown = (html: string) => slots(html).map((s) => s.char).join("");
const lineWidth = (html: string) => /data-scramble-line=""[^>]*?width:([\d.]+)px/.exec(html)![1]!;

const CLEAN: Props = { text: "MOTIONCRAFT" };
const TERMINAL: Props = { text: "npm run render", style: "terminal", label: "Renders in 4.2 s" };
/** A hold frame: everything has landed and the exit has not begun. */
const HOLD = 90;

describe("ScrambleText", () => {
  it("draws the same frame identically twice", () => {
    for (const frame of [0, 8, 14, 20, 30, HOLD]) {
      expect(draw(TERMINAL, frame)).toBe(draw(TERMINAL, frame));
      expect(draw(CLEAN, frame)).toBe(draw(CLEAN, frame));
    }
  });

  it("shows the locked prefix exactly, and scrambled glyphs after it, mid-reveal", () => {
    const timing = scrambleTextTiming(lightTheme, CLEAN.text);
    // Between the fourth and fifth lock.
    const frame = frameAt(timing.locks[3]!);
    expect(msOf(frame)).toBeLessThan(timing.locks[4]!);
    const drawn = slots(draw(CLEAN, frame));
    expect(drawn.map((s) => s.char).slice(0, 4).join("")).toBe("MOTI");
    drawn.slice(4).forEach((s, i) => {
      expect(s.state).toBe("scrambled");
      expect(s.char).not.toBe(CLEAN.text[4 + i]);
      expect(s.char).toMatch(/^[A-Z0-9#$%&*+=/<>]$/);
    });
  });

  it("scrambles every character before the first lock, changing every 2 frames", () => {
    const timing = scrambleTextTiming(lightTheme, CLEAN.text);
    const early = frameAt(lightTheme.motion.leadMs) + 2;
    expect(msOf(early + 3)).toBeLessThan(timing.locks[0]!);
    const a = shown(draw(CLEAN, early));
    expect(slots(draw(CLEAN, early)).every((s) => s.state === "scrambled")).toBe(true);
    expect(a).not.toBe(shown(draw(CLEAN, early + 2)));
  });

  it("locks left to right, about 45 ms apart, after 300 ms of scramble", () => {
    const { locks } = scrambleTextTiming(lightTheme, CLEAN.text);
    expect(locks[0]).toBe(lightTheme.motion.leadMs + 300);
    locks.slice(1).forEach((t, i) => expect(t! - locks[i]!).toBe(45));
    // Forty characters still settle well inside the kit's budget.
    const long = scrambleTextTiming(lightTheme, "X".repeat(40));
    expect(long.lockedMs).toBeLessThanOrEqual(1700);
  });

  it("never replaces spaces", () => {
    for (let frame = 0; frame <= HOLD; frame++) {
      const drawn = slots(draw(TERMINAL, frame));
      [...TERMINAL.text].forEach((char, i) => {
        if (char === " ") expect(drawn[i]!.char).toBe(" ");
        else expect(drawn[i]!.char).not.toBe(" ");
      });
    }
  });

  it("shows exactly the text on the hold frame, in the text color", () => {
    for (const props of [CLEAN, TERMINAL]) {
      const drawn = slots(draw(props, HOLD));
      expect(drawn.map((s) => s.char).join("")).toBe(props.text);
      expect(drawn.every((s) => s.state === "locked" && s.color === lightTheme.colors.text)).toBe(true);
    }
  });

  it("tints only the character that is locking in the accent", () => {
    expect(scrambleTextAccent(lightTheme)).not.toBe(lightTheme.colors.text);
    const timing = scrambleTextTiming(lightTheme, CLEAN.text);
    const drawn = slots(draw(CLEAN, frameAt(timing.locks[5]!)));
    const accented = drawn.filter((s) => s.color === scrambleTextAccent(lightTheme));
    expect(accented).toHaveLength(1);
    expect(drawn.findIndex((s) => s.state === "locking")).toBe(drawn.filter((s) => s.state !== "scrambled").length - 1);
  });

  it.each(["9:16", "16:9"] as const)("keeps the line and every slot the same width on every frame (%s)", (aspect) => {
    for (const props of [CLEAN, TERMINAL]) {
      const widths = new Set<string>();
      const slotWidths = new Set<string>();
      for (let frame = 0; frame < FRAMES; frame += 1) {
        const html = draw(props, frame, aspect);
        widths.add(lineWidth(html));
        for (const s of slots(html)) slotWidths.add(s.width);
      }
      expect(widths.size).toBe(1);
      expect(slotWidths.size).toBe(1);
    }
  });

  it("frames the terminal style with a prompt and a caret that blinks once locked", () => {
    expect(draw(TERMINAL, HOLD)).toContain("data-scramble-prompt");
    expect(draw(CLEAN, HOLD)).not.toContain("data-scramble-prompt");
    const caret = (frame: number) => Number(/data-scramble-caret=""[^>]*opacity:([\d.]+)/.exec(draw(TERMINAL, frame))![1]);
    expect(caret(10)).toBe(0);
    const held = Array.from({ length: 40 }, (_, i) => caret(HOLD - 40 + i));
    expect(Math.max(...held)).toBeGreaterThan(0.9);
    expect(Math.min(...held)).toBeLessThan(0.1);
  });

  it("fades the label in after the lock", () => {
    const opacity = (frame: number) => Number(/data-scramble-label=""[^>]*opacity:([\d.]+)/.exec(draw(TERMINAL, frame))![1]);
    expect(opacity(15)).toBe(0);
    expect(opacity(HOLD)).toBe(1);
  });

  it("varies the glyphs with the seed", () => {
    const frame = frameAt(lightTheme.motion.leadMs) + 1;
    expect(shown(draw(CLEAN, frame))).not.toBe(shown(draw({ ...CLEAN, seed: "other" }, frame)));
  });

  it.each(["9:16", "16:9"] as const)("centers the block in the content area (%s)", (aspect) => {
    for (const props of [CLEAN, TERMINAL, { text: "X".repeat(40) }]) {
      const html = draw(props, HOLD, aspect);
      const area = contentArea(lightTheme, aspect);
      const left = Number(/^<div style="position:absolute;left:([\d.]+)px/.exec(html)![1]);
      const width = Number(/^<div[^>]*?width:([\d.]+)px/.exec(html)![1]);
      expect(left + width / 2).toBeCloseTo(area.x + area.width / 2, 0);
      expect(Number(lineWidth(html))).toBeLessThanOrEqual(width);
    }
  });

  it("throws on bad props", () => {
    expect(() => draw({ text: "" }, 0)).toThrow(/ScrambleText/);
    expect(() => draw({ text: "X".repeat(41) }, 0)).toThrow(/ScrambleText/);
    expect(() => draw({ text: "two\nlines" }, 0)).toThrow(/ScrambleText/);
    expect(() => draw({ text: "OK", style: "loud" as "clean" }, 0)).toThrow(/ScrambleText/);
    expect(() => draw({ text: "OK", label: 3 as unknown as string }, 0)).toThrow(/ScrambleText/);
    expect(() => draw({ text: "OK", seed: 3 as unknown as string }, 0)).toThrow(/ScrambleText/);
  });
});
