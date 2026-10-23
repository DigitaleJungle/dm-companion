// Level up for one class: what the next level gives and asks (`levelPlan`), and the character file after the picks
// (`applyLevel`). Everything comes from the class, subclass, feature and feat entries in the rules data.

import type { Character } from "$lib/api/characters";
import { ABILITIES, SCORE_CAP, bonusOptions, bonusTotals, level1Hp, modifier, skillGrant, type Ability, type BonusOption, type BonusPick, type Scores } from "./rules";
import { pactSlots, spellSlots } from "./sheet";

type Data = Record<string, unknown>;
export type Ref = { name: string; source: string };
/** A rules entry as the dialog loaded it. */
export type Entry = Ref & { data: Data };

const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const obj = (v: unknown): Data => (v && typeof v === "object" && !Array.isArray(v) ? (v as Data) : {});
const lower = (s: string) => s.toLowerCase();
const sameRef = (a: Ref, b: Ref) => lower(a.name) === lower(b.name) && lower(a.source) === lower(b.source);

/** "dungeoneer's pack|xphb" → { name, source }; "#c" style suffixes are dropped. */
export function parseRef(key: string, fallbackSource = ""): Ref {
  const [name, source] = key.split("#")[0].split("|");
  return { name: name.trim(), source: (source || fallbackSource).toUpperCase() };
}

/** Class feature refs: "Name|Class|ClassSrc|level[|src]"; subclass ones: "Name|Class|ClassSrc|Short|SubSrc|level[|src]". */
export function featureRef(ref: string, subclass = false): Ref & { level: number } {
  const p = ref.split("|");
  const level = Number(subclass ? p[5] : p[3]);
  const source = (subclass ? p[6] || p[4] : p[4] || p[2]) ?? "";
  return { name: p[0], source: source.toUpperCase(), level };
}

/** A progression value at a level: arrays are indexed by level − 1, objects keyed by the level they change at. */
export function progressionAt(progression: unknown, level: number): number {
  if (Array.isArray(progression)) return Number(progression[level - 1] ?? 0);
  const keys = Object.keys(obj(progression)).map(Number).filter((k) => k <= level);
  return keys.length ? Number(obj(progression)[String(Math.max(...keys))]) : 0;
}

/** Feats per level in `featProgression`: `{ "19": 1 }` adds one at level 19. */
const featsGainedAt = (progression: unknown, level: number) => Number(obj(progression)[String(level)] ?? 0);

// --- Features -------------------------------------------------------------------------------

export type Feature = Entry & { level: number; subclass: boolean; gainSubclass: boolean };

/** The class's (or subclass's) features at one level, in the class's order, matched to their loaded entries. */
export function featuresAt(owner: Data | null, entries: Entry[], level: number, subclass: boolean): Feature[] {
  const refs = list(owner?.[subclass ? "subclassFeatures" : "classFeatures"]);
  return refs.flatMap((r): Feature[] => {
    const raw = typeof r === "string" ? r : String(obj(r)[subclass ? "subclassFeature" : "classFeature"] ?? "");
    const ref = featureRef(raw, subclass);
    if (ref.level !== level || !ref.name) return [];
    const entry = entries.find((e) => sameRef(e, ref) && Number(e.data.level) === level) ?? { ...ref, data: {} };
    return [{ ...entry, level, subclass, gainSubclass: obj(r).gainSubclassFeature === true }];
  });
}

/** The `options` lists in a feature's text: pick `count` of the referenced class or subclass features. */
function optionsIn(entries: unknown): { count: number; refs: Ref[] }[] {
  const found: { count: number; refs: Ref[] }[] = [];
  const walk = (v: unknown) => {
    if (Array.isArray(v)) return v.forEach(walk);
    const o = obj(v);
    if (o.type === "options") {
      const refs = list(o.entries).flatMap((e): Ref[] => {
        const x = obj(e);
        if (x.type === "refClassFeature") return [featureRef(String(x.classFeature))];
        if (x.type === "refSubclassFeature") return [featureRef(String(x.subclassFeature), true)];
        return []; // refOptionalfeature lists are counted by optionalfeatureProgression instead
      });
      if (refs.length) found.push({ count: Number(o.count ?? 1), refs });
    }
    Object.values(o).forEach(walk);
  };
  walk(entries);
  return found;
}

