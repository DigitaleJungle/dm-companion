// Character sheet rules for play: hit points, death saves, hit dice, spell slots, rests and armor class.
// Class numbers (hit die, slots) come from the class entry in the rules data, never from tables in code.

import { plainText } from "$lib/rules/tags";
import { modifier } from "./rules";

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
