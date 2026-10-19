import { invoke } from "@tauri-apps/api/core";
import type { CardId } from "$lib/views/home/cards";

/** The saved card order, or `null` when nothing has been saved yet. Rejects with a StorageError. */
export function getHomeCards(): Promise<CardId[] | null> {
  return invoke("get_home_cards");
}

export function setHomeCards(cards: CardId[]): Promise<void> {
  return invoke("set_home_cards", { cards });
}