const NUMBER_WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4 };
/**
 * How many skills an Expertise feature asks for.
 * shortcut: read from the text ("in two of your skill proficiencies"), 2 when it doesn't say; fine for every book so far.
 */
function expertiseCount(feature: Feature): number {
  const text = JSON.stringify(feature.data.entries ?? "").toLowerCase();
  const m = /(one|two|three|four|\d) (?:more )?of your skill proficiencies/.exec(text);
  return m ? (NUMBER_WORDS[m[1]] ?? Number(m[1])) : 2;
}

// --- Decisions ------------------------------------------------------------------------------

export type Decision =
  | { kind: "subclass"; id: string; feature: string }
  | { kind: "feat"; id: string; feature: string; categories: string[]; asi: boolean }
  | { kind: "options"; id: string; feature: string; count: number; refs: Ref[] }
  | { kind: "optional"; id: string; feature: string; types: string[]; count: number }
  | { kind: "cantrips"; id: string; count: number; list: Ref; origin: string }
  | { kind: "spells"; id: string; count: number; maxLevel: number; list: Ref; origin: string }
  | { kind: "masteries"; id: string; count: number }
  | { kind: "expertise"; id: string; feature: string; count: number };

export type Plan = { level: number; features: Feature[]; decisions: Decision[] };

export type PlanInput = {
  /** The class level being built. */
  level: number;
  cls: Entry;
  /** The subclass the character has by this level, or the one picked at it. */
  subclass: Entry | null;
  classFeatures: Entry[];
  subclassFeatures: Entry[];
};

/** The highest spell level the class (or its spellcasting subclass) can cast at a level; 0 for none. */
export function maxSpellLevel(cls: Data, subclass: Data | null, level: number): number {
  const fromSlots = (d: Data | null) => spellSlots(d, level).length;
  const sub = subclass ? { classTableGroups: subclass.subclassTableGroups } : null;
  return Math.max(fromSlots(cls), pactSlots(cls, level)?.level ?? 0, fromSlots(sub));
}

/** Third casters (Eldritch Knight, Arcane Trickster) have no list of their own. shortcut: they use the Wizard's, true for both editions. */
const spellListOf = (cls: Entry, subclass: Entry | null): Ref =>
  cls.data.spellcastingAbility || !subclass?.data.spellcastingAbility ? { name: cls.name, source: cls.source } : { name: "Wizard", source: cls.source };

/** What one class level adds: counts are what the class tables add at that level (level 1: their first value). */
const added = (progression: unknown, level: number) => progressionAt(progression, level) - (level > 1 ? progressionAt(progression, level - 1) : 0);

