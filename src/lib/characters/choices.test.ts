import { describe, expect, it } from "vitest";
import { choiceComplete, emptyChoice, entryChoices, prerequisite, resolveChoice, type Entry, type Lookup } from "./choices";

const entry = (name: string, data: Record<string, unknown> = {}, source = "XPHB"): Entry => ({ name, source, data });

const magicInitiate = entry("Magic Initiate", {
  category: "O",
  additionalSpells: [{ name: "Wizard Spells", ability: { choose: ["int", "wis", "cha"] }, innate: { _: { daily: { "1": [{ choose: "level=1|class=Wizard" }] } } }, known: { _: [{ choose: "level=0|class=Wizard", count: 2 }] } }],
});
const pactOfTheTome = entry("Pact of the Tome", {
  featureType: ["EI"],
  additionalSpells: [{ ability: "cha", known: { _: [{ choose: "level=0", count: 3 }] }, prepared: { _: [{ choose: "level=1|components & miscellaneous=ritual", count: 2 }] } }],
});
const lessons = entry("Lessons of the First Ones", {
  featureType: ["EI"],
  featProgression: [{ name: "Origin Feat", category: ["O"], progression: { "*": 1 } }],
  entries: ["…", { type: "entries", entries: [{ type: "entries", name: "Repeatable", entries: ["…"] }] }],
});
const agonizing = entry("Agonizing Blast", {
  featureType: ["EI"],
  prerequisite: [{ spell: [{ choose: "level=0|class=Warlock" }], level: { level: 2 } }],
  entries: [{ type: "entries", entries: [{ type: "entries", name: "Repeatable", entries: ["…"] }] }],
});
const skilled = entry("Skilled", { skillToolLanguageProficiencies: [{ choose: [{ from: ["anySkill", "anyTool"], count: 3 }] }] });
const resilient = entry("Resilient", { ability: [{ choose: { from: ["str", "dex", "con", "int", "wis", "cha"] } }], savingThrowProficiencies: [{ choose: { from: ["str", "dex", "con", "int", "wis", "cha"] } }] });
const human = entry("Human", { feats: [{ anyFromCategory: { category: ["O"], count: 1 } }], skillProficiencies: [{ any: 1 }] });
const elf = entry("Elf", {
  additionalSpells: [{ name: "Drow", innate: { "3": { daily: { "1": ["faerie fire|xphb"] } }, "5": { daily: { "1": ["darkness|xphb"] } } }, known: { "1": ["dancing lights|xphb#c"] } }],
});

const spells = new Map(
  [
    ["fire bolt", 0],
    ["light", 0],
    ["mage hand", 0],
    ["shield", 1],
    ["alarm", 1],
    ["find familiar", 1],
  ].map(([n, l]) => [`${n}|xphb`, entry(String(n), { level: l })]),
);
const find: Lookup = {
  feat: (r) => (r.name.toLowerCase() === "magic initiate" ? magicInitiate : null),
  spell: (k) => spells.get(k) ?? null,
  optional: () => null,
  item: () => null,
};

describe("what an entry asks", () => {
  it("Pact of the Tome: 3 cantrips of any class and 2 rituals", () => {
    const c = entryChoices(pactOfTheTome.data, 1);
    expect(c.spells[0].choose.map((x) => [x.filter.levels, x.filter.ritual, x.count])).toEqual([[[0], false, 3], [[1], true, 2]]);
    expect([c.repeatable, c.target, c.feats]).toEqual([false, null, []]);
  });

  it("Lessons of the First Ones: an Origin feat, repeatable", () => {
    const c = entryChoices(lessons.data, 2);
    expect([c.feats, c.repeatable]).toEqual([[{ categories: ["O"], count: 1 }], true]);
  });

  it("Agonizing Blast: a known Warlock cantrip as its target, repeatable", () => {
    const c = entryChoices(agonizing.data, 2);
    expect([c.target?.levels, c.target?.classes, c.repeatable]).toEqual([[0], ["warlock"], true]);
  });

  it("Skilled: 3 skills or tools; Resilient: an ability and a saving throw; Human: a feat and a skill", () => {
    expect(entryChoices(skilled.data, 1).profs).toEqual([{ from: [], pools: ["skill", "tool"], count: 3 }]);
    const r = entryChoices(resilient.data, 4);
    expect([r.saves[0].count, r.bonus.length]).toEqual([1, 1]);
    const h = entryChoices(human.data, 1);
    expect([h.feats, h.profs]).toEqual([[{ categories: ["O"], count: 1 }], [{ from: [], pools: ["skill"], count: 1 }]]);
  });

  it("Drow spells keep the character level they come at", () => {
    expect(entryChoices(elf.data, 1).spells[0].fixed.map((s) => [s.name, s.atLevel])).toEqual([["dancing lights", 1], ["faerie fire", 3], ["darkness", 5]]);
  });

  it("tool and language choices of backgrounds and older species", () => {
    const c = entryChoices({ toolProficiencies: [{ anyArtisansTool: 1 }], languageProficiencies: [{ common: true, anyStandard: 2 }] }, 1);
    expect([c.fixed.languages, c.profs]).toEqual([["language:common"], [{ from: [], pools: ["artisan"], count: 1 }, { from: [], pools: ["standard"], count: 2 }]]);
  });
});

