import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Character } from "$lib/api/characters";

// The sheet saves through saveCharacter; here it's a mock that each test controls. `saved` holds each saved
// character as it was at the call (the real call sends it as JSON right away).
const saveCharacter = vi.fn();
const saved: Character[] = [];
vi.mock("$lib/api/characters", () => ({
  saveCharacter: (...args: unknown[]) => {
    saved.push(JSON.parse(JSON.stringify(args[2])));
    return saveCharacter(...args);
  },
  getCharacter: vi.fn(),
}));

const { Sheet } = await import("./sheet.svelte");

const thalia = (): Character => ({ id: "c1", name: "Thalia", classes: [{ name: "Fighter", source: "XPHB", level: 1 }], hp: { max: 12, current: 12 } });

function sheet() {
  const s = new Sheet(null, "c1");
  s.character = thalia();
  return s;
}

describe("autosave", () => {
  beforeEach(() => {
    saveCharacter.mockReset();
    saved.length = 0;
  });

  it("a change made while a save runs is saved next, with the newest state", async () => {
    let finish!: () => void;
    saveCharacter.mockImplementationOnce(() => new Promise<void>((resolve) => (finish = resolve))).mockResolvedValue(undefined);
    const s = sheet();
    s.change((c) => (c.hp!.current = 10));
    const first = s.flush();
    await Promise.resolve();
    s.change((c) => (c.hp!.current = 7)); // during the first save
    finish();
    await first;
    await s.flush();
    expect(saved.map((c) => c.hp?.current)).toEqual([10, 7]);
    expect(s.save.status).toBe("saved");
  });

  it("a failed save keeps the change until Retry saves it", async () => {
    saveCharacter.mockRejectedValueOnce({ kind: "io", message: "disk full" }).mockResolvedValue(undefined);
    const s = sheet();
    s.change((c) => (c.hp!.current = 3));
    await s.flush();
    expect(s.save.status).toBe("error");
    await s.retry();
    expect(saveCharacter).toHaveBeenCalledTimes(2);
    expect(saved[1].hp?.current).toBe(3);
    expect(s.save.status).toBe("saved");
  });

  it("nothing changed: nothing is saved", async () => {
    const s = sheet();
    await s.flush();
    expect(saveCharacter).not.toHaveBeenCalled();
  });
});

describe("endConcentration", () => {
  it("ends concentration and forgets its spell, saying which one", () => {
    const s = sheet();
    s.character!.concentrating = true;
    s.character!.concentratingOn = { name: "Bless", source: "XPHB" };
    expect(s.endConcentration()).toBe("Concentration on Bless ended.");
    expect([s.character!.concentrating, s.character!.concentratingOn]).toEqual([false, undefined]);
  });

  it("does nothing when the character isn't concentrating", () => {
    const s = sheet();
    expect(s.endConcentration()).toBeNull();
    expect(s.save.status).toBe("saved");
  });
});

describe("feature uses", () => {
  it("keeps the spent count between 0 and the maximum, with how a short rest gives it back", () => {
    const s = sheet();
    s.setFeatureUsed("second wind", 5, 2, "one");
    expect(s.character!.featureUses).toEqual({ "second wind": { used: 2, short: "one" } });
    s.restFeatures("short");
    expect(s.character!.featureUses).toEqual({ "second wind": { used: 1, short: "one" } });
    s.setFeatureUsed("second wind", 0, 2, "one");
    expect(s.character!.featureUses).toEqual({});
  });
});

describe("features on the Actions tab", () => {
  it("ticking a feature keeps its row key once; unticking removes it", () => {
    const s = sheet();
    const card = { key: "c:Channel Divinity:3", name: "Channel Divinity", from: "Paladin 3", group: "class" as const };
    s.features.setOnActions(card, true);
    s.features.setOnActions(card, true);
    expect(s.character!.actionFeatures).toEqual(["c:Channel Divinity:3"]);
    expect(s.features.onActions(card)).toBe(true);
    s.features.setOnActions(card, false);
    expect(s.features.onActions(card)).toBe(false);
  });
});

