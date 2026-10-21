import { listen } from "@tauri-apps/api/event";
import * as api from "$lib/api/rules";
import type { ImportProgress, RulesStatus } from "$lib/api/rules";
import { errorMessage } from "$lib/api/storage";
import { strings } from "$lib/strings";

/** Rules data status, shared by Settings and (later) the reader and search. */
export const rules = $state({
  status: null as RulesStatus | null, // null until loaded
  loadError: null as string | null,
  /** The import that's running, with its latest progress. */
  busy: null as ImportProgress | null,
});

let listening = false;
async function listenForProgress() {
  if (listening) return;
  listening = true;
  await listen<ImportProgress>("rules-import-progress", (event) => {
    if (rules.busy) rules.busy = event.payload;
  });
}

export async function refreshRules() {
  try {
    rules.status = await api.rulesStatus();
    rules.loadError = null;
  } catch (e) {
    rules.loadError = strings.settings.rules.loadError(errorMessage(e));
  }
}

/** A source's full name from the library, or its abbreviation when the library has none. */
export function sourceName(id: string): string {
  return rules.status?.library?.sources.find((s) => s.id.toLowerCase() === id.toLowerCase())?.name ?? id;
}

/** Runs one import/change and keeps the status in sync. Rejects with a StorageError for the caller to show. */
async function change(task: ImportProgress["task"] | null, action: () => Promise<RulesStatus>) {
  if (task) {
    await listenForProgress();
    rules.busy = { task, done: 0, total: 1 };
  }
  try {
    rules.status = await action();
  } finally {
    rules.busy = null;
  }
}

export const importRules = (path: string) => change("data", () => api.importRules(path));
export const importRuleImages = (path: string) => change("images", () => api.importRuleImages(path));
export const removeRuleImages = () => change(null, api.removeRuleImages);
export const removeRuleSources = (ids: string[]) => change(null, () => api.removeRuleSources(ids));
export const allowRuleSource = (id: string) => change(null, () => api.allowRuleSource(id));