export function levelPlan({ level, cls, subclass, classFeatures, subclassFeatures }: PlanInput): Plan {
  const features = [...featuresAt(cls.data, classFeatures, level, false), ...(subclass ? featuresAt(subclass.data, subclassFeatures, level, true) : [])];
  const decisions: Decision[] = [];

  for (const f of features) {
    const id = `${f.subclass ? "s" : "c"}:${f.name}`;
    if (f.gainSubclass) decisions.push({ kind: "subclass", id, feature: f.name });
    else if (lower(f.name) === "ability score improvement") decisions.push({ kind: "feat", id, feature: f.name, categories: ["G"], asi: true });
    else if (lower(f.name) === "expertise") decisions.push({ kind: "expertise", id, feature: f.name, count: expertiseCount(f) });
    optionsIn(f.data.entries).forEach((o, i) => decisions.push({ kind: "options", id: `${id}:${i}`, feature: f.name, count: o.count, refs: o.refs }));
  }

  for (const owner of [cls, subclass]) {
    for (const fp of list(owner?.data.featProgression)) {
      const p = obj(fp);
      for (let i = 0; i < featsGainedAt(p.progression, level); i++) {
        decisions.push({ kind: "feat", id: `fp:${String(p.name)}:${i}`, feature: String(p.name), categories: list(p.category).map(String), asi: false });
      }
    }
    for (const op of list(owner?.data.optionalfeatureProgression)) {
      const p = obj(op);
      const count = added(p.progression, level);
      if (count > 0) decisions.push({ kind: "optional", id: `op:${String(p.name)}`, feature: String(p.name), types: list(p.featureType).map(String), count });
    }
  }

  const caster = [cls, subclass].find((o) => o?.data.cantripProgression || o?.data.preparedSpellsProgression) ?? null;
  if (caster) {
    const spellList = spellListOf(cls, subclass);
    const cantrips = added(caster.data.cantripProgression, level);
    const spells = added(caster.data.preparedSpellsProgression, level);
    const origin = caster.name;
    if (cantrips > 0) decisions.push({ kind: "cantrips", id: "cantrips", count: cantrips, list: spellList, origin });
    if (spells > 0) decisions.push({ kind: "spells", id: "spells", count: spells, maxLevel: maxSpellLevel(cls.data, subclass?.data ?? null, level), list: spellList, origin });
  }

  const masteries = added(cls.data.itemMasteriesProgression, level);
  if (masteries > 0) decisions.push({ kind: "masteries", id: "masteries", count: masteries });

  return { level, features, decisions };
}
// --- Feats ----------------------------------------------------------------------------------

export type Prereq = "met" | "unmet" | "check";

/**
 * Prerequisites are alternatives (any one will do); inside one, everything must hold. Level, ability scores and other
 * feats are checked; anything else (a feature, a spellcasting ability…) comes back as "check" for the DM to judge.
 */
export function prerequisite(raw: unknown, ctx: { level: number; scores: Scores | null; feats: Ref[]; optional?: Ref[] }): Prereq {
  const alternatives = list(raw);
  if (!alternatives.length) return "met";
  let best: Prereq = "unmet";
  for (const alt of alternatives) {
    let result: Prereq = "met";
    for (const [key, value] of Object.entries(obj(alt))) {
      let ok: boolean | null = null;
      if (key === "level") ok = ctx.level >= Number(typeof value === "number" ? value : obj(value).level);
      // Without scores yet (a character still being created), ability prerequisites are for the DM to check.
      else if (key === "ability") ok = ctx.scores ? list(value).some((a) => Object.entries(obj(a)).every(([ab, min]) => (ctx.scores![ab as Ability] ?? 0) >= Number(min))) : null;
      else if (key === "feat") ok = list(value).every((f) => ctx.feats.some((x) => sameRef(x, parseRef(String(f)))));
      else if (key === "optionalfeature") ok = list(value).every((f) => (ctx.optional ?? []).some((x) => sameRef(x, parseRef(String(f)))));
      else if (key === "pact") ok = (ctx.optional ?? []).some((x) => lower(x.name) === `pact of the ${lower(String(value))}`);
      if (ok === false) result = "unmet";
      else if (ok === null && result === "met") result = "check";
      if (result === "unmet") break;
    }
    if (result === "met") return "met";
    if (result === "check") best = "check";
  }
  return best;
}

/** A spell filter like "level=0|class=Wizard", "level=1|school=E;D" or "level=1|components & miscellaneous=ritual". */
export type SpellFilter = { levels: number[]; classes: string[]; schools: string[]; ritual: boolean };