describe("prerequisites with known spells", () => {
  it("Agonizing Blast needs a known Warlock cantrip", () => {
    const ctx = { level: 2, scores: null, feats: [] };
    expect(prerequisite(agonizing.data.prerequisite, { ...ctx, knowsSpell: () => true })).toBe("met");
    expect(prerequisite(agonizing.data.prerequisite, { ...ctx, knowsSpell: () => false })).toBe("unmet");
    expect(prerequisite(agonizing.data.prerequisite, ctx)).toBe("check");
  });
});

describe("picks and what they give", () => {
  it("Lessons of the First Ones → Magic Initiate → its spells, all complete and resolved", () => {
    const pick = { ...emptyChoice({ name: "Lessons of the First Ones", source: "XPHB" }), feats: [{ ...emptyChoice({ name: "Magic Initiate", source: "XPHB" }) }] };
    expect(choiceComplete(lessons, pick, 2, find)).toBe(false);
    pick.feats[0].spells = [["fire bolt|xphb", "light|xphb"], ["shield|xphb"]];
    pick.feats[0].ability = "int";
    expect(choiceComplete(lessons, pick, 2, find)).toBe(true);
    const g = resolveChoice(lessons, pick, 2, find, "Lessons of the First Ones");
    expect(g.feats).toEqual([{ name: "Magic Initiate", source: "XPHB", origin: "Lessons of the First Ones" }]);
    expect(g.spells.map((s) => [s.name, s.origin])).toEqual([["fire bolt", "Magic Initiate"], ["light", "Magic Initiate"], ["shield", "Magic Initiate"]]);
  });

  it("Agonizing Blast is complete once it has its target", () => {
    const pick = emptyChoice({ name: "Agonizing Blast", source: "XPHB" });
    expect(choiceComplete(agonizing, pick, 2, find)).toBe(false);
    expect(choiceComplete(agonizing, { ...pick, target: "fire bolt|xphb" }, 2, find)).toBe(true);
  });

  it("Skilled gives a mix of skills and tools; Resilient a saving throw and +1", () => {
    const s = resolveChoice(skilled, { ...emptyChoice(), profs: [["skill:arcana", "tool:thieves' tools", "skill:history"]] }, 1, find, "Skilled");
    expect([s.skills, s.tools]).toEqual([["arcana", "history"], ["thieves' tools"]]);
    const r = resolveChoice(resilient, { ...emptyChoice(), saves: ["con"], bonus: { option: 0, picks: [["con"]] } }, 4, find, "Resilient");
    expect([r.saves, r.bonus]).toEqual([["con"], { con: 1 }]);
  });

  it("Pact of the Tome adds its picked spells; Drow adds its spells with the level they come at", () => {
    const tome = resolveChoice(pactOfTheTome, { ...emptyChoice(), spells: [["fire bolt|xphb", "light|xphb", "mage hand|xphb"], ["alarm|xphb", "find familiar|xphb"]] }, 1, find, "Pact of the Tome");
    expect(tome.spells.map((s) => [s.name, s.level])).toEqual([["fire bolt", 0], ["light", 0], ["mage hand", 0], ["alarm", 1], ["find familiar", 1]]);
    const drow = resolveChoice(elf, emptyChoice(), 1, find, "Elf");
    expect(drow.spells.map((s) => [s.name, s.atLevel])).toEqual([["dancing lights", 1], ["faerie fire", 3], ["darkness", 5]]);
    // A granted spell found in the library takes its real name and level.
    const named: Lookup = { ...find, spell: (k) => (k === "faerie fire|xphb" ? entry("Faerie Fire", { level: 1 }) : find.spell(k)) };
    expect(resolveChoice(elf, emptyChoice(), 1, named, "Elf").spells[1]).toEqual({ name: "Faerie Fire", source: "XPHB", origin: "Elf", atLevel: 3, level: 1 });
  });

  it("Magic Initiate asks for its spellcasting ability and gives it to its spells; a given ability needs no pick", () => {
    const picks = { ...emptyChoice(), spells: [["fire bolt|xphb", "light|xphb"], ["shield|xphb"]] };
    expect(choiceComplete(magicInitiate, picks, 1, find)).toBe(false);
    expect(choiceComplete(magicInitiate, { ...picks, ability: "wis" }, 1, find)).toBe(true);
    expect(resolveChoice(magicInitiate, { ...picks, ability: "wis" }, 1, find, "Magic Initiate").spells.map((s) => s.ability)).toEqual(["wis", "wis", "wis"]);
    const tome = resolveChoice(pactOfTheTome, { ...emptyChoice(), spells: [["light|xphb"], []] }, 1, find, "Pact of the Tome");
    expect(tome.spells.map((s) => s.ability)).toEqual(["cha"]);
  });
});
