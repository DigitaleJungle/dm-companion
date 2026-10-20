import { describe, expect, it } from "vitest";
import { contentsTree, headingId } from "./contents";

describe("contentsTree", () => {
  it("nests headers by depth under their chapter", () => {
    const tree = contentsTree([
      { name: "Introduction" },
      { name: "Chapter 1: Playing the Game", headers: ["Dice", "D20 Tests", { header: "Ability Checks", depth: 1 }, { header: "DCs", depth: 2 }, { header: "Saving Throws", depth: 1 }, "Combat"] },
    ]);
    expect(tree[0]).toEqual({ index: 0, name: "Introduction", children: [] });
    const [dice, d20, combat] = tree[1].children;
    expect([dice.name, d20.name, combat.name]).toEqual(["Dice", "D20 Tests", "Combat"]);
    expect(d20.children.map((c) => c.name)).toEqual(["Ability Checks", "Saving Throws"]);
    expect(d20.children[0].children.map((c) => c.name)).toEqual(["DCs"]);
  });

  it("prefixes numbered chapters and appendices like the book does", () => {
    const tree = contentsTree([
      { name: "Playing the Game", ordinal: { type: "chapter", identifier: 1 } },
      { name: "The Multiverse", ordinal: { type: "appendix", identifier: "A" } },
      { name: "Rules Glossary" },
    ]);
    expect(tree.map((c) => c.name)).toEqual(["Chapter 1: Playing the Game", "Appendix A: The Multiverse", "Rules Glossary"]);
  });

  it("tolerates a depth that skips a level and missing data", () => {
    const tree = contentsTree([{ name: "A", headers: [{ header: "Deep", depth: 3 }, { depth: 1 }] }]);
    expect(tree[0].children.map((c) => c.name)).toEqual(["Deep"]);
    expect(contentsTree(null)).toEqual([]);
    expect(contentsTree([{}])[0].name).toBe("Part 1");
  });
});

describe("headingId", () => {
  it("makes stable, readable ids", () => {
    expect(headingId("Advantage/Disadvantage")).toBe("h-advantage-disadvantage");
    expect(headingId("What Is Acquisitions Incorporated?")).toBe("h-what-is-acquisitions-incorporated");
  });
});