export function parseSpellFilter(text: string): SpellFilter {
  const f: SpellFilter = { levels: [], classes: [], schools: [], ritual: false };
  for (const part of text.split("|")) {
    const [key, value = ""] = part.split("=");
    const values = value.split(";").map((v) => v.trim()).filter(Boolean);
    if (lower(key) === "level") f.levels = values.map(Number);
    else if (lower(key) === "class") f.classes = values.map(lower);
    else if (lower(key) === "school") f.schools = values.map((v) => v.toUpperCase());
    else if (lower(key).includes("miscellaneous")) f.ritual = values.some((v) => lower(v) === "ritual");
  }
  return f;
}

/** `classLists` maps a lowercase class name to the spells on its list ("fireball|xphb"). */
export function spellMatches(spell: Entry, f: SpellFilter, classLists: Map<string, Set<string>>): boolean {
  const key = lower(`${spell.name}|${spell.source}`);
  return (
    (!f.levels.length || f.levels.includes(Number(spell.data.level))) &&
    (!f.schools.length || f.schools.includes(String(spell.data.school ?? "").toUpperCase())) &&
    (!f.ritual || obj(spell.data.meta).ritual === true) &&
    f.classes.every((c) => classLists.get(c)?.has(key) ?? false)
  );
}

/** One way a feat grants spells (Magic Initiate has one per class): fixed spells and choices. */
export type SpellGrant = { name: string; fixed: Ref[]; choose: { filter: SpellFilter; count: number }[] };

/** The spells in a feat's (or species') `additionalSpells`, up to a character level. */
export function spellGrants(raw: unknown, level: number): SpellGrant[] {
  return list(raw).map((option, i) => {
    const o = obj(option);
    const grant: SpellGrant = { name: typeof o.name === "string" ? o.name : String(i + 1), fixed: [], choose: [] };
    const collect = (v: unknown): void => {
      if (typeof v === "string") grant.fixed.push(parseRef(v));
      else if (Array.isArray(v)) v.forEach(collect);
      else if (typeof obj(v).choose === "string") grant.choose.push({ filter: parseSpellFilter(String(obj(v).choose)), count: Number(obj(v).count ?? 1) });
      else Object.values(obj(v)).forEach(collect);
    };
    for (const kind of ["known", "innate", "prepared"]) {
      for (const [key, value] of Object.entries(obj(o[kind]))) if (key === "_" || Number.parseInt(key) <= level) collect(value);
    }
    return grant;
  });
}

/** What a picked feat asks for itself. */
export function featChoices(feat: Entry, level: number) {
  const skills = skillGrant(feat.data.skillProficiencies);
  return {
    bonus: bonusOptions(feat.data.ability),
    skills,
    expertise: list(feat.data.expertise).reduce<number>((n, e) => n + Number(obj(e).anyProficientSkill ?? 0), 0),
    spells: spellGrants(feat.data.additionalSpells, level),
  };
}

// --- Picks, level records and rebuilding the character ------------------------------------

/** Hit points of a level: the fixed average, a roll (the die's result, so CON changes still count) or a typed total. */
export type HpChoice = { how: "average" | "roll" | "manual"; value: number };

/** A level's picks as the dialog keeps them, to open the level again. List keys are lowercase "name|source". */
export type SavedFeat = { feat: Ref | null; bonus: BonusPick; skills: string[]; expertise: string[]; grant: number; spells: string[][] };
export type LevelPicks = {
  hp: HpChoice | null;
  subclass: (Ref & { shortName: string }) | null;
  feats: Record<string, SavedFeat>;
  /** Picked keys per decision id: options, invocations, cantrips, spells, masteries, expertise. */
  keys: Record<string, string[]>;
};

/** What a level gave, resolved, so the sheet and Edit character can rebuild without the rules data. */
export type Gains = {
  subclass?: Ref & { shortName: string };
  feats: (Ref & { bonus?: Record<string, number>; skills?: string[]; epic?: boolean })[];
  spells: (Ref & { origin: string; level?: number; prepared?: boolean; always?: boolean })[];
  optional: (Ref & { type: string[] })[];
  options: (Ref & { feature: string })[];
  masteries: Ref[];
  expertise: string[];
};

