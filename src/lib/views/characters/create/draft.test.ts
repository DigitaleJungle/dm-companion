import { describe, expect, it } from "vitest";
import type { Character } from "$lib/api/characters";
import type { CatalogRow } from "$lib/api/rules";
import { rebuild } from "$lib/characters/levelup";
import {
  allLanguages,
  backgroundFeatRef,
  chooseBackground,
  chooseClass,
  chooseSpecies,
  draft,
  draftCharacter,
  editedCharacter,
  loadCharacter,
  openLanguageSlots,
  originComplete,
  originRecord,
  resetDraft,
  scores,
  skillGroups,
  stepComplete,
  toCharacter,
  withConfiguredLevels,
  type Options,
} from "./draft.svelte";
import type { Lookup } from "$lib/characters/choices";

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

  it("rebuilds what levels added: kept with the class, dropped above a lower level and with a new class", () => {
    const leveled = (): Character =>
      rebuild(
        {
          ...thalia(),
          classes: [{ name: "Fighter", source: "XPHB", level: 2 }],
          hp: { max: 20, current: 20 },
          levels: [
            {
              class: "Fighter",
              level: 2,
              hp: { how: "roll", value: 9 }, // 9 + CON 2 = 11, more than the fixed 8
              gains: { feats: [{ name: "Keen Mind", source: "XPHB", skills: ["arcana"], bonus: { int: 1 } }], spells: [], optional: [], options: [], masteries: [], expertise: [] },
            },
          ],
        },
        10,
      );
    const start = leveled();
    expect([start.hp?.max, start.abilities?.levelBonuses, start.skills?.includes("arcana")]).toEqual([23, { int: 1 }, true]);

    loadCharacter(start, "a", options);
    const kept = editedCharacter(start);
    expect(kept.hp?.max).toBe(23);
    expect(kept.feats?.map((f) => f.name)).toEqual(["Savage Attacker", "Keen Mind"]);
    expect(kept.skills).toContain("arcana");

    // A new background redoes the background picks; the level feat stays, with its +1 INT kept apart.
    chooseBackground(sage);
    draft.backgroundPick = { option: 0, picks: [["str", "con"]] };
    draft.skillPicks = { "class-0": ["history", "insight"], "species-0": ["perception"] };
    const rebuilt = editedCharacter(start);
    expect(rebuilt.abilities?.levelBonuses).toEqual({ int: 1 });
    expect(rebuilt.feats?.map((f) => f.name)).toEqual(["Magic Initiate (Wizard)", "Keen Mind"]);

    loadCharacter(start, "a", options);
    draft.level = 1;
    const lower = editedCharacter(start);
    expect([lower.levels, lower.feats?.map((f) => f.name), lower.hp?.max, lower.skills?.includes("arcana")]).toEqual([[], ["Savage Attacker"], 12, false]);

    loadCharacter(start, "a", options);
    draft.cls = wizard;
    draft.skillPicks = { "class-0": ["arcana", "history"], "species-0": ["perception"] };
    const changed = editedCharacter(start);
    expect([changed.levels, changed.feats?.map((f) => f.name)]).toEqual([[], ["Savage Attacker"]]);

    // A save a level feat added (Resilient) goes with the levels, without taking the new class's own save along.
    loadCharacter({ ...start, savingThrows: ["str", "con", "wis"], levelSaves: ["wis"] }, "a", options);
    draft.cls = wizard;
    draft.skillPicks = { "class-0": ["arcana", "history"], "species-0": ["perception"] };
    expect(editedCharacter({ ...start, savingThrows: ["str", "con", "wis"], levelSaves: ["wis"] }).savingThrows).toEqual(["int", "wis"]);
  });
  it("a new level keeps the class and recomputes max HP", () => {
    loadCharacter(thalia(), "a", options);
    expect(draft.level).toBe(1);
    draft.level = 3;
    const saved = editedCharacter(thalia());
    expect(saved.classes).toEqual([{ name: "Fighter", source: "XPHB", level: 3 }]);
    expect(saved.hp).toEqual({ max: 28, current: 23, temp: 3 }); // 12 + 2 × (6 + 2); 5 damage carried over
  });
});

