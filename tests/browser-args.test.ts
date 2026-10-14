import { describe, expect, it } from "vitest";
import { BROWSER_ARGS } from "../src/render/browser";

describe("BROWSER_ARGS", () => {
  it("lets WebGL fall back to SwiftShader on machines without a GPU", () => {
    expect(BROWSER_ARGS).toContain("--enable-unsafe-swiftshader");
  });

  it("does not force SwiftShader on machines with a GPU", () => {
    expect(BROWSER_ARGS.some((arg) => arg.startsWith("--use-angle") || arg.startsWith("--use-gl"))).toBe(false);
  });

  it("keeps the same-pixels flags", () => {
    expect(BROWSER_ARGS).toEqual(expect.arrayContaining(["--font-render-hinting=none", "--force-color-profile=srgb"]));
  });
});
