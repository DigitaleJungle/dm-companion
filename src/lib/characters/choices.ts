// What a rules entry asks you to choose, and what your picks give: one model for feats, invocations and other
// optional features, species and backgrounds. Choices nest: an invocation can grant a feat, which asks its own.

import { bonusOptions, bonusTotals, emptyPick, skillGrant, type Ability, type BonusOption, type BonusPick, type Scores } from "./rules";

type Data = Record<string, unknown>;
export type Ref = { name: string; source: string };
/** A rules entry as it was loaded. */
export type Entry = Ref & { data: Data };

const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const obj = (v: unknown): Data => (v && typeof v === "object" && !Array.isArray(v) ? (v as Data) : {});
const lower = (s: string) => s.toLowerCase();
export const sameRef = (a: Ref, b: Ref) => lower(a.name) === lower(b.name) && lower(a.source) === lower(b.source);
export const refKey = (r: Ref) => lower(`${r.name}|${r.source}`);

/** "dungeoneer's pack|xphb" → { name, source }; "#c" style suffixes are dropped. */
export function parseRef(key: string, fallbackSource = ""): Ref {
  const [name, source] = key.split("#")[0].split("|");
  return { name: name.trim(), source: (source || fallbackSource).toUpperCase() };
}

// --- Spells ---------------------------------------------------------------------------------

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
  return (
    (!f.levels.length || f.levels.includes(Number(spell.data.level))) &&
    (!f.schools.length || f.schools.includes(String(spell.data.school ?? "").toUpperCase())) &&
    (!f.ritual || obj(spell.data.meta).ritual === true) &&
    f.classes.every((c) => classLists.get(c)?.has(refKey(spell)) ?? false)
  );
}

/** One way an entry grants spells (Magic Initiate has one per class, an Elf one per lineage). `atLevel`: from which character level. */
export type SpellGrant = { name: string; fixed: (Ref & { atLevel: number })[]; choose: { filter: SpellFilter; count: number }[] };

/** The spells in an `additionalSpells` list. Fixed spells keep the character level they come at; choices only count up to `level`. */
export function spellGrants(raw: unknown, level: number): SpellGrant[] {
  return list(raw).map((option, i) => {
    const o = obj(option);
    const grant: SpellGrant = { name: typeof o.name === "string" ? o.name : String(i + 1), fixed: [], choose: [] };
    for (const kind of ["known", "innate", "prepared"]) {
      for (const [key, value] of Object.entries(obj(o[kind]))) {
        const atLevel = key === "_" ? 1 : Number.parseInt(key);
        const collect = (v: unknown): void => {
          if (typeof v === "string") grant.fixed.push({ ...parseRef(v), atLevel });
          else if (Array.isArray(v)) v.forEach(collect);
          else if (typeof obj(v).choose === "string") {
            if (atLevel <= level) grant.choose.push({ filter: parseSpellFilter(String(obj(v).choose)), count: Number(obj(v).count ?? 1) });
          } else Object.values(obj(v)).forEach(collect);
        };
        if (Number.isFinite(atLevel)) collect(value);
      }
    }
    return grant;
  });
}

// --- Prerequisites ----------------------------------------------------------------------------

export type Prereq = "met" | "unmet" | "check";
export type PrereqContext = {
  level: number;
  scores: Scores | null;
  feats: Ref[];
  optional?: Ref[];
  /** Whether a known spell matches a filter (Agonizing Blast needs a Warlock damage cantrip); omitted: for the DM to check. */
  knowsSpell?: (filter: SpellFilter) => boolean;
};

/**
 * Prerequisites are alternatives (any one will do); inside one, everything must hold. Level, ability scores, feats,
 * invocations, pacts and known spells are checked; anything else comes back as "check" for the DM to judge.
 */
export function prerequisite(raw: unknown, ctx: PrereqContext): Prereq {
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
      else if (key === "spell" && ctx.knowsSpell) ok = list(value).every((s) => typeof obj(s).choose === "string" && ctx.knowsSpell!(parseSpellFilter(String(obj(s).choose))));
      if (ok === false) result = "unmet";
      else if (ok === null && result === "met") result = "check";
      if (result === "unmet") break;
    }
    if (result === "met") return "met";
    if (result === "check") best = "check";
  }
  return best;
}

// --- What an entry asks -----------------------------------------------------------------------

/**
 * Pick `count` among named keys (`from`) or whole pools: "skill", "tool", "artisan" (artisan's tools), "instrument"
 * (musical instruments), "language", "standard" (standard languages). Picked keys are "skill:arcana", "tool:…", "language:…".
 */
export type ProfChoice = { from: string[]; pools: string[]; count: number };
export type Fixed = { skills: string[]; tools: string[]; languages: string[] };

const POOLS: Record<string, string> = {
  any: "",
  anySkill: "skill",
  anyTool: "tool",
  anyArtisansTool: "artisan",
  anyMusicalInstrument: "instrument",
  anyLanguage: "language",
  anyStandard: "standard",
  anyStandardLanguage: "standard",
};

