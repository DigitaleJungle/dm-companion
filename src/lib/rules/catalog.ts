// What the Library Catalog shows per category: its tab, the fields it loads, its columns and its filters.

import type { CatalogRow } from "$lib/api/rules";
import { strings } from "$lib/strings";
import { ABILITY_NAMES, ITEM_TYPES, SCHOOLS, SIZES, capital, castingTime, creatureTypeName, prerequisite, spellRange } from "./format";
import { plainText } from "./tags";

/** Raw 5etools fields: loosely typed on purpose, shapes vary between books. */
type Data = Record<string, any>;
type Row = CatalogRow & { data: Data };

export type Column = {
  id: string;
  label: string;
  value: (row: Row) => string;
  /** What the column sorts by; defaults to its text. */
  sort?: (row: Row) => number | string;
  numeric?: boolean;
};
export type FilterOption = { label: string; match: (row: Row) => boolean };
export type Filter = {
  id: string;
  label: string;
  options?: FilterOption[];
  /** Options built from the loaded rows (e.g. the classes that have subclasses). */
  optionsFrom?: (rows: Row[]) => FilterOption[];
};
export type Category = { kind: string; keys: string[]; columns: Column[]; filters: Filter[] };

const c = strings.library.columns;
const v = strings.library.values;
const none = v.none;

export const TABS: { id: string; kinds: string[] }[] = [
  { id: "all", kinds: [] },
  { id: "rules", kinds: ["variantrule", "action"] },
  { id: "player", kinds: ["spell", "class", "subclass", "species", "background", "feat", "optionalfeature"] },
  { id: "reference", kinds: ["item", "itemProperty", "itemMastery", "condition", "disease", "language", "skill", "sense"] },
  { id: "dm", kinds: ["creature", "hazard", "trap"] },
];

// ---- Value helpers (exported for tests) ---------------------------------------------------------

export function ordinal(n: number): string {
  const suffix = n % 100 >= 11 && n % 100 <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th";
  return `${n}${suffix}`;
}

export const spellLevelText = (d: Data) => (d.level === 0 ? v.cantrip : ordinal(d.level ?? 0));
export const isConcentration = (d: Data) => (d.duration ?? []).some((x: Data) => x?.concentration);
export const isRitual = (d: Data) => !!d.meta?.ritual;

/** Challenge rating as a number for sorting and ranges ("1/4" → 0.25). */
export function crValue(d: Data): number {
  const cr = typeof d.cr === "string" ? d.cr : d.cr?.cr;
  if (!cr) return -1;
  if (cr.includes("/")) {
    const [a, b] = cr.split("/").map(Number);
    return a / b;
  }
  return Number(cr);
}
const crText = (d: Data) => (typeof d.cr === "string" ? d.cr : (d.cr?.cr ?? none));
const firstAc = (d: Data) => {
  const ac = d.ac?.[0];
  return typeof ac === "number" ? ac : (ac?.ac ?? NaN);
};

const RARITIES = ["none", "common", "uncommon", "rare", "very rare", "legendary", "artifact", "varies", "unknown"];
export const rarityRank = (d: Data) => {
  const i = RARITIES.indexOf(String(d.rarity ?? "none").toLowerCase());
  return i === -1 ? RARITIES.length : i;
};
const typeCode = (d: Data) => (typeof d.type === "string" ? d.type.split("|")[0] : "");

/** Broad item group used by the Category filter. */
export function itemGroup(d: Data): string {
  const code = typeCode(d);
  if (d.wondrous) return "Wondrous item";
  if (["M", "R", "A", "AF"].includes(code)) return "Weapon";
  if (["LA", "MA", "HA", "S"].includes(code)) return "Armor";
  const named: Record<string, string> = { P: "Potion", SC: "Scroll", RG: "Ring", RD: "Rod", WD: "Wand", ST: "Staff" };
  if (named[code]) return named[code];
  return code ? "Gear" : "Other";
}

/** Coin value in copper pieces → "15 gp", "5 sp", "2 cp". */
export function coins(cp: unknown): string {
  if (typeof cp !== "number") return none;
  if (cp >= 100 && cp % 100 === 0) return `${new Intl.NumberFormat().format(cp / 100)} gp`;
  if (cp >= 10 && cp % 10 === 0) return `${cp / 10} sp`;
  return `${cp} cp`;
}

