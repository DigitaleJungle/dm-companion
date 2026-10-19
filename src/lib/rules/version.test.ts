import { describe, expect, it } from "vitest";
import { compareVersions } from "./version";

describe("compareVersions", () => {
  it("compares numerically and ignores a leading v", () => {
    expect(compareVersions("2.10.0", "2.9.1")).toBeGreaterThan(0);
    expect(compareVersions("v2.38.0", "2.38.0")).toBe(0);
    expect(compareVersions("2.38.0", "2.39.0")).toBeLessThan(0);
    expect(compareVersions("2.38", "2.38.0")).toBe(0);
    expect(compareVersions("3.0.0", "2.99.99")).toBeGreaterThan(0);
  });
});
