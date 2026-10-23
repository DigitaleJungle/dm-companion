// Character sheet rules for play: hit points, death saves, hit dice, spell slots, rests and armor class.
// Class numbers (hit die, slots) come from the class entry in the rules data, never from tables in code.

import type { InventoryItem } from "$lib/api/characters";
import { ABILITY_NAMES, capital } from "$lib/rules/format";
import { plainText } from "$lib/rules/tags";
import { modifier, type Ability, type Scores } from "./rules";

export type Hp = { max: number; current: number; temp: number };
export type DeathSaves = { successes: number; failures: number };
export type Vitals = { hp: Hp; deathSaves: DeathSaves };

export const DEATH_SAVES = 3;
/** How many magic items a character can be attuned to at once. */
export const ATTUNEMENT_LIMIT = 3;
const whole = (n: number) => Math.max(0, Math.floor(Number.isFinite(n) ? n : 0));

/** Hit points from the file; current defaults to max and never exceeds it. */
export function hpOf(hp: { max?: number; current?: number; temp?: number } | undefined): Hp {
  const max = whole(hp?.max ?? 0);
  return { max, current: Math.min(max, whole(hp?.current ?? max)), temp: whole(hp?.temp ?? 0) };
}

/** Temporary hit points go first. Damage at 0 hit points is a failed death save instead. */
export function takeDamage(v: Vitals, amount: number): Vitals {
  const n = whole(amount);
  if (n === 0) return v;
  if (v.hp.current === 0) return { ...v, deathSaves: { ...v.deathSaves, failures: Math.min(DEATH_SAVES, v.deathSaves.failures + 1) } };
  const fromTemp = Math.min(v.hp.temp, n);
  return { ...v, hp: { ...v.hp, temp: v.hp.temp - fromTemp, current: Math.max(0, v.hp.current - (n - fromTemp)) } };
}

/** Healing stops at max; back above 0, the death saves reset. */
export function takeHealing(v: Vitals, amount: number): Vitals {
  const current = Math.min(v.hp.max, v.hp.current + whole(amount));
  return { hp: { ...v.hp, current }, deathSaves: current > 0 ? { successes: 0, failures: 0 } : v.deathSaves };
}

/** Temporary hit points don't stack: the new amount replaces the old. */
export const setTemp = (hp: Hp, amount: number): Hp => ({ ...hp, temp: whole(amount) });

export type DeathStatus = "dying" | "stable" | "dead";
export const deathStatus = (d: DeathSaves): DeathStatus =>
  d.failures >= DEATH_SAVES ? "dead" : d.successes >= DEATH_SAVES ? "stable" : "dying";

// --- Class numbers --------------------------------------------------------------------------

type Data = Record<string, unknown>;
const groups = (cls: Data | null): Data[] => (Array.isArray(cls?.classTableGroups) ? (cls.classTableGroups as Data[]) : []);

/** Hit die faces, e.g. 8 for a d8; 0 when the class is unknown. */
export const hitDieFaces = (cls: Data | null) => Number((cls?.hd as Data | undefined)?.faces ?? 0);

/** Slots per spell level (index 0 is 1st level) from the class table; empty for classes without spellcasting slots. */
export function spellSlots(cls: Data | null, level: number): number[] {
  for (const group of groups(cls)) {
    const row = (group.rowsSpellProgression as unknown[][] | undefined)?.[level - 1];
    if (Array.isArray(row)) {
      const slots = row.map((n) => whole(Number(n)));
      while (slots.length && slots.at(-1) === 0) slots.pop();
      return slots;
    }
  }
  return [];
}

/** Pact magic (the class table's "Spell Slots" and "Slot Level" columns): slots that all share one level. */
export function pactSlots(cls: Data | null, level: number): { count: number; level: number } | null {
  for (const group of groups(cls)) {
    const labels = Array.isArray(group.colLabels) ? group.colLabels.map((l) => plainText(String(l)).toLowerCase()) : [];
    const countAt = labels.indexOf("spell slots");
    const levelAt = labels.indexOf("slot level");
    const row = (group.rows as unknown[][] | undefined)?.[level - 1];
    if (countAt < 0 || levelAt < 0 || !Array.isArray(row)) continue;
    const count = whole(Number(row[countAt]));
    const slotLevel = whole(Number(row[levelAt]));
    return count && slotLevel ? { count, level: slotLevel } : null;
  }
  return null;
}

// --- Rests ----------------------------------------------------------------------------------

export type Resources = { hitDiceSpent: number; slotsUsed: number[]; pactSlotsUsed: number };

