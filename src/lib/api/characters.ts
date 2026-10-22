import { invoke } from "@tauri-apps/api/core";

/** Mirrors the types in src-tauri/src/commands/characters.rs. */
export type Subclass = { name: string; shortName: string; source: string };
export type ClassLevel = { name: string; source: string; level: number; subclass?: Subclass };
/** `campaignId` is null for a character without a campaign. */
export type CharacterCard = { campaignId: string | null; archived: boolean; id: string; name: string; classes: ClassLevel[] };
export type CharacterList = { characters: CharacterCard[]; unreadable: string[] };

type Ref = { name: string; source: string };
export type Coin = "cp" | "sp" | "ep" | "gp" | "pp";
export type InventoryItem = {
  name: string;
  /** Set for items from the rules data; custom items have none. */
  source?: string;
  quantity: number;
  /** Per item, in pounds. */
  weight?: number;
  equipped?: boolean;
  /** The item needs attunement (from the rules data). */
  attunement?: boolean;
  attuned?: boolean;
  armor?: "light" | "medium" | "heavy" | "shield";
  ac?: number;
};

/**
 * A character file. Everything after `feats` is filled in on the sheet and may be missing in older files.
 * Fields this type doesn't name are kept as they are.
 */
export type Character = {
  id: string;
  createdAt?: number;
  name: string;
  player?: string;
  species?: Ref & { lineage?: string; subspecies?: Ref; size?: string };
  classes: ClassLevel[];
  background?: Ref;
  abilities?: { method?: string; base: Record<string, number>; bonuses?: Record<string, number> };
  skills?: string[];
  savingThrows?: string[];
  feats?: Ref[];
  hp?: { max: number; current?: number; temp?: number };
  deathSaves?: { successes: number; failures: number };
  hitDiceSpent?: number;
  /** Expended slots per spell level; index 0 is 1st level. */
  slotsUsed?: number[];
  pactSlotsUsed?: number;
  conditions?: Ref[];
  inventory?: InventoryItem[];
  coins?: Partial<Record<Coin, number>>;
  /** Replaces the computed armor class, e.g. for Unarmored Defense or magic armor. */
  acOverride?: number | null;
  notes?: string;
  [field: string]: unknown;
};

/** `archived`: the character's campaign is archived, so it can be read but not saved. */
export type CharacterFile = { archived: boolean; character: Character };

// All of these reject with a StorageError.
/** Every character: in every campaign (active and archived) and without a campaign, sorted by name. */
export function listCharacters(): Promise<CharacterList> {
  return invoke("list_characters");
}

/** Saves a new character in an active campaign, or without one (`campaign` null). The id is assigned by the backend. */
export function createCharacter(campaign: string | null, character: Record<string, unknown>): Promise<CharacterCard> {
  return invoke("create_character", { campaign, character });
}

/** One character, from an active or archived campaign (`campaign` set) or without one (null). */
export function getCharacter(campaign: string | null, id: string): Promise<CharacterFile> {
  return invoke("get_character", { campaign, id });
}

/** Replaces a character in an active campaign or without one. Its id and creation time stay as they were. */
export function saveCharacter(campaign: string | null, id: string, character: Character): Promise<CharacterCard> {
  return invoke("save_character", { campaign, id, character });
}

/** Copies a character into another active campaign under a new id. */
export function copyCharacter(fromCampaign: string | null, id: string, toCampaign: string): Promise<CharacterCard> {
  return invoke("copy_character", { fromCampaign, id, toCampaign });
}
