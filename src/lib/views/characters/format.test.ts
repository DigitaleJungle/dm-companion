import { describe, expect, it } from "vitest";
import { avatarCandidates, classLine, totalLevel } from "./format";

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
