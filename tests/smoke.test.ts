import { describe, expect, it } from "vitest";
import { VERSION } from "../src/index";

describe("motioncraft", () => {
  it("exposes a version", () => {
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
