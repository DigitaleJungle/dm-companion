import { describe, expect, it } from "vitest";
import type { Character } from "$lib/api/characters";
import type { CatalogRow } from "$lib/api/rules";
import { emptyChoice, emptyLevelPicks, type LevelPicks } from "$lib/characters/levelup";
import { levelNeedsChoice, saveLevel, type LevelData } from "./levelData";

let id = 1;
const row = (kind: string, name: string, data: Record<string, unknown> = {}): CatalogRow => ({ id: id++, kind, source: "XPHB", name, data });
const options = (name: string, sub: string, level: number, refs: string[]) =>
  row("subclassFeature", name, {
    level,
    subclassShortName: sub,
    subclassSource: "XPHB",
    entries: [{ type: "options", count: 1, entries: refs.map((r) => ({ type: "refSubclassFeature", subclassFeature: `${r}|Fighter|XPHB|${sub}|XPHB|${level}` })) }],
  });

const base = (cls: string, level: number, extra: Partial<Character> = {}): Character => ({
  id: "c",
  name: "Thalia",
  classes: [{ name: cls, source: "XPHB", level }],
  abilities: { base: { str: 15, dex: 14, con: 14, int: 12, wis: 10, cha: 8 } },
  hp: { max: 10, current: 10 },
  ...extra,
});
const data = (over: Partial<LevelData>): LevelData => ({
  cls: { name: "Fighter", source: "XPHB", data: {} },
  classFeatures: [],
  subclasses: [],
  subclassFeatures: [],
  feats: [],
  optional: [],
  spells: [],
  items: [],
  tools: [],
  languages: [],
  repeatable: new Set(),
  lists: new Map(),
  ...over,
});
const picks = (p: Partial<LevelPicks>): LevelPicks => ({ ...emptyLevelPicks(), hp: { how: "average", value: 6 }, ...p });

