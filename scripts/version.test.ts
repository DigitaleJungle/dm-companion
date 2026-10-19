import { describe, expect, it } from "vitest";
// @ts-expect-error plain .mjs script without type declarations
import { addChangelogSection, bumpVersion, changelogHasEntries, compareVersions } from "./version.mjs";

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

describe("changelog", () => {
  const log = "# Changelog\n\nIntro.\n\n## [0.1.0] - 2026-01-01\n### Added\n- Search\n";

  it("inserts the new section above the newest one", () => {
    const out = addChangelogSection(log, "0.2.0", "2026-02-02");
    expect(out.indexOf("## [0.2.0] - 2026-02-02")).toBeGreaterThan(out.indexOf("Intro."));
    expect(out.indexOf("## [0.2.0]")).toBeLessThan(out.indexOf("## [0.1.0]"));
  });

  it("requires at least one entry in the version's own section", () => {
    expect(changelogHasEntries(log, "0.1.0")).toBe(true);
    const empty = addChangelogSection(log, "0.2.0", "2026-02-02");
    expect(changelogHasEntries(empty, "0.2.0")).toBe(false); // the 0.1.0 entry must not count
    expect(changelogHasEntries(log, "9.9.9")).toBe(false);
    expect(changelogHasEntries(log.replace(/\n/g, "\r\n"), "0.1.0")).toBe(true);
  });
});