/** One class level. Older records (from before levels could be edited) have a plain number for `hp` and nothing else. */
export type LevelRecord = { class: string; level: number; hp?: HpChoice | number; how?: string; picks?: LevelPicks; gains?: Gains };

export const emptyLevelPicks = (): LevelPicks => ({ hp: null, subclass: null, feats: {}, keys: {} });
export const emptyFeat = (): SavedFeat => ({ feat: null, bonus: { option: 0, picks: [] }, skills: [], expertise: [], grant: 0, spells: [] });
export const refKey = (r: Ref) => lower(`${r.name}|${r.source}`);

/** Hit points for a level after the first: the fixed value (half the die + 1) or a roll, plus CON, at least 1. */
export const hpGain = (faces: number, con: number, roll?: number) => Math.max(1, (roll ?? faces / 2 + 1) + modifier(con));

/** A level's hit point gain from its record. */
export function levelHp(hp: LevelRecord["hp"] | null | undefined, faces: number, con: number): number {
  if (typeof hp === "number") return hp;
  if (!hp || hp.how === "average") return hpGain(faces, con);
  return hp.how === "roll" ? hpGain(faces, con, hp.value) : Math.max(1, hp.value);
}

/** The rules entries behind the picked keys, from what the dialog loaded. */
export type Lookup = { feat: (r: Ref) => Entry | null; spell: (key: string) => Entry | null; optional: (key: string) => Entry | null; item: (key: string) => Entry | null };

/** Whether every decision of the plan has its picks. Level 1 has no hit point choice. */
export function complete(plan: Plan, picks: LevelPicks, find: Lookup): boolean {
  if (plan.level > 1 && !picks.hp) return false;
  return plan.decisions.every((d) => decisionComplete(d, plan.level, picks, find));
}

export function decisionComplete(d: Decision, level: number, picks: LevelPicks, find: Lookup): boolean {
  const n = (picks.keys[d.id] ?? []).length;
  switch (d.kind) {
    case "subclass":
      return !!picks.subclass;
    case "feat": {
      const p = picks.feats[d.id];
      const feat = p?.feat ? find.feat(p.feat) : null;
      if (!p || !feat) return false;
      const c = featChoices(feat, level);
      const grant = c.spells[p.grant];
      const spellsDone = !grant || grant.choose.every((x, i) => (p.spells[i] ?? []).length === x.count);
      const bonusDone = !c.bonus.length || (c.bonus[p.bonus.option]?.choices ?? []).every((ch, i) => (p.bonus.picks[i] ?? []).filter(Boolean).length === ch.amounts.length);
      return bonusDone && spellsDone && p.skills.length === c.skills.choices.reduce((x, y) => x + y.count, 0) && p.expertise.length === c.expertise;
    }
    case "options":
    case "optional":
    case "cantrips":
    case "spells":
    case "masteries":
    case "expertise":
      return n === d.count;
  }
}

