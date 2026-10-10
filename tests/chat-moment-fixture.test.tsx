// tests/fixtures/chat-moment: the owner's reference's chat scene. An alert
// arrives, then a deploy bot's message with Approve / Reject; a cursor moves
// to Approve and clicks it; the button resolves to "Approved by Maya Chen";
// the message lifts out of the window as a floating card, and the shared
// morph carries it into the next scene. State at given ms comes from the
// page's own `Frame`; in the browser, the cursor lands on its button, the card
// lifts from exactly where the message is drawn, the morph carries it, and
// every layer-1 check passes.

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, type TestContext } from "vitest";
import { checkStoryboard, formatProblem, runChecks } from "../src/checks";
import { ASPECTS, buildTimeline, cursorTiming, validateStoryboard, type Aspect, type ChatWindowProps, type Storyboard } from "../src/index";
import { BrowserNotFoundError } from "../src/render/browser";
import { estimateDurations } from "../src/render/durations";
import { Frame } from "../src/render/page";
import { showFrame, withRenderPage } from "../src/render/session";
import { resolveTheme } from "../src/render/themes";

const FIXTURES: Record<Aspect, string> = { "9:16": "chat-moment.json", "16:9": "chat-moment-wide.json" };

async function load(aspect: Aspect): Promise<Storyboard> {
  const result = validateStoryboard(JSON.parse(await readFile(join(import.meta.dirname, "fixtures", FIXTURES[aspect]), "utf8")));
  if (!result.ok) throw new Error(result.errors.join("\n"));
  return result.storyboard;
}

function skipWithoutBrowser(ctx: TestContext) {
  return (error: unknown) => {
    if (error instanceof BrowserNotFoundError) ctx.skip(`no Chrome or Edge installed, skipping browser checks: ${error.message}`);
    throw error;
  };
}

/** The chat scene's props, and its click and lift times. */
function moment(sb: Storyboard) {
  const props = sb.scenes[0]!.props as unknown as ChatWindowProps;
  return { props, clickMs: props.cursor!.atMs!, liftMs: props.messages[1]!.lift!.atMs! };
}

function styleOf(html: string, attr: string): Map<string, string> | undefined {
  const style = new RegExp(`<[a-z]+[^>]*?${attr}[^>]*?style="([^"]*)"`).exec(html)?.[1];
  if (style === undefined) return undefined;
  return new Map(
    style.split(";").map((d) => {
      const i = d.indexOf(":");
      return [d.slice(0, i).trim(), d.slice(i + 1).trim()] as const;
    }),
  );
}
const opacityOf = (html: string, attr: string) => parseFloat(styleOf(html, attr)?.get("opacity") ?? "NaN");

