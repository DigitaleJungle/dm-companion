// Same ids, same default order as CARD_IDS in src-tauri/src/commands/home_layout.rs.
export const CARD_IDS = ["encounters", "party", "legendKeeper", "notes", "continue", "tools"] as const;
export type CardId = (typeof CARD_IDS)[number];

/** Moves `id` to position `to` (clamped to the list). */
export function moveCard(order: CardId[], id: CardId, to: number): CardId[] {
  const rest = order.filter((c) => c !== id);
  const at = Math.max(0, Math.min(to, rest.length));
  return [...rest.slice(0, at), id, ...rest.slice(at)];
}

export function removeCard(order: CardId[], id: CardId): CardId[] {
  return order.filter((c) => c !== id);
}

/** Adds `id` at the end, unless it is already shown. */
export function addCard(order: CardId[], id: CardId): CardId[] {
  return order.includes(id) ? order : [...order, id];
}

/** Cards not currently shown, in their default order. */
export function hiddenCards(order: CardId[]): CardId[] {
  return CARD_IDS.filter((c) => !order.includes(c));
}
