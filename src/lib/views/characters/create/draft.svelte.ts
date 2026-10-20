import type { CatalogRow } from "$lib/api/rules";
import type { Roll } from "$lib/api/dice";
import {
  ABILITIES,
  SCORE_CAP,
  STANDARD_ARRAY,
  assignedScores,
  bonusComplete,
  bonusOptions,
  bonusTotals,
  emptyAssignment,
  emptyPick,
  finalScores,
  inSources,
  level1Hp,
  lineageNames,
  mergeOptions,
  skillGrant,
  type Ability,
  type Assignment,
  type BonusOption,
  type BonusPick,
  type Scores,
  type SkillChoice,
} from "$lib/characters/rules";

export const STEPS = ["basics", "species", "class", "background", "abilities", "skills", "review"] as const;
export type Step = (typeof STEPS)[number];
export type Method = "standard" | "manual" | "roll";

/** The rules entries the wizard picks from, with only the fields it needs. */
export type Options = { species: CatalogRow[]; subspecies: CatalogRow[]; classes: CatalogRow[]; backgrounds: CatalogRow[]; skills: CatalogRow[] };

export const OPTION_KEYS = {
  species: ["size", "_versions", "skillProficiencies", "ability", "lineage", "entries"],
  subspecies: ["raceName", "raceSource", "skillProficiencies", "ability"],
  class: ["startingProficiencies", "proficiency", "hd", "isSidekick"],
  background: ["skillProficiencies", "ability", "feats"],
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
    background: null as CatalogRow | null,
    method: "standard" as Method,
    rolls: [] as Roll[],
    assignment: emptyAssignment() as Assignment,
    manual: manualDefault(),
    speciesPick: emptyPick(undefined) as BonusPick,
    backgroundPick: emptyPick(undefined) as BonusPick,
    /** Picked skills per choice group (see `skillGroups`). */
    skillPicks: {} as Record<string, string[]>,
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
}

export function chooseSubspecies(row: CatalogRow | null) {
  draft.subspecies = row;
  draft.skillPicks = {};
  draft.speciesPick = emptyPick(undefined);
}

export function chooseClass(row: CatalogRow | null) {
  draft.cls = row;
  draft.skillPicks = {};
}

export function chooseBackground(row: CatalogRow | null) {
  draft.background = row;
  draft.skillPicks = {};
  draft.backgroundPick = emptyPick(undefined);
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
  const bonus = (bonusTotals(speciesBonuses(), draft.speciesPick)[ability] ?? 0) + (bonusTotals(backgroundBonuses(), draft.backgroundPick)[ability] ?? 0);
  return Math.min(SCORE_CAP, base + bonus);
}

export function scores(): Scores | null {
  const base = baseScores();
  return base && finalScores(base, [bonusTotals(speciesBonuses(), draft.speciesPick), bonusTotals(backgroundBonuses(), draft.backgroundPick)]);
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
      return !!draft.cls;
    case "background":
      return !!draft.background;
    case "abilities":
      return (
        baseScores() !== null &&
        (draft.method !== "roll" || draft.rolls.length === ABILITIES.length) &&
        bonusComplete(speciesBonuses(), draft.speciesPick) &&
        bonusComplete(backgroundBonuses(), draft.backgroundPick)
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
    classes: [{ name: draft.cls!.name, source: draft.cls!.source, level: 1 }],
    background: { name: draft.background!.name, source: draft.background!.source },
    abilities: {
      method: draft.method,
      base,
      bonuses: Object.fromEntries(ABILITIES.map((a) => [a, final[a] - base[a]])),
    },
    skills: allSkills().sort(),
    savingThrows: savingThrows(),
    hp: { max: level1Hp(hitDie(), final.con) },
    feats: backgroundFeats(),
  };
}
