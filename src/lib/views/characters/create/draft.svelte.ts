import type { Character, InventoryItem } from "$lib/api/characters";
import { findEntity, type CatalogRow } from "$lib/api/rules";
import { rebuild, type LevelRecord } from "$lib/characters/levelup";
import { inventoryItem } from "$lib/characters/sheet";
import type { Roll } from "$lib/api/dice";
import {
  ABILITIES,
  SCORE_CAP,
  STANDARD_ARRAY,
  assignedScores,
  bonusComplete,
  bonusOptions,
  bonusTotals,
  coinsOf,
  emptyAssignment,
  equipmentGroups,
  gearOptions,
  startingGear,
  startingHp,
  emptyPick,
  finalScores,
  inSources,
  lineageNames,
  mergeOptions,
  skillGrant,
  type Ability,
  type Assignment,
  type BonusOption,
  type BonusPick,
  type GearGroup,
  type Scores,
  type SkillChoice,
} from "$lib/characters/rules";

export const STEPS = ["basics", "species", "class", "background", "abilities", "skills", "review"] as const;
export type Step = (typeof STEPS)[number];
export type Method = "standard" | "manual" | "roll";

/** The rules entries the wizard picks from, with only the fields it needs. */
export type Options = { species: CatalogRow[]; subspecies: CatalogRow[]; classes: CatalogRow[]; backgrounds: CatalogRow[]; skills: CatalogRow[] };

export const OPTION_KEYS = {
  species: ["size", "_versions", "skillProficiencies", "ability", "lineage", "speed", "darkvision", "reprintedAs"],
  subspecies: ["raceName", "raceSource", "skillProficiencies", "ability"],
  class: ["startingProficiencies", "proficiency", "hd", "isSidekick", "startingEquipment", "primaryAbility", "reprintedAs"],
  background: ["skillProficiencies", "ability", "feats", "startingEquipment", "reprintedAs"],
  skill: ["ability"],
};

const manualDefault = (): Scores => ({ str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 });

function blank() {
  return {
    step: 0,
    /** The furthest step reached; steps up to it can be revisited. */
    reached: 0,
    name: "",
    player: "",
    /** null: no campaign, every book. */
    campaignId: null as string | null,
    species: null as CatalogRow | null,
    lineage: null as string | null,
    subspecies: null as CatalogRow | null,
    size: null as string | null,
    cls: null as CatalogRow | null,
    level: 1,
    /** Choices per class level, from Configure (Edit → Levels on the character being made). */
    levels: [] as LevelRecord[],
    background: null as CatalogRow | null,
    method: "standard" as Method,
    rolls: [] as Roll[],
    assignment: emptyAssignment() as Assignment,
    manual: manualDefault(),
    speciesPick: emptyPick(undefined) as BonusPick,
    backgroundPick: emptyPick(undefined) as BonusPick,
    /**
     * Editing: the saved ability bonuses, kept as totals because the file doesn't record which came from the
     * species and which from the background. Cleared (so the picks are made again) when either changes.
     */
    keptBonuses: null as Partial<Scores> | null,
    /** Picked skills per choice group (see `skillGroups`). */
    skillPicks: {} as Record<string, string[]>,
    /** Picked starting equipment option ("A", "B"…) per group of the class and the background. */
    classGear: [] as (string | null)[],
    backgroundGear: [] as (string | null)[],
    /** Editing a saved character: starting equipment isn't asked for or added. */
    editing: false,
  };
}

export const draft = $state(blank());

export function resetDraft() {
  Object.assign(draft, blank());
}

// --- Changes that clear what depends on them ------------------------------------------------

export function chooseCampaign(id: string | null, sources: string[] | null) {
  draft.campaignId = id;
  if (draft.species && !inSources(draft.species.source, sources)) chooseSpecies(null);
  if (draft.cls && !inSources(draft.cls.source, sources)) chooseClass(null);
  if (draft.background && !inSources(draft.background.source, sources)) chooseBackground(null);
}

