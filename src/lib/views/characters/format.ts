import type { ClassLevel } from "$lib/api/characters";

/** "Fighter (Champion)" for one class, "Fighter 3 (Champion) / Wizard 2" for several. */
export function classLine(classes: ClassLevel[]): string {
  return classes
    .map((c) => [c.name, classes.length > 1 ? String(c.level) : "", c.subclass ? `(${c.subclass.shortName || c.subclass.name})` : ""].filter(Boolean).join(" "))
    .join(" / ");
}

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
