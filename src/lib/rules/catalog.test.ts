import { describe, expect, it } from "vitest";
import {
  applyFilters,
  backgroundAbilities,
  category,
  coins,
  crValue,
  featName,
  itemGroup,
  ordinal,
  bookMatches,
  sortName,
  sortRows,
  spellLevelText,
  TABS,
  type FilterOption,
} from "./catalog";

const row = (name: string, data: Record<string, unknown>, kind = "spell") => ({ id: name.length, kind, source: "XPHB", name, data });

describe("value helpers", () => {
  it("formats levels, CRs, coins and item groups", () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21].map(ordinal)).toEqual(["1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st"]);
    expect(spellLevelText({ level: 0 })).toBe("Cantrip");
    expect(crValue({ cr: "1/4" })).toBe(0.25);
    expect(crValue({ cr: { cr: "10", lair: "11" } })).toBe(10);
    expect(crValue({})).toBe(-1);
    expect([coins(1500), coins(50), coins(3), coins(undefined)]).toEqual(["15 gp", "5 sp", "3 cp", "—"]);
    expect(itemGroup({ type: "M|XPHB" })).toBe("Weapon");
    expect(itemGroup({ type: "HA|XPHB" })).toBe("Armor");
    expect(itemGroup({ wondrous: true, type: "G|XPHB" })).toBe("Wondrous item");
    expect(itemGroup({ type: "P|XDMG" })).toBe("Potion");
    expect(itemGroup({})).toBe("Other");
  });

  it("reads background abilities and feat keys", () => {
    expect(backgroundAbilities({ ability: [{ choose: { weighted: { from: ["int", "wis", "cha"], weights: [2, 1] } } }] })).toBe("Int, Wis, Cha");
    expect(backgroundAbilities({ ability: [{ str: 1, con: 1 }] })).toBe("Str, Con");
    expect(featName("magic initiate; cleric|xphb")).toBe("Magic Initiate (Cleric)");
    expect(featName("alert|xphb")).toBe("Alert");
  });
});

describe("categories", () => {
  it("puts every listed category in exactly one tab, with a config", () => {
    const kinds = TABS.flatMap((t) => t.kinds);
    expect(new Set(kinds).size).toBe(kinds.length);
    for (const kind of kinds) expect(category(kind).kind).toBe(kind);
    expect(category("spell").columns.map((c) => c.id)).toEqual(["level", "school", "castTime", "range", "components", "tags"]);
  });

  it("shows spell columns like the book", () => {
    const fireball = row("Fireball", {
      level: 3, school: "V", time: [{ number: 1, unit: "action" }], range: { type: "point", distance: { type: "feet", amount: 150 } },
      components: { v: true, s: true, m: "bat guano" }, duration: [{ type: "instant" }],
    });
    const values = Object.fromEntries(category("spell").columns.map((c) => [c.id, c.value(fireball)]));
    expect(values).toEqual({ level: "3rd", school: "Evocation", castTime: "1 action", range: "150 feet", components: "V, S, M", tags: "" });
  });
});

describe("filtering and sorting", () => {
  const spells = [
    row("Shield", { level: 1, school: "A", meta: { ritual: false } }),
    row("Bless", { level: 1, school: "E", duration: [{ type: "timed", concentration: true }] }),
    row("Detect Magic", { level: 1, school: "D", meta: { ritual: true }, duration: [{ type: "timed", concentration: true }] }),
    row("Fire Bolt", { level: 0, school: "V" }),
  ];
  const { filters } = category("spell");
  const options = Object.fromEntries(filters.map((f) => [f.id, f.options ?? []])) as Record<string, FilterOption[]>;

  it("ORs options within a filter and ANDs across filters", () => {
    const names = (ticked: Record<string, Set<string>>) => applyFilters(spells, filters, ticked, options).map((r) => r.name);
    expect(names({})).toHaveLength(4);
    expect(names({ level: new Set(["C"]) })).toEqual(["Fire Bolt"]);
    expect(names({ school: new Set(["Abj", "Div"]) })).toEqual(["Shield", "Detect Magic"]);
    expect(names({ level: new Set(["1"]), other: new Set(["Conc", "Ritual"]) })).toEqual(["Bless", "Detect Magic"]);
    expect(names({ other: new Set(["Ritual"]), school: new Set(["Enc"]) })).toEqual([]);
  });

  it("sorts by column value with name as the tie-breaker, both directions", () => {
    const level = category("spell").columns[0];
    expect(sortRows(spells, level, false).map((r) => r.name)).toEqual(["Fire Bolt", "Bless", "Detect Magic", "Shield"]);
    expect(sortRows(spells, level, true).map((r) => r.name)[0]).toBe("Shield");
    expect(sortRows(spells, null, false).map((r) => r.name)).toEqual(["Bless", "Detect Magic", "Fire Bolt", "Shield"]);
  });

  it("matches books by name or abbreviation, ignoring case", () => {
    const eepc = { id: "EEPC", name: "Elemental Evil Player's Companion" };
    expect(bookMatches(eepc, "")).toBe(true);
    expect(bookMatches(eepc, " eepc ")).toBe(true);
    expect(bookMatches(eepc, "player's")).toBe(true);
    expect(bookMatches(eepc, "xanathar")).toBe(false);
  });

  it("sorts names without punctuation or a leading article", () => {
    expect(sortName("The Book of Many Things")).toBe("Book of Many Things");
    expect(sortName('"Lucky" Coin')).toBe("Lucky Coin");
    expect(sortName("Bigby's Hand")).toBe("Bigbys Hand");
    expect(sortName("A")).toBe("A");
    const rows = ["The Zombie", '"Apple"', "a Bat", "Cat"].map((name) => row(name, {}));
    expect(sortRows(rows, null, false).map((r) => r.name)).toEqual(['"Apple"', "a Bat", "Cat", "The Zombie"]);
  });
});
