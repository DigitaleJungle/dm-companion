import { describe, expect, it } from "vitest";
import type { Character } from "$lib/api/characters";
import {
  complete,
  emptyFeat,
  emptyLevelPicks,
  featChoices,
  gainsOf,
  hpGain,
  levelHp,
  levelPlan,
  parseSpellFilter,
  prerequisite,
  progressionAt,
  rebuild,
  scoresWithLevels,
  spellGrants,
  spellMatches,
  subclassSpells,
  withLevel,
  type Entry,
  type Gains,
  type Lookup,
} from "./levelup";

const entry = (name: string, data: Record<string, unknown> = {}, source = "XPHB"): Entry => ({ name, source, data });
const feature = (name: string, cls: string, level: number, entries: unknown[] = ["Text."]) => entry(name, { className: cls, classSource: "XPHB", level, entries });

const character = (cls: string, level: number, extra: Partial<Character> = {}): Character => ({
  id: "c1",
  name: "Thalia",
  classes: [{ name: cls, source: "XPHB", level }],
  abilities: { method: "standard", base: { str: 15, dex: 14, con: 14, int: 12, wis: 10, cha: 8 }, bonuses: { str: 1 } },
  skills: ["athletics", "perception", "stealth"],
  hp: { max: 12, current: 12 },
  ...extra,
});

const fighter = entry("Fighter", {
  hd: { faces: 10 },
  classFeatures: ["Second Wind|Fighter|XPHB|1", { classFeature: "Fighter Subclass|Fighter|XPHB|3", gainSubclassFeature: true }, "Ability Score Improvement|Fighter|XPHB|4", "Extra Attack|Fighter|XPHB|5"],
  featProgression: [{ name: "Fighting Style", category: ["FS"], progression: { "1": 1 } }, { name: "Epic Boon", category: ["EB"], progression: { "19": 1 } }],
  itemMasteriesProgression: { "1": 3, "4": 4, "10": 5 },
});
const fighterFeatures = [feature("Second Wind", "Fighter", 1), feature("Fighter Subclass", "Fighter", 3), feature("Ability Score Improvement", "Fighter", 4), feature("Extra Attack", "Fighter", 5)];
const champion = entry("Champion", { shortName: "Champion", subclassFeatures: ["Improved Critical|Fighter|XPHB|Champion|XPHB|3"] });
const plan = (level: number, subclass: Entry | null = null) => levelPlan({ level, cls: fighter, subclass, classFeatures: fighterFeatures, subclassFeatures: [] });

const none: Lookup = { feat: () => null, spell: () => null, optional: () => null, item: () => null };
const noGains = (): Gains => ({ feats: [], spells: [], optional: [], options: [], masteries: [], expertise: [] });

