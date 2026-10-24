import type { Character, InventoryItem } from "$lib/api/characters";
import { findEntity, type CatalogRow } from "$lib/api/rules";
import { featName, parseFeatKey } from "$lib/rules/catalog";
import {
  choiceComplete,
  emptyChoice,
  emptyGains,
  mergeGains,
  resolveChoice,
  toChoice,
  type Entry,
  type Lookup,
  type SavedChoice,
} from "$lib/characters/choices";
import { rebuild, scoresWithLevels, type LevelRecord } from "$lib/characters/levelup";
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
  species: ["size", "_versions", "skillProficiencies", "ability", "lineage", "speed", "darkvision", "reprintedAs", "feats", "additionalSpells", "toolProficiencies", "languageProficiencies"],
  subspecies: ["raceName", "raceSource", "skillProficiencies", "ability"],
  class: ["startingProficiencies", "proficiency", "hd", "isSidekick", "startingEquipment", "primaryAbility", "reprintedAs"],
  background: ["skillProficiencies", "ability", "feats", "startingEquipment", "reprintedAs", "toolProficiencies", "languageProficiencies"],
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
    /** The character's own picture (a downsized data URL), or null for the class art. */
    avatar: null as string | null,
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
    /** Sub-choices of the species itself (its feat, its spells, tools) and of the background and its feat. */
    speciesChoice: emptyChoice() as SavedChoice,
    backgroundChoice: emptyChoice() as SavedChoice,
    backgroundFeatChoice: emptyChoice() as SavedChoice,
    /** The standard languages picked for the open slots, and any extra ones. */
    languages: [] as string[],
    extraLanguages: [] as string[],
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
  draft.speciesChoice = emptyChoice();
  draft.languages = [];
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
  draft.backgroundChoice = emptyChoice();
  draft.backgroundFeatChoice = emptyChoice(backgroundFeatRef(row));
  draft.languages = [];
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

/**
 * The background's feat as a rules entry reference, and the option it presets: "magic initiate; cleric|xphb" is
 * Magic Initiate with the Cleric spell list.
 */
export function backgroundFeatRef(row: CatalogRow | null = draft.background): (Ref & { preset: string | null }) | null {
  const first = Array.isArray(row?.data.feats) ? (row.data.feats[0] as Record<string, unknown>) : null;
  const key = Object.keys(first ?? {}).find((k) => first?.[k] === true);
  if (!key) return null;
  const { name, source, variant } = parseFeatKey(key);
  return { name, source, preset: variant };
}

// What the species and background ask on top of skills and ability bonuses (those have their own steps).
const ORIGIN_SKIP = ["skillProficiencies", "ability", "languageProficiencies"];
/** A species or background entry for its own choices: its feat, spells and tools (skills, ability bonuses and languages are asked elsewhere). */
export const originEntry = (row: CatalogRow | null): Entry | null =>
  row ? { name: row.name, source: row.source, data: Object.fromEntries(Object.entries(row.data).filter(([k]) => !ORIGIN_SKIP.includes(k))) } : null;

/** Languages a species or background grants outright (older books), besides Common. */
export function grantedLanguages(): string[] {
  const fixed = (row: CatalogRow | null) =>
    Object.entries((Array.isArray(row?.data.languageProficiencies) ? row.data.languageProficiencies[0] : null) ?? {}).flatMap(([k, v]) => (v === true ? [k.toLowerCase()] : []));
  return [...new Set([...fixed(draft.species), ...fixed(draft.subspecies), ...fixed(draft.background)])].filter((l) => l !== "common");
}

/** Every character knows Common and two standard languages; granted languages fill those two first. */
export const STANDARD_LANGUAGES = 2;
export const openLanguageSlots = () => Math.max(0, STANDARD_LANGUAGES - grantedLanguages().length);
export const allLanguages = () => [...new Set(["common", ...grantedLanguages(), ...draft.languages, ...draft.extraLanguages])];

/** Whether the origin's own choices are made (needs the loaded choice data to check feats and spells). */
export function originComplete(step: "species" | "background", find: Lookup): boolean {
  if (step === "species") {
    const entry = originEntry(draft.species);
    return !entry || choiceComplete(entry, draft.speciesChoice, draft.level, find);
  }
  const entry = originEntry(draft.background);
  const featRef = backgroundFeatRef();
  const feat = featRef ? find.feat(featRef) : null;
  return (!entry || choiceComplete(entry, draft.backgroundChoice, draft.level, find)) && (!featRef || !feat || choiceComplete(feat, draft.backgroundFeatChoice, draft.level, find));
}

