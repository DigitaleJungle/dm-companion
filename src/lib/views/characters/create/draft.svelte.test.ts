import { describe, expect, it } from "vitest";
import type { Character } from "$lib/api/characters";
import type { CatalogRow } from "$lib/api/rules";
import { abilityTotal, draft, levelIncreases, loadCharacter, stepComplete, type Options } from "./draft.svelte";

const row = (id: number, name: string, data: Record<string, unknown> = {}): CatalogRow => ({ id, kind: "", source: "XPHB", name, data });

describe("editing a character held in reactive state", () => {
  it("fills every step, level records included (the sheet passes its character as $state)", () => {
    const options: Options = {
      species: [row(1, "Elf", { size: ["M"] })],
      subspecies: [],
      classes: [row(2, "Fighter", { hd: { faces: 10 } })],
      backgrounds: [row(3, "Sage", { skillProficiencies: [{ arcana: true }] })],
      skills: [],
    };
    const character = $state<Character>({
      id: "c",
      name: "Diana",
      species: { name: "Elf", source: "XPHB", size: "M" },
      classes: [{ name: "Fighter", source: "XPHB", level: 2 }],
      background: { name: "Sage", source: "XPHB" },
      abilities: { method: "manual", base: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 }, bonuses: { dex: 2, int: 1 } },
      skills: ["arcana"],
      levels: [{ class: "Fighter", level: 2, hp: { how: "average", value: 6 } }],
    });
    loadCharacter(character, null, options);
    expect([draft.background?.name, draft.keptBonuses, draft.levels.length]).toEqual(["Sage", { dex: 2, int: 1 }, 1]);
    expect((["species", "class", "background", "abilities", "skills"] as const).every((s) => stepComplete(s, options))).toBe(true);
  });
});

describe("the Abilities step's totals while editing", () => {
  it("include what levels add (Fey Touched's +1 Wisdom), as the sheet does", () => {
    const options: Options = { species: [row(1, "Dwarf")], subspecies: [], classes: [row(2, "Cleric", { hd: { faces: 8 } })], backgrounds: [row(3, "Sage")], skills: [] };
    const feyTouched = { name: "Fey-Touched", source: "XPHB", bonus: { wis: 1 } };
    const character = $state<Character>({
      id: "c",
      name: "Bromdir",
      species: { name: "Dwarf", source: "XPHB" },
      classes: [{ name: "Cleric", source: "XPHB", level: 4 }],
      background: { name: "Sage", source: "XPHB" },
      abilities: { method: "manual", base: { str: 12, dex: 12, con: 12, int: 10, wis: 16, cha: 13 }, bonuses: { int: 1, wis: 2 } },
      levels: [{ class: "Cleric", level: 4, hp: { how: "average", value: 5 }, gains: { feats: [feyTouched], spells: [], optional: [], options: [], masteries: [], expertise: [], skills: [], tools: [], languages: [], saves: [], bonus: {} } as never }],
    });
    loadCharacter(character, null, options);
    expect(levelIncreases()).toEqual({ wis: 1 });
    expect([abilityTotal("wis"), abilityTotal("int"), abilityTotal("cha")]).toEqual([19, 11, 13]);
  });
});
