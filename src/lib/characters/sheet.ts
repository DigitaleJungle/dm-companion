// Character sheet rules for play: hit points, death saves, hit dice, spell slots, rests and armor class.
// Class numbers (hit die, slots) come from the class entry in the rules data, never from tables in code.

import { capital } from "$lib/rules/format";
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
export type Weapon = { category?: string; dmg?: string; dmgType?: string; properties?: string[]; ranged?: boolean; range?: string };

const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const obj = (v: unknown): Data => (v && typeof v === "object" && !Array.isArray(v) ? (v as Data) : {});
const propertyCode = (p: unknown) => String(p ?? "").split("|")[0].toUpperCase();

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
export function proficiencyLists(cls: Data | null, background: Data | null, species: Data | null): ProficiencyLists {
  const text = (v: unknown) => list(v).map((s) => capital(plainText(String(s))));
  // shortcut: only fixed grants (`{ "common": true }`); "choose" and "any" grants aren't recorded on the character yet, so they're left out until level up records choices.
  const fixed = (...grants: unknown[]) => grants.flatMap((g) => list(g).flatMap((entry) => Object.entries(obj(entry)).filter(([, v]) => v === true).map(([k]) => capital(k.split("|")[0]))));
  const unique = (xs: string[]) => [...new Set(xs)];
  return {
    armor: unique(text(cls?.armor)),
    weapons: unique(text(cls?.weapons)),
    tools: unique([...text(cls?.tools), ...fixed(background?.toolProficiencies)]),
    languages: unique(fixed(species?.languageProficiencies, background?.languageProficiencies)),
  };
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