describe("configuring levels while creating", () => {
  it("applies the configured level records to the new character, and a new class clears them", () => {
    loadCharacter(thalia(), null, options);
    resetDraft();
    Object.assign(draft, { name: "Kira", species: elf, size: "M", cls: fighter, background: soldier, level: 4 });
    draft.assignment = { str: 0, dex: 1, con: 2, int: 3, wis: 4, cha: 5 };
    draft.backgroundPick = { option: 0, picks: [["str", "con"]] };
    draft.skillPicks = { "class-0": ["history", "insight"], "species-0": ["perception"] };
    draft.levels = [
      { class: "Fighter", level: 2, hp: { how: "manual", value: 10 } },
      { class: "Fighter", level: 4, gains: { feats: [{ name: "Alert", source: "XPHB" }], spells: [], optional: [], options: [], masteries: [], expertise: [] } },
    ];
    expect(draftCharacter().classes).toEqual([{ name: "Fighter", source: "XPHB", level: 4 }]);
    const made = withConfiguredLevels({ id: "", ...toCharacter() });
    expect(made.feats?.map((f) => f.name)).toEqual(["Savage Attacker", "Alert"]);
    expect(made.hp?.max).toBe(12 + 12 + 8 + 8); // level 2 a manual roll of 10 (+ CON 2), levels 3 and 4 fixed (6 + 2)

    chooseClass(wizard);
    expect(draft.levels).toEqual([]);
  });
});

describe("origin choices", () => {
  const magicInitiate = { name: "Magic Initiate", source: "XPHB", data: { additionalSpells: [{ name: "Cleric Spells", known: { _: [{ choose: "level=0|class=Cleric", count: 1 }] } }, { name: "Wizard Spells", known: { _: [{ choose: "level=0|class=Wizard", count: 1 }] } }] } };
  const alert = { name: "Alert", source: "XPHB", data: {} };
  const find: Lookup = {
    feat: (r) => (r.name === "Magic Initiate" ? magicInitiate : r.name === "Alert" ? alert : null),
    spell: (k) => (k === "light|xphb" ? { name: "Light", source: "XPHB", data: { level: 0 } } : null),
    optional: () => null,
    item: () => null,
  };

  it("a species' feat and lineage spells, a background's feat with its preset spell list, and the languages", () => {
    resetDraft();
    chooseSpecies(row("Human", { feats: [{ anyFromCategory: { category: ["O"], count: 1 } }], languageProficiencies: [{ common: true, elvish: true }] }));
    chooseBackground(row("Acolyte", { feats: [{ "magic initiate; wizard|xphb": true }] }));
    expect(backgroundFeatRef()).toEqual({ name: "Magic Initiate", source: "XPHB", preset: "wizard" });
    expect(draft.backgroundFeatChoice.ref).toEqual({ name: "Magic Initiate", source: "XPHB", preset: "wizard" });
    expect([originComplete("species", find), originComplete("background", find)]).toEqual([false, false]);

    draft.speciesChoice.feats = [{ ...draft.speciesChoice, ref: { name: "Alert", source: "XPHB" }, feats: [] }];
    draft.backgroundFeatChoice.grant = 1;
    draft.backgroundFeatChoice.spells = [["light|xphb"]];
    expect([originComplete("species", find), originComplete("background", find)]).toEqual([true, true]);

    // Elvish comes with the species, so one standard language is left to pick; extras can be added.
    expect(openLanguageSlots()).toBe(1);
    draft.languages = ["dwarvish"];
    draft.extraLanguages = ["draconic"];
    expect(allLanguages()).toEqual(["common", "elvish", "dwarvish", "draconic"]);

    const origin = originRecord(find);
    expect(origin.gains?.feats).toEqual([{ name: "Alert", source: "XPHB", origin: "Human" }]);
    expect(origin.gains?.spells.map((s) => [s.name, s.origin])).toEqual([["Light", "Magic Initiate"]]);
    expect(origin.gains?.languages).toEqual(["common", "elvish", "dwarvish", "draconic"]);
  });
});
