import type { Character, ClassLevel } from "$lib/api/characters";
import type { PrereqContext } from "$lib/characters/choices";
import { byExtra, catalogRows, classSpells, type CatalogRow } from "$lib/api/rules";
import {
  complete,
  gainsOf,
  levelPlan,
  normalizePicks,
  prerequisite,
  rebuild,
  refKey,
  scoresWithLevels,
  spellMatches,
  subclassSpells,
  withLevel,
  type Entry,
  type LevelPicks,
  type LevelRecord,
  type Lookup,
  type Plan,
  type Ref,
} from "$lib/characters/levelup";

// The rules a class's levels need, loaded once per dialog, and the level-by-level bookkeeping both level dialogs share.

// Fields of feats and optional features that choices read (see entryChoices in $lib/characters/choices).
const CHOICE_KEYS = [
  "prerequisite",
  "repeatable",
  "ability",
  "skillProficiencies",
  "toolProficiencies",
  "languageProficiencies",
  "skillToolLanguageProficiencies",
  "savingThrowProficiencies",
  "expertise",
  "additionalSpells",
  "featProgression",
  "feats",
  "reprintedAs",
];

/** What any choice may pick from: feats, invocations and other optional features, spells, tools and languages. */
export type ChoiceData = {
  feats: CatalogRow[];
  optional: CatalogRow[];
  spells: CatalogRow[];
  /** Tools by kind: "tool" (all), "artisan", "instrument". */
  tools: CatalogRow[];
  languages: CatalogRow[];
  /** Lowercase class name → its spells ("fireball|xphb"); null when the rules data predates spell lists. */
  lists: Map<string, Set<string>> | null;
};

export type LevelData = ChoiceData & {
  cls: Entry;
  classFeatures: Entry[];
  subclasses: CatalogRow[];
  /** Every subclass's features for this class; filter by `subclassShortName` and `subclassSource`. */
  subclassFeatures: Entry[];
  /** Weapons with a mastery property. */
  items: CatalogRow[];
};

const TOOL_TYPES = ["AT", "INS", "GS", "T"];
const itemType = (r: CatalogRow) => String(r.data.type ?? "").split("|")[0];

/** Loads what choices pick from; `classSource` picks which printing of each class's spell list to use. */
export async function loadChoiceData(classSource: string, published: (source: string) => string): Promise<ChoiceData & { allItems: CatalogRow[] }> {
  const [feats, optional, spells, items, languages, classes] = await Promise.all([
    catalogRows("feat", ["category", ...CHOICE_KEYS]),
    catalogRows("optionalfeature", ["featureType", "entries", ...CHOICE_KEYS]),
    catalogRows("spell", ["level", "school", "meta"]),
    catalogRows("item", ["type", "mastery", "reprintedAs"]),
    catalogRows("language", ["type"]),
    catalogRows("class", ["isSidekick"]),
  ]);
  // One spell list per class name: the printing in the character's own book when there is one, else the newest.
  const pick = new Map<string, CatalogRow>();
  for (const row of classes.filter((r) => !r.data.isSidekick)) {
    const name = row.name.toLowerCase();
    const current = pick.get(name);
    if (!current || row.source === classSource || (current.source !== classSource && published(row.source) > published(current.source))) pick.set(name, row);
  }
  const lists = await Promise.all([...pick.values()].map(async (r) => [r.name.toLowerCase(), await classSpells(r.name, r.source, [])] as const));
  return {
    feats,
    optional,
    spells,
    tools: items.filter((i) => TOOL_TYPES.includes(itemType(i))),
    languages,
    allItems: items,
    lists: lists.some(([, l]) => l === null) ? null : new Map(lists.map(([name, l]) => [name, new Set((l ?? []).map(refKey))])),
  };
}

export async function loadLevelData(main: ClassLevel, clsData: Record<string, unknown>, published: (source: string) => string): Promise<LevelData> {
  const [classFeatures, subclasses, subclassFeatures, choices] = await Promise.all([
    byExtra("classFeature", `${main.name}|${main.source}|`),
    byExtra("subclass", `${main.name}|${main.source}`),
    byExtra("subclassFeature", `${main.name}|`),
    loadChoiceData(main.source, published),
  ]);
  const { allItems, ...rest } = choices;
  return {
    ...rest,
    cls: { name: main.name, source: main.source, data: clsData },
    classFeatures,
    subclasses,
    subclassFeatures,
    items: allItems.filter((i) => Array.isArray(i.data.mastery) && i.data.mastery.length > 0),
  };
}
export function lookup(data: ChoiceData & { items?: CatalogRow[] }): Lookup {
  const index = (rows: CatalogRow[]) => new Map(rows.map((r) => [refKey(r), r]));
  const feats = index(data.feats);
  const spells = index(data.spells);
  const optional = index(data.optional);
  const items = index(data.items ?? []);
  return {
    feat: (r) => feats.get(refKey(r)) ?? null,
    spell: (k) => spells.get(k) ?? null,
    optional: (k) => optional.get(k) ?? null,
    item: (k) => items.get(k) ?? null,
  };
}

const findSubclass = (data: LevelData, ref: Ref | null | undefined) => (ref ? (data.subclasses.find((s) => refKey(s) === refKey(ref)) ?? null) : null);

/** The subclass a level is built with: the one picked at it, else the latest one recorded before it, else the character's. */
export function subclassAt(c: Character, data: LevelData, level: number, picks: LevelPicks | null): CatalogRow | null {
  if (picks?.subclass) return findSubclass(data, picks.subclass);
  const recorded = (c.levels ?? []).filter((r) => r.level < level && r.gains?.subclass).sort((a, b) => b.level - a.level)[0]?.gains?.subclass;
  if (recorded) return findSubclass(data, recorded);
  // Only a subclass that no record set (from before levels had records) carries over this way.
  const anyRecorded = (c.levels ?? []).some((r) => r.gains?.subclass);
  return anyRecorded ? null : findSubclass(data, c.classes[0]?.subclass);
}

