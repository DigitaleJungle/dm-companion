import { invoke } from "@tauri-apps/api/core";

/** Mirrors `AppSettings` in src-tauri/src/commands/settings.rs. */
export type Theme = "system" | "light" | "dark";
export type Animations = "system" | "on" | "off";
export type AppSettings = {
  theme: Theme;
  animations: Animations;
  /** GitHub `owner/repo` whose latest release is compared with the imported rules data. */
  rulesUpdateRepo: string | null;
  /** Sources unticked in the Library Catalog's book list. */
  catalogHiddenSources: string[];
};

// Both reject with a StorageError.
export function getSettings(): Promise<AppSettings> {
  return invoke("get_settings");
}

/** Saves only the given fields and returns the full, saved settings. */
export function setSettings(changes: Partial<AppSettings>): Promise<AppSettings> {
  return invoke("set_settings", { settings: changes });
}
