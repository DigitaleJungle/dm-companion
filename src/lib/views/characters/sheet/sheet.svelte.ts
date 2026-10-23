import { getCharacter, saveCharacter, type Character } from "$lib/api/characters";
import { catalogRows, findEntity, type CatalogRow } from "$lib/api/rules";
import { errorMessage, type StorageError } from "$lib/api/storage";
import { restUses } from "$lib/characters/features";
import { SheetFeatures } from "./features.svelte";
import { scoresWithLevels } from "$lib/characters/levelup";
import { modifier, proficiencyBonus, type Ability, type Scores } from "$lib/characters/rules";
import { castSlots, hpOf, pactSlots, spellDice, spellRow, spellSlots, type CastSlot, type Resources, type SpellRow, type Vitals } from "$lib/characters/sheet";
import { capital, castingTime, components, spellRange } from "$lib/rules/format";
import { strings } from "$lib/strings";

type Data = Record<string, unknown>;
export type Skill = { key: string; name: string; ability: Ability };

const SAVE_DELAY_MS = 500;
/** The spell fields the Spells and Actions tabs read (see spellRow and spellDice). */
const SPELL_KEYS = ["level", "time", "range", "components", "duration", "meta", "spellAttack", "savingThrow", "damageInflict", "conditionInflict", "miscTags", "scalingLevelDice", "entries"];
export const spellKey = (s: { name: string; source: string }) => `${s.name}|${s.source}`.toLowerCase();
const plain = new Intl.NumberFormat();
const signed = new Intl.NumberFormat(undefined, { signDisplay: "always" });
const listShort = new Intl.ListFormat(undefined, { type: "unit", style: "short" });

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
  background = $state<Data | null>(null);
  skills = $state<Skill[]>([]);
  /** Item property names by code ("F" → "Finesse"). */
  properties = $state<Record<string, string>>({});
  conditions = $state<CatalogRow[]>([]);
  rulesError = $state<string | null>(null);
  /** Spells' rules data by "name|source" key, for the Spells and Actions tabs; loaded once, on first use. */
  spellDetails = $state<Map<string, CatalogRow> | null>(null);
  spellDetailsError = $state<string | null>(null);
  #spellsLoading = false;
  /** Features, traits and feats with their texts, shared by the Features & traits and Actions tabs. */
  readonly features = new SheetFeatures(this);

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

  /** Base scores plus their saved bonuses and the increases from feats taken at levels. */
  get scores(): Scores | null {
    return this.character ? scoresWithLevels(this.character) : null;
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
      const [cls, species, background, skills, conditions, properties] = await Promise.all([
        main ? findEntity("class", main.name, main.source) : null,
        c.species ? findEntity("species", c.species.name, c.species.source) : null,
        c.background ? findEntity("background", c.background.name, c.background.source) : null,
        catalogRows("skill", ["ability"]),
        catalogRows("condition", []),
        catalogRows("itemProperty", ["abbreviation"]),
      ]);
      this.cls = cls?.data ?? null;
      this.species = species?.data ?? null;
      this.background = background?.data ?? null;
      this.properties = Object.fromEntries(properties.map((p) => [String(p.data.abbreviation ?? "").toUpperCase(), p.name]));
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
    // Started now, not awaited: the sheet shows at once, and the Spells, Features and Actions tabs find their data
    // (spell details, feature texts, free casts) ready. Each loads once; the tabs' own calls then do nothing.
    this.features.load();
    if ((c.spells ?? []).length) void this.loadSpellDetails();
  }

  async loadSpellDetails() {
    if (this.spellDetails || this.#spellsLoading) return;
    this.#spellsLoading = true;
    this.spellDetailsError = null;
    try {
      const rows = await catalogRows("spell", SPELL_KEYS);
      this.spellDetails = new Map(rows.map((r) => [spellKey(r), r]));
    } catch (e) {
      this.spellDetailsError = errorMessage(e);
    } finally {
      this.#spellsLoading = false;
    }
  }

  spellDetail(spell: { name: string; source: string }): CatalogRow | null {
    return this.spellDetails?.get(spellKey(spell)) ?? null;
  }

  /** Sets how many uses of a feature are spent (0 to `max`); `short` is how a short rest gives them back. */
  setFeatureUsed(key: string, used: number, max: number, short: "all" | "one" | null) {
    this.change((x) => {
      const spent = { ...(x.featureUses ?? {}) };
      used = Math.min(max, Math.max(0, used));
      if (used > 0) spent[key] = { used, ...(short ? { short } : {}) };
      else delete spent[key];
      x.featureUses = spent;
    });
  }

  /** A feature's number of uses, set by hand (its text gives none); 0 clears it. */
  setFeatureMax(key: string, max: number) {
    this.change((x) => {
      const next = { ...(x.featureUsesMax ?? {}) };
      if (max > 0) next[key] = max;
      else delete next[key];
      x.featureUsesMax = next;
    });
  }

  /** A short or long rest gives feature uses back (see restUses). */
  restFeatures(rest: "short" | "long") {
    this.change((x) => (x.featureUses = restUses(x.featureUses ?? {}, rest)));
  }

  /** The slots a spell of this level can be cast with now (see castSlots). */
  castSlotsFor(spellLevel: number): CastSlot[] {
    const c = this.character;
    return castSlots(spellLevel, spellSlots(this.cls, this.level), c?.slotsUsed ?? [], pactSlots(this.cls, this.level), c?.pactSlotsUsed ?? 0);
  }

  /**
   * Ends concentration (a short or long rest): Concentrating off, and its spell's row stops glowing. Returns the
   * notification's sentence, or null when the character wasn't concentrating.
   */
  endConcentration(): string | null {
    const c = this.character;
    if (!c?.concentrating || this.readOnly) return null;
    const t = strings.characters.sheet.spells;
    const message = c.concentratingOn ? t.concentrationEnded(c.concentratingOn.name) : t.concentrationEndedPlain;
    this.change((x) => {
      x.concentrating = false;
      delete x.concentratingOn;
    });
    return message;
  }

  /** Casts a spell: uses the slot (none for a cantrip) and, for a concentration spell, starts concentrating on it. */
  cast(spell: { name: string; source: string }, slot: CastSlot | null, concentration: boolean) {
    this.change((x) => {
      if (slot?.pact) x.pactSlotsUsed = (x.pactSlotsUsed ?? 0) + 1;
      else if (slot) {
        const used = [...(x.slotsUsed ?? [])];
        while (used.length < slot.level) used.push(0);
        used[slot.level - 1] += 1;
        x.slotsUsed = used;
      }
      if (concentration) {
        x.concentrating = true;
        x.concentratingOn = { name: spell.name, source: spell.source };
      }
    });
  }

  /** One spell as the Spells tab shows it; null until its rules data is loaded (or when it has none). */
  spellLine(spell: { name: string; source: string; ability?: string }) {
    const data = this.spellDetail(spell)?.data;
    if (!data) return null;
    const t = strings.characters.sheet;
    const row = spellRow(data);
    const dice = spellDice(data, this.level);
    const damage =
      row.healing && !row.effects.length ? (dice ? t.actions.healing(dice) : t.spells.healing) : [dice, row.effects.map(capital).join(", ")].filter(Boolean).join(" ");
    const cast = strings.characters.levelUpDialog.cast[row.unit as keyof typeof strings.characters.levelUpDialog.cast];
    return {
      level: Number(data.level ?? 0),
      concentration: row.concentration,
      // A, BA or R (the full word on hover); a longer casting time ("1 minute") is written out.
      time: (cast ?? { short: castingTime(data), long: castingTime(data) }) as { short: string; long: string },
      range: spellRange(data),
      hit: this.spellHitOrDc(spell, row),
      damage: damage || t.spells.none,
      notes: listShort.format([[row.v && "V", row.s && "S", row.m && "M"].filter(Boolean).join(", "), ...(row.ritual ? [t.actions.ritual] : [])].filter(Boolean)),
      notesTitle: components(data),
    };
  }

  /** The class's spell save DC (8 + spellcasting modifier + proficiency); null without spellcasting or scores. */
  spellSaveDc(): number | null {
    const ability = typeof this.cls?.spellcastingAbility === "string" ? (this.cls.spellcastingAbility as Ability) : null;
    return ability && this.scores ? 8 + modifier(this.scores[ability]) + proficiencyBonus(this.level) : null;
  }

  /** Hit/DC of a spell: "+5" for an attack, "WIS 13" for a save, "—" otherwise; with its own ability (Magic Initiate's pick), else the class's. */
  spellHitOrDc(spell: { ability?: string }, row: SpellRow): string {
    const t = strings.characters.sheet;
    const classAbility = typeof this.cls?.spellcastingAbility === "string" ? this.cls.spellcastingAbility : null;
    const own = (spell.ability ?? classAbility) as Ability | null;
    const mod = own && this.scores ? modifier(this.scores[own]) : null;
    const pb = proficiencyBonus(this.level);
    if (row.attack) return mod === null ? t.unknown : signed.format(mod + pb);
    if (row.save) return t.spells.dc(mod === null ? t.unknown : plain.format(8 + mod + pb), row.save.toUpperCase());
    return t.spells.none;
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
