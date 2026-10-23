import { describe, expect, it } from "vitest";
import { featureUse, inspirationOnLongRest, nestedFeatures, resolveUse, restUses, structuredUse, tableCount, usesMax } from "./features";

describe("featureUse", () => {
  it("reads the action type and how a rest gives uses back", () => {
    const secondWind = ["As a {@variantrule Bonus Action|XPHB}, you can use it to regain Hit Points. You regain one expended use when you finish a {@variantrule Short Rest|XPHB}, and you regain all expended uses when you finish a {@variantrule Long Rest|XPHB}."];
    expect(featureUse(secondWind, 2)).toEqual({ time: "bonus", short: "one", long: true, uses: { count: 2 }, freeCast: false, spells: [] });
    const actionSurge = ["On your turn, you can take one additional action.", "Once you use this feature, you can't do so again until you finish a {@variantrule Short Rest|XPHB|Short} or {@variantrule Long Rest|XPHB}."];
    expect(featureUse(actionSurge)).toEqual({ time: null, short: "all", long: true, uses: { count: 1 }, freeCast: false, spells: [] });
  });

  it("reads Channel Divinity's \"regain one of its expended uses\" as one use back on a short rest", () => {
    const text = ["You can use this class's Channel Divinity twice. You regain one of its expended uses when you finish a {@variantrule Short Rest|XPHB}, and you regain all expended uses when you finish a {@variantrule Long Rest|XPHB}."];
    expect(featureUse(text, 2)).toMatchObject({ short: "one", long: true, uses: { count: 2 } });
  });

  it("finds a pool, an ability modifier or the proficiency bonus as the number of uses", () => {
    const layOnHands = ["You have a pool of healing power that replenishes when you finish a {@variantrule Long Rest|XPHB}. With that pool, you can restore a total number of Hit Points equal to five times your Paladin level.", "As a {@variantrule Bonus Action|XPHB}, you can touch a creature."];
    expect(featureUse(layOnHands)).toEqual({ time: "bonus", short: null, long: true, uses: { perLevel: 5 }, freeCast: false, spells: [] });
    const bardic = [{ entries: ["You can confer a Bardic Inspiration die a number of times equal to your Charisma modifier (minimum of once), and you regain all expended uses when you finish a {@variantrule Long Rest|XPHB}."] }];
    expect(featureUse(bardic).uses).toEqual({ ability: "cha" });
    expect(featureUse(["You have a number of Luck Points equal to your {@variantrule Proficiency|XPHB|Proficiency Bonus}. You regain your expended Luck Points when you finish a {@variantrule Long Rest|XPHB}."]).uses).toEqual({ proficiency: true });
  });

  it("has no uses or recharge for a feature that is always on", () => {
    expect(featureUse(["You gain a +1 bonus to AC while you are wearing armor."])).toEqual({ time: null, short: null, long: false, uses: null, freeCast: false, spells: [] });
  });
});

describe("free casts", () => {
  it("a feature that casts a named spell without a slot has one use per rest, for that spell", () => {
    const smite = ["You always have the {@spell Divine Smite|XPHB} spell prepared. In addition, you can cast it without expending a spell slot, but you must finish a {@variantrule Long Rest|XPHB} before you can cast it in this way again."];
    expect(featureUse(smite)).toEqual({ time: null, short: null, long: true, uses: { count: 1 }, freeCast: true, spells: ["divine smite"] });
  });
});

describe("usesMax and tableCount", () => {
  it("works the count out for the character", () => {
    expect(usesMax({ perLevel: 5 }, null, 2, 3)).toBe(15);
    expect(usesMax({ ability: "cha" }, { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 8 }, 2, 1)).toBe(1);
    expect(usesMax({ proficiency: true }, null, 3, 5)).toBe(3);
    expect(usesMax({ ability: "cha" }, null, 2, 1)).toBeNull();
  });

  it("reads a class table column by the feature's name", () => {
    const paladin = { classTableGroups: [{ colLabels: ["Channel Divinity", "{@filter Prepared Spells|spells}"], rows: [[0, 2], [0, 3], [2, 4]] }] };
    expect(tableCount(paladin, "Channel Divinity", 3)).toBe(2);
    const barbarian = { classTableGroups: [{ colLabels: ["Rages", "Rage Damage"], rows: [["2", { type: "bonus", value: 2 }]] }] };
    expect(tableCount(barbarian, "Rage", 1)).toBe(2);
    expect(tableCount(barbarian, "Rage Damage", 1)).toBeNull();
    expect(tableCount(paladin, "Lay On Hands", 3)).toBeNull();
  });
});

