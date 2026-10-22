import type { CharacterCard, ClassLevel } from "$lib/api/characters";

export type CharacterSort = "name" | "campaign" | "level";
/** null means "all" for each filter; `campaign` is the campaign label shown on the card. */
export type CharacterFilters = { search: string; campaign: string | null; className: string | null; level: number | null };

const collator = new Intl.Collator(undefined, { sensitivity: "base", numeric: true });

/** The characters matching the search (name or class line) and every chosen filter, in the chosen order; ties go by name. */
export function selectCharacters(
  characters: CharacterCard[],
  filters: CharacterFilters,
  sort: CharacterSort,
  campaignOf: (c: CharacterCard) => string,
): CharacterCard[] {
  const needle = filters.search.trim().toLowerCase();
  const kept = characters.filter(
    (c) =>
      (!needle || c.name.toLowerCase().includes(needle) || classLine(c.classes).toLowerCase().includes(needle)) &&
      (filters.campaign === null || campaignOf(c) === filters.campaign) &&
      (filters.className === null || c.classes.some((k) => k.name === filters.className)) &&
      (filters.level === null || totalLevel(c.classes) === filters.level),
  );
  const order = (a: CharacterCard, b: CharacterCard) =>
    sort === "campaign" ? collator.compare(campaignOf(a), campaignOf(b)) : sort === "level" ? totalLevel(a.classes) - totalLevel(b.classes) : 0;
  return kept.sort((a, b) => order(a, b) || collator.compare(a.name, b.name));
}

/** "Fighter (Champion)" for one class, "Fighter 3 (Champion) / Wizard 2" for several. */
export function classLine(classes: ClassLevel[]): string {
  return classes
    .map((c) => [c.name, classes.length > 1 ? String(c.level) : "", c.subclass ? `(${c.subclass.shortName || c.subclass.name})` : ""].filter(Boolean).join(" "))
    .join(" / ");
}

/** The character sheet's address. */
export const sheetHref = (c: { campaignId: string | null; id: string }) =>
  `/characters/${encodeURIComponent(c.id)}${c.campaignId === null ? "" : `?campaign=${encodeURIComponent(c.campaignId)}`}`;

export function totalLevel(classes: ClassLevel[]): number {
  return classes.reduce((sum, c) => sum + c.level, 0);
}

/** Imported class art to try, best first: the subclass picture, then the class picture. */
export function avatarCandidates(classes: ClassLevel[]): string[] {
  const main = classes[0];
  if (!main) return [];
  const sub = main.subclass;
  return [...(sub ? [`classes/${sub.source}/${sub.shortName || sub.name} ${main.name}.webp`] : []), `classes/${main.source}/${main.name}.webp`];
}
