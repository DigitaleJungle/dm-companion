// How a class feature, trait or feat is used, read from its rules text: as an action, bonus action or reaction; how
// often (a class table column, an ability modifier, the proficiency bonus, once or twice, or a pool per level); and
// whether a short or long rest gives those uses back. Plus the uses the sheet has spent, and what a rest restores.

import { ABILITY_NAMES } from "$lib/rules/format";
import { plainText } from "$lib/rules/tags";
import { modifier, type Ability, type Scores } from "./rules";
import { texts } from "./sheet";

type Data = Record<string, unknown>;
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

export type FeatureTime = "action" | "bonus" | "reaction";
/** How many uses: a fixed count, an ability modifier (at least 1), the proficiency bonus, or a pool of `perLevel` × level. */
export type Uses = { count: number } | { ability: Ability } | { proficiency: true } | { perLevel: number };
/**
 * `short`: a short rest gives back all uses, or one; `long`: a long rest gives back all. `freeCast`: a use casts a
 * spell without a spell slot; `spells` (lowercase) are the spells its text names, which a free cast is for.
 */
export type FeatureUse = { time: FeatureTime | null; short: "all" | "one" | null; long: boolean; uses: Uses | null; freeCast: boolean; spells: string[] };

const NUMBERS: Record<string, number> = { two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
const ABILITY_BY_NAME = Object.fromEntries(Object.entries(ABILITY_NAMES).map(([key, name]) => [name.toLowerCase(), key as Ability]));

/**
 * Reads a feature's text. A class table count (`tableCount`), when there is one, wins over what the text says.
 * shortcut: found by wording, like skill advantage; a structured field in the data would replace this.
 */
export function featureUse(entries: unknown, tableCount: number | null = null): FeatureUse {
  const raw = texts(entries);
  const text = raw.map(plainText).join(" ");
  const spells = [...new Set(raw.flatMap((s) => [...s.matchAll(/\{@spell ([^|}]+)/g)].map((m) => m[1].toLowerCase())))];
  const freeCast = /without (expending |using )?a spell slot/i.test(text);
  const sentences = text.split(/(?<=\.)\s+/);
  const time: FeatureTime | null = /\bBonus Action\b/.test(text)
    ? "bonus"
    : /\bReaction\b/.test(text)
      ? "reaction"
      : /\b(Magic action|as an action|take an action|use an action|the Attack action)\b/i.test(text)
        ? "action"
        : null;
  // A rest gives uses back when the sentence naming it says so (regain, replenish, again…).
  const restores = (rest: RegExp) => sentences.filter((s) => rest.test(s) && /\b(regain|replenish|again|recharge|expended)/i.test(s));
  // "a Short or Long Rest" names the short rest too.
  const shortSentences = restores(/\bShort (Rest|or Long Rest)\b/);
  const short = shortSentences.length ? (shortSentences.some((s) => /regain one (of (its|your|their) )?(expended )?use/i.test(s)) ? "one" : "all") : null;
  const long = short !== null || restores(/\bLong Rest\b/).length > 0;
  const recharges = short !== null || long;

  const pool = /pool[\s\S]*?equal to (\w+) times your \w+ level/i.exec(text);
  const ability = /equal to your (Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma) modifier/i.exec(text);
  const uses: Uses | null =
    tableCount !== null
      ? { count: tableCount }
      : pool && NUMBERS[pool[1].toLowerCase()]
        ? { perLevel: NUMBERS[pool[1].toLowerCase()] }
        : ability
          ? { ability: ABILITY_BY_NAME[ability[1].toLowerCase()] }
          : /equal to your Proficiency Bonus/i.test(text)
            ? { proficiency: true }
            : recharges && /\btwice\b/i.test(text)
              ? { count: 2 }
              : recharges && (freeCast || /\bonce\b/i.test(text))
                ? { count: 1 }
                : null;
  return { time, short, long, uses, freeCast, spells };
}

/** The number of uses for this character; an ability modifier counts at least once. */
export function usesMax(uses: Uses, scores: Scores | null, proficiency: number, level: number): number | null {
  if ("count" in uses) return uses.count;
  if ("perLevel" in uses) return uses.perLevel * level;
  if ("proficiency" in uses) return proficiency;
  return scores ? Math.max(1, modifier(scores[uses.ability])) : null;
}

/** A class table column for this feature ("Channel Divinity", "Rages" for Rage) at a class level, when it's a number. */
export function tableCount(cls: Data | null, feature: string, level: number): number | null {
  const name = feature.toLowerCase();
  for (const group of list(cls?.classTableGroups)) {
    const g = group as Data;
    const labels = list(g.colLabels).map((l) => plainText(String(l)).toLowerCase());
    const at = labels.findIndex((l) => l === name || l === `${name}s` || l.replace(/s$/, "") === name);
    if (at < 0) continue;
    const value = list(list(g.rows)[level - 1])[at];
    const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/**
 * A feat's name as the rules data has it: a background's feat is saved with its choice ("Magic Initiate (Wizard)"),
 * the data names it "Magic Initiate".
 */
export const baseFeatName = (name: string) => name.replace(/\s*\([^)]*\)$/, "");

/** Uses spent per feature, and how a short rest gives them back (a long rest gives back all). */
export type SpentUses = Record<string, { used: number; short?: "all" | "one" }>;

/** What's left spent after a rest: a long rest clears everything; a short rest clears "all", gives back one of "one". */
export function restUses(spent: SpentUses, rest: "short" | "long"): SpentUses {
  if (rest === "long") return {};
  return Object.fromEntries(
    Object.entries(spent).flatMap(([key, s]) => {
      const used = s.short === "all" ? 0 : s.short === "one" ? s.used - 1 : s.used;
      return used > 0 ? [[key, { ...s, used }]] : [];
    }),
  );
}

// ---- Structured data and what's filled in by hand ----------------------------------------------------------------

/** What the rules data says outright: the pool a feature spends (`consumes`), and free casts in `additionalSpells`. */
export type StructuredUse = { drawsFrom: string | null; freeCast: { count: number; short: boolean; spells: string[] } | null };

/**
 * `consumes: { name: "Channel Divinity" }` makes a feature spend that pool. `additionalSpells` with `daily` ("1": once
 * per long rest) or `rest` ("1": once per short rest) is a free cast of those spells (or, with a choice, its own).
 */
export function structuredUse(data: Data | null | undefined): StructuredUse {
  const consumes = (data?.consumes as Data | undefined)?.name;
  let freeCast = null as StructuredUse["freeCast"];
  for (const option of list(data?.additionalSpells)) {
    for (const kind of ["innate", "prepared", "known"]) {
      for (const atLevel of Object.values((option as Data)?.[kind] ?? {})) {
        for (const per of ["daily", "rest"] as const) {
          for (const [times, spells] of Object.entries(((atLevel as Data)?.[per] ?? {}) as Data)) {
            const names = list(spells).flatMap((s) => (typeof s === "string" ? [s.split("|")[0].split("#")[0].toLowerCase()] : []));
            freeCast = {
              count: Math.max(freeCast?.count ?? 0, Number.parseInt(times) || 1),
              short: (freeCast?.short ?? false) || per === "rest",
              spells: [...new Set([...(freeCast?.spells ?? []), ...names])],
            };
          }
        }
      }
    }
  }
  return { drawsFrom: typeof consumes === "string" ? consumes : null, freeCast };
}

/** A feature's usage with everything resolved: what's filled in by hand, then the rules data, then its text. */
export type ResolvedUse = FeatureUse & { drawsFrom: string | null; range: string | null; damage: string | null; save: Ability | null; table: string | null };

/** Filled in by hand (see FeatureUsage in $lib/api/featureUsage); every field optional. */
export type ManualUse = {
  usage?: "none" | "uses" | "pool" | "spell";
  count?: { fixed?: number; ability?: string; proficiency?: boolean; perLevel?: number; table?: string };
  spell?: string;
  short?: "all" | "one" | "none";
  long?: boolean;
  time?: "action" | "bonus" | "reaction" | "none";
  range?: string;
  damage?: string;
  save?: string;
  drawsFrom?: string;
};

export function resolveUse(detected: FeatureUse, structured: StructuredUse, manual: ManualUse | undefined): ResolvedUse {
  const m = manual ?? {};
  // The data's free cast wins over the text's guess.
  const base: FeatureUse = structured.freeCast
    ? { ...detected, freeCast: true, uses: { count: structured.freeCast.count }, short: structured.freeCast.short ? "all" : null, long: true, spells: structured.freeCast.spells.length ? structured.freeCast.spells : detected.spells }
    : detected;
  const count = m.count;
  const uses: Uses | null =
    m.usage === "none"
      ? null
      : count?.fixed !== undefined
        ? { count: count.fixed }
        : count?.ability
          ? { ability: count.ability as Ability }
          : count?.proficiency
            ? { proficiency: true }
            : count?.perLevel !== undefined
              ? { perLevel: count.perLevel }
              : base.uses;
  return {
    time: m.time === "none" ? null : (m.time ?? base.time),
    short: m.short === "none" ? null : (m.short ?? base.short),
    long: m.long ?? base.long,
    uses,
    freeCast: m.usage ? m.usage === "spell" : base.freeCast,
    spells: m.spell ? [m.spell.toLowerCase()] : base.spells,
    drawsFrom: m.drawsFrom ?? structured.drawsFrom,
    range: m.range ?? null,
    damage: m.damage ?? null,
    save: (m.save as Ability | undefined) ?? null,
    table: count?.table ?? null,
  };
}

/**
 * Features a feature's text refers to as their own entries ("Divine Sense" inside Channel Divinity, "Sacred Weapon"
 * inside Oath of Devotion), in order. A choice between them (an `options` block, like Divine Order's) is left out:
 * only the picked one applies, and that comes with the feature's choice.
 */
export function nestedFeatures(entries: unknown): { kind: "classFeature" | "subclassFeature"; ref: string }[] {
  const found: { kind: "classFeature" | "subclassFeature"; ref: string }[] = [];
  const walk = (value: unknown): void => {
    if (Array.isArray(value)) return value.forEach(walk);
    const e = value as Data | null;
    if (!e || typeof e !== "object" || e.type === "options") return;
    if (e.type === "refClassFeature" && typeof e.classFeature === "string") found.push({ kind: "classFeature", ref: e.classFeature });
    else if (e.type === "refSubclassFeature" && typeof e.subclassFeature === "string") found.push({ kind: "subclassFeature", ref: e.subclassFeature });
    walk(e.entries);
  };
  walk(entries);
  return found;
}

/**
 * Whether a feature gives the character Heroic Inspiration on a long rest ("You gain Heroic Inspiration whenever you
 * finish a Long Rest": the Human's Resourceful). Giving it to others, like Musician, doesn't count.
 */
export function inspirationOnLongRest(entries: unknown): boolean {
  return /\byou gain Heroic Inspiration\b[^.]*\bLong Rest\b/i.test(texts(entries).map(plainText).join(" "));
}

/** The standard actions a feature's text names ({@action Dash}): Cunning Action lets you Dash, Disengage or Hide. */
export function actionsIn(entries: unknown): string[] {
  return [...new Set(texts(entries).flatMap((s) => [...s.matchAll(/\{@action ([^|}]+)/g)].map((m) => m[1])))];
}

/** What a feature adds to the Hit Point maximum: so much per character level, and a flat amount. */
export type HpBonus = { perLevel: number; flat: number };

/**
 * Reads "Your Hit Point maximum increases by …": by 1 now and 1 again with every level (Dwarven Toughness, the Hill
 * Dwarf), by twice the level (Tough), by 3 and then 1 per class level (Draconic Resilience, taken at 3: one per level),
 * or a flat amount (Boon of Fortitude's 40).
 * shortcut: found by wording, like the rest; a structured field in the data would replace this.
 */
export function hpBonusIn(entries: unknown): HpBonus {
  const sentences = texts(entries).map(plainText).join(" ").split(/(?<=\.)\s+/);
  let perLevel = 0;
  let flat = 0;
  sentences.forEach((s, i) => {
    if (!/\bHit Point maximum increases\b/i.test(s)) return;
    const next = sentences[i + 1] ?? "";
    if (/\btwice your (character )?level\b/i.test(s)) perLevel += 2;
    else {
      const again = /\bincreases by (\d+)\b[^.]*\bincreases by (\d+)\b[^.]*\b(again|whenever|every time)\b/i.exec(s);
      if (again) perLevel += Number(again[2]);
      else {
        const by = /\bincreases by (\d+)\b/i.exec(s);
        // A one-off amount, unless the next sentence makes it grow with levels (Tough's is counted above).
        if (by && !/\bwhenever you gain\b/i.test(next)) flat += Number(by[1]);
      }
    }
  });
  return { perLevel, flat };
}
