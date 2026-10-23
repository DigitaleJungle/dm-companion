import * as api from "$lib/api/featureUsage";
import type { FeatureUsage, FeatureUsageMap } from "$lib/api/featureUsage";
import { errorMessage } from "$lib/api/storage";

/** The usage filled in by hand for features (app-wide), loaded once; the character sheet and preview cards read it. */
export const featureUsage = $state({
  map: {} as FeatureUsageMap,
  loaded: false,
  loadError: null as string | null,
});

let loading: Promise<void> | null = null;

export function loadFeatureUsage(): Promise<void> {
  loading ??= api
    .getFeatureUsage()
    .then((map) => {
      featureUsage.map = map;
      featureUsage.loaded = true;
      featureUsage.loadError = null;
    })
    .catch((e) => {
      featureUsage.loadError = errorMessage(e);
      loading = null; // try again next time
    });
  return loading;
}

/** Saves one feature's usage; the map is replaced by what was saved. Rejects with a StorageError (shown by the caller). */
export async function saveFeatureUsage(key: string, usage: FeatureUsage | null) {
  featureUsage.map = await api.setFeatureUsage(key, usage);
}
