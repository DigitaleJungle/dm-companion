import { getCharacter, saveCharacter, type Character } from "$lib/api/characters";
import { catalogRows, findEntity, type CatalogRow } from "$lib/api/rules";
import { errorMessage, type StorageError } from "$lib/api/storage";
import { ABILITIES, type Ability, type Scores } from "$lib/characters/rules";
import { hpOf, type Resources, type Vitals } from "$lib/characters/sheet";
import { strings } from "$lib/strings";

type Data = Record<string, unknown>;
export type Skill = { key: string; name: string; ability: Ability };

const SAVE_DELAY_MS = 500;

/** One open character sheet: the file, the rules entries it refers to, and saving every change shortly after it's made. */
export class Sheet {
  character = $state<Character | null>(null);
  /** In an archived campaign: everything is shown, nothing can change. */
  archived = $state(false);
  loadError = $state<string | null>(null);
  notFound = $state(false);
  save = $state<{ status: "saved" | "pending" | "saving" | "error"; error: string | null }>({ status: "saved", error: null });

  // Rules entries; null until loaded or when the rules data doesn't have them.
  cls = $state<Data | null>(null);
  species = $state<Data | null>(null);
  skills = $state<Skill[]>([]);
  conditions = $state<CatalogRow[]>([]);
  rulesError = $state<string | null>(null);

  #timer: ReturnType<typeof setTimeout> | undefined;
  #dirty = false;
  #running: Promise<void> | null = null;

  constructor(
    readonly campaign: string | null,
    readonly id: string,
  ) {}

  get readOnly() {
    return this.archived || !this.character;
  }

  get level() {
    return (this.character?.classes ?? []).reduce((sum, c) => sum + c.level, 0);
  }

  /** Base scores plus their saved bonuses. */
  get scores(): Scores | null {
    const a = this.character?.abilities;
    if (!a?.base) return null;
    return Object.fromEntries(ABILITIES.map((k) => [k, (a.base[k] ?? 10) + (a.bonuses?.[k] ?? 0)])) as Scores;
  }

  get vitals(): Vitals {
    const c = this.character;
    return { hp: hpOf(c?.hp), deathSaves: { successes: c?.deathSaves?.successes ?? 0, failures: c?.deathSaves?.failures ?? 0 } };
  }

  get resources(): Resources {
    const c = this.character;
    return { hitDiceSpent: c?.hitDiceSpent ?? 0, slotsUsed: c?.slotsUsed ?? [], pactSlotsUsed: c?.pactSlotsUsed ?? 0 };
  }

  async load() {
    try {
      const file = await getCharacter(this.campaign, this.id);
      this.character = file.character;
      this.archived = file.archived;
    } catch (e) {
      if ((e as StorageError)?.kind === "notFound") this.notFound = true;
      else this.loadError = strings.characters.sheet.loadError(errorMessage(e));
      return;
    }
    await this.loadRules();
  }

  /** Missing rules data only hides the numbers that come from it; tracking still works. */
  async loadRules() {
    const c = this.character;
    if (!c) return;
    this.rulesError = null;
    const main = c.classes[0];
    try {
      const [cls, species, skills, conditions] = await Promise.all([
        main ? findEntity("class", main.name, main.source) : null,
        c.species ? findEntity("species", c.species.name, c.species.source) : null,
        catalogRows("skill", ["ability"]),
        catalogRows("condition", []),
      ]);
      this.cls = cls?.data ?? null;
      this.species = species?.data ?? null;
      const byKey = new Map<string, Skill>();
      for (const row of skills) byKey.set(row.name.toLowerCase(), { key: row.name.toLowerCase(), name: row.name, ability: String(row.data.ability ?? "") as Ability });
      this.skills = [...byKey.values()].sort((a, b) => a.name.localeCompare(b.name));
      // One chip per condition; the version from the character's own book wins.
      const byName = new Map<string, CatalogRow>();
      for (const row of conditions) {
        const key = row.name.toLowerCase();
        if (!byName.has(key) || row.source.toLowerCase() === main?.source.toLowerCase()) byName.set(key, row);
      }
      this.conditions = [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
    } catch (e) {
      this.rulesError = strings.characters.sheet.rulesError(errorMessage(e));
    }
  }

  /** Applies a change to the character and saves it shortly after. Does nothing for read-only characters. */
  change(edit: (c: Character) => void) {
    if (this.readOnly) return;
    edit(this.character!);
    this.#dirty = true;
    this.save = { status: "pending", error: null };
    clearTimeout(this.#timer);
    this.#timer = setTimeout(() => this.flush(), SAVE_DELAY_MS);
  }

  /** Saves now if anything is waiting; one save at a time, the latest state always wins. */
  async flush() {
    clearTimeout(this.#timer);
    while (this.#running) await this.#running;
    if (!this.#dirty || !this.character) return;
    this.#dirty = false;
    this.save = { status: "saving", error: null };
    const snapshot = $state.snapshot(this.character) as Character;
    this.#running = saveCharacter(this.campaign, this.id, snapshot).then(
      () => {
        if (!this.#dirty) this.save = { status: "saved", error: null };
      },
      (e) => {
        this.#dirty = true; // kept, so Retry (or the next change) saves it
        this.save = { status: "error", error: strings.characters.sheet.saveError(errorMessage(e)) };
      },
    );
    await this.#running;
    this.#running = null;
  }

  /** After a failed save: try again with the current state. */
  retry() {
    this.#dirty = true;
    return this.flush();
  }
}
