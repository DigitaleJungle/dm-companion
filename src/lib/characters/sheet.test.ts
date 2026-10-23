import { describe, expect, it } from "vitest";
import {
  masteryNames,
  armorClass,
  armorKind,
  carryingCapacity,
  deathStatus,
  hitDieRoll,
  hpOf,
  lineageFields,
  longRest,
  pactSlots,
  proficiencyLists,
  setTemp,
  shortAdvantage,
  shortRest,
  speciesDefenses,
  spellSlots,
  takeDamage,
  takeHealing,
  weaponAttack,
  weaponOf,
  weaponProficient,
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

describe("weapons", () => {
  const rapier = weaponOf({ weapon: true, type: "M|XPHB", weaponCategory: "martial", property: ["F|XPHB"], dmg1: "1d8", dmgType: "P" })!;
  const longbow = weaponOf({ weapon: true, type: "R|XPHB", weaponCategory: "martial", property: ["A|XPHB", "2H|XPHB"], dmg1: "1d8", range: "150/600" })!;
  const scores = { str: 10, dex: 16, con: 12, int: 10, wis: 10, cha: 10 };

  it("keeps only weapons, with property codes and range", () => {
    expect(rapier).toEqual({ category: "martial", dmg: "1d8", dmgType: "P", properties: ["F"] });
    expect(longbow.ranged).toBe(true);
    expect(weaponOf({ type: "HA|XPHB", ac: 16 })).toBeUndefined();
  });

  it("picks the ability: DEX for ranged and finesse (when better), else STR", () => {
    expect(weaponAttack(rapier, scores, 2, true)).toEqual({ ability: "dex", toHit: 5, damage: "1d8+3" });
    expect(weaponAttack(longbow, scores, 2, false)).toEqual({ ability: "dex", toHit: 3, damage: "1d8+3" });
    expect(weaponAttack({ ...rapier, properties: [] }, scores, 2, true)).toEqual({ ability: "str", toHit: 2, damage: "1d8" });
    expect(weaponAttack({ ...rapier, properties: [] }, { ...scores, str: 8 }, 2, false).damage).toBe("1d8-1");
  });

  it("reads weapon proficiency from the class", () => {
    const fighter = { weapons: ["simple", "martial"] };
    const wizard = { weapons: ["simple"] };
    const rogue = { weapons: ["simple", "Martial weapons that have the …"], weaponProficiencies: [{ simple: true, all: { fromFilter: "type=martial weapon|property=light;finesse" } }] };
    expect(weaponProficient(fighter, "Rapier", rapier)).toBe(true);
    expect(weaponProficient(wizard, "Rapier", rapier)).toBe(false);
    expect(weaponProficient(rogue, "Rapier", rapier)).toBe(true);
    expect(weaponProficient(rogue, "Longbow", longbow)).toBe(false);
    expect(weaponProficient({ weaponProficiencies: [{ "longbow|xphb": true }] }, "Longbow", longbow)).toBe(true);
    expect(weaponProficient(null, "Rapier", rapier)).toBe(false);
  });
});

describe("proficiencies and carrying", () => {
  it("lists fixed proficiencies from class, background and species", () => {
    const rogue = { armor: ["light"], weapons: ["simple", "{@filter Martial weapons|items}"], tools: ["{@item Thieves' Tools|XPHB}"] };
    const sage = { toolProficiencies: [{ "calligrapher's supplies": true }], languageProficiencies: [{ elvish: true, anyStandard: 1 }] };
    const elf = { languageProficiencies: [{ common: true, elvish: true }] };
    expect(proficiencyLists(rogue, sage, elf)).toEqual({
      armor: ["Light"],
      weapons: ["Simple", "Martial weapons"],
      tools: ["Thieves' Tools", "Calligrapher's supplies"],
      languages: ["Common", "Elvish"],
    });
    expect(proficiencyLists(null, null, null)).toEqual({ armor: [], weapons: [], tools: [], languages: [] });
  });

  it("carries Strength × 15 pounds, scaled by size", () => {
    expect(carryingCapacity(10)).toBe(150);
    expect(carryingCapacity(10, "S")).toBe(150);
    expect(carryingCapacity(10, "L")).toBe(300);
  });
});

describe("species defenses", () => {
  const dwarf = {
    resist: ["poison"],
    entries: [
      { type: "entries", name: "Dwarven Resilience", entries: ["You have {@variantrule Resistance|XPHB} to Poison damage. You also have {@variantrule Advantage|XPHB} on saving throws you make to avoid or end the {@condition Poisoned|XPHB} condition."] },
      { type: "entries", name: "Stonecunning", entries: ["You can use Tremorsense."] },
    ],
  };

  it("reads resistances and finds save advantages in the trait text", () => {
    expect(speciesDefenses(dwarf)).toEqual({
      advantages: ["Poisoned condition"],
      advantageNotes: [],
      resist: ["Poison"],
      immune: [],
      conditionImmune: [],
      vulnerable: [],
    });
    expect(speciesDefenses({ entries: ["You have {@variantrule Advantage|XPHB} on Intelligence, Wisdom, and Charisma saving throws."] }).advantages).toEqual([
      "INT, WIS, CHA saves",
    ]);
    expect(speciesDefenses(null)).toEqual({ advantages: [], advantageNotes: [], resist: [], immune: [], conditionImmune: [], vulnerable: [] });
  });

  it("shortens save advantages, keeping sentences that carry a condition", () => {
    expect(shortAdvantage("You have advantage on saving throws you make to avoid or end the charmed condition on yourself.")).toEqual({ what: "Charmed condition" });
    expect(shortAdvantage("You have advantage on saving throws you make to avoid or end the charmed or stunned condition on yourself.")).toEqual({ what: "Charmed or Stunned condition" });
    expect(shortAdvantage("Your innate psychic defenses grant you advantage on saving throws you make to avoid or end the charmed and frightened conditions on yourself.")).toEqual({
      what: "Charmed and Frightened conditions",
    });
    expect(shortAdvantage("You have advantage on Intelligence, Wisdom, and Charisma saving throws against spells.")).toEqual({ what: "INT, WIS, CHA saves vs spells" });
    expect(shortAdvantage("You have advantage on saving throws against spells.")).toEqual({ what: "Saves vs spells" });
    expect(shortAdvantage("Until you emerge, you gain a +4 bonus to your AC, and you have advantage on Strength and Constitution saving throws.")).toEqual({
      sentence: "Until you emerge, you gain a +4 bonus to your AC, and you have advantage on Strength and Constitution saving throws",
    });
    expect(shortAdvantage("You have advantage on saving throws made in the dark.")).toEqual({ sentence: "Advantage on saving throws made in the dark" });
  });

  it("settles a resistance choice through the chosen lineage", () => {
    const dragonborn = {
      resist: [{ choose: { from: ["acid", "fire"] } }],
      _versions: [{ _abstract: { name: "Dragonborn ({{color}})" }, _implementations: [{ _variables: { color: "Black" }, resist: ["acid"] }, { _variables: { color: "Red" }, resist: ["fire"] }] }],
    };
    const tiefling = { resist: [{ choose: { from: ["poison", "fire"] } }], _versions: [{ name: "Tiefling; Infernal Legacy", resist: ["fire"], darkvision: 60 }] };
    expect(speciesDefenses(dragonborn, "Dragonborn (Red)").resist).toEqual(["Fire"]);
    expect(speciesDefenses(dragonborn).resist).toEqual([]); // no lineage chosen: the choice stays open
    expect(speciesDefenses(tiefling, "Infernal Legacy").resist).toEqual(["Fire"]);
    expect(lineageFields(tiefling._versions, "Abyssal Legacy")).toEqual({});
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

describe("item references", () => {
  it("reads masteries and properties as strings or { uid } objects", () => {
    expect(masteryNames(["Sap|XPHB", { uid: "Vex|XPHB" }])).toEqual(["Sap", "Vex"]);
    expect(weaponOf({ weaponCategory: "martial", property: [{ uid: "F|XPHB", note: "x" }, "2H|XPHB"] })?.properties).toEqual(["F", "2H"]);
  });
});