/** A proficiency list (`skillProficiencies`, `toolProficiencies`, …): fixed keys, `choose`, and `any…` counts. */
function profs(raw: unknown, kind: "skill" | "tool" | "language", fixed: string[], choices: ProfChoice[]) {
  const option = obj(list(raw)[0]); // shortcut: the first alternative only, as skillGrant does; offer more when one shows up
  for (const [key, value] of Object.entries(option)) {
    if (value === true) fixed.push(`${kind}:${lower(key)}`);
    else if (key === "choose") {
      for (const c of Array.isArray(value) ? value : [value]) {
        const from = list(obj(c).from).map(String);
        const pools = from.filter((f) => f in POOLS).map((f) => POOLS[f] || kind);
        choices.push({ from: from.filter((f) => !(f in POOLS)).map((f) => `${kind}:${lower(f)}`), pools, count: Number(obj(c).count ?? 1) });
      }
    } else if (key in POOLS && typeof value === "number") choices.push({ from: [], pools: [POOLS[key] || kind], count: value });
  }
}

export type EntryChoices = {
  bonus: BonusOption[];
  fixed: Fixed;
  profs: ProfChoice[];
  /** Saving throws to pick (Resilient). */
  saves: { from: Ability[]; count: number }[];
  /** How many proficient skills get expertise. */
  expertise: number;
  spells: SpellGrant[];
  /** Feats to pick, by category ("O" = Origin): an invocation's or a species' feat. */
  feats: { categories: string[]; count: number }[];
  /** "Choose one of your known … cantrips": the filter the target spell must match. */
  target: SpellFilter | null;
  repeatable: boolean;
};

/** Everything an entry asks, at a character level (spell choices that come later don't count yet). */
export function entryChoices(data: Data, level: number): EntryChoices {
  const fixed: Fixed = { skills: [], tools: [], languages: [] };
  const choices: ProfChoice[] = [];
  const skillFixed: string[] = [];
  const grant = skillGrant(data.skillProficiencies);
  skillFixed.push(...grant.fixed.map((s) => `skill:${s}`));
  choices.push(...grant.choices.map((c) => ({ from: (c.from ?? []).map((s) => `skill:${s}`), pools: c.from ? [] : ["skill"], count: c.count })));
  profs(data.toolProficiencies, "tool", fixed.tools, choices);
  profs(data.languageProficiencies, "language", fixed.languages, choices);
  profs(data.skillToolLanguageProficiencies, "skill", skillFixed, choices);
  fixed.skills = skillFixed;

  const saveChoices = list(data.savingThrowProficiencies).flatMap((s) => {
    const choose = obj(obj(s).choose);
    return Array.isArray(choose.from) ? [{ from: choose.from.map(String) as Ability[], count: Number(choose.count ?? 1) }] : [];
  });
  const feats = [
    ...list(data.featProgression).map((fp) => ({ categories: list(obj(fp).category).map(String), count: Number(obj(obj(fp).progression)["*"] ?? 0) })),
    ...list(data.feats).flatMap((f) => {
      const any = obj(obj(f).anyFromCategory);
      return any.category ? [{ categories: list(any.category).map(String), count: Number(any.count ?? 1) }] : [];
    }),
  ].filter((f) => f.count > 0);
  const targetChoose = list(data.prerequisite).flatMap((p) => list(obj(p).spell)).map((s) => obj(s).choose).find((c) => typeof c === "string");

  return {
    bonus: bonusOptions(data.ability),
    fixed,
    profs: choices,
    saves: saveChoices,
    expertise: list(data.expertise).reduce<number>((n, e) => n + Number(obj(e).anyProficientSkill ?? 0), 0),
    spells: spellGrants(data.additionalSpells, level),
    feats,
    target: typeof targetChoose === "string" ? parseSpellFilter(targetChoose) : null,
    repeatable: data.repeatable === true || JSON.stringify(data.entries ?? "").includes('"name":"Repeatable"'),
  };
}

// --- Picks and what they give ----------------------------------------------------------------

/** One pick and its sub-choices, as the dialogs keep it to open again. Keys are "name|source" or "kind:name". */
export type SavedChoice = {
  ref: Ref | null;
  bonus: BonusPick;
  /** Picked keys per proficiency choice. */
  profs: string[][];
  saves: string[];
  expertise: string[];
  /** Which spell option (Magic Initiate's class, an Elf's lineage). */
  grant: number;
  /** Picked spell keys per choice of that option. */
  spells: string[][];
  feats: SavedChoice[];
  /** The known spell it applies to (Agonizing Blast). */
  target: string | null;
};

export const emptyChoice = (ref: Ref | null = null): SavedChoice => ({ ref, bonus: emptyPick(undefined), profs: [], saves: [], expertise: [], grant: 0, spells: [], feats: [], target: null });

/** Older saved feat picks ({ feat, skills, … }) as a SavedChoice. */
export function toChoice(raw: unknown): SavedChoice {
  const r = obj(raw);
  if ("ref" in r) return { ...emptyChoice(), ...(r as Partial<SavedChoice>) } as SavedChoice;
  return {
    ...emptyChoice((r.feat as Ref | null) ?? null),
    bonus: (r.bonus as BonusPick) ?? emptyPick(undefined),
    profs: Array.isArray(r.skills) && r.skills.length ? [(r.skills as string[]).map((s) => `skill:${s}`)] : [],
    expertise: (r.expertise as string[]) ?? [],
    grant: Number(r.grant ?? 0),
    spells: (r.spells as string[][]) ?? [],
  };
}