describe("levelPlan: what one level adds", () => {
  it("Fighter 1: Fighting Style and three weapon masteries", () => {
    expect(plan(1).decisions.map((d) => [d.kind, "count" in d ? d.count : d.id])).toEqual([
      ["feat", "fp:Fighting Style:0"],
      ["masteries", 3],
    ]);
  });

  it("Fighter 3: the subclass, then its features", () => {
    expect(plan(3).decisions.map((d) => d.kind)).toEqual(["subclass"]);
    const picked = levelPlan({ level: 3, cls: fighter, subclass: champion, classFeatures: fighterFeatures, subclassFeatures: [entry("Improved Critical", { level: 3 })] });
    expect(picked.features.map((f) => [f.name, f.subclass])).toEqual([["Fighter Subclass", false], ["Improved Critical", true]]);
  });

  it("Fighter 4: ASI or a feat, and the one mastery the table adds", () => {
    expect(plan(4, champion).decisions).toEqual([
      { kind: "feat", id: "c:Ability Score Improvement", feature: "Ability Score Improvement", categories: ["G"], asi: true },
      { kind: "masteries", id: "masteries", count: 1 },
    ]);
  });

  it("Warlock: invocations, cantrips and spells the table adds at the level", () => {
    const warlock = entry("Warlock", {
      classFeatures: ["Magical Cunning|Warlock|XPHB|2"],
      optionalfeatureProgression: [{ name: "Eldritch Invocations", featureType: ["EI"], progression: [1, 3, 3, 3, 5] }],
      cantripProgression: [2, 2, 2, 3],
      preparedSpellsProgression: [2, 3, 4, 5],
    });
    const at = (level: number) =>
      levelPlan({ level, cls: warlock, subclass: null, classFeatures: [feature("Magical Cunning", "Warlock", 2)], subclassFeatures: [] }).decisions.map((d) => [d.kind, "count" in d ? d.count : null]);
    expect(at(1)).toEqual([["optional", 1], ["cantrips", 2], ["spells", 2]]);
    expect(at(2)).toEqual([["optional", 2], ["spells", 1]]);
  });

  it("Cleric 7: an options feature asks for one of its referenced features", () => {
    const blessed = feature("Blessed Strikes", "Cleric", 7, [
      { type: "entries", entries: [{ type: "options", count: 1, entries: [{ type: "refClassFeature", classFeature: "Divine Strike|Cleric|XPHB|7" }, { type: "refClassFeature", classFeature: "Potent Spellcasting|Cleric|XPHB|7" }] }] },
    ]);
    const cleric = entry("Cleric", { classFeatures: ["Blessed Strikes|Cleric|XPHB|7"] });
    expect(levelPlan({ level: 7, cls: cleric, subclass: null, classFeatures: [blessed], subclassFeatures: [] }).decisions).toEqual([
      { kind: "options", id: "c:Blessed Strikes:0", feature: "Blessed Strikes", count: 1, refs: [{ name: "Divine Strike", source: "XPHB", level: 7 }, { name: "Potent Spellcasting", source: "XPHB", level: 7 }] },
    ]);
  });

  it("Rogue 6: expertise, with the count from the text", () => {
    const rogue = entry("Rogue", { classFeatures: ["Expertise|Rogue|XPHB|6"] });
    const p = levelPlan({ level: 6, cls: rogue, subclass: null, classFeatures: [feature("Expertise", "Rogue", 6, ["You gain Expertise in two of your Skill Proficiencies of your choice."])], subclassFeatures: [] });
    expect(p.decisions).toEqual([{ kind: "expertise", id: "c:Expertise", feature: "Expertise", count: 2 }]);
  });
});

describe("feats", () => {
  const scores = { str: 16, dex: 14, con: 13, int: 12, wis: 10, cha: 8 };

  it("checks level, ability and feat prerequisites; anything else is for the DM", () => {
    const ctx = { level: 4, scores, feats: [{ name: "Alert", source: "XPHB" }] };
    expect(prerequisite([{ level: 4 }], ctx)).toBe("met");
    expect(prerequisite([{ level: 4, ability: [{ cha: 13 }] }], ctx)).toBe("unmet");
    expect(prerequisite([{ level: 4, ability: [{ str: 13 }] }, { level: 4, ability: [{ dex: 13 }] }], ctx)).toBe("met");
    expect(prerequisite([{ feature: ["Fighting Style"] }], ctx)).toBe("check");
    expect(prerequisite([{ feat: ["alert|xphb"] }], ctx)).toBe("met");
    expect(prerequisite([{ pact: "Blade" }], { ...ctx, optional: [{ name: "Pact of the Blade", source: "XPHB" }] })).toBe("met");
    expect(prerequisite([{ pact: "Blade" }], ctx)).toBe("unmet");
  });

  it("reads Magic Initiate's spells per option, and filters spells", () => {
    const grants = spellGrants(
      [
        { name: "Wizard Spells", innate: { _: { daily: { "1": [{ choose: "level=1|class=Wizard" }] } } }, known: { _: [{ choose: "level=0|class=Wizard", count: 2 }] } },
        { innate: { _: { daily: { "1e": ["misty step|xphb", { choose: "level=1|school=E;D" }] } } } },
      ],
      4,
    );
    expect(grants[0].choose.map((c) => [c.filter.levels, c.filter.classes, c.count])).toEqual([[[0], ["wizard"], 2], [[1], ["wizard"], 1]]);
    expect(grants[1].fixed).toEqual([{ name: "misty step", source: "XPHB" }]);
    const lists = new Map([["wizard", new Set(["fire bolt|xphb"])]]);
    expect(spellMatches(entry("Fire Bolt", { level: 0 }), parseSpellFilter("level=0|class=Wizard"), lists)).toBe(true);
    expect(spellMatches(entry("Sacred Flame", { level: 0 }), parseSpellFilter("level=0|class=Wizard"), lists)).toBe(false);
    expect(spellMatches(entry("Charm Person", { level: 1, school: "E" }), parseSpellFilter("level=1|school=E;D"), lists)).toBe(true);
    expect(spellMatches(entry("Alarm", { level: 1, meta: { ritual: true } }), parseSpellFilter("level=1|components & miscellaneous=ritual"), lists)).toBe(true);
  });

  it("knows what a feat asks: ASI's +2 or +1/+1, skills, expertise", () => {
    const asi = featChoices(entry("Ability Score Improvement", { ability: [{ choose: { from: ["str", "dex"], amount: 2 } }, { choose: { from: ["str", "dex"], count: 2 } }] }), 4);
    expect(asi.bonus.map((o) => o.choices[0].amounts)).toEqual([[2], [1, 1]]);
    const expert = featChoices(entry("Skill Expert", { skillProficiencies: [{ any: 1 }], expertise: [{ anyProficientSkill: 1 }] }), 4);
    expect([expert.skills.choices[0].count, expert.expertise]).toEqual([1, 1]);
  });
});

