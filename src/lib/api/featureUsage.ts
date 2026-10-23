import { invoke } from "@tauri-apps/api/core";

/** How many uses: exactly one of these is set. */
export type UsageCount = { fixed?: number; ability?: string; proficiency?: boolean; perLevel?: number; table?: string };

/**
 * How a feature, trait or feat is used, filled in by hand in its preview card (see feature_usage.rs). Every field is
 * optional: what's left out comes from the rules data or its text.
 */
export type FeatureUsage = {
  usage?: "none" | "uses" | "pool" | "spell";
  count?: UsageCount;
  /** The spell a free cast ("spell" usage) is for. */
  spell?: string;
  short?: "all" | "one" | "none";
  long?: boolean;
  time?: "action" | "bonus" | "reaction" | "none";
  range?: string;
  damage?: string;
  save?: string;
  /** Another feature, by name, whose uses this one spends (Turn Undead: Channel Divinity). */
  drawsFrom?: string;
};

/** Keyed "kind:name|source", plus "|class" or "|class|subclass" for a class or subclass feature; lowercase. */
export type FeatureUsageMap = Record<string, FeatureUsage>;

/**
 * A feature's key. Class and subclass features add their class (and subclass), since several share a name:
 * the Cleric's and the Paladin's Channel Divinity are different features.
 */
export function usageKey(ref: { kind: string; name: string; source?: string }, data?: Record<string, unknown>): string {
  const of = [data?.className, data?.subclassShortName].filter((x): x is string => typeof x === "string");
  return [`${ref.kind}:${ref.name}`, ref.source ?? "", ...of].join("|").toLowerCase();
}

/** Everything filled in so far (empty when nothing is). Rejects with a StorageError. */
export function getFeatureUsage(): Promise<FeatureUsageMap> {
  return invoke("get_feature_usage");
}

/** Sets one feature's usage (null or empty removes it); resolves to the whole map. */
export function setFeatureUsage(key: string, usage: FeatureUsage | null): Promise<FeatureUsageMap> {
  return invoke("set_feature_usage", { key, usage });
}