describe.each(ASPECTS)("tests/fixtures/chat-moment (%s)", (aspect) => {
  it("is a valid storyboard: the chat scene, then a scene that carries the lifted card in", async () => {
    const sb = await load(aspect);
    expect(sb.aspect).toBe(aspect);
    const { props } = moment(sb);
    expect(sb.scenes[0]!.component).toBe("ChatWindow");
    expect(props.messages[0]!.badge).toBe("ALERT");
    expect(props.messages[1]!.actions!.map((a) => a.label)).toEqual(["Approve", "Reject"]);
    expect(props.cursor!.target).toBe("approve");
    expect(sb.scenes[1]!.props.shareId).toBe(props.messages[1]!.shareId);
    const issues = await checkStoryboard(sb, { theme: resolveTheme(sb) });
    expect(issues.filter((issue) => issue.severity === "error")).toEqual([]);
  });

  it("plays the moment: messages, cursor, click, resolved, lifted", async () => {
    const sb = await load(aspect);
    const theme = resolveTheme(sb);
    const timeline = buildTimeline(sb, estimateDurations(sb), theme);
    const at = (ms: number) => renderToStaticMarkup(<Frame storyboard={sb} theme={theme} timeline={timeline} frame={Math.round((ms * timeline.fps) / 1000)} />);
    const { clickMs, liftMs } = moment(sb);
    const cursor = cursorTiming(theme, clickMs);

    // Both messages have landed; the buttons wait, nothing has been clicked.
    const landed = at(cursor.appearMs - 100);
    expect(opacityOf(landed, 'data-chat-message="0"')).toBeCloseTo(1, 3);
    expect(opacityOf(landed, 'data-chat-message="1"')).toBeCloseTo(1, 3);
    expect(landed).toContain(">Approve<");
    expect(landed).not.toContain("data-cursor=");
    expect(landed).not.toContain("Approved by");

    // The cursor is on its way to Approve.
    const moving = at((cursor.moveMs[0] + cursor.moveMs[1]) / 2);
    expect(moving).toMatch(/data-cursor-target="approve"[^]*data-cursor=/);
    expect(moving).not.toContain("data-cursor-ring");

    // The click: the ring, and the buttons resolve.
    const clicked = at(clickMs + 200);
    expect(clicked).toContain("data-cursor-ring");
    expect(clicked).toContain("Approved by Maya Chen");
    expect(opacityOf(clicked, "data-chat-actions=")).toBeCloseTo(0, 3);
    expect(opacityOf(clicked, "data-chat-resolved=")).toBeCloseTo(1, 3);
    expect(clicked).not.toContain("data-chat-lift");

    // Lifted: the card floats, settled, carrying the shareId; the message is a ghost.
    const lifted = at(liftMs + theme.motion.enter.ms + 100);
    expect(lifted).toMatch(/data-chat-lift="1"[^>]*data-share-id="deploy"/);
    expect(styleOf(lifted, 'data-chat-lift="1"')!.get("transform")).toMatch(/^translate\(0px, 0px\) scale\(1\.04\)$/);
    expect(opacityOf(lifted, 'data-chat-message="1"')).toBeCloseTo(theme.motion.liftOut.ghostOpacity, 3);
    expect(lifted).not.toContain("data-cursor=");
  });

  it("lands the cursor on Approve, lifts the card from exactly where the message is, and morphs it on", { timeout: 120_000 }, async (ctx) => {
    const sb = await load(aspect);
    const theme = resolveTheme(sb);
    const durations = estimateDurations(sb);
    const timeline = buildTimeline(sb, durations, theme);
    const { clickMs, liftMs } = moment(sb);
    const frameOf = (ms: number) => Math.round((ms * timeline.fps) / 1000);
    const rect = (selector: string) => {
      const r = document.querySelector(selector)?.getBoundingClientRect();
      return r === undefined ? null : { x: r.x, y: r.y, width: r.width, height: r.height };
    };
    const transition = timeline.transitions[0]!;
    const measured = await withRenderPage({ storyboard: sb, theme, durations }, async (page) => {
      await showFrame(page, frameOf(clickMs), 20_000);
      const tip = await page.evaluate(rect, "[data-camera] [data-cursor]");
      const button = await page.evaluate(rect, '[data-camera] [data-chat-action="approve"]');
      await showFrame(page, frameOf(liftMs), 20_000);
      const card = await page.evaluate(rect, '[data-camera] [data-chat-lift="1"]');
      const message = await page.evaluate(rect, '[data-camera] [data-chat-message="1"]');
      await showFrame(page, transition.startFrame + Math.floor(transition.frames / 2), 20_000);
      const morph = await page.evaluate(rect, '[data-morph-box="deploy"]');
      return { tip, button, card, message, morph };
    }).catch(skipWithoutBrowser(ctx));
    const { tip, button, card, message, morph } = measured;
    expect(tip && button && card && message && morph).toBeTruthy();
    expect(tip!.x).toBeGreaterThan(button!.x);
    expect(tip!.x).toBeLessThan(button!.x + button!.width);
    expect(tip!.y).toBeGreaterThan(button!.y);
    expect(tip!.y).toBeLessThan(button!.y + button!.height);
    // The card's padding and border wrap the message exactly where it is drawn.
    const inset = (aspect === "9:16" ? theme.spacing.md : Math.round(theme.spacing.md * 0.8)) + theme.hairline;
    expect(Math.abs(message!.x - (card!.x + inset))).toBeLessThan(1.5);
    expect(Math.abs(message!.width - (card!.width - 2 * inset))).toBeLessThan(1.5);
    expect(Math.abs(message!.y + message!.height - (card!.y + card!.height - inset))).toBeLessThan(1.5);
    expect(Math.abs(message!.height - (card!.height - 2 * inset))).toBeLessThan(1.5);
  });

  it("passes every layer-1 check", { timeout: 120_000 }, async (ctx) => {
    const sb = await load(aspect);
    const theme = resolveTheme(sb);
    const checked = await runChecks({ storyboard: sb, theme, durations: estimateDurations(sb) }).catch(skipWithoutBrowser(ctx));
    expect(checked.problems.map(formatProblem)).toEqual([]);
    expect(checked.passed).toBe(true);
  });
});
