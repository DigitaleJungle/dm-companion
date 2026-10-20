import { describe, expect, it } from "vitest";
import { parseTags, plainText } from "./tags";

describe("parseTags", () => {
  it("turns entity tags into links with display text and source", () => {
    expect(parseTags("Cast {@spell fireball|XPHB}.")).toEqual([
      { type: "text", text: "Cast " },
      { type: "link", kind: "spell", name: "fireball", source: "XPHB", text: "fireball" },
      { type: "text", text: "." },
    ]);
    expect(parseTags("{@variantrule Sphere [Area of Effect]|XPHB|Sphere}")[0]).toEqual({
      type: "link", kind: "variantrule", name: "Sphere [Area of Effect]", source: "XPHB", text: "Sphere",
    });
    expect(parseTags("{@race Elf}")[0]).toMatchObject({ kind: "species", name: "Elf", source: undefined });
  });

  it("looks item properties up by their display name", () => {
    expect(parseTags("{@itemProperty L|XPHB|Light}")[0]).toMatchObject({ kind: "itemProperty", name: "Light", text: "Light" });
  });

  it("nests styles and keeps links inside them", () => {
    const [bold] = parseTags("{@b Hit: {@spell Shield|XPHB}}");
    expect(bold).toMatchObject({ type: "style", style: "b" });
    expect(bold.type === "style" && bold.children[1]).toMatchObject({ type: "link", name: "Shield" });
  });

  it("renders stat block action markup as readable labels", () => {
    expect(plainText("{@atkr m} {@hit 4}, reach 5 ft. {@h}5 ({@damage 1d6 + 2}) Slashing damage.")).toBe(
      "Melee Attack Roll: +4, reach 5 ft. Hit: 5 (1d6 + 2) Slashing damage.",
    );
    expect(plainText("{@actSave dex} {@dc 13}. {@actSaveFail} Half. {@actSaveSuccess} None.")).toBe(
      "Dexterity Saving Throw: DC 13. Failure: Half. Success: None.",
    );
    expect(plainText("Fire Breath {@recharge 5}")).toBe("Fire Breath (Recharge 5–6)");
    expect(plainText("{@recharge}")).toBe("(Recharge 6)");
  });

  it("shows unknown and text-only tags as their text, and keeps broken markup", () => {
    expect(plainText("{@filter Warlock spells|spells|class=Warlock}")).toBe("Warlock spells");
    expect(plainText("{@somethingNew Shown text}")).toBe("Shown text");
    expect(plainText("See {@area Proficiency|036|x} later")).toBe("See Proficiency later");
    expect(plainText("unclosed {@b tag")).toBe("unclosed {@b tag");
    expect(parseTags("")).toEqual([]);
  });
});
