import { describe, expect, it } from "vitest";
import { abilityScores, classFacts, creatureFacts, itemFacts, prerequisite, sizeTypeAlignment, spellcasting, spellFacts, spellLevel } from "./format";

// Shapes taken from the real 5etools 2.38.0 data.
const fireball = {
  name: "Fireball", source: "XPHB", level: 3, school: "V",
  time: [{ number: 1, unit: "action" }],
  range: { type: "point", distance: { type: "feet", amount: 150 } },
  components: { v: true, s: true, m: "a ball of bat guano and sulfur" },
  duration: [{ type: "instant" }],
};
const goblin = {
  name: "Goblin Warrior", size: ["S"], type: { type: "fey", tags: ["goblinoid"] }, alignment: ["C", "N"],
  ac: [15], hp: { average: 10, formula: "3d6" }, speed: { walk: 30 },
  str: 8, dex: 15, con: 10, int: 10, wis: 8, cha: 8,
  skill: { stealth: "+6" }, senses: ["Darkvision 60 ft."], passive: 9, languages: ["Common", "Goblin"], cr: "1/4",
};

describe("spells", () => {
  it("formats the level line and the four facts", () => {
    expect(spellLevel(fireball)).toBe("Level 3 Evocation");
    expect(spellLevel({ level: 0, school: "C" })).toBe("Conjuration cantrip");
    expect(spellLevel({ level: 1, school: "D", meta: { ritual: true } })).toBe("Level 1 Divination (ritual)");
    expect(spellFacts(fireball)).toEqual([
      { label: "Casting Time", value: "1 action" },
      { label: "Range", value: "150 feet" },
      { label: "Components", value: "V, S, M (a ball of bat guano and sulfur)" },
      { label: "Duration", value: "Instantaneous" },
    ]);
  });

  it("handles concentration, reactions, self areas and touch", () => {
    const facts = spellFacts({
      time: [{ number: 1, unit: "reaction", condition: "which you take when you are hit" }],
      range: { type: "cone", distance: { type: "feet", amount: 15 } },
      components: { s: true },
      duration: [{ type: "timed", duration: { type: "minute", amount: 10 }, concentration: true }],
    });
    expect(facts.map((f) => f.value)).toEqual(["1 reaction, which you take when you are hit", "Self (15-foot cone)", "S", "Concentration, up to 10 minutes"]);
    expect(spellFacts({ range: { type: "point", distance: { type: "touch" } } })[0]).toEqual({ label: "Range", value: "Touch" });
  });
});

describe("creatures", () => {
  it("formats size, type, alignment and the stat lines", () => {
    expect(sizeTypeAlignment(goblin)).toBe("Small Fey (Goblinoid), Chaotic Neutral");
    expect(creatureFacts(goblin)).toEqual([
      { label: "AC", value: "15" },
      { label: "HP", value: "10 (3d6)" },
      { label: "Speed", value: "30 ft." },
      { label: "Skills", value: "Stealth +6" },
      { label: "Senses", value: "Darkvision 60 ft., Passive Perception 9" },
      { label: "Languages", value: "Common, Goblin" },
      { label: "CR", value: "1/4" },
    ]);
    expect(abilityScores(goblin)[1]).toEqual({ ability: "DEX", score: 15, modifier: "+2" });
    expect(abilityScores(goblin)[0].modifier).toBe("-1");
  });

  it("formats armor sources and other speeds", () => {
    const facts = creatureFacts({ ac: [{ ac: 17, from: ["{@item plate armor|XPHB}"] }], speed: { walk: 40, fly: { number: 80, condition: "(hover)" } } });
    expect(facts.find((f) => f.label === "AC")?.value).toBe("17 (plate armor)");
    expect(facts.find((f) => f.label === "Speed")?.value).toBe("40 ft., Fly 80 ft. (hover)");
  });
});

describe("items, feats and classes", () => {
  it("formats item type, rarity and attunement", () => {
    expect(itemFacts({ type: "RD|XDMG", rarity: "uncommon", reqAttune: "by a warlock" })).toEqual([
      { label: "Type", value: "Rod, Uncommon" },
      { label: "Attunement", value: "Requires attunement by a warlock" },
    ]);
    expect(itemFacts({ wondrous: true, rarity: "rare", reqAttune: true })[1].value).toBe("Requires attunement");
    expect(itemFacts({ type: "G|XPHB", rarity: "none" })).toEqual([{ label: "Type", value: "Adventuring gear" }]);
  });

  it("formats prerequisites and class basics", () => {
    expect(prerequisite({ prerequisite: [{ level: 4 }] })).toBe("Level 4+");
    expect(prerequisite({ prerequisite: [{ ability: [{ str: 13 }] }, { other: "Proficiency with a {@item Lance|XPHB}" }] })).toBe("Strength 13+; or Proficiency with a Lance");
    expect(classFacts({ hd: { number: 1, faces: 10 }, primaryAbility: [{ str: true }, { dex: true }] })).toEqual([
      { label: "Hit Die", value: "d10" },
      { label: "Primary Ability", value: "Strength or Dexterity" },
    ]);
  });
});

describe("creature spellcasting", () => {
  it("lists at-will and per-day spells and keeps where the book puts them", () => {
    const [cast, featherFall] = spellcasting({
      spellcasting: [
        { name: "Spellcasting", headerEntries: ["The aarakocra casts…"], will: ["{@spell Mage Hand|XPHB}", "{@spell Message|XPHB}"], daily: { "1e": ["{@spell Lightning Bolt|XPHB}", "{@spell Fly|XPHB}"], "2": ["{@spell Shield|XPHB}"] }, displayAs: "action" },
        { name: "Feather Fall (1/Day)", headerEntries: ["…"], daily: { "1": ["{@spell Feather Fall|XPHB}"] }, displayAs: "reaction", hidden: ["daily"] },
      ],
    });
    expect(cast.block).toBe("action");
    expect(cast.lines).toEqual([
      "At Will: {@spell Mage Hand|XPHB}, {@spell Message|XPHB}",
      "1/Day Each: {@spell Lightning Bolt|XPHB}, {@spell Fly|XPHB}",
      "2/Day: {@spell Shield|XPHB}",
    ]);
    expect(featherFall).toMatchObject({ block: "reaction", lines: [] });
    expect(spellcasting({ spellcasting: [{ spells: { "0": { spells: ["a"] }, "1": { slots: 4, spells: ["b"] } } }] })[0]).toMatchObject({
      name: "Spellcasting", block: "trait", lines: ["Cantrips (at will): a", "Level 1 (4 slots): b"],
    });
  });
});