const FEAT_CATEGORIES: Record<string, string> = {
  O: "Origin", G: "General", FS: "Fighting Style", "FS:P": "Fighting Style (Paladin)", "FS:R": "Fighting Style (Ranger)", EB: "Epic Boon", D: "Dragonmark", DG: "Dark Gift",
};
const FEATURE_TYPES: Record<string, string> = {
  EI: "Eldritch Invocation", MM: "Metamagic", "MV:B": "Maneuver", AI: "Artificer Infusion", AS: "Arcane Shot", ED: "Elemental Discipline",
  "FS:F": "Fighting Style (Fighter)", "FS:R": "Fighting Style (Ranger)", "FS:P": "Fighting Style (Paladin)", "FS:B": "Fighting Style (Bard)",
  PB: "Pact Boon", RN: "Rune", RP: "Replicate Magic Item", OTH: "Other",
};
const RULE_TYPES: Record<string, string> = { C: "Core", O: "Optional", V: "Variant", VO: "Variant (optional)" };
const TRAP_TYPES: Record<string, string> = {
  MECH: "Mechanical trap", MAG: "Magic trap", SMPL: "Simple trap", CMPX: "Complex trap", TRP: "Trap", HAUNT: "Haunt",
  WLD: "Wilderness hazard", WTH: "Weather", ENV: "Environmental hazard", EST: "Eldritch storm", GEN: "Hazard",
};

const abilityList = (keys: string[]) => keys.map((k) => (ABILITY_NAMES[k] ?? k).slice(0, 3)).join(", ");

/** Background ability scores: the choice list or the fixed ones. */
export function backgroundAbilities(d: Data): string {
  const first = d.ability?.[0];
  if (!first) return none;
  const from = first.choose?.weighted?.from ?? first.choose?.from;
  return from ? abilityList(from) : abilityList(Object.keys(first).filter((k) => k in ABILITY_NAMES));
}
const trueKeys = (o: Data | undefined) => (o ? Object.entries(o).filter(([, val]) => val === true).map(([k]) => capital(k)) : []);
function backgroundSkills(d: Data): string {
  const first = d.skillProficiencies?.[0];
  if (!first) return none;
  const fixed = trueKeys(first);
  if (first.choose) fixed.push(`choose ${first.choose.count ?? 1}`);
  return fixed.join(", ") || none;
}
/** "magic initiate; cleric|xphb" → "Magic Initiate (Cleric)". */
export function featName(key: string): string {
  const [name, variant] = key.split("|")[0].split(";").map((s) => s.trim());
  const title = (s: string) => s.replace(/\b\w/g, (ch) => ch.toUpperCase());
  return variant ? `${title(name)} (${title(variant)})` : title(name);
}
const speedText = (d: Data) => {
  const s = typeof d.speed === "number" ? d.speed : d.speed?.walk;
  return typeof s === "number" ? `${s} ft.` : none;
};

// ---- Building blocks ----------------------------------------------------------------------------

const optionsFromValues = (value: (row: Row) => string) => (rows: Row[]): FilterOption[] =>
  [...new Set(rows.map(value).filter((x) => x && x !== none))].sort().map((label) => ({ label, match: (row) => value(row) === label }));

const valueFilter = (id: string, label: string, value: (row: Row) => string): Filter => ({ id, label, optionsFrom: optionsFromValues(value) });

// ---- Categories ---------------------------------------------------------------------------------

