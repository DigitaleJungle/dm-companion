import { describe, expect, it } from "vitest";
import { avatarCandidates, classLine, selectCharacters, totalLevel, type CharacterFilters } from "./format";

const fighter = { name: "Fighter", source: "XPHB", level: 3, subclass: { name: "Champion", shortName: "Champion", source: "XPHB" } };
const wizard = { name: "Wizard", source: "XPHB", level: 2 };

describe("character card format", () => {
  it("shows levels per class only when multiclassed", () => {
    expect(classLine([fighter])).toBe("Fighter (Champion)");
    expect(classLine([fighter, wizard])).toBe("Fighter 3 (Champion) / Wizard 2");
    expect(classLine([])).toBe("");
  });

  it("adds up the class levels", () => {
    expect(totalLevel([fighter, wizard])).toBe(5);
    expect(totalLevel([])).toBe(0);
  });

  it("tries the subclass art from its own book, then the class art", () => {
    const xge = { ...fighter, subclass: { name: "Samurai", shortName: "Samurai", source: "XGE" } };
    expect(avatarCandidates([xge, wizard])).toEqual(["classes/XGE/Samurai Fighter.webp", "classes/XPHB/Fighter.webp"]);
    expect(avatarCandidates([wizard])).toEqual(["classes/XPHB/Wizard.webp"]);
    expect(avatarCandidates([])).toEqual([]);
  });
});

describe("character overview search, filters and sort", () => {
  const card = (name: string, campaignId: string | null, classes: typeof wizard[]) => ({ campaignId, archived: false, id: name, name, classes });
  // Each sort gives a different order: by name Ada, Bram, Cora; by campaign Bram (Alpha), Ada (Beta), Cora; by level Bram (2), Ada, Cora (5).
  const all = [
    card("Cora", null, [{ ...wizard, level: 5 }]),
    card("Ada", "b", [fighter, wizard]), // level 5, Champion
    card("Bram", "a", [wizard]), // level 2
  ];
  const campaignOf = (c: { campaignId: string | null }) => ({ a: "Alpha", b: "Beta" })[c.campaignId ?? ""] ?? "No campaign";
  const none: CharacterFilters = { search: "", campaign: null, className: null, level: null };
  const names = (filters: Partial<CharacterFilters>, sort: "name" | "campaign" | "level" = "name") =>
    selectCharacters(all, { ...none, ...filters }, sort, campaignOf).map((c) => c.name);

  it("searches names and class lines, subclass included", () => {
    expect(names({ search: "ad" })).toEqual(["Ada"]);
    expect(names({ search: "champ" })).toEqual(["Ada"]);
    expect(names({ search: " WIZARD " })).toEqual(["Ada", "Bram", "Cora"]);
  });

  it("combines campaign, class and total-level filters", () => {
    expect(names({ campaign: "No campaign" })).toEqual(["Cora"]);
    expect(names({ className: "Wizard", level: 5 })).toEqual(["Ada", "Cora"]);
    expect(names({ className: "Fighter", campaign: "Alpha" })).toEqual([]);
  });

  it("sorts by name, campaign or level, with name breaking ties", () => {
    expect(names({})).toEqual(["Ada", "Bram", "Cora"]);
    expect(names({}, "campaign")).toEqual(["Bram", "Ada", "Cora"]);
    expect(names({}, "level")).toEqual(["Bram", "Ada", "Cora"]);
  });
});
