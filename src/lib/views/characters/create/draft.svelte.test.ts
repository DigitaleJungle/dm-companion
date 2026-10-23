import { describe, expect, it } from "vitest";
import type { Character } from "$lib/api/characters";
import type { CatalogRow } from "$lib/api/rules";
import { draft, loadCharacter, stepComplete, type Options } from "./draft.svelte";

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