const CATEGORIES: Category[] = [
  {
    kind: "spell",
    keys: ["level", "school", "time", "range", "components", "duration", "meta"],
    columns: [
      { id: "level", label: c.level, value: (r) => spellLevelText(r.data), sort: (r) => r.data.level ?? 0, numeric: true },
      { id: "school", label: c.school, value: (r) => SCHOOLS[r.data.school] ?? r.data.school ?? none },
      { id: "castTime", label: c.castTime, value: (r) => castingTime({ time: (r.data.time ?? []).map((t: Data) => ({ ...t, condition: undefined })) }) || none },
      { id: "range", label: c.range, value: (r) => spellRange(r.data) || none },
      {
        id: "components",
        label: c.components,
        value: (r) => ["v", "s", "m", "r"].filter((k) => r.data.components?.[k]).map((k) => k.toUpperCase()).join(", ") || none,
      },
      { id: "tags", label: c.tags, value: (r) => [isConcentration(r.data) && v.concentration, isRitual(r.data) && v.ritual].filter(Boolean).join(", ") },
    ],
    filters: [
      {
        id: "level",
        label: c.level,
        options: Array.from({ length: 10 }, (_, n) => ({ label: n === 0 ? "C" : `${n}`, match: (r: Row) => r.data.level === n })),
      },
      {
        id: "school",
        label: c.school,
        options: ["A", "C", "D", "E", "V", "I", "N", "T"].map((code) => ({ label: SCHOOLS[code].slice(0, 3), match: (r: Row) => r.data.school === code })),
      },
      {
        id: "other",
        label: c.other,
        options: [
          { label: v.conc, match: (r) => isConcentration(r.data) },
          { label: v.ritual, match: (r) => isRitual(r.data) },
        ],
      },
    ],
  },
  {
    kind: "creature",
    keys: ["cr", "type", "size", "ac", "hp"],
    columns: [
      { id: "cr", label: c.cr, value: (r) => crText(r.data), sort: (r) => crValue(r.data), numeric: true },
      { id: "type", label: c.type, value: (r) => creatureTypeName(r.data) || none },
      { id: "size", label: c.size, value: (r) => (r.data.size ?? []).map((s: string) => SIZES[s] ?? s).join(" or ") || none, sort: (r) => "TSMLHG".indexOf(r.data.size?.[0] ?? "") },
      { id: "ac", label: c.ac, value: (r) => (Number.isNaN(firstAc(r.data)) ? none : `${firstAc(r.data)}`), sort: (r) => firstAc(r.data) || 0, numeric: true },
      { id: "hp", label: c.hp, value: (r) => (r.data.hp?.average !== undefined ? `${r.data.hp.average}` : none), sort: (r) => r.data.hp?.average ?? 0, numeric: true },
    ],
    filters: [
      {
        id: "cr",
        label: c.cr,
        options: [
          { label: "0–½", match: (r) => crValue(r.data) >= 0 && crValue(r.data) < 1 },
          { label: "1–4", match: (r) => crValue(r.data) >= 1 && crValue(r.data) <= 4 },
          { label: "5–10", match: (r) => crValue(r.data) >= 5 && crValue(r.data) <= 10 },
          { label: "11–16", match: (r) => crValue(r.data) >= 11 && crValue(r.data) <= 16 },
          { label: "17+", match: (r) => crValue(r.data) >= 17 },
        ],
      },
      {
        id: "type",
        label: c.type,
        // A creature with a choice of types (Celestial or Fiend) matches each of them.
        optionsFrom: (rows) =>
          [...new Set(rows.flatMap((r) => creatureTypeName(r.data).split(" or ")).filter(Boolean))]
            .sort()
            .map((label) => ({ label, match: (r: Row) => creatureTypeName(r.data).split(" or ").includes(label) })),
      },
      { id: "size", label: c.size, options: "TSMLHG".split("").map((s) => ({ label: SIZES[s], match: (r: Row) => (r.data.size ?? []).includes(s) })) },
    ],
  },
  {
    kind: "item",
    keys: ["type", "rarity", "reqAttune", "wondrous", "weight", "value"],
    columns: [
      { id: "type", label: c.type, value: (r) => (r.data.wondrous ? "Wondrous item" : (ITEM_TYPES[typeCode(r.data)] ?? (typeCode(r.data) || none))) },
      { id: "rarity", label: c.rarity, value: (r) => (r.data.rarity && r.data.rarity !== "none" ? capital(String(r.data.rarity)) : none), sort: (r) => rarityRank(r.data) },
      { id: "attunement", label: c.attunement, value: (r) => (r.data.reqAttune ? v.yes : none) },
      { id: "weight", label: c.weight, value: (r) => (typeof r.data.weight === "number" ? `${r.data.weight} lb.` : none), sort: (r) => r.data.weight ?? 0, numeric: true },
      { id: "value", label: c.value, value: (r) => coins(r.data.value), sort: (r) => r.data.value ?? 0, numeric: true },
    ],
    filters: [
      valueFilter("group", c.category, (r) => itemGroup(r.data)),
      {
        id: "rarity",
        label: c.rarity,
        options: ["common", "uncommon", "rare", "very rare", "legendary", "artifact"].map((rarity) => ({
          label: capital(rarity),
          match: (r: Row) => String(r.data.rarity ?? "").toLowerCase() === rarity,
        })),
      },
      {
        id: "attunement",
        label: c.attunement,
        options: [
          { label: v.attunementRequired, match: (r) => !!r.data.reqAttune },
          { label: v.attunementNone, match: (r) => !r.data.reqAttune },
        ],
      },
    ],
  },
  {
    kind: "feat",
    keys: ["category", "prerequisite"],
    columns: [
      { id: "category", label: c.category, value: (r) => FEAT_CATEGORIES[r.data.category] ?? r.data.category ?? none },
      { id: "prerequisite", label: c.prerequisite, value: (r) => prerequisite(r.data) || none },
    ],
    filters: [valueFilter("category", c.category, (r) => FEAT_CATEGORIES[r.data.category] ?? r.data.category ?? "")],
  },
  {
    kind: "background",
    keys: ["ability", "skillProficiencies", "feats"],
    columns: [
      { id: "abilityScores", label: c.abilityScores, value: (r) => backgroundAbilities(r.data) },
      { id: "skills", label: c.skills, value: (r) => backgroundSkills(r.data) },
      { id: "feat", label: c.feat, value: (r) => Object.keys(r.data.feats?.[0] ?? {}).map(featName).join(", ") || none },
    ],
    filters: [valueFilter("feat", c.feat, (r) => Object.keys(r.data.feats?.[0] ?? {}).map(featName).join(", "))],
  },
  {
    kind: "species",
    keys: ["size", "speed", "darkvision", "creatureTypes"],
    columns: [
      { id: "size", label: c.size, value: (r) => (r.data.size ?? []).map((s: string) => SIZES[s] ?? s).join(" or ") || none },
      { id: "speed", label: c.speed, value: (r) => speedText(r.data), sort: (r) => (typeof r.data.speed === "number" ? r.data.speed : (r.data.speed?.walk ?? 0)), numeric: true },
      { id: "darkvision", label: c.darkvision, value: (r) => (r.data.darkvision ? `${r.data.darkvision} ft.` : none), sort: (r) => r.data.darkvision ?? 0, numeric: true },
      { id: "creatureType", label: c.creatureType, value: (r) => (r.data.creatureTypes ?? ["humanoid"]).map((t: string) => capital(t)).join(", ") },
    ],
    filters: [{ id: "size", label: c.size, options: "SM".split("").map((s) => ({ label: SIZES[s], match: (r: Row) => (r.data.size ?? []).includes(s) })) }],
  },
  {
    kind: "class",
    keys: ["hd", "primaryAbility"],
    columns: [
      { id: "hitDie", label: c.hitDie, value: (r) => (r.data.hd?.faces ? `d${r.data.hd.faces}` : none), sort: (r) => r.data.hd?.faces ?? 0, numeric: true },
      {
        id: "primaryAbility",
        label: c.primaryAbility,
        value: (r) => (r.data.primaryAbility ?? []).flatMap((o: Data) => Object.keys(o).map((k) => ABILITY_NAMES[k] ?? k)).join(" or ") || none,
      },
    ],
    filters: [],
  },
  {
    kind: "subclass",
    keys: ["className", "classSource"],
    columns: [{ id: "className", label: c.className, value: (r) => r.data.className ?? none }],
    filters: [valueFilter("className", c.className, (r) => r.data.className ?? "")],
  },
  {
    kind: "optionalfeature",
    keys: ["featureType", "prerequisite"],
    columns: [
      { id: "type", label: c.type, value: (r) => (r.data.featureType ?? []).map((t: string) => FEATURE_TYPES[t] ?? t).join(", ") || none },
      { id: "prerequisite", label: c.prerequisite, value: (r) => prerequisite(r.data) || none },
    ],
    filters: [
      {
        id: "type",
        label: c.type,
        optionsFrom: (rows) =>
          [...new Set(rows.flatMap((r) => (r.data.featureType ?? []) as string[]))]
            .map((t) => ({ label: FEATURE_TYPES[t] ?? t, match: (r: Row) => (r.data.featureType ?? []).includes(t) }))
            .sort((a, b) => a.label.localeCompare(b.label)),
      },
    ],
  },
  {
    kind: "variantrule",
    keys: ["ruleType"],
    columns: [{ id: "type", label: c.type, value: (r) => RULE_TYPES[r.data.ruleType] ?? none }],
    filters: [valueFilter("type", c.type, (r) => RULE_TYPES[r.data.ruleType] ?? "")],
  },
  {
    kind: "action",
    keys: ["time"],
    columns: [{ id: "time", label: c.time, value: (r) => (r.data.time?.length ? castingTime(r.data) : none) }],
    filters: [],
  },
  {
    kind: "language",
    keys: ["type", "script", "typicalSpeakers"],
    columns: [
      { id: "type", label: c.type, value: (r) => (r.data.type ? capital(String(r.data.type)) : none) },
      { id: "script", label: c.script, value: (r) => r.data.script ?? none },
      { id: "speakers", label: c.speakers, value: (r) => (r.data.typicalSpeakers ?? []).map((s: string) => plainText(s)).join(", ") || none },
    ],
    filters: [valueFilter("type", c.type, (r) => (r.data.type ? capital(String(r.data.type)) : ""))],
  },
  {
    kind: "skill",
    keys: ["ability"],
    columns: [{ id: "ability", label: c.ability, value: (r) => ABILITY_NAMES[r.data.ability] ?? none }],
    filters: [valueFilter("ability", c.ability, (r) => ABILITY_NAMES[r.data.ability] ?? "")],
  },
  ...["hazard", "trap"].map(
    (kind): Category => ({
      kind,
      keys: ["trapHazType"],
      columns: [{ id: "type", label: c.type, value: (r) => TRAP_TYPES[r.data.trapHazType] ?? none }],
      filters: [valueFilter("type", c.type, (r) => TRAP_TYPES[r.data.trapHazType] ?? "")],
    }),
  ),
  ...["condition", "disease", "sense", "itemProperty", "itemMastery"].map((kind): Category => ({ kind, keys: [], columns: [], filters: [] })),
];

