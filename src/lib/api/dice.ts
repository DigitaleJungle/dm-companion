import { invoke } from "@tauri-apps/api/core";

/** Mirrors `Roll` in src-tauri/src/dice.rs. */
export type Die = { faces: number; value: number; kept: boolean };
export type Roll = { notation: string; total: number; dice: Die[] };

/** Rolls dice notation like "4d6kh3" or "2d20kh1+4". Rejects with a StorageError for bad notation. */
export function rollDice(notation: string): Promise<Roll> {
  return invoke("roll_dice", { notation });
}
