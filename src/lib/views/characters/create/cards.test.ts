import { describe, expect, it } from "vitest";
import type { CatalogRow } from "$lib/api/rules";
import { artPath, backgroundFacts, classFacts, speciesFacts, versionGroups } from "./cards";

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

  it("groups reprints, newest allowed book first, and keeps same-name options apart", () => {
    let id = 1;
    const r = (name: string, source: string, reprintedAs?: string[]): CatalogRow => ({ id: id++, kind: "", source, name, data: reprintedAs ? { reprintedAs } : {} });
    const rows = [
      r("Aasimar", "DMG", ["Aasimar|XPHB"]),
      r("Aasimar", "VGM", ["Aasimar|MPMM", "Aasimar|XPHB"]),
      r("Aasimar", "MPMM", ["Aasimar|XPHB"]),
      r("Aasimar", "XPHB"),
      r("Aven", "PSA"),
      r("Aven", "PSD"),
    ];
    const year: Record<string, string> = { DMG: "2014-12", VGM: "2016-11", MPMM: "2022-01", XPHB: "2024-09", PSA: "2017-01", PSD: "2017-02" };
    const label = (gs: ReturnType<typeof versionGroups>) => gs.map((g) => g.versions.map((v) => `${v.name} ${v.source}`).join(", "));
    expect(label(versionGroups(rows, () => true, (s) => year[s]))).toEqual(["Aasimar XPHB, Aasimar MPMM, Aasimar VGM, Aasimar DMG", "Aven PSA", "Aven PSD"]);
    // Without the 2024 book, the reprints still group (through it) and the newest allowed one leads.
    expect(label(versionGroups(rows, (s) => s === "DMG" || s === "VGM", (s) => year[s]))).toEqual(["Aasimar VGM, Aasimar DMG"]);
  });
});