export function chooseSpecies(row: CatalogRow | null) {
  draft.species = row;
  draft.lineage = null;
  draft.subspecies = null;
  const sizes = sizesOf(row);
  draft.size = sizes.length === 1 ? sizes[0] : null;
  draft.skillPicks = {};
  draft.speciesPick = emptyPick(undefined);
  draft.keptBonuses = null;
}

export function chooseSubspecies(row: CatalogRow | null) {
  draft.subspecies = row;
  draft.skillPicks = {};
  draft.speciesPick = emptyPick(undefined);
  draft.keptBonuses = null;
}

export function chooseClass(row: CatalogRow | null) {
  draft.cls = row;
  draft.skillPicks = {};
  draft.classGear = [];
  draft.levels = [];
}

export function chooseBackground(row: CatalogRow | null) {
  draft.background = row;
  draft.skillPicks = {};
  draft.backgroundGear = [];
  draft.backgroundPick = emptyPick(undefined);
  draft.keptBonuses = null;
}

export function chooseMethod(method: Method) {
  draft.method = method;
  draft.assignment = emptyAssignment();
}

// --- Reading the picked entries -------------------------------------------------------------

export const sizesOf = (row: CatalogRow | null): string[] => (Array.isArray(row?.data.size) ? (row.data.size as string[]) : []);
export const lineagesOf = (row: CatalogRow | null): string[] => lineageNames(row?.data._versions);
export const subspeciesOf = (options: Options | null, row: CatalogRow | null): CatalogRow[] =>
  row ? (options?.subspecies ?? []).filter((s) => s.data.raceName === row.name && String(s.data.raceSource).toLowerCase() === row.source.toLowerCase()) : [];

export function speciesBonuses(): BonusOption[] {
  const species = draft.species;
  if (!species) return [];
  const own = bonusOptions(species.data.ability, !!species.data.lineage);
  return mergeOptions(own, bonusOptions(draft.subspecies?.data.ability));
}

export const backgroundBonuses = (): BonusOption[] => bonusOptions(draft.background?.data.ability);

export const savingThrows = (): Ability[] => ((draft.cls?.data.proficiency as string[] | undefined) ?? []).filter((a): a is Ability => (ABILITIES as readonly string[]).includes(a));
export const hitDie = (): number => Number((draft.cls?.data.hd as { faces?: number } | undefined)?.faces ?? 0);

