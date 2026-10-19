import { invoke } from "@tauri-apps/api/core";

/** Mirrors `AppSettings` in src-tauri/src/commands/settings.rs. */
export type Theme = "system" | "light" | "dark";
export type AppSettings = {
  theme: Theme;
  /** GitHub `owner/repo` whose latest release is compared with the imported rules data. */
  rulesUpdateRepo: string | null;
};

// Both reject with a StorageError.
export function getSettings(): Promise<AppSettings> {
  return invoke("get_settings");
}

/** Saves only the given fields and returns the full, saved settings. */
export function setSettings(changes: Partial<AppSettings>): Promise<AppSettings> {
  return invoke("set_settings", { settings: changes });
}
