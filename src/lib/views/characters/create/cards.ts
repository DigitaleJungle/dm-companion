import type { CatalogRow } from "$lib/api/rules";
import { bonusOptions } from "$lib/characters/rules";
import { SIZES } from "$lib/rules/format";
import { strings } from "$lib/strings";

// The short facts and the picture of each species, class and background, so you can compare before opening one.

const t = strings.characters.wizard.cards;
const or = new Intl.ListFormat(undefined, { type: "disjunction" });
const and = new Intl.ListFormat(undefined, { type: "conjunction" });
const plain = new Intl.NumberFormat();
const upper = (keys: string[]) => keys.map((k) => k.toUpperCase());
/** "sleight of hand" → "Sleight of Hand". */
const title = (s: string) => s.replace(/\b(?!of\b)\w/g, (c) => c.toUpperCase());
const trueKeys = (value: unknown): string[] =>
  Array.isArray(value) && value[0] && typeof value[0] === "object" ? Object.entries(value[0]).filter(([, v]) => v === true).map(([k]) => k) : [];

/**
 * The imported picture for an entry, like "classes/XPHB/Fighter.webp".
 * shortcut: follows the images' file naming instead of reading the entry's fluff; read fluff if pictures go missing.
 */
export const artPath = (folder: "races" | "classes" | "backgrounds") => (row: CatalogRow) => `${folder}/${row.source}/${row.name}.webp`;

export function speciesFacts(row: CatalogRow): string[] {
  const sizes = Array.isArray(row.data.size) ? (row.data.size as string[]) : [];
  const speed = row.data.speed;
  const walk = typeof speed === "number" ? speed : typeof (speed as { walk?: unknown } | undefined)?.walk === "number" ? (speed as { walk: number }).walk : null;
  const moves = speed && typeof speed === "object" ? Object.keys(speed).filter((k) => k !== "walk" && (speed as Record<string, unknown>)[k]) : [];
  const darkvision = typeof row.data.darkvision === "number" ? row.data.darkvision : null;
  return [
    sizes.length ? or.format(sizes.map((s) => SIZES[s] ?? s)) : "",
    walk !== null ? t.speed(plain.format(walk)) : "",
    darkvision ? t.darkvision(plain.format(darkvision)) : "",
    ...moves.map((m) => t.moves[m] ?? m),
  ].filter(Boolean);
}

export function classFacts(row: CatalogRow): string[] {
  const faces = (row.data.hd as { faces?: number } | undefined)?.faces;
  const primary = (Array.isArray(row.data.primaryAbility) ? row.data.primaryAbility : []).map((p) => and.format(upper(trueKeys([p]))));
  const saves = Array.isArray(row.data.proficiency) ? upper(row.data.proficiency as string[]) : [];
  return [faces ? t.hitDie(plain.format(faces)) : "", primary.length ? or.format(primary) : "", saves.length ? t.saves(and.format(saves)) : ""].filter(Boolean);
}

export function backgroundFacts(row: CatalogRow): string[] {
  const first = bonusOptions(row.data.ability)[0];
  const abilities = first ? [...new Set([...Object.keys(first.fixed), ...first.choices.flatMap((c) => c.from)])] : [];
  const feat = trueKeys(row.data.feats)[0]?.split("|")[0].replace(/; (.+)$/, " ($1)");
  return [
    abilities.length ? upper(abilities).join(", ") : "",
    and.format(trueKeys(row.data.skillProficiencies).map(title)),
    feat ? t.feat(title(feat)) : "",
  ].filter(Boolean);
}

// --- Versions ---------------------------------------------------------------------------------

/** One option with all its printings the campaign allows, newest first; `main` is the one its card shows. */
export type VersionGroup = { main: CatalogRow; versions: CatalogRow[] };

const keyOf = (name: string, source: string) => `${name}|${source}`.toLowerCase();
const reprints = (value: unknown): string[] =>
  (Array.isArray(value) ? value : []).flatMap((v) => {
    const uid = typeof v === "string" ? v : (v as { uid?: unknown } | null)?.uid;
    return typeof uid === "string" ? [uid.toLowerCase()] : [];
  });

/**
 * Groups reprints of the same option ("Fighter|PHB" is reprinted as "Fighter|XPHB") by following `reprintedAs`
 * through every book, also ones the campaign doesn't use; then keeps the allowed printings, newest book first.
 * Options that only share a name (Aven in two settings) stay apart.
 */
export function versionGroups(rows: CatalogRow[], allowed: (source: string) => boolean, published: (source: string) => string): VersionGroup[] {
  const byKey = new Map(rows.map((r) => [keyOf(r.name, r.source), r]));
  const latest = (row: CatalogRow) => {
    const seen = new Set([row]);
    let current = row;
    for (;;) {
      const next = reprints(current.data.reprintedAs).map((k) => byKey.get(k)).find((r) => r && !seen.has(r));
      if (!next) return current;
      seen.add(next);
      current = next;
    }
  };
  const groups = new Map<CatalogRow, CatalogRow[]>();
  for (const row of rows) {
    const root = latest(row);
    groups.set(root, [...(groups.get(root) ?? []), row]);
  }
  return [...groups.values()]
    .map((versions) => versions.filter((r) => allowed(r.source)).sort((a, b) => published(b.source).localeCompare(published(a.source))))
    .filter((versions) => versions.length > 0)
    .map((versions) => ({ main: versions[0], versions }));
}