/** Feats a background grants, from keys like "magic initiate; cleric|xphb". */
export function backgroundFeats(): { name: string; source: string }[] {
  const feats = draft.background?.data.feats;
  const first = Array.isArray(feats) ? (feats[0] as Record<string, unknown>) : null;
  return Object.keys(first ?? {}).flatMap((key) => {
    const [name, source = ""] = key.split("|");
    // "magic initiate; cleric" is the Cleric version of Magic Initiate.
    const title = name.replace(/(^|[\s(])(\w)/g, (_, a: string, b: string) => a + b.toUpperCase()).replace(/; (.+)$/, " ($1)");
    return first?.[key] === true ? [{ name: title, source: source.toUpperCase() }] : [];
  });
}

// --- Starting equipment ---------------------------------------------------------------------

export const classGroups = (): GearGroup[] => equipmentGroups(draft.cls?.data.startingEquipment);
export const backgroundGroups = (): GearGroup[] => equipmentGroups(draft.background?.data.startingEquipment);
const gearPicked = (groups: GearGroup[], picks: (string | null)[]) => draft.editing || groups.every((g, i) => gearOptions(g).length === 0 || !!picks[i]);

/**
 * The new character's inventory and coins from the picked starting equipment. Rules items are looked up for
 * weight, armor and attacks; one that isn't in the library is kept by name.
 */
export async function startingInventory(typeName: (types: string[]) => string): Promise<{ inventory: InventoryItem[]; coins: Partial<Record<"gp" | "sp" | "cp", number>> }> {
  const picked = [startingGear(classGroups(), draft.classGear, typeName), startingGear(backgroundGroups(), draft.backgroundGear, typeName)];
  const inventory: InventoryItem[] = [];
  const looked = await Promise.all(picked.flatMap((p) => p.gear).map(async (g) => ({ g, found: g.item ? await findEntity("item", g.item.name, g.item.source) : null })));
  for (const { g, found } of looked) {
    // The library's name, unless the equipment names it its own way ("Book (Prayers)").
    const item: InventoryItem = found
      ? { ...inventoryItem(found, g.quantity), ...(g.name !== g.item?.name ? { name: g.name } : {}) }
      : { name: g.name, quantity: g.quantity };
    // The same item from the class and the background is one line.
    const same = inventory.find((i) => i.name === item.name && i.source === item.source);
    if (same) same.quantity += item.quantity;
    else inventory.push(item);
  }
  return { inventory, coins: coinsOf(picked.reduce((sum, p) => sum + p.copper, 0)) };
}

// --- Skills -----------------------------------------------------------------------------------

export type SkillGroup = { id: string; origin: "species" | "class" | "background"; choice: SkillChoice };

function grants() {
  const species = skillGrant(draft.species?.data.skillProficiencies);
  const subspecies = skillGrant(draft.subspecies?.data.skillProficiencies);
  return {
    species: { fixed: [...species.fixed, ...subspecies.fixed], choices: [...species.choices, ...subspecies.choices] },
    class: skillGrant((draft.cls?.data.startingProficiencies as { skills?: unknown } | undefined)?.skills),
    background: skillGrant(draft.background?.data.skillProficiencies),
  };
}

/** Skills that come with the background and species, without choosing. */
export function grantedSkills(): string[] {
  const g = grants();
  // shortcut: a skill granted twice isn't swapped for another; the 2024 rule allows a free replacement, add it with feat choices.
  return [...new Set([...g.background.fixed, ...g.species.fixed])];
}

export function skillGroups(): SkillGroup[] {
  const g = grants();
  return (["class", "background", "species"] as const).flatMap((origin) => g[origin].choices.map((choice, i) => ({ id: `${origin}-${i}`, origin, choice })));
}

/** Every chosen and granted skill, lowercase. */
export function allSkills(): string[] {
  return [...new Set([...grantedSkills(), ...Object.values(draft.skillPicks).flat()])];
}

// --- Abilities --------------------------------------------------------------------------------

export const rolledValues = (): number[] => draft.rolls.map((r) => r.total);

export function baseScores(): Scores | null {
  if (draft.method === "manual") return { ...draft.manual };
  return assignedScores(draft.method === "standard" ? STANDARD_ARRAY : rolledValues(), draft.assignment);
}

/** One ability's score with its bonuses so far, as soon as it has a base value; null before. */
export function abilityTotal(ability: Ability): number | null {
  const values = draft.method === "standard" ? STANDARD_ARRAY : rolledValues();
  const index = draft.assignment[ability];
  const base = draft.method === "manual" ? draft.manual[ability] : index === null ? null : (values[index] ?? null);
  if (base === null) return null;
  return Math.min(SCORE_CAP, base + bonusesNow().reduce((sum, b) => sum + (b[ability] ?? 0), 0));
}

/** The ability bonuses in force: the saved totals while editing kept them, otherwise the picks. */
const bonusesNow = (): Partial<Scores>[] =>
  draft.keptBonuses ? [draft.keptBonuses] : [bonusTotals(speciesBonuses(), draft.speciesPick), bonusTotals(backgroundBonuses(), draft.backgroundPick)];

export function scores(): Scores | null {
  const base = baseScores();
  return base && finalScores(base, bonusesNow());
}

// --- Step completeness ------------------------------------------------------------------------

export function stepComplete(step: Step, options: Options | null): boolean {
  switch (step) {
    case "basics":
      return draft.name.trim().length > 0 && draft.name.trim().length <= 100;
    case "species":
      return (
        !!draft.species &&
        (lineagesOf(draft.species).length === 0 || !!draft.lineage) &&
        (subspeciesOf(options, draft.species).length === 0 || !!draft.subspecies) &&
        (sizesOf(draft.species).length <= 1 || !!draft.size)
      );
    case "class":
      return !!draft.cls && gearPicked(classGroups(), draft.classGear);
    case "background":
      return !!draft.background && gearPicked(backgroundGroups(), draft.backgroundGear);
    case "abilities":
      return (
        baseScores() !== null &&
        (draft.method !== "roll" || draft.rolls.length === ABILITIES.length) &&
        (!!draft.keptBonuses || (bonusComplete(speciesBonuses(), draft.speciesPick) && bonusComplete(backgroundBonuses(), draft.backgroundPick)))
      );
    case "skills":
      return skillGroups().every((g) => (draft.skillPicks[g.id] ?? []).length === g.choice.count);
    case "review":
      return STEPS.slice(0, -1).every((s) => stepComplete(s, options));
  }
}

/** The character file (see src-tauri/src/commands/characters.rs). */
export function toCharacter() {
  const base = baseScores()!;
  const final = scores()!;
  return {
    name: draft.name.trim(),
    player: draft.player.trim(),
    species: {
      name: draft.species!.name,
      source: draft.species!.source,
      ...(draft.lineage ? { lineage: draft.lineage } : {}),
      ...(draft.subspecies ? { subspecies: { name: draft.subspecies.name, source: draft.subspecies.source } } : {}),
      ...(draft.size ? { size: draft.size } : {}),
    },
    classes: [{ name: draft.cls!.name, source: draft.cls!.source, level: draft.level }],
    background: { name: draft.background!.name, source: draft.background!.source },
    abilities: {
      method: draft.method,
      base,
      bonuses: Object.fromEntries(ABILITIES.map((a) => [a, final[a] - base[a]])),
    },
    skills: allSkills().sort(),
    savingThrows: savingThrows(),
    hp: { max: startingHp(hitDie(), final.con, draft.level) },
    feats: backgroundFeats(),
  };
}

// --- Editing a saved character ------------------------------------------------------------------

type Ref = { name: string; source: string };
const same = (row: CatalogRow, ref: Ref | undefined) => !!ref && row.name.toLowerCase() === ref.name.toLowerCase() && row.source.toLowerCase() === ref.source.toLowerCase();

/** Which value of `values` (by index) each ability has, using each value once; null when the scores aren't those values. */
function assignmentFor(values: number[], base: Scores): Assignment | null {
  const used = new Set<number>();
  const assignment = emptyAssignment();
  for (const a of ABILITIES) {
    const i = values.findIndex((v, j) => v === base[a] && !used.has(j));
    if (i < 0) return null;
    used.add(i);
    assignment[a] = i;
  }
  return assignment;
}

/**
 * Fills the wizard from a saved character. The file keeps results, not where they came from, so:
 * ability bonuses are kept as saved totals (`keptBonuses`), rolled scores come back without their dice,
 * and skill picks are rebuilt by giving each choice group the saved skills it allows.
 */
export function loadCharacter(c: Character, campaignId: string | null, options: Options) {
  resetDraft();
  draft.editing = true;
  draft.name = c.name;
  draft.player = c.player ?? "";
  draft.campaignId = campaignId;
  draft.species = options.species.find((r) => same(r, c.species)) ?? null;
  draft.lineage = c.species?.lineage ?? null;
  draft.subspecies = subspeciesOf(options, draft.species).find((r) => same(r, c.species?.subspecies)) ?? null;
  const sizes = sizesOf(draft.species);
  draft.size = c.species?.size ?? (sizes.length === 1 ? sizes[0] : null);
  draft.cls = options.classes.find((r) => same(r, c.classes[0])) ?? null;
  draft.level = c.classes[0]?.level ?? 1;
  draft.levels = structuredClone(c.levels ?? []);
  draft.background = options.backgrounds.find((r) => same(r, c.background)) ?? null;

  const saved = c.abilities;
  const base = saved?.base && ABILITIES.every((a) => typeof saved.base[a] === "number") ? (saved.base as Scores) : null;
  if (base) {
    const standard = saved?.method === "standard" ? assignmentFor(STANDARD_ARRAY, base) : null;
    if (standard) {
      draft.method = "standard";
      draft.assignment = standard;
    } else if (saved?.method === "roll") {
      draft.method = "roll";
      draft.rolls = ABILITIES.map((a) => ({ notation: "", total: base[a], dice: [] }));
      draft.assignment = Object.fromEntries(ABILITIES.map((a, i) => [a, i])) as Assignment;
    } else {
      draft.method = "manual";
      draft.manual = { ...base };
    }
    draft.keptBonuses = { ...(saved?.bonuses ?? {}) } as Partial<Scores>;
  }

  const granted = new Set(grantedSkills());
  const left = (c.skills ?? []).filter((s) => !granted.has(s));
  for (const group of skillGroups()) {
    const picks = left.filter((s) => group.choice.from === null || group.choice.from.includes(s)).slice(0, group.choice.count);
    for (const s of picks) left.splice(left.indexOf(s), 1);
    draft.skillPicks[group.id] = picks;
  }
  draft.reached = STEPS.length - 1;
}

/**
 * The saved character with the wizard's choices applied. Everything from play (hit point damage, temporary
 * hit points, conditions, inventory, notes…) stays; a new background replaces the background feat, and damage taken
 * carries over to a changed maximum. What levels added (see Edit → Levels) is rebuilt from the level records: they
 * stay with the class (a lower level drops the ones above it); a new class drops them all and resets spent slots.
 */
export function editedCharacter(existing: Character): Character {
  const next = toCharacter();
  const sameClass = same(draft.cls!, existing.classes[0]);
  const sameBackground = same(draft.background!, existing.background);
  const backgroundFeats = (existing.feats ?? []).filter((f) => f.gained === undefined && !f.origin);
  const merged: Character = {
    ...existing,
    ...next,
    // Keeping the class keeps its subclass.
    classes: sameClass ? [{ ...existing.classes[0], level: draft.level }, ...existing.classes.slice(1)] : next.classes,
    hp: existing.hp ?? next.hp,
    abilities: { ...next.abilities, levelBonuses: existing.abilities?.levelBonuses },
    ...(sameClass
      ? {
          feats: [...(sameBackground ? backgroundFeats : next.feats), ...(existing.feats ?? []).filter((f) => f.gained !== undefined || f.origin)],
          levels: $state.snapshot(draft.levels) as LevelRecord[],
          // The wizard's skills plus what levels added; the rebuild takes the level ones off and adds them back as they are now.
          skills: [...new Set([...next.skills, ...(existing.levelSkills ?? [])])],
        }
      : {
          feats: sameBackground ? backgroundFeats : next.feats,
          levels: [],
          spells: [],
          optionalFeatures: [],
          featureChoices: [],
          weaponMasteries: [],
          expertise: [],
          levelSkills: [],
          levelExpertise: [],
          slotsUsed: [],
          pactSlotsUsed: 0,
        }),
  };
  return rebuild(merged, hitDie());
}

/** The character as far as the wizard knows it, for Configure (scores only once they're chosen). */
export function draftCharacter(): Character {
  const base = baseScores();
  const final = scores();
  return {
    id: "",
    name: draft.name.trim(),
    classes: draft.cls ? [{ name: draft.cls.name, source: draft.cls.source, level: draft.level }] : [],
    ...(draft.species ? { species: { name: draft.species.name, source: draft.species.source } } : {}),
    ...(draft.background ? { background: { name: draft.background.name, source: draft.background.source } } : {}),
    ...(base && final ? { abilities: { base, bonuses: Object.fromEntries(ABILITIES.map((a) => [a, final[a] - base[a]])) } } : {}),
    skills: allSkills(),
    feats: backgroundFeats(),
    levels: $state.snapshot(draft.levels) as LevelRecord[],
  };
}

/** A new character with its configured levels applied (feats, spells, hit points… rebuilt from them). */
export const withConfiguredLevels = (c: Character): Character => rebuild({ ...c, levels: $state.snapshot(draft.levels) as LevelRecord[] }, hitDie());
