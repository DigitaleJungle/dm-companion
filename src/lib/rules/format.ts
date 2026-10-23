// Short, readable summaries of 5etools entries (spell lines, creature stats, item type…).

import { plainText } from "./tags";

export type Fact = { label: string; value: string };
// Raw 5etools JSON: loosely typed on purpose, every field is optional and shapes vary between books.
type Data = Record<string, any>;

export const SCHOOLS: Record<string, string> = {
  A: "Abjuration", C: "Conjuration", D: "Divination", E: "Enchantment", V: "Evocation", I: "Illusion", N: "Necromancy", T: "Transmutation", P: "Psionic",
};
export const SIZES: Record<string, string> = { T: "Tiny", S: "Small", M: "Medium", L: "Large", H: "Huge", G: "Gargantuan" };
/** The data's damage type codes (`dmgType`). */
export const DAMAGE_TYPES: Record<string, string> = {
  A: "acid", B: "bludgeoning", C: "cold", F: "fire", O: "force", L: "lightning", N: "necrotic", P: "piercing", I: "poison", Y: "psychic", R: "radiant", S: "slashing", T: "thunder",
};
const ALIGNMENTS: Record<string, string> = { L: "Lawful", N: "Neutral", C: "Chaotic", G: "Good", E: "Evil", U: "Unaligned", A: "Any alignment" };
export const ABILITY_NAMES: Record<string, string> = { str: "Strength", dex: "Dexterity", con: "Constitution", int: "Intelligence", wis: "Wisdom", cha: "Charisma" };
export const ITEM_TYPES: Record<string, string> = {
  M: "Melee weapon", R: "Ranged weapon", A: "Ammunition", LA: "Light armor", MA: "Medium armor", HA: "Heavy armor", S: "Shield",
  RD: "Rod", RG: "Ring", WD: "Wand", P: "Potion", SC: "Scroll", G: "Adventuring gear", INS: "Instrument", T: "Tool", AT: "Artisan's tools",
  GS: "Gaming set", TAH: "Tack and harness", SCF: "Spellcasting focus", $: "Treasure", FD: "Food and drink", MNT: "Mount", VEH: "Vehicle",
};
export const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** "sleight of hand" → "Sleight of Hand", "dungeoneer's pack" → "Dungeoneer's Pack": each word capitalized, "of" kept small. */
export const titleCase = (s: string) => s.replace(/(^|[\s(/-])(\w+)/g, (_, before: string, word: string) => before + (word === "of" && before ? word : capital(word)));
const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? "" : "s"}`;

export const modifier = (score: number) => {
  const mod = Math.floor((score - 10) / 2);
  return mod >= 0 ? `+${mod}` : `${mod}`;
};

// ---- Spells -------------------------------------------------------------------------------------

export function spellLevel(s: Data): string {
  const school = SCHOOLS[s.school] ?? s.school ?? "";
  const ritual = s.meta?.ritual ? " (ritual)" : "";
  return (s.level === 0 ? `${school} cantrip` : `Level ${s.level} ${school}`) + ritual;
}

export function castingTime(s: Data): string {
  return (s.time ?? [])
    .map((t: Data | string) => {
      if (typeof t === "string") return plainText(t); // e.g. "Varies"
      const base = plural(t.number, t.unit === "bonus" ? "bonus action" : t.unit);
      return t.condition ? `${base}, ${plainText(t.condition)}` : base;
    })
    .join(" or ");
}

export function spellRange(s: Data): string {
  const r = s.range ?? {};
  const d = r.distance ?? {};
  const distance = ((): string => {
    switch (d.type) {
      case "self": return "Self";
      case "touch": return "Touch";
      case "sight": return "Sight";
      case "unlimited": return "Unlimited";
      case "feet": return `${d.amount} feet`;
      case "miles": return plural(d.amount, "mile");
      default: return d.type ? capital(d.type) : "";
    }
  })();
  if (r.type === "special") return "Special";
  if (["cone", "line", "radius", "sphere", "cube", "emanation", "hemisphere", "cylinder"].includes(r.type)) {
    return `Self (${d.amount}-${d.type === "miles" ? "mile" : "foot"} ${r.type})`;
  }
  return distance;
}

export function components(s: Data): string {
  const c = s.components ?? {};
  const parts: string[] = [];
  if (c.v) parts.push("V");
  if (c.s) parts.push("S");
  if (c.m) parts.push(`M (${plainText(typeof c.m === "string" ? c.m : (c.m.text ?? ""))})`);
  if (c.r) parts.push("R");
  return parts.join(", ");
}

export function duration(s: Data): string {
  return (s.duration ?? [])
    .map((d: Data) => {
      switch (d.type) {
        case "instant": return "Instantaneous";
        case "permanent": return d.ends?.includes("dispel") ? "Until dispelled" : "Permanent";
        case "special": return "Special";
        case "timed": {
          const time = plural(d.duration?.amount ?? 1, d.duration?.type ?? "round");
          return d.concentration ? `Concentration, up to ${time}` : time;
        }
        default: return d.type ? capital(d.type) : "";
      }
    })
    .join(" or ");
}

export function spellFacts(s: Data): Fact[] {
  return [
    { label: "Casting Time", value: castingTime(s) },
    { label: "Range", value: spellRange(s) },
    { label: "Components", value: components(s) },
    { label: "Duration", value: duration(s) },
  ].filter((f) => f.value);
}

// ---- Creatures ----------------------------------------------------------------------------------

/** "fey", or "Celestial or Fiend" when the creature has a choice of types (like the Empyrean). */
export function creatureTypeName(m: Data): string {
  const type = typeof m.type === "string" ? m.type : m.type?.type;
  if (typeof type === "string") return capital(type);
  if (Array.isArray(type?.choose)) return type.choose.map((t: string) => capital(t)).join(" or ");
  return "";
}

export function sizeTypeAlignment(m: Data): string {
  const size = (m.size ?? []).map((s: string) => SIZES[s] ?? s).join(" or ");
  const tags = typeof m.type === "object" && m.type?.tags?.length ? ` (${m.type.tags.map((t: unknown) => capital(typeof t === "string" ? t : String((t as Data).tag ?? ""))).join(", ")})` : "";
  const type = creatureTypeName(m) + tags;
  const alignment = (m.alignment ?? []).filter((a: unknown) => typeof a === "string").map((a: string) => ALIGNMENTS[a] ?? a).join(" ");
  return [`${size} ${type}`.trim(), alignment].filter(Boolean).join(", ");
}

export function armorClass(m: Data): string {
  return (m.ac ?? [])
    .map((a: number | Data) => (typeof a === "number" ? `${a}` : `${a.ac ?? ""}${a.from ? ` (${a.from.map(plainText).join(", ")})` : ""}${a.condition ? ` ${plainText(a.condition)}` : ""}`))
    .join(", ");
}

export function hitPoints(m: Data): string {
  const hp = m.hp ?? {};
  if (hp.special) return plainText(hp.special);
  return hp.formula ? `${hp.average} (${hp.formula})` : `${hp.average ?? ""}`;
}

export function speed(m: Data): string {
  const s = m.speed ?? {};
  const one = (mode: string, v: number | Data) => {
    const n = typeof v === "number" ? v : v.number;
    const cond = typeof v === "object" && v.condition ? ` ${plainText(v.condition)}` : "";
    return `${mode === "walk" ? "" : `${capital(mode)} `}${n} ft.${cond}`;
  };
  return ["walk", "burrow", "climb", "fly", "swim"].filter((k) => s[k] !== undefined).map((k) => one(k, s[k])).join(", ") + (s.canHover ? " (hover)" : "");
}

export function challenge(m: Data): string {
  return typeof m.cr === "string" ? m.cr : (m.cr?.cr ?? "");
}

export function creatureFacts(m: Data): Fact[] {
  const keyed = (o: Data | undefined) => (o ? Object.entries(o).map(([k, v]) => `${capital(k)} ${v}`).join(", ") : "");
  const senses = [...(m.senses ?? []).map(plainText), m.passive !== undefined ? `Passive Perception ${m.passive}` : ""].filter(Boolean).join(", ");
  return [
    { label: "AC", value: armorClass(m) },
    { label: "HP", value: hitPoints(m) },
    { label: "Speed", value: speed(m) },
    { label: "Saving Throws", value: keyed(m.save) },
    { label: "Skills", value: keyed(m.skill) },
    { label: "Senses", value: senses },
    { label: "Languages", value: (m.languages ?? []).map(plainText).join(", ") },
    { label: "CR", value: challenge(m) },
  ].filter((f) => f.value);
}

/** The six ability scores with modifiers, or nothing for entries without them. */
export function abilityScores(m: Data): { ability: string; score: number; modifier: string }[] {
  return Object.keys(ABILITY_NAMES)
    .filter((k) => typeof m[k] === "number")
    .map((k) => ({ ability: k.toUpperCase(), score: m[k], modifier: modifier(m[k]) }));
}

// ---- Items, feats, classes ----------------------------------------------------------------------

export function itemFacts(i: Data): Fact[] {
  const code = typeof i.type === "string" ? i.type.split("|")[0] : "";
  const type = i.wondrous ? "Wondrous item" : (ITEM_TYPES[code] ?? code);
  const rarity = i.rarity && i.rarity !== "none" ? capital(i.rarity) : "";
  const attune = i.reqAttune === true ? "Requires attunement" : typeof i.reqAttune === "string" ? `Requires attunement ${plainText(i.reqAttune)}` : "";
  return [{ label: "Type", value: [type, rarity].filter(Boolean).join(", ") }, { label: "Attunement", value: attune }].filter((f) => f.value);
}

export function prerequisite(e: Data): string {
  return (e.prerequisite ?? [])
    .map((p: Data) => {
      const parts: string[] = [];
      if (p.level) parts.push(`Level ${typeof p.level === "number" ? p.level : p.level.level}+`);
      for (const a of p.ability ?? []) for (const [k, v] of Object.entries(a)) parts.push(`${ABILITY_NAMES[k] ?? k} ${v}+`);
      for (const f of p.feat ?? []) parts.push(plainText(`{@feat ${f}}`));
      if (p.spellcasting || p.spellcasting2020) parts.push("Spellcasting feature");
      if (p.other) parts.push(plainText(p.other));
      return parts.join(", ");
    })
    .filter(Boolean)
    .join("; or ");
}

export function classFacts(c: Data): Fact[] {
  const hitDie = c.hd?.faces ? `d${c.hd.faces}` : "";
  const primary = (c.primaryAbility ?? []).flatMap((o: Data) => Object.keys(o).map((k) => ABILITY_NAMES[k] ?? k)).join(" or ");
  return [{ label: "Hit Die", value: hitDie }, { label: "Primary Ability", value: primary }].filter((f) => f.value);
}

// ---- Creature spellcasting -----------------------------------------------------------------------

export type Spellcasting = { name: string; header: unknown[]; lines: string[]; footer: unknown[]; block: string };

/** "1e" → "1/Day Each", "2" → "2/Day", "1" with one spell → "1/Day". */
function perDay(key: string, unit: string) {
  const n = parseInt(key, 10);
  return `${n}/${unit}${key.endsWith("e") ? " Each" : ""}`;
}

/** A creature's spellcasting entries as named blocks, placed under Traits, Actions, etc. like the book shows them. */
export function spellcasting(m: Data): Spellcasting[] {
  return (m.spellcasting ?? []).map((sc: Data) => {
    const hidden: string[] = sc.hidden ?? [];
    const lines: string[] = [];
    const list = (spells: string[]) => spells.join(", ");
    if (sc.will?.length && !hidden.includes("will")) lines.push(`At Will: ${list(sc.will)}`);
    for (const [period, unit] of [["daily", "Day"], ["restLong", "Long Rest"], ["rest", "Rest"], ["recharge", "Recharge"]] as const) {
      if (!sc[period] || hidden.includes(period)) continue;
      for (const key of Object.keys(sc[period]).sort()) lines.push(`${perDay(key, unit)}: ${list(sc[period][key])}`);
    }
    for (const level of Object.keys(sc.spells ?? {}).sort((a, b) => Number(a) - Number(b))) {
      const group = sc.spells[level];
      const label = level === "0" ? "Cantrips (at will)" : `Level ${level}${group.slots ? ` (${group.slots} slots)` : ""}`;
      lines.push(`${label}: ${list(group.spells ?? [])}`);
    }
    return { name: sc.name ?? "Spellcasting", header: sc.headerEntries ?? [], lines, footer: sc.footerEntries ?? [], block: sc.displayAs ?? "trait" };
  });
}