export function featuresOf(data: LevelData, subclass: CatalogRow | null): Entry[] {
  if (!subclass) return [];
  const short = String(subclass.data.shortName ?? subclass.name).toLowerCase();
  return data.subclassFeatures.filter(
    (f) => String(f.data.subclassShortName ?? "").toLowerCase() === short && String(f.data.subclassSource ?? "").toLowerCase() === subclass.source.toLowerCase(),
  );
}

export function planFor(data: LevelData, level: number, subclass: CatalogRow | null): Plan {
  return levelPlan({ level, cls: data.cls, subclass, classFeatures: data.classFeatures, subclassFeatures: featuresOf(data, subclass) });
}

/** The character as it was before a level: lower records only, used for prerequisites and what's already taken. */
export function stateBefore(c: Character, level: number, faces: number): Character {
  const main = c.classes[0];
  return rebuild({ ...c, classes: [{ ...main, level: Math.max(1, level - 1) }, ...c.classes.slice(1)], levels: (c.levels ?? []).filter((r) => r.level < level) }, level > 1 ? faces : 0);
}

/** The subclass's always-prepared spells first reached at this level. */
export function alwaysSpellsAt(data: LevelData, subclass: CatalogRow | null, level: number): Entry[] {
  const now = subclassSpells(subclass?.data ?? null, level);
  const before = new Set(subclassSpells(subclass?.data ?? null, level - 1).map(refKey));
  const spells = new Map(data.spells.map((s) => [refKey(s), s]));
  return now.filter((r) => !before.has(refKey(r))).flatMap((r) => spells.get(refKey(r)) ?? []);
}

/** Prerequisite context from a character state; `extraSpells` are spells picked in the same level (its cantrips). */
export function prereqContext(before: Character, level: number, data: ChoiceData, extraSpells: string[] = []): PrereqContext {
  const known = [...(before.spells ?? []).map(refKey), ...extraSpells];
  const find = lookup(data);
  return {
    level,
    scores: scoresWithLevels(before),
    feats: before.feats ?? [],
    optional: before.optionalFeatures ?? [],
    knowsSpell: (filter) => known.some((k) => {
      const spell = find.spell(k);
      return !!spell && spellMatches(spell, filter, data.lists ?? new Map());
    }),
  };
}

/** The record for a level from its picks, ready to save. */
export function recordFor(c: Character, data: LevelData, level: number, saved: LevelPicks): LevelRecord {
  const picks = normalizePicks(saved);
  const subclass = subclassAt(c, data, level, picks);
  const plan = planFor(data, level, subclass);
  return { class: data.cls.name, level, ...(level > 1 && picks.hp ? { hp: picks.hp } : {}), picks, gains: gainsOf(plan, picks, lookup(data), data.cls, alwaysSpellsAt(data, subclass, level)) };
}

/** A level's picks without what its plan no longer asks for, or what no longer meets its prerequisites. */
export function prune(plan: Plan, picks: LevelPicks, data: LevelData, before: Character): LevelPicks {
  const ids = new Set(plan.decisions.map((d) => d.id));
  const ctx = prereqContext(before, plan.level, data, picks.keys.cantrips ?? []);
  const find = lookup(data);
  const fits = (entry: { data: Record<string, unknown> } | null) => !entry || prerequisite(entry.data.prerequisite, ctx) !== "unmet";
  const feats = Object.fromEntries(Object.entries(picks.feats).filter(([id, p]) => ids.has(id) && fits(p.ref ? find.feat(p.ref) : null)));
  const choices = Object.fromEntries(
    Object.entries(picks.choices ?? {})
      .filter(([id]) => ids.has(id))
      .map(([id, slots]) => [id, slots.filter((s) => fits(s.ref ? find.optional(refKey(s.ref)) : null))]),
  );
  const keys = Object.fromEntries(Object.entries(picks.keys).filter(([id]) => ids.has(id)));
  return { ...picks, subclass: plan.decisions.some((d) => d.kind === "subclass") ? picks.subclass : null, feats, choices, keys };
}

/**
 * Saves one level's picks and goes through the later recorded levels: picks that no longer fit (another subclass's
 * features, an invocation whose pact is gone) are removed. Returns the character and the later levels left incomplete.
 */
export function saveLevel(c: Character, data: LevelData, level: number, picks: LevelPicks, faces: number): { character: Character; reopened: number[] } {
  let current = withLevel(c, recordFor(c, data, level, picks), faces);
  const reopened: number[] = [];
  for (const r of (current.levels ?? []).filter((x) => x.level > level && x.picks).sort((a, b) => a.level - b.level)) {
    const before = stateBefore(current, r.level, faces);
    const saved = normalizePicks(r.picks!);
    const plan = planFor(data, r.level, subclassAt(current, data, r.level, saved));
    const kept = prune(plan, saved, data, before);
    if (JSON.stringify(kept) !== JSON.stringify(saved) && !complete(plan, kept, lookup(data))) reopened.push(r.level);
    current = withLevel(current, recordFor(current, data, r.level, kept), faces);
  }
  return { character: current, reopened };
}

/** Whether a level still needs choices: an incomplete record, or no record while its plan asks something. */
export function levelNeedsChoice(c: Character, data: LevelData, level: number): boolean {
  const record = (c.levels ?? []).find((r) => r.level === level);
  const plan = planFor(data, level, subclassAt(c, data, level, record?.picks ?? null));
  if (!record?.picks) return plan.decisions.length > 0;
  return !complete(plan, normalizePicks(record.picks), lookup(data));
}
