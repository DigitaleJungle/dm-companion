import { invoke } from "@tauri-apps/api/core";
import type { CardId } from "$lib/views/home/cards";

/** Mirrors `LayoutError` in src-tauri/src/commands/home_layout.rs. */
export type LayoutError = { kind: "io" | "corrupt" | "invalid"; message: string };

/** The saved card order, or `null` when nothing has been saved yet. */
export function getHomeCards(): Promise<CardId[] | null> {
  return invoke("get_home_cards");
}

export function setHomeCards(cards: CardId[]): Promise<void> {
  return invoke("set_home_cards", { cards });
}
