import { invoke } from "@tauri-apps/api/core";

/** Mirrors the types in src-tauri/src/commands/characters.rs. */
export type Subclass = { name: string; shortName: string; source: string };
export type ClassLevel = { name: string; source: string; level: number; subclass?: Subclass };
/** `campaignId` is null for a character without a campaign. */
export type CharacterCard = { campaignId: string | null; archived: boolean; id: string; name: string; classes: ClassLevel[] };
export type CharacterList = { characters: CharacterCard[]; unreadable: string[] };

// All of these reject with a StorageError.
/** Every character: in every campaign (active and archived) and without a campaign, sorted by name. */
export function listCharacters(): Promise<CharacterList> {
  return invoke("list_characters");
}

/** Saves a new character in an active campaign, or without one (`campaign` null). The id is assigned by the backend. */
export function createCharacter(campaign: string | null, character: Record<string, unknown>): Promise<CharacterCard> {
  return invoke("create_character", { campaign, character });
}

/** Copies a character into another active campaign under a new id. */
export function copyCharacter(fromCampaign: string | null, id: string, toCampaign: string): Promise<CharacterCard> {
  return invoke("copy_character", { fromCampaign, id, toCampaign });
}
