import { describe, expect, it } from "vitest";
import { addCard, hiddenCards, moveCard, removeCard, type CardId } from "./cards";

const order: CardId[] = ["encounters", "party", "notes"];

describe("home cards", () => {
  it("moves a card earlier, later, and clamps past the ends", () => {
    expect(moveCard(order, "notes", 0)).toEqual(["notes", "encounters", "party"]);
    expect(moveCard(order, "encounters", 1)).toEqual(["party", "encounters", "notes"]);
    expect(moveCard(order, "encounters", 99)).toEqual(["party", "notes", "encounters"]);
    expect(moveCard(order, "party", -1)).toEqual(["party", "encounters", "notes"]);
  });

  it("removes and adds back without duplicates", () => {
    expect(removeCard(order, "party")).toEqual(["encounters", "notes"]);
    expect(addCard(order, "tools")).toEqual(["encounters", "party", "notes", "tools"]);
    expect(addCard(order, "party")).toBe(order);
  });

  it("lists hidden cards in default order", () => {
    expect(hiddenCards(order)).toEqual(["legendKeeper", "continue", "tools"]);
    expect(hiddenCards([])).toHaveLength(6);
  });
});
