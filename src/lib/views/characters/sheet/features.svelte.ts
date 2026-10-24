import { byExtra, findEntity } from "$lib/api/rules";
import { errorMessage } from "$lib/api/storage";
import { usageKey } from "$lib/api/featureUsage";
import { baseFeatName, featureUse, nestedFeatures, resolveUse, structuredUse, tableCount, usesMax, type ResolvedUse } from "$lib/characters/features";
import { featureRef, type Entry } from "$lib/characters/levelup";
import { proficiencyBonus } from "$lib/characters/rules";
import type { Ref } from "$lib/rules/preview.svelte";
import { featureUsage, loadFeatureUsage } from "$lib/stores/featureUsage.svelte";
import { strings } from "$lib/strings";
import type { Sheet } from "./sheet.svelte";

type Data = Record<string, unknown>;

/**
 * One class or subclass feature, species trait, feat or other pick, with its rules text. `ref` opens its preview card
 * (a species trait has none); `table` is its class table count, when it has a column.
 */
export type FeatureCard = {
  key: string;
  name: string;
  from: string;
  text?: unknown;
  choice?: string;
  ref?: Ref;
  group: "class" | "traits" | "feats" | "other";
  table?: number | null;
  /** Its rules entry's data, for what the data says outright (consumes, additionalSpells). */
  data?: Data;
};

const lower = (s: string) => s.toLowerCase();
const plain = new Intl.NumberFormat();

/**
 * The sheet's features for the Features & traits and Actions tabs: their texts are loaded once per class and subclass
 * (feats and other picks one by one), and `cards` lists them in order. Both tabs call `load()` from an effect.
 */
export class SheetFeatures {
  classFeatures = $state<Entry[]>([]);
  subclassFeatures = $state<Entry[]>([]);
  subclassData = $state<Data | null>(null);
  /** Feats' and other picks' rules data, looked up one by one. */
  extras = $state<Record<string, Data | null>>({});
  error = $state<string | null>(null);
  #loadedFor = "";
  /** Lookups still running; the texts are complete when none are (and a class was loaded). */
  #pending = $state(0);

  /** Whether every text is in: what's read from them (a Hit Point bonus) can be trusted, not half known. */
  get ready(): boolean {
    return this.#loadedFor !== "" && this.#pending === 0 && !this.error;
  }

  constructor(private readonly sheet: Sheet) {}