/** The rules entries behind refs and keys, from what a dialog loaded. */
export type Lookup = {
  feat: (r: Ref) => Entry | null;
  spell: (key: string) => Entry | null;
  optional: (key: string) => Entry | null;
  item: (key: string) => Entry | null;
};

export const featSlots = (c: EntryChoices) => c.feats.flatMap((f) => Array.from({ length: f.count }, () => f.categories));

/** Whether a pick and all its sub-choices are made. `entry` is the picked entry (or the species/background itself). */
export function choiceComplete(entry: Entry | null, saved: SavedChoice, level: number, find: Lookup): boolean {
  if (!entry) return false;
  const c = entryChoices(entry.data, level);
  const grant = c.spells[saved.grant];
  const bonusDone = !c.bonus.length || (c.bonus[saved.bonus.option]?.choices ?? []).every((ch, i) => (saved.bonus.picks[i] ?? []).filter(Boolean).length === ch.amounts.length);
  return (
    bonusDone &&
    c.profs.every((p, i) => (saved.profs[i] ?? []).length === p.count) &&
    saved.saves.length === c.saves.reduce((n, s) => n + s.count, 0) &&
    saved.expertise.length === c.expertise &&
    (!grant || grant.choose.every((x, i) => (saved.spells[i] ?? []).length === x.count)) &&
    (!c.target || !!saved.target) &&
    featSlots(c).every((_, i) => {
      const f = saved.feats[i];
      return !!f?.ref && choiceComplete(find.feat(f.ref), f, level, find);
    })
  );
}

/** What a pick gives, resolved for the character file. Feats it grants (Lessons of the First Ones) come with their own gains. */
export type ChoiceGains = {
  feats: (Ref & { origin: string })[];
  spells: (Ref & { origin: string; level?: number; atLevel?: number })[];
  skills: string[];
  tools: string[];
  languages: string[];
  saves: string[];
  expertise: string[];
  bonus: Record<string, number>;
};

export const emptyGains = (): ChoiceGains => ({ feats: [], spells: [], skills: [], tools: [], languages: [], saves: [], expertise: [], bonus: {} });

export function mergeGains(a: ChoiceGains, b: ChoiceGains): ChoiceGains {
  const bonus = { ...a.bonus };
  for (const [k, n] of Object.entries(b.bonus)) bonus[k] = (bonus[k] ?? 0) + n;
  return {
    feats: [...a.feats, ...b.feats],
    spells: [...a.spells, ...b.spells],
    skills: [...a.skills, ...b.skills],
    tools: [...a.tools, ...b.tools],
    languages: [...a.languages, ...b.languages],
    saves: [...a.saves, ...b.saves],
    expertise: [...a.expertise, ...b.expertise],
    bonus,
  };
}

const keyName = (key: string) => key.slice(key.indexOf(":") + 1);

/**
 * What an entry's picks give. `origin` names where spells and feats come from on the sheet ("Pact of the Tome");
 * a picked feat (`asFeat`) is listed itself too, with `featOrigin`.
 */
export function resolveChoice(entry: Entry, saved: SavedChoice, level: number, find: Lookup, origin: string): ChoiceGains {
  const c = entryChoices(entry.data, level);
  const g = emptyGains();
  const picked = [...c.fixed.skills, ...c.fixed.tools, ...c.fixed.languages, ...saved.profs.flat()];
  g.skills = picked.filter((k) => k.startsWith("skill:")).map(keyName);
  g.tools = picked.filter((k) => k.startsWith("tool:")).map(keyName);
  g.languages = picked.filter((k) => k.startsWith("language:")).map(keyName);
  g.saves = [...saved.saves];
  g.expertise = [...saved.expertise];
  g.bonus = bonusTotals(c.bonus, saved.bonus) as Record<string, number>;
  const grant = c.spells[saved.grant];
  if (grant) {
    // The data names granted spells by key ("misty step|xphb"); the spell itself has the real name and level.
    g.spells.push(
      ...grant.fixed.map((r) => {
        const spell = find.spell(refKey(r));
        return { name: spell?.name ?? r.name, source: spell?.source ?? r.source, origin, atLevel: r.atLevel, ...(spell ? { level: Number(spell.data.level ?? 1) } : {}) };
      }),
    );
    g.spells.push(...saved.spells.flat().flatMap((k) => find.spell(k) ?? []).map((s) => ({ name: s.name, source: s.source, origin, level: Number(s.data.level ?? 1) })));
  }
  featSlots(c).forEach((_, i) => {
    const f = saved.feats[i];
    const feat = f?.ref ? find.feat(f.ref) : null;
    if (!f || !feat) return;
    g.feats.push({ name: feat.name, source: feat.source, origin });
    Object.assign(g, mergeGains(g, resolveChoice(feat, f, level, find, feat.name)));
  });
  return g;
}

export type { BonusOption, Scores };