/** Hit points back to max, temporary ones gone, every slot back, and half the hit dice (at least one) regained. */
export function longRest(v: Vitals, r: Resources, level: number): { vitals: Vitals; resources: Resources } {
  const regained = Math.max(1, Math.floor(level / 2));
  return {
    vitals: { hp: { ...v.hp, current: v.hp.max, temp: 0 }, deathSaves: { successes: 0, failures: 0 } },
    resources: { hitDiceSpent: Math.max(0, r.hitDiceSpent - regained), slotsUsed: [], pactSlotsUsed: 0 },
  };
}

/** A short rest brings pact magic slots back; hit dice are spent one at a time with `hitDieRoll`. */
export const shortRest = (r: Resources): Resources => ({ ...r, pactSlotsUsed: 0 });

/** Dice notation for spending one hit die, e.g. "1d10+2". */
export function hitDieRoll(faces: number, con: number): string {
  const mod = modifier(con);
  return `1d${faces}${mod > 0 ? `+${mod}` : mod < 0 ? `${mod}` : ""}`;
}

// --- Weapons --------------------------------------------------------------------------------

/** What the sheet keeps of a weapon from the rules data. `properties` are codes without their book ("F", "2H"). */
/** `mastery`: its Weapon Mastery property names ("Sap"). */
export type Weapon = { category?: string; dmg?: string; dmgType?: string; properties?: string[]; ranged?: boolean; range?: string; mastery?: string[] };

const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const obj = (v: unknown): Data => (v && typeof v === "object" && !Array.isArray(v) ? (v as Data) : {});
/** A reference in item data: a "Name|Source" string, or an object with that as its `uid` (properties and masteries can be either). */
const refName = (v: unknown) => String(typeof v === "string" ? v : (obj(v).uid ?? "")).split("|")[0];
const propertyCode = (p: unknown) => refName(p).toUpperCase();

/** The Weapon Mastery property names of an item entry ("Sap"). */
export const masteryNames = (raw: unknown): string[] => list(raw).map(refName).filter(Boolean);

/** The weapon fields of an item entry, or undefined when it isn't a weapon. */
export function weaponOf(item: Data): Weapon | undefined {
  if (!item.weapon && !item.weaponCategory && !item.dmg1) return undefined;
  return {
    ...(item.weaponCategory ? { category: String(item.weaponCategory).toLowerCase() } : {}),
    ...(item.dmg1 ? { dmg: String(item.dmg1) } : {}),
    ...(item.dmgType ? { dmgType: String(item.dmgType) } : {}),
    properties: list(item.property).map(propertyCode),
    ...(String(item.type ?? "").split("|")[0] === "R" ? { ranged: true } : {}),
    ...(item.range ? { range: String(item.range) } : {}),
    ...(masteryNames(item.mastery).length ? { mastery: masteryNames(item.mastery) } : {}),
  };
}

/**
 * Proficiency from the class: its `weapons` list ("simple", "martial") or `weaponProficiencies`
 * (categories, named weapons, or "martial weapons with the Light or Finesse property").
 */
export function weaponProficient(cls: Data | null, name: string, weapon: Weapon): boolean {
  const category = weapon.category ?? "";
  if (list(cls?.weapons).some((w) => String(w).toLowerCase() === category)) return true;
  return list(cls?.weaponProficiencies).some((entry) => {
    const e = obj(entry);
    if (category && e[category] === true) return true;
    if (Object.keys(e).some((k) => e[k] === true && k.split("|")[0] === name.toLowerCase())) return true;
    // e.g. "type=martial weapon|property=light;finesse"
    const filter = String(obj(e.all).fromFilter ?? "").toLowerCase();
    if (!filter) return false;
    const parts = Object.fromEntries(filter.split("|").map((p) => p.split("=") as [string, string]));
    const typeOk = !parts.type || parts.type.split(";").some((t) => t.startsWith(category));
    const wanted = parts.property?.split(";") ?? [];
    const names: Record<string, string> = { light: "L", finesse: "F", heavy: "H", reach: "R", thrown: "T", versatile: "V", "two-handed": "2H" };
    const propsOk = !wanted.length || wanted.some((p) => weapon.properties?.includes(names[p] ?? p.toUpperCase()));
    return !!category && typeOk && propsOk;
  });
}

export type Attack = { ability: Ability; toHit: number; damage: string | null };