/** The Source column every table ends with. */
export const SOURCE_COLUMN: Column = { id: "source", label: c.source, value: (r) => r.source };

/** The All tab: every entry, with its category. */
const ALL: Category = {
  kind: "all",
  keys: [],
  columns: [{ id: "category", label: c.category, value: (r) => strings.library.kinds[r.kind] ?? r.kind }],
  filters: [valueFilter("category", c.category, (r) => strings.library.kinds[r.kind] ?? r.kind)],
};

export function category(kind: string): Category {
  return kind === "all" ? ALL : (CATEGORIES.find((cat) => cat.kind === kind) ?? { kind, keys: [], columns: [], filters: [] });
}

/** Keeps rows that match every filter; within one filter, any ticked option matches. */
export function applyFilters(rows: Row[], filters: Filter[], ticked: Record<string, Set<string>>, options: Record<string, FilterOption[]>): Row[] {
  const active = filters.filter((f) => ticked[f.id]?.size);
  if (!active.length) return rows;
  return rows.filter((row) => active.every((f) => (options[f.id] ?? []).some((o) => ticked[f.id].has(o.label) && o.match(row))));
}

const collator = new Intl.Collator(undefined, { sensitivity: "base", numeric: true });

/** The name as it sorts: no punctuation, no leading "the", "a" or "an". */
export function sortName(name: string): string {
  return name
    .replace(/['’]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/^(the|an?) /i, "");
}

/** Alphabetical by `sortName`, falling back to the raw names. */
export const compareNames = (a: string, b: string) => collator.compare(sortName(a), sortName(b)) || collator.compare(a, b);

/** A book matches a typed filter when its name or abbreviation contains it. */
export function bookMatches(book: { id: string; name: string }, filter: string): boolean {
  const needle = filter.trim().toLowerCase();
  return !needle || book.name.toLowerCase().includes(needle) || book.id.toLowerCase().includes(needle);
}

/** Sorts by a column (or name), keeping name order between equal values. */
export function sortRows(rows: Row[], column: Column | null, descending: boolean): Row[] {
  // Keys are cleaned once per row, not per comparison: the All tab can hold thousands of rows.
  const keyed = rows.map((row) => {
    const key = column ? (column.sort ?? column.value)(row) : row.name;
    return { row, key: typeof key === "number" ? key : sortName(key), name: sortName(row.name) };
  });
  keyed.sort((a, b) => {
    const diff = typeof a.key === "number" && typeof b.key === "number" ? a.key - b.key : collator.compare(String(a.key), String(b.key));
    return diff || collator.compare(a.name, b.name) || collator.compare(a.row.name, b.row.name);
  });
  const sorted = keyed.map((k) => k.row);
  return descending ? sorted.reverse() : sorted;
}
