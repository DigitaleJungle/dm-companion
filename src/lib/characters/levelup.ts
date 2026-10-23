// Level up for one class: what the next level gives and asks (`levelPlan`), and the character file after the picks
// (`applyLevel`). Everything comes from the class, subclass, feature and feat entries in the rules data.

import type { Character } from "$lib/api/characters";
import {
  choiceComplete,
  emptyGains,
  mergeGains,
  parseRef,
  refKey,
  resolveChoice,
  sameRef,
  toChoice,
  type ChoiceGains,
  type Entry,
  type Lookup,
  type Ref,
  type SavedChoice,
} from "./choices";
import { ABILITIES, SCORE_CAP, level1Hp, modifier, type BonusOption, type Scores } from "./rules";

export {
  emptyChoice,
  entryChoices,
  parseRef,
  parseSpellFilter,
  prerequisite,
  refKey,
  spellGrants,
  spellMatches,
  type Entry,
  type Lookup,
  type Prereq,
  type Ref,
  type SavedChoice,
  type SpellFilter,
  type SpellGrant,
} from "./choices";
import { pactSlots, spellSlots } from "./sheet";

type Data = Record<string, unknown>;

const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const obj = (v: unknown): Data => (v && typeof v === "object" && !Array.isArray(v) ? (v as Data) : {});
const lower = (s: string) => s.toLowerCase();

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
// --- Picks, level records and rebuilding the character ------------------------------------

/** Hit points of a level: the fixed average, or a die result (rolled in the app, or a real die typed in as a manual roll); CON is added on top, so CON changes still count. */
export type HpChoice = { how: "average" | "roll" | "manual"; value: number };

/** A level's picks as the dialog keeps them, to open the level again. List keys are lowercase "name|source". */
export type LevelPicks = {
  hp: HpChoice | null;
  subclass: (Ref & { shortName: string }) | null;
  /** A feat per feat decision, with its sub-choices. */
  feats: Record<string, SavedChoice>;
  /** One pick per slot of an optional-feature decision (invocations, maneuvers…), with its sub-choices. */
  choices: Record<string, SavedChoice[]>;
  /** Picked keys per decision id: options, cantrips, spells, masteries, expertise. */
  keys: Record<string, string[]>;
};

/** What a level (or the character's origin) gave, resolved, so the sheet and Edit character can rebuild without the rules data. */
export type Gains = {
  subclass?: Ref & { shortName: string };
  /** `origin` when a feat came through something else (Lessons of the First Ones); `bonus`/`skills` on records from before `bonus`/`skills` below. */
  feats: (Ref & { origin?: string; bonus?: Record<string, number>; skills?: string[]; epic?: boolean })[];
  /** `atLevel`: the character level from which a spell applies (species spells). */
  spells: (Ref & { origin: string; level?: number; atLevel?: number; prepared?: boolean; always?: boolean; ability?: string })[];
  /** `target`: the known spell it applies to ("Eldritch Blast" for Agonizing Blast). */
  optional: (Ref & { type: string[]; target?: string })[];
  options: (Ref & { feature: string })[];
  masteries: Ref[];
  expertise: string[];
  skills?: string[];
  tools?: string[];
  languages?: string[];
  saves?: string[];
  bonus?: Record<string, number>;
};

/** One class level. Older records (from before levels could be edited) have a plain number for `hp` and nothing else. */
export type LevelRecord = { class: string; level: number; hp?: HpChoice | number; how?: string; picks?: LevelPicks; gains?: Gains };

export const emptyLevelPicks = (): LevelPicks => ({ hp: null, subclass: null, feats: {}, choices: {}, keys: {} });

