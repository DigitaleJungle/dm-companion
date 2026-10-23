import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import type { Gains, LevelRecord, SavedChoice } from "$lib/characters/levelup";
import type { Weapon } from "$lib/characters/sheet";

/** Mirrors the types in src-tauri/src/commands/characters.rs. */
export type Subclass = { name: string; shortName: string; source: string };
export type ClassLevel = { name: string; source: string; level: number; subclass?: Subclass };
/** `campaignId` is null for a character without a campaign. */
/** `avatar`: the character's own picture as a `data:image/…` URL, when it has one. */
export type CharacterCard = { campaignId: string | null; archived: boolean; id: string; name: string; classes: ClassLevel[]; avatar?: string };
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
  weapon?: Weapon;
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
  /** The character's own picture, downsized, as a `data:image/…` URL. */
  avatar?: string;
  species?: Ref & { lineage?: string; subspecies?: Ref; size?: string };
  classes: ClassLevel[];
  background?: Ref;
  /** `bonuses`: from species and background; `levelBonuses`: from feats taken at levels (rebuilt from `levels`). */
  abilities?: { method?: string; base: Record<string, number>; bonuses?: Record<string, number>; levelBonuses?: Record<string, number> };
  skills?: string[];
  savingThrows?: string[];
  /**
   * Below, items with `gained` (the class level they came from) are rebuilt from `levels`; `origin` names where an
   * item came from when it isn't the background or the class itself, e.g. "Fighter 4" or "Magic Initiate".
   */
  feats?: (Ref & { origin?: string; gained?: number })[];
  hp?: { max: number; current?: number; temp?: number };
  /** One record per class level: its hit points and what was picked (see `src/lib/characters/levelup.ts`). */
  levels?: LevelRecord[];
  /** `prepared` for class spells; `always`: always prepared (from a subclass). */
  /** `atLevel`: the character level from which it applies (species spells). */
  spells?: (Ref & { origin: string; level?: number; atLevel?: number; prepared?: boolean; always?: boolean; gained?: number })[];
  /** Invocations, maneuvers, metamagic…; `type` is the feature type codes ("EI"). */
  optionalFeatures?: (Ref & { origin: string; type: string[]; target?: string; gained?: number })[];
  /** A pick in a feature with options, like Divine Order: Protector. */
  featureChoices?: (Ref & { feature: string; gained?: number })[];
  /** Skill keys with expertise. */
  expertise?: string[];
  weaponMasteries?: (Ref & { gained?: number })[];
  /** What levels and origin choices added to `skills`, `expertise` and `savingThrows`, so a rebuild can take them off again. */
  levelSkills?: string[];
  levelExpertise?: string[];
  levelSaves?: string[];
  /** Tool and language proficiencies picked through choices (rebuilt from `origin` and `levels`). */
  tools?: string[];
  languages?: string[];
  /** The species and background sub-choices and the languages picked in the wizard, with what they resolved to. */
  origin?: { species?: SavedChoice; background?: SavedChoice; backgroundFeat?: SavedChoice; languages?: string[]; extraLanguages?: string[]; gains?: Gains };
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
  inspiration?: boolean;
  concentrating?: boolean;
  personality?: string;
  ideals?: string;
  bonds?: string;
  flaws?: string;
  /** The backstory. */
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

/** Permanently deletes a character in an active campaign or without one. */
export function deleteCharacter(campaign: string | null, id: string): Promise<void> {
  return invoke("delete_character", { campaign, id });
}

/** Copies a character into another active campaign under a new id. */
export function copyCharacter(fromCampaign: string | null, id: string, toCampaign: string): Promise<CharacterCard> {
  return invoke("copy_character", { fromCampaign, id, toCampaign });
}

/** A URL for the character's original picture, or null when only the small copy in the file exists. */
export async function characterAvatar(campaign: string | null, id: string): Promise<string | null> {
  const path = await invoke<string | null>("character_avatar", { campaign, id });
  return path ? convertFileSrc(path) : null;
}

/** Keeps the original of a picked picture beside the character's file (sent as raw bytes; pictures are too big for JSON). */
export async function saveCharacterAvatar(campaign: string | null, id: string, file: File): Promise<void> {
  const ext = (file.name.split(".").pop() ?? "").toLowerCase() || file.type.split("/")[1] || "png";
  await invoke("save_character_avatar", new Uint8Array(await file.arrayBuffer()), { headers: { campaign: campaign ?? "", id, ext } });
}

export function removeCharacterAvatar(campaign: string | null, id: string): Promise<void> {
  return invoke("remove_character_avatar", { campaign, id });
}
