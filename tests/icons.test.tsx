import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ICON_NAMES, Icon, isIconName } from "../src/index";

const CURATED = [
  "chat", "terminal", "code", "check", "shield", "cloud", "laptop", "box", "play", "search", "file", "user",
  "users", "lock", "zap", "chart", "clock", "globe", "mail", "git-branch", "settings", "star", "arrow-right", "sparkles",
];

describe("Icon", () => {
  it("covers the curated name list", () => {
    expect([...ICON_NAMES].sort()).toEqual([...CURATED].sort());
  });

  it.each(CURATED)("renders %s as an inline svg with drawn shapes", (name) => {
    const html = renderToStaticMarkup(<Icon name={name} />);
    expect(html).toMatch(/^<svg[^>]*viewBox="0 0 24 24"/);
    expect(html).toMatch(/<(path|circle|rect)\b/);
    expect(html).not.toMatch(/href|url\(/);
  });

  it("throws a clear error for an unknown name, listing the known ones", () => {
    expect(() => renderToStaticMarkup(<Icon name="rocket-ship" />)).toThrow(/Unknown icon "rocket-ship".*chat.*sparkles/);
  });

  it("applies size, color and strokeWidth", () => {
    const html = renderToStaticMarkup(<Icon name="star" size={96} color="#ff0000" strokeWidth={3} />);
    expect(html).toMatch(/width="96"/);
    expect(html).toMatch(/height="96"/);
    expect(html).toMatch(/stroke="#ff0000"/);
    expect(html).toMatch(/stroke-width="3"/);
    expect(html).toMatch(/fill="none"/);
  });

  it("defaults to 24px, currentColor and a 2px stroke", () => {
    const html = renderToStaticMarkup(<Icon name="check" />);
    expect(html).toMatch(/width="24"/);
    expect(html).toMatch(/stroke="currentColor"/);
    expect(html).toMatch(/stroke-width="2"/);
  });

  it("narrows names with isIconName", () => {
    expect(isIconName("zap")).toBe(true);
    expect(isIconName("toString")).toBe(false);
    expect(isIconName("nope")).toBe(false);
  });
});