describe("picks and gains", () => {
  const mi = entry("Magic Initiate", {
    additionalSpells: [{ name: "Wizard Spells", innate: { _: { daily: { "1": [{ choose: "level=1|class=Wizard" }] } } }, known: { _: [{ choose: "level=0|class=Wizard", count: 2 }] } }],
  });
  const spells = new Map([
    ["shield|xphb", entry("Shield", { level: 1 })],
    ["fire bolt|xphb", entry("Fire Bolt", { level: 0 })],
    ["light|xphb", entry("Light", { level: 0 })],
  ]);
  const find: Lookup = { ...none, feat: (r) => (r.name === "Magic Initiate" ? mi : null), spell: (k) => spells.get(k) ?? null, item: (k) => (k === "greatsword|xphb" ? entry("Greatsword") : null) };

  it("a level is complete when every decision has its picks, and its gains resolve them", () => {
    const p = plan(4, champion);
    const picks = emptyLevelPicks();
    picks.hp = { how: "roll", value: 7 };
    picks.feats["c:Ability Score Improvement"] = { ...emptyFeat(), feat: { name: "Magic Initiate", source: "XPHB" } };
    picks.keys.masteries = ["greatsword|xphb"];
    expect(complete(p, picks, find)).toBe(false); // the feat's spells are missing
    picks.feats["c:Ability Score Improvement"].spells = [["fire bolt|xphb", "light|xphb"], ["shield|xphb"]];
    expect(complete(p, picks, find)).toBe(true);
    const gains = gainsOf(p, picks, find, fighter);
    expect(gains.feats).toEqual([{ name: "Magic Initiate", source: "XPHB" }]);
    expect(gains.spells.map((s) => [s.name, s.origin, s.level])).toEqual([["Fire Bolt", "Magic Initiate", 0], ["Light", "Magic Initiate", 0], ["Shield", "Magic Initiate", 1]]);
    expect(gains.masteries).toEqual([{ name: "Greatsword", source: "XPHB" }]);
  });

  it("level 1 has no hit point choice", () => {
    const picks = emptyLevelPicks();
    picks.feats["fp:Fighting Style:0"] = { ...emptyFeat(), feat: { name: "Magic Initiate", source: "XPHB" }, spells: [["fire bolt|xphb", "light|xphb"], ["shield|xphb"]] };
    picks.keys.masteries = ["a", "b", "c"];
    expect(complete(plan(1), picks, find)).toBe(true);
  });
});

