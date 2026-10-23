// Character creation rules, read from 5etools-format data. Nothing here is tied to one edition:
// skills, ability bonuses and lineages all come from the species, class and background entries.

export const ABILITIES = ["str", "dex", "con", "int", "wis", "cha"] as const;
export type Ability = (typeof ABILITIES)[number];
export type Scores = Record<Ability, number>;

export const STANDARD_ARRAY = [15, 14, 13, 12, 10, 8];
export const MANUAL_MIN = 3;
export const MANUAL_MAX = 18;
export const SCORE_CAP = 20;
export const ROLL_NOTATION = "4d6kh3";

const isAbility = (key: string): key is Ability => (ABILITIES as readonly string[]).includes(key);
const record = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;

export const modifier = (score: number) => Math.floor((score - 10) / 2);

/** Level 1 hit points: the hit die's maximum plus the Constitution modifier, at least 1. */
export const level1Hp = (hitDieFaces: number, con: number) => Math.max(1, hitDieFaces + modifier(con));

export const MAX_LEVEL = 20;

/** Hit points at a starting level: level 1's, plus the fixed value (half the die + 1, plus CON) for each level after, at least 1 each. */
export const startingHp = (hitDieFaces: number, con: number, level: number) =>
  level1Hp(hitDieFaces, con) + (Math.max(1, level) - 1) * Math.max(1, hitDieFaces / 2 + 1 + modifier(con));

/** `sources` null means every book is allowed (a character without a campaign). */
export const inSources = (source: string, sources: string[] | null) => sources === null || sources.some((s) => s.toLowerCase() === source.toLowerCase());

// --- Skills -------------------------------------------------------------------------------

/** `from` null means any skill. */
export type SkillChoice = { from: string[] | null; count: number };
export type SkillGrant = { fixed: string[]; choices: SkillChoice[] };

/** A `skillProficiencies`-style list: fixed skills (`{ insight: true }`), `choose { from, count }` and `any: n`. */
export function skillGrant(raw: unknown): SkillGrant {
  // shortcut: only the first alternative is used; entries with several alternatives are rare, offer them when one shows up.
  const option = Array.isArray(raw) ? record(raw[0]) : null;
  const grant: SkillGrant = { fixed: [], choices: [] };
  for (const [key, value] of Object.entries(option ?? {})) {
    const choose = record(value);
    if (key === "choose" && choose && Array.isArray(choose.from)) grant.choices.push({ from: choose.from.map(String), count: Number(choose.count ?? 1) });
    else if (key === "any") grant.choices.push({ from: null, count: Number(value) });
    else if (value === true) grant.fixed.push(key);
  }
  return grant;
}

// --- Ability bonuses ----------------------------------------------------------------------

/** Pick a different ability for each amount, e.g. amounts [2, 1] is "+2 to one, +1 to another". */
export type BonusChoice = { from: Ability[]; amounts: number[] };
export type BonusOption = { fixed: Partial<Scores>; choices: BonusChoice[] };

const anyTwoOrThree = (): BonusOption[] => [
  { fixed: {}, choices: [{ from: [...ABILITIES], amounts: [2, 1] }] },
  { fixed: {}, choices: [{ from: [...ABILITIES], amounts: [1, 1, 1] }] },
];

/** The alternatives in an `ability` list. `flexible` (species with a `lineage` and no `ability`) means +2/+1 or +1/+1/+1 to any. */
export function bonusOptions(raw: unknown, flexible = false): BonusOption[] {
  if (!Array.isArray(raw) || raw.length === 0) return flexible ? anyTwoOrThree() : [];
  return raw.flatMap((entry) => {
    const option: BonusOption = { fixed: {}, choices: [] };
    for (const [key, value] of Object.entries(record(entry) ?? {})) {
      if (isAbility(key) && typeof value === "number") option.fixed[key] = value;
      const choose = key === "choose" ? record(value) : null;
      if (!choose) continue;
      const weighted = record(choose.weighted);
      const from = ((weighted ?? choose).from as unknown[] | undefined)?.map(String).filter(isAbility) ?? [];
      const amounts = weighted ? (weighted.weights as number[]) : Array<number>(Number(choose.count ?? 1)).fill(Number(choose.amount ?? 1));
      option.choices.push({ from, amounts });
    }
    return Object.keys(option.fixed).length || option.choices.length ? [option] : [];
  });
}