/** Saved picks in today's shape: feats from before sub-choices, and invocations kept as a list of keys. */
export function normalizePicks(raw: LevelPicks): LevelPicks {
  const keys = { ...raw.keys };
  const choices = { ...(raw.choices ?? {}) };
  for (const id of Object.keys(keys).filter((k) => k.startsWith("op:") && !choices[k])) {
    choices[id] = keys[id].map((k) => ({ ...emptyChoiceFor(k) }));
    delete keys[id];
  }
  return { ...raw, feats: Object.fromEntries(Object.entries(raw.feats ?? {}).map(([id, f]) => [id, toChoice(f)])), choices, keys };
}
const emptyChoiceFor = (key: string): SavedChoice => toChoice({ ref: { name: key.split("|")[0], source: (key.split("|")[1] ?? "").toUpperCase() } });

/** Hit points for a level after the first: the fixed value (half the die + 1) or a roll, plus CON, at least 1. */
export const hpGain = (faces: number, con: number, roll?: number) => Math.max(1, (roll ?? faces / 2 + 1) + modifier(con));

/** A level's hit point gain from its record. */
export function levelHp(hp: LevelRecord["hp"] | null | undefined, faces: number, con: number): number {
  if (typeof hp === "number") return hp;
  if (!hp || hp.how === "average") return hpGain(faces, con);
  return hpGain(faces, con, hp.value);
}

/** Whether every decision of the plan has its picks. Level 1 has no hit point choice. */
export function complete(plan: Plan, picks: LevelPicks, find: Lookup): boolean {
  if (plan.level > 1 && !picks.hp) return false;
  return plan.decisions.every((d) => decisionComplete(d, plan.level, picks, find));
}

export function decisionComplete(d: Decision, level: number, picks: LevelPicks, find: Lookup): boolean {
  switch (d.kind) {
    case "subclass":
      return !!picks.subclass;
    case "feat": {
      const p = picks.feats[d.id];
      return !!p?.ref && choiceComplete(find.feat(p.ref), p, level, find);
    }
    case "optional": {
      const slots = picks.choices?.[d.id] ?? [];
      return slots.length === d.count && slots.every((s) => !!s.ref && choiceComplete(find.optional(refKey(s.ref)), s, level, find));
    }
    case "options":
    case "cantrips":
    case "spells":
    case "masteries":
    case "expertise":
      return (picks.keys[d.id] ?? []).length === d.count;
  }
}

const emptyLevelGains = (): Gains => ({ feats: [], spells: [], optional: [], options: [], masteries: [], expertise: [], skills: [], tools: [], languages: [], saves: [], bonus: {} });

/** Adds what a pick's sub-choices gave to a level's gains. */
function addChoice(g: Gains, sub: ChoiceGains) {
  const merged = mergeGains({ ...emptyGains(), skills: g.skills ?? [], tools: g.tools ?? [], languages: g.languages ?? [], saves: g.saves ?? [], bonus: g.bonus ?? {} }, sub);
  g.feats.push(...sub.feats);
  g.spells.push(...sub.spells);
  g.expertise.push(...sub.expertise);
  Object.assign(g, { skills: merged.skills, tools: merged.tools, languages: merged.languages, saves: merged.saves, bonus: merged.bonus });
}

