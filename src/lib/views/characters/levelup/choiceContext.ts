import type { Character } from "$lib/api/characters";
import type { CatalogRow } from "$lib/api/rules";
import { prerequisite, refKey, spellMatches, type PrereqContext, type SpellFilter } from "$lib/characters/choices";
import { spellSources } from "$lib/characters/levelup";
import { inSources } from "$lib/characters/rules";
import { ordinal } from "$lib/rules/catalog";
import { titleCase } from "$lib/rules/format";
import { strings } from "$lib/strings";
import { versionGroups } from "../create/cards";
import type { Candidate, ChoiceContext } from "./ChoicePicker.svelte";
import type { PickItem } from "./PickList.svelte";
import { lookup, type ChoiceData } from "./levelData";

// What pickers offer, from the loaded rules and the character as it is before the choice: spells (known ones ticked and greyed),
// feats not taken (unless repeatable) whose prerequisites are met, skills, tools and languages.

const itemType = (r: CatalogRow) => String(r.data.type ?? "").split("|")[0];

export type ContextInput = {
  data: ChoiceData;
  before: Character;
  prereq: PrereqContext;
  sources: string[] | null;
  published: (source: string) => string;
  skills: { key: string; name: string }[];
  /** Spells picked elsewhere in the same step (a level's cantrips), which a target may be. */
  alsoKnown?: string[];
  /** Always-prepared spells this step adds (a level's class and subclass spells): shown as had, with `note`. */
  always?: { key: string; note: string }[];
  /** Spells later levels picked (an earlier level changed under Edit → Levels): only labelled with that level, still pickable. */
  later?: { key: string; note: string }[];
};

/** Rows newest-first per reprint group, allowed by the campaign's books. */
function newest(rows: CatalogRow[], input: ContextInput) {
  return versionGroups(rows, (s) => inSources(s, input.sources), input.published).map((g) => g.main);
}

/** Candidates whose prerequisites aren't unmet, "check" marked, sorted by name (with an optional first one). */
export function candidatesOf(rows: CatalogRow[], input: ContextInput, first?: (r: CatalogRow) => boolean): Candidate[] {
  return newest(rows, input)
    .map((row) => ({ row, prereq: prerequisite(row.data.prerequisite, input.prereq) }))
    .filter((x) => x.prereq !== "unmet")
    .sort((a, b) => Number(first?.(b.row) ?? 0) - Number(first?.(a.row) ?? 0) || a.row.name.localeCompare(b.row.name))
    .map((x) => ({ row: x.row, check: x.prereq === "check" }));
}

/** Feats of these categories the character can take: not taken yet unless repeatable. */
export function featCandidates(categories: string[], input: ContextInput, first?: (r: CatalogRow) => boolean): Candidate[] {
  const taken = new Set((input.before.feats ?? []).map((f) => f.name.toLowerCase()));
  const rows = input.data.feats.filter(
    (r) => categories.includes(String(r.data.category ?? "")) && (!taken.has(r.name.toLowerCase()) || input.data.repeatable.has(refKey(r))),
  );
  return candidatesOf(rows, input, first);
}

export function choiceContext(input: ContextInput): ChoiceContext {
  const t = strings.characters.levelUpDialog;
  const { data, before } = input;
  const allowed = (r: CatalogRow) => inSources(r.source, input.sources);
  const known = new Set((before.spells ?? []).map(refKey));
  const plain = new Intl.NumberFormat();
  // Every place a spell came from: the character's own, then this step's.
  const sources = spellSources(before, (cls, level) => t.classLevel(cls, plain.format(level)));
  for (const a of input.always ?? []) sources.set(a.key, [...(sources.get(a.key) ?? []), a.note]);
  // A spell had already can't be picked again and says where it came from; had from two places, it gets a (!).
  const later = new Map<string, string[]>();
  for (const a of input.later ?? []) later.set(a.key, [...(later.get(a.key) ?? []), a.note]);
  const marked = (item: PickItem): PickItem => {
    const at = sources.get(item.key) ?? [];
    const then = later.get(item.key) ?? [];
    return {
      ...item,
      ...(at.length ? { taken: true, note: at[0] } : then.length ? { note: then.join(", ") } : {}),
      ...(at.length + then.length > 1 && at.length ? { alert: t.preparedTwice([...at, ...then].join(", ")) } : {}),
    };
  };
  const lists = data.lists ?? new Map<string, Set<string>>();
  const byName = (rows: CatalogRow[], kind: string): PickItem[] =>
    [...new Map(rows.filter(allowed).map((r) => [r.name.toLowerCase(), { key: `${kind}:${r.name.toLowerCase()}`, name: r.name }])).values()].sort((a, b) =>
      a.name.localeCompare(b.name),
    );
  const pools: Record<string, () => PickItem[]> = {
    skill: () => input.skills.map((s) => ({ key: `skill:${s.key}`, name: s.name })),
    tool: () => byName(data.tools, "tool"),
    artisan: () => byName(data.tools.filter((r) => itemType(r) === "AT"), "tool"),
    instrument: () => byName(data.tools.filter((r) => itemType(r) === "INS"), "tool"),
    language: () => byName(data.languages, "language"),
    standard: () => byName(data.languages.filter((r) => String(r.data.type ?? "standard") === "standard"), "language"),
  };
  // Cast as an action, bonus action or reaction (A, BA, R); longer casting times get no tag.
  const castTag = (r: CatalogRow) => {
    const unit = String((r.data.time as { unit?: string }[] | undefined)?.[0]?.unit ?? "");
    return unit in t.cast ? { tag: t.cast[unit as keyof typeof t.cast] } : {};
  };
  const spellItem = (r: CatalogRow): PickItem => ({
    key: refKey(r),
    name: r.name,
    ...castTag(r),
    group: Number(r.data.level) === 0 ? t.cantrips : t.spellLevel(ordinal(Number(r.data.level))),
    preview: { kind: "spell", name: r.name, source: r.source },
  });
  const byLevel = (a: CatalogRow, b: CatalogRow) => Number(a.data.level) - Number(b.data.level) || a.name.localeCompare(b.name);
  const matching = (filter: SpellFilter) => data.spells.filter((r) => allowed(r) && spellMatches(r, filter, lists)).sort(byLevel);
  const knownKeys = new Set([...known, ...(input.alsoKnown ?? [])]);

  return {
    find: lookup(data),
    poolItems: (pool) => pools[pool]?.() ?? [],
    namedItem: (key) => ({ key, name: titleCase(key.slice(key.indexOf(":") + 1)) }),
    proficient: before.skills ?? [],
    expertise: before.expertise ?? [],
    spellItems: (filter) => matching(filter).map(spellItem).map(marked),
    targetItems: (filter) => matching(filter).filter((r) => knownKeys.has(refKey(r))).map(spellItem),
    featCandidates: (categories) => featCandidates(categories, input),
  };
}