describe("rebuild from level records", () => {
  it("hit points: level 1's, then each record (rolled, typed or the fixed value when missing)", () => {
    const c = character("Fighter", 4, {
      hp: { max: 30, current: 25 },
      levels: [
        { class: "Fighter", level: 2, hp: { how: "roll", value: 9 } }, // 9 + 2
        { class: "Fighter", level: 4, hp: { how: "manual", value: 3 } },
      ],
    });
    const r = rebuild(c, 10);
    expect(r.hp).toEqual({ max: 12 + 11 + 8 + 3, current: 34 - 5 }); // level 3 has no record: 6 + 2
    expect(levelHp(5, 10, 14)).toBe(5); // records from before levels could be edited
    expect(hpGain(6, 3)).toBe(1);
  });

  it("adds what levels gained and takes it off again when a record changes", () => {
    const feat = { name: "Keen Mind", source: "XPHB", skills: ["arcana"], bonus: { int: 1 } };
    const c = rebuild(character("Fighter", 4, { levels: [{ class: "Fighter", level: 4, gains: { ...noGains(), feats: [feat], expertise: ["perception"], spells: [{ name: "Light", source: "XPHB", origin: "Keen Mind", level: 0 }] } }] }), 10);
    expect(c.feats).toEqual([{ name: "Keen Mind", source: "XPHB", origin: "Fighter 4", gained: 4 }]);
    expect([c.skills, c.levelSkills, c.expertise]).toEqual([["arcana", "athletics", "perception", "stealth"], ["arcana"], ["perception"]]);
    expect(scoresWithLevels(c)?.int).toBe(13);
    expect(c.spells?.map((s) => [s.name, s.gained])).toEqual([["Light", 4]]);

    const changed = withLevel(c, { class: "Fighter", level: 4, gains: noGains() }, 10);
    expect([changed.feats, changed.skills, changed.expertise, changed.spells, changed.abilities?.levelBonuses]).toEqual([[], ["athletics", "perception", "stealth"], [], [], {}]);
  });

  it("keeps items saved before levels had records, and caps scores at 20", () => {
    const c = character("Fighter", 4, {
      feats: [{ name: "Alert", source: "XPHB" }],
      abilities: { base: { str: 18, dex: 14, con: 14, int: 12, wis: 10, cha: 8 }, bonuses: { str: 1 } },
      levels: [{ class: "Fighter", level: 4, gains: { ...noGains(), feats: [{ name: "Ability Score Improvement", source: "XPHB", bonus: { str: 2 } }] } }],
    });
    const r = rebuild(c, 10);
    expect(r.feats?.map((f) => f.name)).toEqual(["Alert", "Ability Score Improvement"]);
    expect(scoresWithLevels(r)?.str).toBe(20);
  });

  it("a new level through withLevel raises the class level and takes the subclass from its record", () => {
    const c = withLevel(character("Fighter", 2), { class: "Fighter", level: 3, hp: { how: "average", value: 6 }, gains: { ...noGains(), subclass: { name: "Champion", source: "XPHB", shortName: "Champion" } } }, 10);
    expect([c.classes[0].level, c.classes[0].subclass?.name, c.hp?.max]).toEqual([3, "Champion", 12 + 8 + 8]);
  });
});

describe("numbers", () => {
  it("reads progressions as arrays or level-keyed objects", () => {
    expect(progressionAt([2, 2, 3], 3)).toBe(3);
    expect(progressionAt({ "1": 3, "4": 4, "10": 5 }, 9)).toBe(4);
    expect(progressionAt(undefined, 4)).toBe(0);
  });

  it("subclass spells that are always prepared, up to a level", () => {
    expect(subclassSpells({ additionalSpells: [{ prepared: { "3": ["aid|xphb", "bless|xphb"], "5": ["revivify|xphb"] } }] }, 3)).toEqual([
      { name: "aid", source: "XPHB" },
      { name: "bless", source: "XPHB" },
    ]);
  });
});