/** The resolved gains of a level's picks; `always` are the class's and subclass's always-prepared spells reached at this level. */
export function gainsOf(plan: Plan, picks: LevelPicks, find: Lookup, cls: Entry, always: (Entry & { origin?: string })[] = []): Gains {
  const g = emptyLevelGains();
  const spell = (s: Entry, origin: string, extra: { prepared?: boolean; always?: boolean } = {}) => ({ name: s.name, source: s.source, origin, level: Number(s.data.level ?? 1), ...extra });
  const keys = (id: string) => picks.keys[id] ?? [];
  for (const d of plan.decisions) {
    if (d.kind === "subclass" && picks.subclass) g.subclass = { name: picks.subclass.name, source: picks.subclass.source, shortName: picks.subclass.shortName };
    else if (d.kind === "feat") {
      const p = picks.feats[d.id];
      const feat = p?.ref ? find.feat(p.ref) : null;
      if (!p || !feat) continue;
      g.feats.push({ name: feat.name, source: feat.source, ...(d.categories.includes("EB") ? { epic: true } : {}) });
      addChoice(g, resolveChoice(feat, p, plan.level, find, feat.name));
    } else if (d.kind === "optional") {
      for (const slot of picks.choices?.[d.id] ?? []) {
        const entry = slot.ref ? find.optional(refKey(slot.ref)) : null;
        if (!entry) continue;
        const target = slot.target ? find.spell(slot.target)?.name : undefined;
        g.optional.push({ name: entry.name, source: entry.source, type: d.types, ...(target ? { target } : {}) });
        addChoice(g, resolveChoice(entry, slot, plan.level, find, entry.name));
      }
    } else if (d.kind === "options") g.options.push(...d.refs.filter((r) => keys(d.id).includes(refKey(r))).map((r) => ({ name: r.name, source: r.source, feature: d.feature })));
    else if (d.kind === "cantrips" || d.kind === "spells") g.spells.push(...keys(d.id).flatMap((k) => find.spell(k) ?? []).map((s) => spell(s, d.origin, { prepared: true })));
    else if (d.kind === "masteries") g.masteries.push(...keys(d.id).flatMap((k) => find.item(k) ?? []).map((r) => ({ name: r.name, source: r.source })));
    else if (d.kind === "expertise") g.expertise.push(...keys(d.id));
  }
  const subclassName = picks.subclass?.name ?? cls.name;
  g.spells.push(...always.map((s) => spell(s, s.origin ?? subclassName, { always: true, prepared: true })));
  return g;
}

/** A deep copy; through JSON because callers pass the sheet's reactive character, which structuredClone can't copy. */
const copy = (c: Character): Character => JSON.parse(JSON.stringify(c));

const unique = <T>(items: T[], key: (t: T) => string) => [...new Map(items.map((i) => [key(i), i])).values()];

/** Takes off what a rebuild added last time (`added`), then adds what it adds now. */
function swap(current: string[] | undefined, added: string[] | undefined, now: string[]): { all: string[]; added: string[] } {
  const base = (current ?? []).filter((s) => !(added ?? []).includes(s));
  const fresh = [...new Set(now.filter((s) => !base.includes(s)))];
  return { all: [...base, ...fresh], added: fresh };
}

/**
 * Everything that comes from levels and from the origin choices (species and background sub-choices, languages),
 * recomputed from their records: feats, spells, invocations, option picks, weapon masteries, expertise, the skills,
 * tools, languages, saving throws and ability increases picks gave, the subclass and maximum hit points.
 * Items saved before levels had records (no `gained`) are left as they are. Damage taken carries over.
 */
