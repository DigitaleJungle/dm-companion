import { describe, expect, it } from "vitest";
import type { Character } from "$lib/api/characters";
import type { CatalogRow } from "$lib/api/rules";
import { chooseBackground, draft, editedCharacter, loadCharacter, scores, skillGroups, stepComplete, type Options } from "./draft.svelte";

let nextId = 1;
const row = (name: string, data: Record<string, unknown> = {}, source = "XPHB"): CatalogRow => ({ id: nextId++, kind: "", source, name, data });

const elf = row("Elf", { size: ["M"], skillProficiencies: [{ choose: { from: ["insight", "perception", "survival"], count: 1 } }] });
const fighter = row("Fighter", { proficiency: ["str", "con"], hd: { faces: 10 }, startingProficiencies: { skills: [{ choose: { from: ["athletics", "history", "insight"], count: 2 } }] } });
const wizard = row("Wizard", { proficiency: ["int", "wis"], hd: { faces: 6 }, startingProficiencies: { skills: [{ choose: { from: ["arcana", "history"], count: 2 } }] } });
const soldier = row("Soldier", { skillProficiencies: [{ athletics: true, intimidation: true }], ability: [{ choose: { weighted: { from: ["str", "dex", "con"], weights: [2, 1] } } }], feats: [{ "savage attacker|xphb": true }] });
const sage = row("Sage", { skillProficiencies: [{ arcana: true, history: true }], ability: [{ choose: { weighted: { from: ["con", "int", "wis"], weights: [2, 1] } } }], feats: [{ "magic initiate; wizard|xphb": true }] });
const options: Options = { species: [elf], subspecies: [], classes: [fighter, wizard], backgrounds: [soldier, sage], skills: [] };

const thalia = (): Character => ({
  id: "c1",
  name: "Thalia",
  player: "Sam",
  species: { name: "Elf", source: "XPHB", size: "M" },
  classes: [{ name: "Fighter", source: "XPHB", level: 1 }],
  background: { name: "Soldier", source: "XPHB" },
  abilities: { method: "standard", base: { str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 8 }, bonuses: { str: 2, con: 1 } },
  skills: ["athletics", "history", "insight", "intimidation", "perception"],
  savingThrows: ["str", "con"],
  hp: { max: 12, current: 7, temp: 3 },
  feats: [{ name: "Savage Attacker", source: "XPHB" }],
  inventory: [{ name: "Longsword", quantity: 1 }],
  slotsUsed: [1],
  notes: "keep me",
});

describe("editing a saved character", () => {
  it("fills the wizard: rows, standard array, kept bonuses and rebuilt skill picks", () => {
    loadCharacter(thalia(), "a", options);
    expect([draft.name, draft.player, draft.campaignId, draft.species?.name, draft.cls?.name, draft.background?.name]).toEqual(["Thalia", "Sam", "a", "Elf", "Fighter", "Soldier"]);
    expect(draft.method).toBe("standard");
    expect(scores()).toEqual({ str: 17, dex: 14, con: 14, int: 12, wis: 10, cha: 8 });
    const picks = Object.fromEntries(skillGroups().map((g) => [g.origin, draft.skillPicks[g.id]]));
    expect(picks).toEqual({ class: ["history", "insight"], species: ["perception"] });
    expect((["basics", "species", "class", "background", "abilities", "skills"] as const).every((s) => stepComplete(s, options))).toBe(true);
  });

  it("keeps play data and the current damage when nothing changes", () => {
    loadCharacter(thalia(), "a", options);
    const saved = editedCharacter(thalia());
    expect(saved.hp).toEqual({ max: 12, current: 7, temp: 3 });
    expect([saved.notes, saved.inventory, saved.slotsUsed, saved.feats]).toEqual(["keep me", [{ name: "Longsword", quantity: 1 }], [1], [{ name: "Savage Attacker", source: "XPHB" }]]);
  });

  it("a new background asks for the bonuses again and replaces the feat", () => {
    loadCharacter(thalia(), "a", options);
    chooseBackground(sage);
    expect(draft.keptBonuses).toBeNull();
    expect(stepComplete("abilities", options)).toBe(false);
    draft.backgroundPick = { option: 0, picks: [["int", "con"]] };
    draft.skillPicks = { "class-0": ["athletics", "insight"], "species-0": ["perception"] };
    const saved = editedCharacter(thalia());
    expect(saved.feats).toEqual([{ name: "Magic Initiate (Wizard)", source: "XPHB" }]);
    expect(saved.skills).toEqual(["arcana", "athletics", "history", "insight", "perception"]);
  });

  it("a new class changes saves and max HP, keeps the damage taken and resets spell slots", () => {
    loadCharacter(thalia(), "a", options);
    draft.cls = wizard;
    draft.skillPicks = { "class-0": ["arcana", "history"], "species-0": ["perception"] };
    const saved = editedCharacter(thalia());
    expect(saved.savingThrows).toEqual(["int", "wis"]);
    expect(saved.hp).toEqual({ max: 8, current: 3, temp: 3 }); // d6 + CON 14 (+2); 5 damage carried over
    expect(saved.slotsUsed).toEqual([]);
    expect(saved.classes).toEqual([{ name: "Wizard", source: "XPHB", level: 1 }]);
  });
});