/** Ranged weapons use DEX, finesse ones the better of STR and DEX, the rest STR; proficiency adds to the attack roll only. */
export function weaponAttack(weapon: Weapon, scores: Scores, proficiency: number, proficient: boolean): Attack {
  const finesse = weapon.properties?.includes("F");
  const ability: Ability = weapon.ranged ? "dex" : finesse && scores.dex > scores.str ? "dex" : "str";
  const mod = modifier(scores[ability]);
  const bonus = mod > 0 ? `+${mod}` : mod < 0 ? `${mod}` : "";
  return { ability, toHit: mod + (proficient ? proficiency : 0), damage: weapon.dmg ? `${weapon.dmg}${bonus}` : null };
}

// --- Proficiencies and carrying ---------------------------------------------------------------

export type ProficiencyLists = { armor: string[]; weapons: string[]; tools: string[]; languages: string[] };

/** Fixed proficiencies from the class, background and species entries, as readable text. */
/** Fixed proficiencies from the class, background and species, plus the tools and languages the character picked (`chosen`). */
export function proficiencyLists(cls: Data | null, background: Data | null, species: Data | null, chosen: { tools?: string[]; languages?: string[] } = {}): ProficiencyLists {
  const text = (v: unknown) => list(v).map((s) => capital(plainText(String(s))));
  const fixed = (...grants: unknown[]) => grants.flatMap((g) => list(g).flatMap((entry) => Object.entries(obj(entry)).filter(([, v]) => v === true).map(([k]) => capital(k.split("|")[0]))));
  const names = (xs: string[] | undefined) => (xs ?? []).map((x) => x.replace(/(^|[\s(/-])(\w)/g, (_, a: string, b: string) => a + b.toUpperCase()));
  // The same proficiency from two places (or in two capitalizations) is listed once.
  const unique = (xs: string[]) => [...new Map(xs.map((x) => [x.toLowerCase(), x])).values()];
  return {
    armor: unique(text(cls?.armor)),
    weapons: unique(text(cls?.weapons)),
    tools: unique([...text(cls?.tools), ...fixed(background?.toolProficiencies), ...names(chosen.tools)]),
    languages: unique([...fixed(species?.languageProficiencies, background?.languageProficiencies), ...names(chosen.languages)]),
  };
}

// --- Defenses: resistances, immunities and save advantages from the species -------------------

/** The fields a chosen lineage sets over its species (a Dragonborn color's resistance, a Tiefling legacy's). */
export function lineageFields(versions: unknown, lineage: string | null | undefined): Data {
  if (!lineage) return {};
  const shortName = (name: string) => name.split("; ").slice(1).join("; ") || name;
  const own = (v: Data) => Object.fromEntries(Object.entries(v).filter(([k]) => !k.startsWith("_") && k !== "name" && k !== "source"));
  for (const entry of list(versions)) {
    const version = obj(entry);
    const template = obj(version._abstract);
    if (Array.isArray(version._implementations)) {
      for (const impl of version._implementations.map(obj)) {
        const vars = obj(impl._variables);
        const name = String(template.name ?? "").replace(/\{\{(\w+)\}\}/g, (_, key: string) => String(vars[key] ?? key));
        if (shortName(name) === lineage) return own(impl);
      }
    } else if (typeof version.name === "string" && shortName(version.name) === lineage) return own(version);
  }
  return {};
}

/** `advantages`: what save advantages apply to ("Charmed condition"); `advantageNotes`: ones kept as whole sentences. */
export type Defenses = { advantages: string[]; advantageNotes: string[]; resist: string[]; immune: string[]; conditionImmune: string[]; vulnerable: string[] };

/** Every string in nested `entries`, in order. */
function texts(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(texts);
  return texts(obj(value).entries ?? []);
}

/**
 * Resistances, immunities and vulnerabilities from the species (or its chosen lineage), and the save advantages
 * its traits give, e.g. "Advantage on saving throws you make to avoid or end the Charmed condition".
 */
export function speciesDefenses(species: Data | null, lineage?: string | null): Defenses {
  const own = { ...species, ...lineageFields(species?._versions, lineage) };
  // Choices ({ choose: … }) are settled by the lineage; anything still unsettled is left out.
  const names = (key: string) => [...new Set(list(own[key]).filter((v): v is string => typeof v === "string").map((v) => capital(v)))];
  // shortcut: save advantages exist only in the trait text, so they're found by wording; a structured field in the data would replace this.
  const found = texts(species?.entries)
    .flatMap((text) => plainText(text).split(/(?<=\.)\s+/))
    .filter((sentence) => /\badvantage\b/i.test(sentence) && /saving throw/i.test(sentence))
    .map(shortAdvantage);
  const unique = (xs: (string | null)[]) => [...new Set(xs.filter((x): x is string => x !== null))];
  return {
    advantages: unique(found.map((f) => ("what" in f ? f.what : null))),
    advantageNotes: unique(found.map((f) => ("sentence" in f ? f.sentence : null))),
    resist: names("resist"),
    immune: names("immune"),
    conditionImmune: names("conditionImmune"),
    vulnerable: names("vulnerable"),
  };
}

const ABILITY_ABBR = Object.fromEntries(Object.entries(ABILITY_NAMES).map(([key, name]) => [name.toLowerCase(), key.toUpperCase()]));

/**
 * What a save-advantage sentence applies to, in short form: "Poisoned condition", "INT, WIS, CHA saves vs spells".
 * A sentence with a condition attached ("Until you emerge, …"), or one that isn't recognized, is kept whole instead.
 */
export function shortAdvantage(sentence: string): { what: string } | { sentence: string } {
  const text = sentence.trim().replace(/\.$/, "");
  const at = text.search(/\badvantage\b/i);
  const whole = { sentence: capital(text.replace(/^you (also )?have /i, "")) };
  if (/\b(until|while|when|if)\b/i.test(text.slice(0, at))) return whole;
  const rest = text.slice(at);
  const abilityWords = /\bon ([\w ,]+?) saving throws/i.exec(rest)?.[1].split(/,\s*(?:and |or )?|\s+(?:and|or)\s+/) ?? [];
  const abilities = abilityWords.length && abilityWords.every((w) => ABILITY_ABBR[w.toLowerCase()]) ? abilityWords.map((w) => ABILITY_ABBR[w.toLowerCase()]) : [];
  const condition = /avoid or end the (.+?) (conditions?)\b/i.exec(rest);
  const spells = /against spells/i.test(rest);
  if (condition) return { what: `${condition[1].replace(/\b(?!and\b|or\b)\w/g, (c) => c.toUpperCase())} ${condition[2].toLowerCase()}` };
  if (abilities.length) return { what: `${abilities.join(", ")} saves${spells ? " vs spells" : ""}` };
  if (spells) return { what: "Saves vs spells" };
  return whole;
}

/** Strength × 15 pounds, doubled per size above Medium and halved for Tiny. */
export function carryingCapacity(str: number, size = "M"): number {
  const factor = ({ T: 0.5, L: 2, H: 4, G: 8 } as Record<string, number>)[size] ?? 1;
  return str * 15 * factor;
}

// --- Armor class ----------------------------------------------------------------------------

export type ArmorKind = "light" | "medium" | "heavy" | "shield";
export type ArmorPiece = { armor?: ArmorKind; ac?: number; equipped?: boolean };

/** Item type codes in the rules data ("HA|XPHB") to armor kinds. */
export function armorKind(type: unknown): ArmorKind | undefined {
  const code = String(type ?? "").split("|")[0];
  return ({ LA: "light", MA: "medium", HA: "heavy", S: "shield" } as const)[code as "LA" | "MA" | "HA" | "S"];
}

/** An inventory line for a rules item, keeping what the sheet needs for armor class, weight and attacks. */
export function inventoryItem(row: { name: string; source: string; data: Data }, quantity = 1): InventoryItem {
  const armor = armorKind(row.data.type);
  const weapon = weaponOf(row.data);
  return {
    name: row.name,
    source: row.source,
    quantity,
    ...(typeof row.data.weight === "number" ? { weight: row.data.weight } : {}),
    ...(row.data.reqAttune ? { attunement: true } : {}),
    ...(armor ? { armor, ...(typeof row.data.ac === "number" ? { ac: row.data.ac } : {}) } : {}),
    ...(weapon ? { weapon } : {}),
  };
}

/**
 * 10 + DEX without armor; light armor adds DEX, medium at most +2, heavy none; an equipped shield adds its bonus.
 * An override (e.g. Unarmored Defense, magic armor) replaces the whole result.
 */
export function armorClass(dex: number, items: ArmorPiece[], override?: number | null): number {
  if (typeof override === "number" && Number.isFinite(override)) return override;
  const worn = items.filter((i) => i.equipped);
  const body = worn.find((i) => i.armor && i.armor !== "shield" && typeof i.ac === "number");
  const mod = modifier(dex);
  const base = !body ? 10 + mod : body.armor === "heavy" ? body.ac! : body.armor === "medium" ? body.ac! + Math.min(2, mod) : body.ac! + mod;
  const shield = worn.find((i) => i.armor === "shield");
  return base + (shield ? (shield.ac ?? 2) : 0);
}