export function rebuild(character: Character, faces: number): Character {
  const c = copy(character);
  const main = c.classes[0];
  if (!main) return c;
  const records = (c.levels ?? []).filter((r) => r.level <= main.level).sort((a, b) => a.level - b.level);
  c.levels = records;
  // The origin's gains count as level 0.
  const originGains = c.origin?.gains ? [{ level: 0, origin: "", gains: { ...emptyLevelGains(), ...c.origin.gains } as Gains }] : [];
  const tagged = [...originGains, ...records.flatMap((r) => (r.gains ? [{ level: r.level, origin: `${r.class} ${r.level}`, gains: r.gains }] : []))];
  const untagged = <T extends { gained?: number }>(items: T[] | undefined) => (items ?? []).filter((i) => i.gained === undefined);
  const all = <T>(pick: (g: Gains) => T[] | undefined) => tagged.flatMap((t) => pick(t.gains) ?? []);

  c.feats = [...untagged(c.feats), ...tagged.flatMap((t) => t.gains.feats.map((f) => ({ name: f.name, source: f.source, origin: f.origin || t.origin || undefined, gained: t.level })))];
  // A spell's prepared tick is set on the Spells tab; a rebuild keeps it.
  const prepared = new Map((c.spells ?? []).map((s) => [refKey(s), s.prepared]));
  c.spells = unique(
    [
      ...untagged(c.spells),
      ...tagged.flatMap((t) => t.gains.spells.map((s) => ({ ...s, gained: t.level, ...(prepared.has(refKey(s)) && !s.always ? { prepared: prepared.get(refKey(s)) } : {}) }))),
    ],
    refKey,
  );
  c.optionalFeatures = [...untagged(c.optionalFeatures), ...tagged.flatMap((t) => t.gains.optional.map((o) => ({ ...o, origin: main.name, gained: t.level })))];
  c.featureChoices = [...untagged(c.featureChoices), ...tagged.flatMap((t) => t.gains.options.map((o) => ({ ...o, gained: t.level })))];
  c.weaponMasteries = unique([...untagged(c.weaponMasteries), ...tagged.flatMap((t) => t.gains.masteries.map((m) => ({ ...m, gained: t.level })))], refKey);

  const skills = swap(c.skills, c.levelSkills, [...all((g) => g.skills), ...all((g) => g.feats.flatMap((f) => f.skills ?? []))]);
  c.skills = skills.all.sort();
  c.levelSkills = skills.added;
  const expertise = swap(c.expertise, c.levelExpertise, all((g) => g.expertise));
  [c.expertise, c.levelExpertise] = [expertise.all, expertise.added];
  const saves = swap(c.savingThrows, c.levelSaves, all((g) => g.saves));
  [c.savingThrows, c.levelSaves] = [saves.all, saves.added];
  c.tools = [...new Set(all((g) => g.tools))];
  c.languages = [...new Set(all((g) => g.languages))];

  const levelBonuses: Record<string, number> = {};
  const bonuses = [...all((g) => (g.bonus ? [g.bonus] : [])), ...all((g) => g.feats.flatMap((f) => (f.bonus ? [f.bonus] : [])))];
  for (const b of bonuses) for (const [a, n] of Object.entries(b)) levelBonuses[a] = (levelBonuses[a] ?? 0) + n;
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
/**
 * Every place each spell came from ("name|source" keys), oldest first: the origin or feat ("Magic Initiate"), then each class level.
 * The character keeps a spell once, so the level records are read to see the ones had twice.
 */
export function spellSources(c: Character, levelLabel: (cls: string, level: number) => string): Map<string, string[]> {
  const sources = new Map<string, string[]>();
  const from = (key: string, label: string) => sources.set(key, [...(sources.get(key) ?? []), label]);
  for (const s of c.spells ?? []) if (!s.gained) from(refKey(s), s.origin);
  for (const r of c.levels ?? []) for (const s of r.gains?.spells ?? []) from(refKey(s), levelLabel(r.class, r.level));
  return sources;
}

/** The character one class level lower: the highest level and what it gave are dropped (its subclass too). Level 1 stays. */
export function removeTopLevel(character: Character, faces: number): Character {
  const main = character.classes[0];
  if (!main || main.level <= 1) return copy(character);
  const top = (character.levels ?? []).find((r) => r.level === main.level);
  // rebuild only sets a subclass it finds in the records, so one picked at the removed level is cleared here.
  const cls = { ...main, level: main.level - 1 };
  if (top?.gains?.subclass) delete cls.subclass;
  return rebuild({ ...character, classes: [cls, ...character.classes.slice(1)] }, faces);
}

/** A class's or subclass's spells that are always prepared up to a class level ("prepared": { "3": ["bless|xphb"] }). */
export function subclassSpells(subclass: Data | null, level: number): Ref[] {
  // shortcut: only a subclass's first spell list; Circle of the Land's land types (several named lists) need a pick, add it with that subclass.
  const first = obj(list(subclass?.additionalSpells)[0]);
  return Object.entries(obj(first.prepared)).flatMap(([key, spells]) => (Number(key) <= level ? list(spells).filter((s): s is string => typeof s === "string").map((s) => parseRef(s)) : []));
}

export type { BonusOption };
