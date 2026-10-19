import { invoke } from "@tauri-apps/api/core";

/** Mirrors `AppSettings` in src-tauri/src/commands/settings.rs. */
export type Theme = "system" | "light" | "dark";
export type AppSettings = { theme: Theme };

// Both reject with a StorageError.
export function getSettings(): Promise<AppSettings> {
  return invoke("get_settings");
}

export function setSettings(settings: AppSettings): Promise<void> {
  return invoke("set_settings", { settings });
}