  load() {
    void loadFeatureUsage();
    const c = this.sheet.character;
    const m = c?.classes[0];
    if (!m) return;
    const sub = m.subclass;
    const key = `${m.name}|${m.source}|${sub?.name ?? ""}|${sub?.source ?? ""}`;
    if (key !== this.#loadedFor) {
      this.#loadedFor = key;
      this.error = null;
      this.#pending++;
      (async () => {
        this.classFeatures = await byExtra("classFeature", `${m.name}|${m.source}|`);
        if (sub) {
          const subclasses = await byExtra("subclass", `${m.name}|${m.source}`);
          this.subclassData = subclasses.find((s) => lower(s.name) === lower(sub.name) && lower(s.source) === lower(sub.source))?.data ?? null;
          const rows = await byExtra("subclassFeature", `${m.name}|${sub.shortName || sub.name}|`);
          this.subclassFeatures = rows.filter((r) => lower(String(r.data.subclassSource ?? "")) === lower(sub.source));
        } else {
          this.subclassData = null;
          this.subclassFeatures = [];
        }
      })()
        .catch((e) => (this.error = errorMessage(e)))
        .finally(() => this.#pending--);
    }
    // Feats and optional features: their text, looked up one by one (a character has only a few).
    const wanted = [...(c.feats ?? []).map((f) => ["feat", f] as const), ...(c.optionalFeatures ?? []).map((o) => ["optionalfeature", o] as const)];
    for (const [kind, ref] of wanted) {
      const k = `${kind}:${ref.name}|${ref.source}`;
      if (k in this.extras) continue;
      this.extras[k] = null;
      this.#pending++;
      findEntity(kind, kind === "feat" ? baseFeatName(ref.name) : ref.name, ref.source)
        .then((e) => (this.extras[k] = e?.data ?? null))
        .catch(() => {})
        .finally(() => this.#pending--);
    }
  }

  get cards(): FeatureCard[] {
    const t = strings.characters.sheet.features;
    const c = this.sheet.character;
    const main = c?.classes[0];
    if (!c || !main) return [];
    const level = main.level;
    const choices = c.featureChoices ?? [];
    const entryOf = (list: Entry[], name: string, at: number) => list.find((e) => lower(e.name) === lower(name) && Number(e.data.level) === at);
    const cls = this.sheet.cls;
    type Leveled = FeatureCard & { level: number };
    const make = (kind: "classFeature" | "subclassFeature", ref: { name: string; level: number }, choice?: string): Leveled => {
      const sub = kind === "subclassFeature";
      const entry = entryOf(sub ? this.subclassFeatures : this.classFeatures, ref.name, ref.level);
      return {
        key: `${sub ? "s" : "c"}:${ref.name}:${ref.level}`,
        name: ref.name,
        from: t.classLevel(sub ? (main.subclass?.name ?? "") : main.name, plain.format(ref.level)),
        text: entry?.data.entries,
        data: entry?.data,
        choice: choice || undefined,
        level: ref.level,
        // By id when known: the popup then shows this class's feature, not another class's of the same name.
        ref: { kind, name: ref.name, source: entry?.source ?? (sub ? main.subclass?.source : undefined) ?? main.source, id: (entry as { id?: number } | undefined)?.id },
        group: "class",
        ...(sub ? {} : { table: tableCount(cls, ref.name, level) }),
      };
    };
    // A feature, then the ones its text refers to as their own entries (Channel Divinity: Divine Sense; Oath of
    // Devotion: Sacred Weapon), each up to the character's level.
    const withNested = (parent: Leveled): Leveled[] => [
      parent,
      ...nestedFeatures(parent.text).flatMap((n) => {
        const ref = featureRef(n.ref, n.kind === "subclassFeature");
        return ref.name && ref.level <= level ? [make(n.kind, ref)] : [];
      }),
    ];
    const fromClass = (Array.isArray(cls?.classFeatures) ? cls.classFeatures : []).flatMap((r): Leveled[] => {
      const raw = typeof r === "string" ? r : String((r as Data)?.classFeature ?? "");
      const ref = featureRef(raw);
      // With a subclass, its own features replace the "Subclass" placeholder.
      if (!ref.name || ref.level > level || (main.subclass && (r as Data)?.gainSubclassFeature)) return [];
      const choice = choices.filter((x) => x.feature === ref.name).map((x) => x.name).join(", ");
      return withNested(make("classFeature", ref, choice));
    });
    const subclassFeatures = this.subclassData?.subclassFeatures;
    const fromSubclass = (Array.isArray(subclassFeatures) ? subclassFeatures : []).flatMap((r): Leveled[] => {
      const ref = featureRef(typeof r === "string" ? r : String((r as Data)?.subclassFeature ?? ""), true);
      return ref.name && ref.level <= level ? withNested(make("subclassFeature", ref)) : [];
    });
    // A feature both listed and referred to shows once.
    const seen = new Set<string>();
    const byLevel = [...fromClass, ...fromSubclass].sort((a, b) => a.level - b.level).filter((card) => !seen.has(card.key) && !!seen.add(card.key));
    const speciesEntries = this.sheet.species?.entries;
    const traits = (Array.isArray(speciesEntries) ? speciesEntries : []).flatMap((e): FeatureCard[] => {
      const entry = e as Data;
      return typeof entry?.name === "string" ? [{ key: `t:${entry.name}`, name: entry.name, from: c.species?.name ?? "", text: entry.entries, group: "traits" }] : [];
    });
    const feats = (c.feats ?? []).map((f, i): FeatureCard => ({
      key: `f:${i}:${f.name}|${f.source}`,
      name: f.name,
      from: f.origin ? t.featFrom(f.origin) : t.feat,
      text: this.extras[`feat:${f.name}|${f.source}`]?.entries,
      data: this.extras[`feat:${f.name}|${f.source}`] ?? undefined,
      ref: { kind: "feat", name: baseFeatName(f.name), source: f.source },
      group: "feats",
    }));
    // A repeatable invocation can be there twice (on different cantrips), so the card key includes its place.
    const optional = (c.optionalFeatures ?? []).map((o, i): FeatureCard => ({
      key: `o:${i}:${o.name}|${o.source}`,
      name: o.target ? t.withTarget(o.name, o.target) : o.name,
      from: o.origin,
      text: this.extras[`optionalfeature:${o.name}|${o.source}`]?.entries,
      data: this.extras[`optionalfeature:${o.name}|${o.source}`] ?? undefined,
      ref: { kind: "optionalfeature", name: o.name, source: o.source },
      group: "other",
    }));
    return [...byLevel, ...traits, ...feats, ...optional];
  }

  /** How a feature is used: what's filled in by hand (its preview card), then the rules data, then its text. */
  useOf(card: FeatureCard): ResolvedUse {
    const manual = card.ref ? featureUsage.map[usageKey(card.ref, card.data)] : undefined;
    return resolveUse(featureUse(card.text, card.table ?? null), structuredUse(card.data), manual);
  }

  /** The feature whose uses this one spends: the pool it draws from (Turn Undead: Channel Divinity), else itself. */
  poolOf(card: FeatureCard): FeatureCard {
    const from = this.useOf(card).drawsFrom?.toLowerCase();
    if (!from || from === card.name.toLowerCase()) return card;
    return this.cards.find((other) => other.name.toLowerCase() === from) ?? card;
  }

  /**
   * Its uses, counted on its pool and kept per pool name (a feature named twice, like Ability Score Improvement,
   * shares them): the key, the maximum (from a class table column, its usage, or set by hand; null when unknown),
   * how many are spent, and how a short rest gives them back.
   */
  usesOf(card: FeatureCard): { key: string; max: number | null; used: number; short: "all" | "one" | null } {
    const pool = this.poolOf(card);
    const use = this.useOf(pool);
    const key = pool.name.toLowerCase();
    const c = this.sheet.character;
    const level = c?.classes[0]?.level ?? 1;
    const table = use.table ? tableCount(this.sheet.cls, use.table, level) : null;
    const max = table ?? (use.uses ? usesMax(use.uses, this.sheet.scores, proficiencyBonus(this.sheet.level), level) : (c?.featureUsesMax?.[key] ?? null));
    return { key, max, used: c?.featureUses?.[key]?.used ?? 0, short: use.short };
  }

  /**
   * The free casts of a spell with a use left: features that cast it without a spell slot, naming it (Paladin's
   * Smite: Divine Smite) or, naming none, the feat the spell came from (Magic Initiate).
   */
  freeCastsFor(spell: { name: string; origin?: string }): { card: FeatureCard; key: string; max: number; used: number; short: "all" | "one" | null }[] {
    const name = spell.name.toLowerCase();
    return this.cards.flatMap((card) => {
      const use = this.useOf(card);
      if (!use.freeCast) return [];
      // Named in it (Paladin's Smite: Divine Smite), or the spell came from it (Magic Initiate's, Fey Touched's chosen one).
      const fromIt = !!spell.origin && baseFeatName(spell.origin) === baseFeatName(card.name);
      const forThis = use.spells.includes(name) || fromIt;
      const uses = this.usesOf(card);
      return forThis && uses.max !== null && uses.used < uses.max ? [{ card, ...uses, max: uses.max }] : [];
    });
  }

  /** Spends one free cast (ticks the feature's use box). */
  spendFreeCast(free: { key: string; max: number; used: number; short: "all" | "one" | null }) {
    this.sheet.setFeatureUsed(free.key, free.used + 1, free.max, free.short);
  }

  /**
   * The Actions tab's feature rows: the ticked ones, each that draws from a pool bundled under it as an `option`
   * (Channel Divinity, then Divine Sense and Sacred Weapon). The pool shows even when only its options are ticked.
   */
  actionRows(): { card: FeatureCard; option: boolean }[] {
    const rows: { card: FeatureCard; option: boolean }[] = [];
    const placed = new Set<string>();
    const ticked = this.cards.filter((card) => this.onActions(card));
    for (const card of ticked) {
      const head = this.poolOf(card);
      if (placed.has(head.key)) continue;
      placed.add(head.key);
      rows.push({ card: head, option: false });
      for (const option of ticked.filter((o) => o.key !== head.key && this.poolOf(o).key === head.key)) {
        placed.add(option.key);
        rows.push({ card: option, option: true });
      }
    }
    return rows;
  }

  /** Whether it's ticked to show on the Actions tab. */
  onActions(card: FeatureCard): boolean {
    return (this.sheet.character?.actionFeatures ?? []).includes(card.key);
  }

  setOnActions(card: FeatureCard, on: boolean) {
    this.sheet.change((x) => {
      const keys = (x.actionFeatures ?? []).filter((k) => k !== card.key);
      x.actionFeatures = on ? [...keys, card.key] : keys;
    });
  }
}
