import { describe, expect, it } from "vitest";
import {
  assignedScores,
  bonusComplete,
  bonusOptions,
  bonusTotals,
  emptyAssignment,
  emptyPick,
  finalScores,
  inSources,
  level1Hp,
  lineageNames,
  lineageTarget,
  speciesLabel,
  mergeOptions,
  modifier,
  proficiencyBonus,
  skillGrant,
} from "./rules";

describe("skills", () => {
  it("reads fixed skills, choices and any", () => {
    expect(skillGrant([{ insight: true, religion: true }])).toEqual({ fixed: ["insight", "religion"], choices: [] });
    expect(skillGrant([{ choose: { from: ["arcana", "history"], count: 2 } }])).toEqual({ fixed: [], choices: [{ from: ["arcana", "history"], count: 2 }] });
    expect(skillGrant([{ choose: { from: ["nature", "survival"] } }]).choices[0].count).toBe(1);
    expect(skillGrant([{ any: 3 }])).toEqual({ fixed: [], choices: [{ from: null, count: 3 }] });
    expect(skillGrant(undefined)).toEqual({ fixed: [], choices: [] });
  });
});

describe("ability bonuses", () => {
  const background = [
    { choose: { weighted: { from: ["int", "wis", "cha"], weights: [2, 1] } } },
    { choose: { weighted: { from: ["int", "wis", "cha"], weights: [1, 1, 1] } } },
  ];

  it("reads weighted, fixed and plain choices", () => {
    expect(bonusOptions(background)).toEqual([
      { fixed: {}, choices: [{ from: ["int", "wis", "cha"], amounts: [2, 1] }] },
      { fixed: {}, choices: [{ from: ["int", "wis", "cha"], amounts: [1, 1, 1] }] },
    ]);
    expect(bonusOptions([{ cha: 2, choose: { count: 1, from: ["str", "dex"] } }])).toEqual([{ fixed: { cha: 2 }, choices: [{ from: ["str", "dex"], amounts: [1] }] }]);
    expect(bonusOptions(undefined)).toEqual([]);
    expect(bonusOptions(undefined, true).map((o) => o.choices[0].amounts)).toEqual([[2, 1], [1, 1, 1]]);
  });

  it("merges species and subspecies bonuses", () => {
    expect(mergeOptions(bonusOptions([{ con: 2 }]), bonusOptions([{ wis: 1, con: 1 }]))).toEqual([{ fixed: { con: 3, wis: 1 }, choices: [] }]);
    expect(mergeOptions([], bonusOptions([{ str: 1 }]))).toEqual([{ fixed: { str: 1 }, choices: [] }]);
  });

  it("totals a pick and needs a different ability per amount", () => {
    const options = bonusOptions(background);
    const pick = emptyPick(options[0]);
    expect(bonusComplete(options, pick)).toBe(false);
    pick.picks[0] = ["wis", "wis"];
    expect(bonusComplete(options, pick)).toBe(false);
    pick.picks[0] = ["wis", "cha"];
    expect(bonusComplete(options, pick)).toBe(true);
    expect(bonusTotals(options, pick)).toEqual({ wis: 2, cha: 1 });
    expect(bonusComplete([], emptyPick(undefined))).toBe(true);
  });
});

describe("scores", () => {
  it("needs every ability to get its own value", () => {
    const a = emptyAssignment();
    expect(assignedScores([15, 14, 13, 12, 10, 8], a)).toBeNull();
    Object.assign(a, { str: 0, dex: 1, con: 2, int: 3, wis: 4, cha: 4 });
    expect(assignedScores([15, 14, 13, 12, 10, 8], a)).toBeNull();
    a.cha = 5;
    expect(assignedScores([15, 14, 13, 12, 10, 8], a)).toEqual({ str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 8 });
  });

  it("adds bonuses up to 20 and derives modifiers and hit points", () => {
    const base = { str: 19, dex: 14, con: 13, int: 12, wis: 10, cha: 8 };
    expect(finalScores(base, [{ str: 2 }, { con: 1, cha: 1 }])).toEqual({ str: 20, dex: 14, con: 14, int: 12, wis: 10, cha: 9 });
    expect([modifier(8), modifier(9), modifier(10), modifier(15), modifier(20)]).toEqual([-1, -1, 0, 2, 5]);
    expect(level1Hp(10, 14)).toBe(12);
    expect(level1Hp(6, 3)).toBe(2);
    expect([proficiencyBonus(1), proficiencyBonus(4), proficiencyBonus(5), proficiencyBonus(17)]).toEqual([2, 2, 3, 6]);
  });
});

describe("lineages and sources", () => {
  it("names lineages from versions and templates", () => {
    expect(lineageNames([{ name: "Elf; Drow Lineage" }, { name: "Elf; High Elf Lineage" }])).toEqual(["Drow Lineage", "High Elf Lineage"]);
    expect(lineageNames([{ _abstract: { name: "Dragonborn ({{color}})" }, _implementations: [{ _variables: { color: "Black" } }, { _variables: { color: "Blue" } }] }])).toEqual([
      "Dragonborn (Black)",
      "Dragonborn (Blue)",
    ]);
    expect(lineageNames(undefined)).toEqual([]);
  });

  it("limits to a campaign's books, ignoring case", () => {
    expect(inSources("XPHB", ["xphb"])).toBe(true);
    expect(inSources("PHB", ["XPHB"])).toBe(false);
    expect(inSources("PHB", null)).toBe(true);
  });
});

describe("species versions", () => {
  it("finds the entry a lineage choice belongs under", () => {
    const entries = [{ name: "Darkvision" }, { name: "Elven Lineage" }, { name: "Trance" }];
    expect(lineageTarget([{ _mod: { entries: [{ mode: "replaceArr", replace: "Elven Lineage" }, { replace: "Darkvision" }] } }], entries)).toBe("Elven Lineage");
    expect(lineageTarget([{ _abstract: { _mod: { entries: [{ mode: "removeArr", names: "Draconic Ancestry" }] } } }], [{ name: "Draconic Ancestry" }])).toBe("Draconic Ancestry");
    expect(lineageTarget([{ _mod: { entries: { replace: "Missing" } } }], entries)).toBeNull();
    expect(lineageTarget(undefined, entries)).toBeNull();
  });

  it("labels the species with its chosen version", () => {
    expect(speciesLabel("Dragonborn", "Dragonborn (Black)")).toBe("Dragonborn (Black)");
    expect(speciesLabel("Elf", "Drow Lineage")).toBe("Elf (Drow Lineage)");
    expect(speciesLabel("Human", null)).toBe("Human");
  });
});