/** The origin choices for the character file, with what they give (rebuilt into feats, spells, tools, languages…). */
export function originRecord(find: Lookup): NonNullable<Character["origin"]> {
  const species = originEntry(draft.species);
  const background = originEntry(draft.background);
  const featRef = backgroundFeatRef();
  const feat = featRef ? find.feat(featRef) : null;
  let gains = emptyGains();
  if (species) gains = mergeGains(gains, resolveChoice(species, draft.speciesChoice, draft.level, find, draft.species!.name));
  if (background) gains = mergeGains(gains, resolveChoice(background, draft.backgroundChoice, draft.level, find, draft.background!.name));
  if (feat) gains = mergeGains(gains, resolveChoice(feat, draft.backgroundFeatChoice, draft.level, find, feat.name));
  gains.languages = [...gains.languages, ...allLanguages()];
  return {
    species: $state.snapshot(draft.speciesChoice) as SavedChoice,
    background: $state.snapshot(draft.backgroundChoice) as SavedChoice,
    backgroundFeat: $state.snapshot(draft.backgroundFeatChoice) as SavedChoice,
    languages: [...draft.languages],
    extraLanguages: [...draft.extraLanguages],
    gains: { ...gains, optional: [], options: [], masteries: [] },
  };
}

/** Feats a background grants, from keys like "magic initiate; cleric|xphb". */
export function backgroundFeats(): { name: string; source: string }[] {
  const feats = draft.background?.data.feats;
  const first = Array.isArray(feats) ? (feats[0] as Record<string, unknown>) : null;
  // "magic initiate; cleric" is the Cleric version of Magic Initiate.
  return Object.keys(first ?? {}).flatMap((key) => (first?.[key] === true ? [{ name: featName(key), source: parseFeatKey(key).source }] : []));
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

/**
 * One ability's score with its bonuses so far, as soon as it has a base value; null before. With levels configured
 * (Edit → Character, or Configure), what they add is in it too (an Ability Score Improvement, Fey Touched's +1), as on
 * the sheet, so the two show the same number.
 */
export function abilityTotal(ability: Ability): number | null {
  const values = draft.method === "standard" ? STANDARD_ARRAY : rolledValues();
  const index = draft.assignment[ability];
  const base = draft.method === "manual" ? draft.manual[ability] : index === null ? null : (values[index] ?? null);
  if (base === null) return null;
  const origin = Math.min(SCORE_CAP, base + bonusesNow().reduce((sum, b) => sum + (b[ability] ?? 0), 0));
  return withLevels()?.[ability] ?? origin;
}

/** The scores with the configured levels' increases, as the sheet works them out; null without levels or a full set of scores. */
function withLevels(): Scores | null {
  if (!draft.levels.length || !scores()) return null;
  return scoresWithLevels(withConfiguredLevels(draftCharacter()));
}

/** What the configured levels add to the scores ({ wis: 1 }), for the Abilities step's note. */
export function levelIncreases(): Partial<Scores> {
  if (!draft.levels.length || !scores()) return {};
  return (withConfiguredLevels(draftCharacter()).abilities?.levelBonuses ?? {}) as Partial<Scores>;
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
    // Always set, so removing the picture while editing clears the saved one.
    avatar: draft.avatar ?? undefined,
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
  draft.avatar = c.avatar ?? null;
  draft.campaignId = campaignId;
  draft.species = options.species.find((r) => same(r, c.species)) ?? null;
  draft.lineage = c.species?.lineage ?? null;
  draft.subspecies = subspeciesOf(options, draft.species).find((r) => same(r, c.species?.subspecies)) ?? null;
  const sizes = sizesOf(draft.species);
  draft.size = c.species?.size ?? (sizes.length === 1 ? sizes[0] : null);
  draft.cls = options.classes.find((r) => same(r, c.classes[0])) ?? null;
  draft.level = c.classes[0]?.level ?? 1;
  // A snapshot: the character may come in as reactive state, which structuredClone can't copy.
  draft.levels = $state.snapshot(c.levels ?? []) as LevelRecord[];
  draft.background = options.backgrounds.find((r) => same(r, c.background)) ?? null;
  const origin = $state.snapshot(c.origin ?? {}) as NonNullable<Character["origin"]>;
  draft.speciesChoice = toChoice(origin.species ?? emptyChoice());
  draft.backgroundChoice = toChoice(origin.background ?? emptyChoice());
  draft.backgroundFeatChoice = toChoice(origin.backgroundFeat ?? emptyChoice(backgroundFeatRef()));
  draft.languages = origin.languages ?? [];
  draft.extraLanguages = origin.extraLanguages ?? [];

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
export function editedCharacter(existing: Character, origin?: Character["origin"]): Character {
  const next = { ...toCharacter(), ...(origin ? { origin } : {}) };
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
          levelSaves: [],
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