/** Every combination of a species' and its subspecies' bonus options. */
export function mergeOptions(a: BonusOption[], b: BonusOption[]): BonusOption[] {
  if (!a.length) return b;
  if (!b.length) return a;
  return a.flatMap((x) =>
    b.map((y) => {
      const fixed = { ...x.fixed };
      for (const [k, v] of Object.entries(y.fixed) as [Ability, number][]) fixed[k] = (fixed[k] ?? 0) + v;
      return { fixed, choices: [...x.choices, ...y.choices] };
    }),
  );
}

/** Which option was taken, and the ability picked for each amount of each of its choices. */
export type BonusPick = { option: number; picks: (Ability | null)[][] };

export const emptyPick = (option: BonusOption | undefined, index = 0): BonusPick => ({
  option: index,
  picks: (option?.choices ?? []).map((c) => c.amounts.map(() => null)),
});

export function bonusComplete(options: BonusOption[], pick: BonusPick): boolean {
  const option = options[pick.option];
  if (!options.length) return true;
  if (!option) return false;
  return option.choices.every((choice, i) => {
    const picked = pick.picks[i] ?? [];
    return picked.length === choice.amounts.length && picked.every((a) => a !== null) && new Set(picked).size === picked.length;
  });
}

export function bonusTotals(options: BonusOption[], pick: BonusPick): Partial<Scores> {
  const option = options[pick.option];
  const totals: Partial<Scores> = { ...option?.fixed };
  option?.choices.forEach((choice, i) =>
    choice.amounts.forEach((amount, j) => {
      const ability = pick.picks[i]?.[j];
      if (ability) totals[ability] = (totals[ability] ?? 0) + amount;
    }),
  );
  return totals;
}

// --- Scores -------------------------------------------------------------------------------

/** For the standard array or rolled scores: which value (by index) each ability gets. */
export type Assignment = Record<Ability, number | null>;
export const emptyAssignment = (): Assignment => ({ str: null, dex: null, con: null, int: null, wis: null, cha: null });

/** The base scores once every ability has its own value, otherwise null. */
export function assignedScores(values: number[], assignment: Assignment): Scores | null {
  const used = ABILITIES.map((a) => assignment[a]);
  if (used.some((i) => i === null || i >= values.length) || new Set(used).size !== ABILITIES.length) return null;
  return Object.fromEntries(ABILITIES.map((a) => [a, values[assignment[a]!]])) as Scores;
}

export function finalScores(base: Scores, bonuses: Partial<Scores>[]): Scores {
  return Object.fromEntries(
    ABILITIES.map((a) => [a, Math.min(SCORE_CAP, bonuses.reduce((sum, b) => sum + (b[a] ?? 0), base[a]))]),
  ) as Scores;
}

// --- Lineages -----------------------------------------------------------------------------

/** Lineage names from a species' `_versions`: "Elf; Drow Lineage" becomes "Drow Lineage", templates fill in their variables. */
export function lineageNames(versions: unknown): string[] {
  if (!Array.isArray(versions)) return [];
  const names = versions.flatMap((v) => {
    const version = record(v);
    const template = record(version?._abstract);
    if (template && Array.isArray(version?._implementations)) {
      return version._implementations.map((impl) => {
        const vars = record(record(impl)?._variables) ?? {};
        return String(template.name ?? "").replace(/\{\{(\w+)\}\}/g, (_, key: string) => String(vars[key] ?? key));
      });
    }
    return typeof version?.name === "string" ? [version.name] : [];
  });
  return names.map((name) => name.split("; ").slice(1).join("; ") || name).filter(Boolean);
}

/** Proficiency bonus by total character level: +2 at levels 1–4, rising by 1 every 4 levels. */
export const proficiencyBonus = (level: number) => 2 + Math.floor((Math.max(1, level) - 1) / 4);

/** A skill check or saving throw bonus: the ability modifier, plus the proficiency bonus when proficient. */
export const checkBonus = (score: number, proficient: boolean, proficiency: number) => modifier(score) + (proficient ? proficiency : 0);

