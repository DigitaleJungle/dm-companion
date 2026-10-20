import { invoke } from "@tauri-apps/api/core";

/** Mirrors the types in src-tauri/src/commands/characters.rs. */
export type Subclass = { name: string; shortName: string; source: string };
export type ClassLevel = { name: string; source: string; level: number; subclass?: Subclass };
export type CharacterCard = { campaignId: string; archived: boolean; id: string; name: string; classes: ClassLevel[] };
export type CharacterList = { characters: CharacterCard[]; unreadable: string[] };

// Both reject with a StorageError.
/** Every character in every campaign, active and archived, sorted by name. */
export function listCharacters(): Promise<CharacterList> {
  return invoke("list_characters");
}

/** Copies a character into another active campaign under a new id. */
export function copyCharacter(fromCampaign: string, id: string, toCampaign: string): Promise<CharacterCard> {
  return invoke("copy_character", { fromCampaign, id, toCampaign });
}