describe("free casts", () => {
  it("a feat that casts its spell without a slot offers one use, spent by casting", () => {
    const s = sheet();
    s.character!.feats = [{ name: "Magic Initiate", source: "XPHB" }];
    s.features.extras["feat:Magic Initiate|XPHB"] = { entries: ["You can cast the chosen spell once without a spell slot, and you regain the ability to cast it in that way when you finish a {@variantrule Long Rest|XPHB}."] };
    const bless = { name: "Bless", source: "XPHB", origin: "Magic Initiate" };
    const [free] = s.features.freeCastsFor(bless);
    expect([free.card.name, free.max, free.used]).toEqual(["Magic Initiate", 1, 0]);
    expect(s.features.freeCastsFor({ name: "Shield", origin: "Wizard" })).toEqual([]);
    s.features.spendFreeCast(free);
    expect(s.features.freeCastsFor(bless)).toEqual([]);
    s.restFeatures("long");
    expect(s.features.freeCastsFor(bless)).toHaveLength(1);
  });
});

describe("pools", () => {
  it("a feature that draws from a pool counts and ticks the pool's uses", () => {
    const s = sheet();
    s.character!.classes = [{ name: "Cleric", source: "XPHB", level: 2 }];
    s.cls = {
      classFeatures: ["Channel Divinity|Cleric|XPHB|2", "Turn Undead|Cleric|XPHB|2"],
      classTableGroups: [{ colLabels: ["Channel Divinity"], rows: [[0], [2]] }],
    };
    s.features.classFeatures = [
      { name: "Channel Divinity", source: "XPHB", data: { level: 2, entries: ["You regain one of its expended uses when you finish a {@variantrule Short Rest|XPHB}."] } },
      { name: "Turn Undead", source: "XPHB", data: { level: 2, consumes: { name: "Channel Divinity" }, entries: ["As a {@action Magic|XPHB} action, you present your Holy Symbol."] } },
    ];
    const [channel, turn] = s.features.cards;
    expect(s.features.poolOf(turn)).toEqual(channel);
    expect(s.features.usesOf(turn)).toEqual({ key: "channel divinity", max: 2, used: 0, short: "one" });
    const { key, max, short } = s.features.usesOf(turn);
    s.setFeatureUsed(key, 1, max!, short);
    expect(s.features.usesOf(channel).used).toBe(1);
  });
});

describe("a background's feat saved with its choice", () => {
  it("Magic Initiate (Wizard) gives Shield, from \"Magic Initiate\", its free cast", () => {
    const s = sheet();
    s.character!.feats = [{ name: "Magic Initiate (Wizard)", source: "XPHB" }];
    // Only the data's additionalSpells (daily: once per long rest), no wording to go by.
    s.features.extras["feat:Magic Initiate (Wizard)|XPHB"] = { additionalSpells: [{ name: "Wizard Spells", innate: { _: { daily: { "1": [{ choose: "level=1|class=Wizard" }] } } } }] };
    const [free] = s.features.freeCastsFor({ name: "Shield", origin: "Magic Initiate" });
    expect([free?.card.name, free?.max]).toEqual(["Magic Initiate (Wizard)", 1]);
    expect(s.features.cards[0].ref?.name).toBe("Magic Initiate");
  });
});

describe("features referred to inside another", () => {
  it("Divine Sense, inside Paladin's Channel Divinity, gets its own row and spends Channel Divinity", () => {
    const s = sheet();
    s.character!.classes = [{ name: "Paladin", source: "XPHB", level: 3 }];
    s.cls = { classFeatures: ["Channel Divinity|Paladin|XPHB|3"], classTableGroups: [{ colLabels: ["Channel Divinity"], rows: [[0], [0], [2]] }] };
    s.features.classFeatures = [
      { name: "Channel Divinity", source: "XPHB", data: { level: 3, entries: ["Effects…", { type: "entries", entries: [{ type: "refClassFeature", classFeature: "Divine Sense|Paladin|XPHB|3|XPHB" }] }] } },
      { name: "Divine Sense", source: "XPHB", data: { level: 3, consumes: { name: "Channel Divinity" }, entries: ["As a {@variantrule Bonus Action|XPHB}, you can open your awareness."] } },
    ];
    const cards = s.features.cards;
    expect(cards.map((c) => c.name)).toEqual(["Channel Divinity", "Divine Sense"]);
    expect(s.features.usesOf(cards[1])).toMatchObject({ key: "channel divinity", max: 2 });
  });
});
