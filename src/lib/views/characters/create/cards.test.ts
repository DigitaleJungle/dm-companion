import { describe, expect, it } from "vitest";
import type { CatalogRow } from "$lib/api/rules";
import { artPath, backgroundFacts, classFacts, speciesFacts } from "./cards";

const row = (data: Record<string, unknown>): CatalogRow => ({ id: 1, kind: "", source: "XPHB", name: "X", data });

describe("card facts", () => {
  it("species: size, speed, darkvision and other movement", () => {
    expect(speciesFacts(row({ size: ["M"], speed: 30, darkvision: 60 }))).toEqual(["Medium", "30 ft", "Darkvision 60 ft"]);
    expect(speciesFacts(row({ size: ["S", "M"], speed: { walk: 30, fly: true } }))).toEqual(["Small or Medium", "30 ft", "Fly"]);
  });

  it("class: hit die, primary ability, saves", () => {
    expect(classFacts(row({ hd: { faces: 10 }, primaryAbility: [{ str: true }, { dex: true }], proficiency: ["str", "con"] }))).toEqual([
      "d10",
      "STR or DEX",
      "Saves STR and CON",
    ]);
  });

  it("background: abilities, skills, feat", () => {
    expect(
      backgroundFacts(
        row({
          ability: [{ choose: { weighted: { from: ["con", "int", "wis"], weights: [2, 1] } } }],
          skillProficiencies: [{ arcana: true, "sleight of hand": true }],
          feats: [{ "magic initiate; wizard|xphb": true }],
        }),
      ),
    ).toEqual(["CON, INT, WIS", "Arcana and Sleight of Hand", "Feat: Magic Initiate (Wizard)"]);
  });

  it("finds the picture by folder, book and name", () => {
    expect(artPath("classes")({ ...row({}), name: "Fighter" })).toBe("classes/XPHB/Fighter.webp");
  });
});