describe("saving a level", () => {
  it("another subclass at 3 clears the level 7 pick of the old one and flags level 7", () => {
    const sub = (name: string) => row("subclass", name, { shortName: name, subclassFeatures: [`${name} Pick|Fighter|XPHB|${name}|XPHB|7`] });
    const d = data({
      cls: { name: "Fighter", source: "XPHB", data: { hd: { faces: 10 }, classFeatures: [{ classFeature: "Fighter Subclass|Fighter|XPHB|3", gainSubclassFeature: true }] } },
      classFeatures: [row("classFeature", "Fighter Subclass", { level: 3 })],
      subclasses: [sub("Champion"), sub("Battle Master")],
      subclassFeatures: [options("Champion Pick", "Champion", 7, ["Mighty"]), options("Battle Master Pick", "Battle Master", 7, ["Clever"])],
    });
    let c = base("Fighter", 2);
    c = saveLevel(c, d, 3, picks({ subclass: { name: "Champion", source: "XPHB", shortName: "Champion" } }), 10).character;
    for (const l of [4, 5, 6]) c = saveLevel(c, d, l, picks({}), 10).character;
    c = saveLevel(c, d, 7, picks({ keys: { "s:Champion Pick:0": ["mighty|xphb"] } }), 10).character;
    expect(c.featureChoices?.map((f) => f.name)).toEqual(["Mighty"]);
    expect(levelNeedsChoice(c, d, 7)).toBe(false);

    const { character, reopened } = saveLevel(c, d, 3, picks({ subclass: { name: "Battle Master", source: "XPHB", shortName: "Battle Master" } }), 10);
    expect(reopened).toEqual([7]);
    expect(character.classes[0].subclass?.name).toBe("Battle Master");
    expect(character.featureChoices).toEqual([]);
    expect(levelNeedsChoice(character, d, 7)).toBe(true);
  });

  it("dropping Pact of the Blade at level 1 clears Thirsting Blade at level 5", () => {
    const warlock = { hd: { faces: 8 }, optionalfeatureProgression: [{ name: "Eldritch Invocations", featureType: ["EI"], progression: [1, 1, 1, 1, 2] }] };
    const d = data({
      cls: { name: "Warlock", source: "XPHB", data: warlock },
      optional: [
        row("optionalfeature", "Pact of the Blade", { featureType: ["EI"] }),
        row("optionalfeature", "Pact of the Tome", { featureType: ["EI"] }),
        row("optionalfeature", "Thirsting Blade", { featureType: ["EI"], prerequisite: [{ level: { level: 5 }, pact: "Blade" }] }),
      ],
    });
    let c = base("Warlock", 4, { classes: [{ name: "Warlock", source: "XPHB", level: 4 }] });
    c = saveLevel(c, d, 1, picks({ hp: null, keys: { "op:Eldritch Invocations": ["pact of the blade|xphb"] } }), 8).character;
    c = saveLevel(c, d, 5, picks({ keys: { "op:Eldritch Invocations": ["thirsting blade|xphb"] } }), 8).character;
    expect(c.optionalFeatures?.map((o) => o.name)).toEqual(["Pact of the Blade", "Thirsting Blade"]);

    const { character, reopened } = saveLevel(c, d, 1, picks({ hp: null, keys: { "op:Eldritch Invocations": ["pact of the tome|xphb"] } }), 8);
    expect(reopened).toEqual([5]);
    expect(character.optionalFeatures?.map((o) => o.name)).toEqual(["Pact of the Tome"]);
  });

  it("a level without a record needs a choice only when its plan asks for one", () => {
    const d = data({ cls: { name: "Fighter", source: "XPHB", data: { hd: { faces: 10 }, itemMasteriesProgression: { "1": 3 } } } });
    const c = base("Fighter", 2);
    expect([levelNeedsChoice(c, d, 1), levelNeedsChoice(c, d, 2)]).toEqual([true, false]);
  });

  it("invocations with sub-choices: two Agonizing Blasts on different cantrips, Lessons of the First Ones with a feat and its spells", () => {
    const repeatable = [{ type: "entries", entries: [{ type: "entries", name: "Repeatable", entries: ["…"] }] }];
    const d = data({
      cls: { name: "Warlock", source: "XPHB", data: { hd: { faces: 8 }, optionalfeatureProgression: [{ name: "Eldritch Invocations", featureType: ["EI"], progression: [0, 3] }] } },
      optional: [
        row("optionalfeature", "Agonizing Blast", { featureType: ["EI"], prerequisite: [{ spell: [{ choose: "level=0|class=Warlock" }] }], entries: repeatable }),
        row("optionalfeature", "Lessons of the First Ones", { featureType: ["EI"], featProgression: [{ category: ["O"], progression: { "*": 1 } }], entries: repeatable }),
      ],
      feats: [row("feat", "Magic Initiate", { category: "O", additionalSpells: [{ name: "Wizard Spells", known: { _: [{ choose: "level=0|class=Wizard", count: 1 }] } }] })],
      spells: [row("spell", "Eldritch Blast", { level: 0 }), row("spell", "Chill Touch", { level: 0 }), row("spell", "Light", { level: 0 })],
    });
    const c = base("Warlock", 1, { classes: [{ name: "Warlock", source: "XPHB", level: 1 }], spells: [{ name: "Eldritch Blast", source: "XPHB", origin: "Warlock", level: 0 }] });
    const blast = (target: string) => ({ ...emptyChoice({ name: "Agonizing Blast", source: "XPHB" }), target });
    const lessons = { ...emptyChoice({ name: "Lessons of the First Ones", source: "XPHB" }), feats: [{ ...emptyChoice({ name: "Magic Initiate", source: "XPHB" }), spells: [["light|xphb"]] }] };
    const { character } = saveLevel(c, d, 2, picks({ choices: { "op:Eldritch Invocations": [blast("eldritch blast|xphb"), blast("chill touch|xphb"), lessons] } }), 8);
    expect(character.optionalFeatures?.map((o) => [o.name, o.target])).toEqual([
      ["Agonizing Blast", "Eldritch Blast"],
      ["Agonizing Blast", "Chill Touch"],
      ["Lessons of the First Ones", undefined],
    ]);
    expect(character.feats?.map((f) => [f.name, f.origin])).toEqual([["Magic Initiate", "Lessons of the First Ones"]]);
    expect(character.spells?.map((s) => [s.name, s.origin])).toEqual([["Eldritch Blast", "Warlock"], ["Light", "Magic Initiate"]]);
    expect(levelNeedsChoice(character, d, 2)).toBe(false);
  });
});