/** The species entry a lineage choice belongs under: the one its `_versions` replace or remove ("Elven Lineage"). */
export function lineageTarget(versions: unknown, entries: unknown): string | null {
  const names = new Set(
    (Array.isArray(entries) ? entries : []).flatMap((e) => (typeof record(e)?.name === "string" ? [String(record(e)!.name).toLowerCase()] : [])),
  );
  const candidates = (Array.isArray(versions) ? versions : []).flatMap((v) => {
    const mod = record(record(v)?._mod) ?? record(record(record(v)?._abstract)?._mod);
    const edits = mod?.entries;
    return (Array.isArray(edits) ? edits : [edits]).flatMap((edit) => {
      const e = record(edit);
      return [e?.replace, ...(Array.isArray(e?.names) ? e.names : [e?.names])].filter((n): n is string => typeof n === "string");
    });
  });
  return candidates.find((n) => names.has(n.toLowerCase())) ?? null;
}

/** "Dragonborn (Black)" stays as is; "Drow Lineage" for an Elf becomes "Elf (Drow Lineage)". */
export const speciesLabel = (species: string, variant: string | null | undefined) =>
  !variant ? species : variant.toLowerCase().includes(species.toLowerCase()) ? variant : `${species} (${variant})`;

// --- Starting equipment ---------------------------------------------------------------------

/** One line of starting equipment: an item key ("chain mail|xphb"), coins in copper, or a thing named in words. */
export type GearEntry =
  | string
  | { item?: string; displayName?: string; quantity?: number; value?: number; containsValue?: number; special?: string; equipmentType?: string; equipmentTypes?: string[] };
/** One choice, by option key ("A", "B"…); `_` is what comes whichever option is picked. */
export type GearGroup = Record<string, GearEntry[]>;
/** `item` is set when the gear is a rules item to look up. */
export type Gear = { name: string; quantity: number; item?: { name: string; source: string } };

/** A class keeps its starting equipment under `defaultData`; a background lists the groups directly. */
export function equipmentGroups(raw: unknown): GearGroup[] {
  const groups = Array.isArray(raw) ? raw : record(raw)?.defaultData;
  return Array.isArray(groups) ? groups.filter((g): g is GearGroup => !!record(g)) : [];
}

export const gearOptions = (group: GearGroup) => Object.keys(group).filter((key) => key !== "_");

/** "dungeoneer's pack|xphb" → Dungeoneer's Pack from XPHB. */
function itemRef(key: string) {
  const [name, source = ""] = key.split("|");
  return { name: name.replace(/(^|[\s(])(\w)/g, (_, a: string, b: string) => a + b.toUpperCase()), source: source.toUpperCase() };
}

/** What a list of entries gives. `typeName` names a "your choice" entry, like any musical instrument. */
export function gearOf(entries: GearEntry[], typeName: (types: string[]) => string): { gear: Gear[]; copper: number } {
  const gear: Gear[] = [];
  let copper = 0;
  for (const entry of entries) {
    if (typeof entry === "string") {
      const item = itemRef(entry);
      gear.push({ name: item.name, quantity: 1, item });
      continue;
    }
    const quantity = entry.quantity ?? 1;
    copper += (entry.value ?? 0) + (entry.containsValue ?? 0);
    const types = entry.equipmentTypes ?? (entry.equipmentType ? [entry.equipmentType] : []);
    if (entry.item) {
      const item = itemRef(entry.item);
      gear.push({ name: entry.displayName ?? item.name, quantity, item });
    } else if (entry.special) gear.push({ name: entry.special, quantity });
    else if (types.length) gear.push({ name: entry.displayName ?? typeName(types), quantity });
  }
  return { gear, copper };
}

/** Everything the picks give: each group's `_` part plus its picked option (none while unpicked). */
export function startingGear(groups: GearGroup[], picks: (string | null)[], typeName: (types: string[]) => string) {
  return gearOf(groups.flatMap((group, i) => [...(group._ ?? []), ...(picks[i] ? (group[picks[i]] ?? []) : [])]), typeName);
}

/** Copper as the fewest coins in gold, silver and copper (no electrum or platinum, as the books hand them out). */
export function coinsOf(copper: number): Partial<Record<"gp" | "sp" | "cp", number>> {
  const coins = { gp: Math.floor(copper / 100), sp: Math.floor((copper % 100) / 10), cp: copper % 10 };
  return Object.fromEntries(Object.entries(coins).filter(([, n]) => n > 0));
}
