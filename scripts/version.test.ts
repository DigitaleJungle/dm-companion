import { describe, expect, it } from "vitest";
// @ts-expect-error plain .mjs script without type declarations
import { bumpVersion, compareVersions } from "./version.mjs";

describe("bumpVersion", () => {
  it("bumps each level and resets the lower parts", () => {
    expect(bumpVersion("1.4.2", "patch")).toBe("1.4.3");
    expect(bumpVersion("1.4.2", "minor")).toBe("1.5.0");
    expect(bumpVersion("1.4.2", "major")).toBe("2.0.0");
    expect(bumpVersion("0.0.0", "patch")).toBe("0.0.1");
  });

  it("rejects invalid input", () => {
    expect(() => bumpVersion("1.4", "patch")).toThrow();
    expect(() => bumpVersion("1.4.2-beta", "patch")).toThrow();
    expect(() => bumpVersion("1.4.2", "huge")).toThrow();
  });
});

describe("compareVersions", () => {
  it("compares numerically, not as text", () => {
    expect(compareVersions("0.10.0", "0.9.0")).toBeGreaterThan(0);
    expect(compareVersions("1.0.0", "1.0.0")).toBe(0);
    expect(compareVersions("1.0.0", "1.0.1")).toBeLessThan(0);
  });
});
