import { describe, expect, it } from "vitest";
import {
  armorClass,
  armorKind,
  deathStatus,
  hitDieRoll,
  hpOf,
  longRest,
  pactSlots,
  setTemp,
  shortRest,
  spellSlots,
  takeDamage,
  takeHealing,
  type Vitals,
} from "./sheet";

const fresh = (current: number, temp = 0): Vitals => ({ hp: { max: 20, current, temp }, deathSaves: { successes: 0, failures: 0 } });

describe("hit points", () => {
  it("defaults current to max and keeps it within 0..max", () => {
    expect(hpOf({ max: 12 })).toEqual({ max: 12, current: 12, temp: 0 });
    expect(hpOf({ max: 12, current: 30, temp: 3 })).toEqual({ max: 12, current: 12, temp: 3 });
    expect(hpOf(undefined)).toEqual({ max: 0, current: 0, temp: 0 });
  });

  it("takes damage from temporary hit points first, never below 0", () => {
    expect(takeDamage(fresh(20, 5), 3).hp).toEqual({ max: 20, current: 20, temp: 2 });
    expect(takeDamage(fresh(20, 5), 8).hp).toEqual({ max: 20, current: 17, temp: 0 });
    expect(takeDamage(fresh(4), 50).hp.current).toBe(0);
  });

  it("counts damage at 0 hit points as a failed death save", () => {
    const down = takeDamage(fresh(0), 5);
    expect(down.deathSaves).toEqual({ successes: 0, failures: 1 });
    expect(down.hp.current).toBe(0);
  });

  it("heals up to max and resets death saves once above 0", () => {
    const dying: Vitals = { hp: { max: 20, current: 0, temp: 0 }, deathSaves: { successes: 2, failures: 1 } };
    expect(takeHealing(dying, 5)).toEqual({ hp: { max: 20, current: 5, temp: 0 }, deathSaves: { successes: 0, failures: 0 } });
    expect(takeHealing(fresh(18), 10).hp.current).toBe(20);
    expect(takeHealing(dying, 0).deathSaves.successes).toBe(2);
  });

  it("replaces temporary hit points instead of stacking them", () => {
    expect(setTemp({ max: 20, current: 20, temp: 8 }, 5).temp).toBe(5);
  });

  it("names the death save outcome", () => {
    expect(deathStatus({ successes: 2, failures: 2 })).toBe("dying");
    expect(deathStatus({ successes: 3, failures: 1 })).toBe("stable");
    expect(deathStatus({ successes: 1, failures: 3 })).toBe("dead");
  });
});

describe("class numbers", () => {
  const wizard = {
    hd: { faces: 6 },
    classTableGroups: [
      { colLabels: ["Cantrips"], rows: [[3], [3], [3]] },
      { title: "Spell Slots per Spell Level", rowsSpellProgression: [[2, 0, 0], [3, 0, 0], [4, 2, 0]] },
    ],
  };
  const warlock = {
    classTableGroups: [
      { colLabels: ["{@filter Invocations|optionalfeatures|feature type=ei}", "Spell Slots", "Slot Level"], rows: [[1, 1, 1], [3, 2, 1], [3, 2, 2]] },
    ],
  };

  it("reads spell slots per level from the class table", () => {
    expect(spellSlots(wizard, 1)).toEqual([2]);
    expect(spellSlots(wizard, 3)).toEqual([4, 2]);
    expect(spellSlots(warlock, 3)).toEqual([]);
    expect(spellSlots(null, 1)).toEqual([]);
  });

  it("reads pact magic slots and their level", () => {
    expect(pactSlots(warlock, 3)).toEqual({ count: 2, level: 2 });
    expect(pactSlots(wizard, 3)).toBeNull();
  });

  it("builds the hit die roll with the Constitution modifier", () => {
    expect(hitDieRoll(10, 14)).toBe("1d10+2");
    expect(hitDieRoll(6, 8)).toBe("1d6-1");
    expect(hitDieRoll(8, 10)).toBe("1d8");
  });
});

describe("rests", () => {
  const used = { hitDiceSpent: 3, slotsUsed: [2, 1], pactSlotsUsed: 1 };

  it("long rest restores hit points and slots, and half the hit dice", () => {
    const { vitals, resources } = longRest({ hp: { max: 20, current: 3, temp: 4 }, deathSaves: { successes: 1, failures: 2 } }, used, 5);
    expect(vitals).toEqual({ hp: { max: 20, current: 20, temp: 0 }, deathSaves: { successes: 0, failures: 0 } });
    expect(resources).toEqual({ hitDiceSpent: 1, slotsUsed: [], pactSlotsUsed: 0 });
    expect(longRest(fresh(20), { ...used, hitDiceSpent: 1 }, 1).resources.hitDiceSpent).toBe(0);
  });

  it("short rest brings back pact slots only", () => {
    expect(shortRest(used)).toEqual({ hitDiceSpent: 3, slotsUsed: [2, 1], pactSlotsUsed: 0 });
  });
});

describe("armor class", () => {
  const dex16 = 16; // +3

  it("follows the armor's kind", () => {
    expect(armorClass(dex16, [])).toBe(13);
    expect(armorClass(dex16, [{ armor: "light", ac: 11, equipped: true }])).toBe(14);
    expect(armorClass(dex16, [{ armor: "medium", ac: 14, equipped: true }])).toBe(16);
    expect(armorClass(dex16, [{ armor: "heavy", ac: 16, equipped: true }])).toBe(16);
  });

  it("adds an equipped shield and ignores unequipped items", () => {
    expect(armorClass(dex16, [{ armor: "heavy", ac: 18, equipped: true }, { armor: "shield", ac: 2, equipped: true }])).toBe(20);
    expect(armorClass(dex16, [{ armor: "heavy", ac: 18 }, { armor: "shield", ac: 2 }])).toBe(13);
  });

  it("lets an override replace the result", () => {
    expect(armorClass(dex16, [{ armor: "heavy", ac: 18, equipped: true }], 17)).toBe(17);
    expect(armorClass(dex16, [], null)).toBe(13);
  });

  it("maps item type codes to armor kinds", () => {
    expect(armorKind("HA|XPHB")).toBe("heavy");
    expect(armorKind("S")).toBe("shield");
    expect(armorKind("M|XPHB")).toBeUndefined();
  });
});