/** The resolved gains of a level's picks; `always` are the subclass's always-prepared spells reached at this level. */
export function gainsOf(plan: Plan, picks: LevelPicks, find: Lookup, cls: Entry, always: Entry[] = []): Gains {
  const g: Gains = { feats: [], spells: [], optional: [], options: [], masteries: [], expertise: [] };
  const spell = (s: Entry, origin: string, extra: { prepared?: boolean; always?: boolean } = {}) => ({ name: s.name, source: s.source, origin, level: Number(s.data.level ?? 1), ...extra });
  const keys = (id: string) => picks.keys[id] ?? [];
  for (const d of plan.decisions) {
    if (d.kind === "subclass" && picks.subclass) g.subclass = { name: picks.subclass.name, source: picks.subclass.source, shortName: picks.subclass.shortName };
    else if (d.kind === "feat") {
      const p = picks.feats[d.id];
      const feat = p?.feat ? find.feat(p.feat) : null;
      if (!p || !feat) continue;
      const choices = featChoices(feat, plan.level);
      const bonus = bonusTotals(choices.bonus, p.bonus);
      const skills = [...choices.skills.fixed, ...p.skills];
      g.feats.push({ name: feat.name, source: feat.source, ...(Object.keys(bonus).length ? { bonus } : {}), ...(skills.length ? { skills } : {}), ...(d.categories.includes("EB") ? { epic: true } : {}) });
      g.expertise.push(...p.expertise);
      const grant = choices.spells[p.grant];
      if (grant) {
        g.spells.push(...grant.fixed.map((r) => ({ ...r, origin: feat.name })));
        g.spells.push(...p.spells.flat().flatMap((k) => find.spell(k) ?? []).map((s) => spell(s, feat.name)));
      }
    } else if (d.kind === "options") g.options.push(...d.refs.filter((r) => keys(d.id).includes(refKey(r))).map((r) => ({ name: r.name, source: r.source, feature: d.feature })));
    else if (d.kind === "optional") g.optional.push(...keys(d.id).flatMap((k) => find.optional(k) ?? []).map((o) => ({ name: o.name, source: o.source, type: d.types })));
    else if (d.kind === "cantrips" || d.kind === "spells") g.spells.push(...keys(d.id).flatMap((k) => find.spell(k) ?? []).map((s) => spell(s, d.origin, { prepared: true })));
    else if (d.kind === "masteries") g.masteries.push(...keys(d.id).flatMap((k) => find.item(k) ?? []).map((r) => ({ name: r.name, source: r.source })));
    else if (d.kind === "expertise") g.expertise.push(...keys(d.id));
  }
  const subclassName = picks.subclass?.name ?? cls.name;
  g.spells.push(...always.map((s) => spell(s, subclassName, { always: true, prepared: true })));
  return g;
}

/** A deep copy; through JSON because callers pass the sheet's reactive character, which structuredClone can't copy. */
const copy = (c: Character): Character => JSON.parse(JSON.stringify(c));

const unique = <T>(items: T[], key: (t: T) => string) => [...new Map(items.map((i) => [key(i), i])).values()];

/**
 * Everything that comes from levels, recomputed from the level records: feats, spells, invocations, option picks,
 * weapon masteries, expertise, the skills and ability increases feats gave, the subclass and maximum hit points.
 * Items saved before levels had records (no `gained`) are left as they are. Damage taken carries over.
 */