describe("restUses", () => {
  it("a short rest gives back all or one use; a long rest everything", () => {
    const spent = { "action surge": { used: 1, short: "all" as const }, "second wind": { used: 2, short: "one" as const }, "lay on hands": { used: 10 } };
    expect(restUses(spent, "short")).toEqual({ "second wind": { used: 1, short: "one" }, "lay on hands": { used: 10 } });
    expect(restUses(spent, "long")).toEqual({});
  });
});

describe("structured data and what's set by hand", () => {
  it("reads consumes and free casts from additionalSpells", () => {
    expect(structuredUse({ consumes: { name: "Channel Divinity" } })).toEqual({ drawsFrom: "Channel Divinity", freeCast: null });
    const magicInitiate = { additionalSpells: [{ innate: { _: { daily: { "1": [{ choose: "level=1|class=Cleric" }] } } }, known: { _: [{ choose: "level=0", count: 2 }] } }] };
    expect(structuredUse(magicInitiate).freeCast).toEqual({ count: 1, short: false, spells: [] });
    const firbolg = { additionalSpells: [{ known: { "1": { rest: { "1": ["detect magic|xphb", "disguise self|xphb"] } } } }] };
    expect(structuredUse(firbolg).freeCast).toEqual({ count: 1, short: true, spells: ["detect magic", "disguise self"] });
  });

  it("uses what's set by hand first, then the data, then the text", () => {
    const detected = featureUse(["As a {@variantrule Bonus Action|XPHB}, you can do it once. You regain it when you finish a {@variantrule Long Rest|XPHB}."]);
    const structured = { drawsFrom: "Channel Divinity", freeCast: null };
    const plain = resolveUse(detected, structured, undefined);
    expect([plain.time, plain.long, plain.uses, plain.drawsFrom]).toEqual(["bonus", true, { count: 1 }, "Channel Divinity"]);
    const set = resolveUse(detected, structured, { time: "action", count: { fixed: 3 }, short: "one", range: "30 feet", save: "wis", drawsFrom: "Wild Shape" });
    expect([set.time, set.uses, set.short, set.range, set.save, set.drawsFrom]).toEqual(["action", { count: 3 }, "one", "30 feet", "wis", "Wild Shape"]);
    expect(resolveUse(detected, structured, { usage: "none", time: "none" })).toMatchObject({ uses: null, time: null });
    expect(resolveUse(detected, structured, { count: { table: "Channel Divinity" } }).table).toBe("Channel Divinity");
  });
});

describe("nestedFeatures", () => {
  it("finds features referred to in the text, not the ones in a choice", () => {
    const channel = ["You start with one such effect: Divine Sense.", { type: "entries", entries: [{ type: "refClassFeature", classFeature: "Divine Sense|Paladin|XPHB|3|XPHB" }] }];
    expect(nestedFeatures(channel)).toEqual([{ kind: "classFeature", ref: "Divine Sense|Paladin|XPHB|3|XPHB" }]);
    const devotion = ["Tenets…", { type: "refSubclassFeature", subclassFeature: "Sacred Weapon|Paladin|XPHB|Devotion|XPHB|3" }];
    expect(nestedFeatures(devotion)).toEqual([{ kind: "subclassFeature", ref: "Sacred Weapon|Paladin|XPHB|Devotion|XPHB|3" }]);
    const order = [{ type: "entries", entries: [{ type: "options", count: 1, entries: [{ type: "refClassFeature", classFeature: "Protector|Cleric|XPHB|1|XPHB" }] }] }];
    expect(nestedFeatures(order)).toEqual([]);
  });
});

describe("usageKey", () => {
  it("tells apart features of the same name in different classes and subclasses", async () => {
    const { usageKey } = await import("$lib/api/featureUsage");
    const ref = { kind: "classFeature", name: "Channel Divinity", source: "XPHB" };
    expect(usageKey(ref, { className: "Paladin" })).toBe("classfeature:channel divinity|xphb|paladin");
    expect(usageKey(ref, { className: "Cleric" })).not.toBe(usageKey(ref, { className: "Paladin" }));
    expect(usageKey({ kind: "subclassFeature", name: "Sacred Weapon", source: "XPHB" }, { className: "Paladin", subclassShortName: "Devotion" })).toBe("subclassfeature:sacred weapon|xphb|paladin|devotion");
    expect(usageKey({ kind: "feat", name: "Lucky", source: "XPHB" })).toBe("feat:lucky|xphb");
  });
});

describe("inspirationOnLongRest", () => {
  it("is Resourceful's rule, not Musician's (which gives it to others)", () => {
    expect(inspirationOnLongRest([{ name: "Resourceful", entries: ["You gain {@variantrule Heroic Inspiration|XPHB} whenever you finish a {@variantrule Long Rest|XPHB}."] }])).toBe(true);
    expect(inspirationOnLongRest(["As you finish a Long Rest, you can play a song and give Heroic Inspiration to allies who hear it."])).toBe(false);
  });
});
