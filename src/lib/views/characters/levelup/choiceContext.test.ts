import { describe, expect, it } from "vitest";
import type { Character } from "$lib/api/characters";
import type { CatalogRow } from "$lib/api/rules";
import type { Gains } from "$lib/characters/levelup";
import { choiceContext } from "./choiceContext";
import type { LevelData } from "./levelData";

let id = 1;
const spell = (name: string, unit = "action"): CatalogRow => ({ id: id++, kind: "spell", source: "XPHB", name, data: { level: 1, time: [{ number: 1, unit }] } });
const gains = (spells: string[]) => ({ feats: [], spells: spells.map((name) => ({ name, source: "XPHB", origin: "Paladin", level: 1 })) }) as unknown as Gains;

describe("spellItems", () => {
  const before: Character = {
    id: "c",
    name: "Thalia",
    classes: [{ name: "Paladin", source: "XPHB", level: 1 }],
    spells: [
      { name: "Guidance", source: "XPHB", origin: "Magic Initiate", level: 0, gained: 0 },
      { name: "Divine Smite", source: "XPHB", origin: "Paladin", level: 1, gained: 1 },
      { name: "Bless", source: "XPHB", origin: "Paladin", level: 1, gained: 1 },
    ],
    levels: [{ class: "Paladin", level: 1, gains: gains(["Divine Smite", "Bless"]) }],
  } as Character;
  const data = { spells: [spell("Guidance"), spell("Divine Smite", "bonus"), spell("Bless"), spell("Command"), spell("Shield", "reaction"), spell("Find Steed", "minute")], feats: [], optional: [], lists: new Map() } as unknown as LevelData;
  const ctx = choiceContext({
    data,
    before,
    prereq: { level: 2, scores: null, feats: [], optional: [], knowsSpell: () => false },
    sources: null,
    published: () => "",
    skills: [],
    always: [{ key: "divine smite|xphb", note: "Paladin 2" }],
    later: [{ key: "command|xphb", note: "Paladin 3" }],
  });
  const items = Object.fromEntries(ctx.spellItems({ levels: [0, 1], classes: [], schools: [], ritual: false }).map((i) => [i.name, i]));

  it("spells had already are ticked, with where they came from", () => {
    expect([items.Guidance.taken, items.Guidance.note]).toEqual([true, "Magic Initiate"]);
    expect([items.Bless.taken, items.Bless.note, items.Bless.alert]).toEqual([true, "Paladin 1", undefined]);
    expect(items.Command.taken).toBeUndefined();
  });

  it("a spell had from two places gets a (!) naming both", () => {
    expect(items["Divine Smite"].alert).toContain("Paladin 1, Paladin 2");
  });

  it("tags a spell cast as an action, bonus action or reaction", () => {
    expect([items.Command.tag?.short, items["Divine Smite"].tag?.short, items.Shield.tag?.short, items["Find Steed"].tag]).toEqual(["A", "BA", "R", undefined]);
  });

  it("a spell a later level picked only gets that level as its label: not ticked, still pickable", () => {
    expect([items.Command.note, items.Command.taken, items.Command.alert]).toEqual(["Paladin 3", undefined, undefined]);
  });
});