export function rebuild(character: Character, faces: number): Character {
  const c = copy(character);
  const main = c.classes[0];
  if (!main) return c;
  const records = (c.levels ?? []).filter((r) => r.level <= main.level).sort((a, b) => a.level - b.level);
  c.levels = records;
  const tagged = records.flatMap((r) => (r.gains ? [{ level: r.level, origin: `${r.class} ${r.level}`, gains: r.gains }] : []));
  const untagged = <T extends { gained?: number }>(items: T[] | undefined) => (items ?? []).filter((i) => i.gained === undefined);
  const each = <T>(pick: (g: Gains) => T[]) => tagged.flatMap((t) => pick(t.gains).map((x) => ({ ...x, gained: t.level, origin: t.origin })));

  c.feats = [...untagged(c.feats), ...each((g) => g.feats).map(({ name, source, origin, gained }) => ({ name, source, origin, gained }))];
  c.spells = unique([...untagged(c.spells), ...tagged.flatMap((t) => t.gains.spells.map((s) => ({ ...s, gained: t.level })))], refKey);
  c.optionalFeatures = [...untagged(c.optionalFeatures), ...tagged.flatMap((t) => t.gains.optional.map((o) => ({ ...o, origin: main.name, gained: t.level })))];
  c.featureChoices = [...untagged(c.featureChoices), ...tagged.flatMap((t) => t.gains.options.map((o) => ({ ...o, gained: t.level })))];
  c.weaponMasteries = unique([...untagged(c.weaponMasteries), ...tagged.flatMap((t) => t.gains.masteries.map((m) => ({ ...m, gained: t.level })))], refKey);

  // Skills and expertise: take off what levels added last time, then add what they add now.
  const featSkills = tagged.flatMap((t) => t.gains.feats.flatMap((f) => f.skills ?? []));
  const baseSkills = (c.skills ?? []).filter((s) => !(c.levelSkills ?? []).includes(s));
  c.levelSkills = [...new Set(featSkills.filter((s) => !baseSkills.includes(s)))];
  c.skills = [...baseSkills, ...c.levelSkills].sort();
  const levelExpertise = tagged.flatMap((t) => t.gains.expertise);
  const baseExpertise = (c.expertise ?? []).filter((s) => !(c.levelExpertise ?? []).includes(s));
  c.levelExpertise = [...new Set(levelExpertise.filter((s) => !baseExpertise.includes(s)))];
  c.expertise = [...baseExpertise, ...c.levelExpertise];

  const levelBonuses: Record<string, number> = {};
  for (const f of tagged.flatMap((t) => t.gains.feats)) for (const [a, n] of Object.entries(f.bonus ?? {})) levelBonuses[a] = (levelBonuses[a] ?? 0) + n;
  if (c.abilities) c.abilities = { ...c.abilities, levelBonuses };

  const subclass = [...tagged].reverse().find((t) => t.gains.subclass)?.gains.subclass;
  if (subclass) c.classes = [{ ...main, subclass }, ...c.classes.slice(1)];

  // Hit points: level 1's, plus each later level's record (the fixed value when it has none). Damage taken stays.
  const con = scoresWithLevels(c)?.con;
  if (faces > 0 && con !== undefined) {
    const byLevel = new Map(records.map((r) => [r.level, r]));
    let max = level1Hp(faces, con);
    for (let l = 2; l <= main.level; l++) max += levelHp(byLevel.get(l)?.hp, faces, con);
    const old = c.hp?.max ?? max;
    const damage = Math.max(0, old - (c.hp?.current ?? old));
    c.hp = { ...c.hp, max, current: Math.max(0, max - damage) };
  }
  return c;
}

/** Base scores plus species/background bonuses plus feat increases from levels, each at most 20 (30 with an Epic Boon). */
export function scoresWithLevels(c: Character): Scores | null {
  const a = c.abilities;
  if (!a?.base) return null;
  const epic = (c.levels ?? []).some((r) => r.gains?.feats.some((f) => f.epic));
  return Object.fromEntries(
    ABILITIES.map((k) => {
      const before = (a.base[k] ?? 10) + (a.bonuses?.[k] ?? 0);
      const levels = a.levelBonuses?.[k] ?? 0;
      return [k, levels ? Math.max(before, Math.min(epic ? 30 : SCORE_CAP, before + levels)) : before];
    }),
  ) as Scores;
}

/** Adds or replaces one level's record and rebuilds the character from all records. */
export function withLevel(character: Character, record: LevelRecord, faces: number): Character {
  const c = copy(character);
  c.levels = [...(c.levels ?? []).filter((r) => r.level !== record.level), record];
  if (record.level > (c.classes[0]?.level ?? 0)) c.classes = [{ ...c.classes[0], level: record.level }, ...c.classes.slice(1)];
  return rebuild(c, faces);
}
/** Subclass spells that are always prepared up to a class level ("prepared": { "3": ["bless|xphb"] }). */
export function subclassSpells(subclass: Data | null, level: number): Ref[] {
  // shortcut: only a subclass's first spell list; Circle of the Land's land types (several named lists) need a pick, add it with that subclass.
  const first = obj(list(subclass?.additionalSpells)[0]);
  return Object.entries(obj(first.prepared)).flatMap(([key, spells]) => (Number(key) <= level ? list(spells).filter((s): s is string => typeof s === "string").map((s) => parseRef(s)) : []));
}

export type { BonusOption };
