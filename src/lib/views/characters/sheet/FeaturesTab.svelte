<script lang="ts">
  import Entries from "$lib/components/rules/Entries.svelte";
  import { byExtra, findEntity } from "$lib/api/rules";
  import { errorMessage } from "$lib/api/storage";
  import { featureRef, type Entry } from "$lib/characters/levelup";
  import { strings } from "$lib/strings";
  import type { Sheet } from "./sheet.svelte";

  // Class and subclass features up to the character's level, species traits, feats, and picks made when leveling
  // (Divine Order, invocations…), each with its rules text; long texts fold open.
  let { sheet }: { sheet: Sheet } = $props();

  const t = strings.characters.sheet.features;
  const plain = new Intl.NumberFormat();
  type Card = { key: string; name: string; from: string; text?: unknown; choice?: string };
  type Data = Record<string, unknown>;

  let classFeatures = $state<Entry[]>([]);
  let subclassFeatures = $state<Entry[]>([]);
  let subclassData = $state<Data | null>(null);
  let extras = $state<Record<string, unknown>>({});
  let loadError = $state<string | null>(null);
  let expanded = $state<Record<string, boolean>>({});

  const c = $derived(sheet.character);
  const main = $derived(c?.classes[0]);
  const lower = (s: string) => s.toLowerCase();

  // The class's and subclass's feature entries (with their text), loaded once per class and subclass.
  $effect(() => {
    const m = main;
    loadError = null;
    if (!m) return;
    const sub = m.subclass;
    (async () => {
      classFeatures = await byExtra("classFeature", `${m.name}|${m.source}|`);
      if (sub) {
        const subclasses = await byExtra("subclass", `${m.name}|${m.source}`);
        subclassData = subclasses.find((s) => lower(s.name) === lower(sub.name) && lower(s.source) === lower(sub.source))?.data ?? null;
        const rows = await byExtra("subclassFeature", `${m.name}|${sub.shortName || sub.name}|`);
        subclassFeatures = rows.filter((r) => lower(String(r.data.subclassSource ?? "")) === lower(sub.source));
      } else {
        subclassData = null;
        subclassFeatures = [];
      }
    })().catch((e) => (loadError = errorMessage(e)));
  });

  // Feats and optional features: their text, looked up one by one (a character has only a few).
  $effect(() => {
    const wanted = [...(c?.feats ?? []).map((f) => ["feat", f] as const), ...(c?.optionalFeatures ?? []).map((o) => ["optionalfeature", o] as const)];
    for (const [kind, ref] of wanted) {
      const k = `${kind}:${ref.name}|${ref.source}`;
      if (k in extras) continue;
      extras[k] = null;
      findEntity(kind, ref.name, ref.source)
        .then((e) => (extras[k] = e?.data.entries ?? null))
        .catch(() => {});
    }
  });

  const textOf = (list: Entry[], name: string, level: number) => list.find((e) => lower(e.name) === lower(name) && Number(e.data.level) === level)?.data.entries;

  const cards = $derived.by((): Card[] => {
    if (!c || !main) return [];
    const level = main.level;
    const choices = c.featureChoices ?? [];
    const fromClass = (Array.isArray(sheet.cls?.classFeatures) ? sheet.cls.classFeatures : []).flatMap((r): (Card & { level: number })[] => {
      const raw = typeof r === "string" ? r : String((r as Data)?.classFeature ?? "");
      const ref = featureRef(raw);
      // With a subclass, its own features replace the "Subclass" placeholder.
      if (!ref.name || ref.level > level || (main.subclass && (r as Data)?.gainSubclassFeature)) return [];
      const choice = choices.filter((x) => x.feature === ref.name).map((x) => x.name).join(", ");
      return [{ key: `c:${ref.name}:${ref.level}`, name: ref.name, from: t.classLevel(main.name, plain.format(ref.level)), text: textOf(classFeatures, ref.name, ref.level), choice: choice || undefined, level: ref.level }];
    });
    const fromSubclass = (Array.isArray(subclassData?.subclassFeatures) ? subclassData.subclassFeatures : []).flatMap((r): (Card & { level: number })[] => {
      const ref = featureRef(typeof r === "string" ? r : String((r as Data)?.subclassFeature ?? ""), true);
      if (!ref.name || ref.level > level) return [];
      return [{ key: `s:${ref.name}:${ref.level}`, name: ref.name, from: t.classLevel(main.subclass?.name ?? "", plain.format(ref.level)), text: textOf(subclassFeatures, ref.name, ref.level), level: ref.level }];
    });
    const byLevel = [...fromClass, ...fromSubclass].sort((a, b) => a.level - b.level);
    const traits = (Array.isArray(sheet.species?.entries) ? sheet.species.entries : []).flatMap((e): Card[] => {
      const entry = e as Data;
      return typeof entry?.name === "string" ? [{ key: `t:${entry.name}`, name: entry.name, from: c.species?.name ?? "", text: entry.entries }] : [];
    });
    const feats = (c.feats ?? []).map((f, i) => ({ key: `f:${i}:${f.name}|${f.source}`, name: f.name, from: f.origin ? t.featFrom(f.origin) : t.feat, text: extras[`feat:${f.name}|${f.source}`] ?? undefined }));
    // A repeatable invocation can be there twice (on different cantrips), so the card key includes its place.
    const optional = (c.optionalFeatures ?? []).map((o, i) => ({
      key: `o:${i}:${o.name}|${o.source}`,
      name: o.target ? t.withTarget(o.name, o.target) : o.name,
      from: o.origin,
      text: extras[`optionalfeature:${o.name}|${o.source}`] ?? undefined,
    }));
    return [...byLevel, ...traits, ...feats, ...optional];
  });
</script>

{#if loadError}<p class="error" role="alert">{t.loadError(loadError)}</p>{/if}
{#if cards.length === 0}
  <p class="muted">{t.empty}</p>
{:else}
  <ul class="cards">
    {#each cards as card (card.key)}
      <li class="card">
        <div class="head"><b>{card.name}</b><span class="muted small">{card.from}</span></div>
        {#if card.choice}<p class="choice">{t.choice(card.choice)}</p>{/if}
        {#if card.text}
          <div class="text" class:open={expanded[card.key]} id="feature-{card.key}"><Entries entry={card.text} depth={5} /></div>
          <button class="more" aria-expanded={!!expanded[card.key]} aria-controls="feature-{card.key}" onclick={() => (expanded[card.key] = !expanded[card.key])}>
            {expanded[card.key] ? t.less : t.more}
          </button>
        {/if}
      </li>
    {/each}
  </ul>
{/if}

<style>
  .cards {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(100%, calc(10 * var(--space-6))), 1fr));
    gap: var(--space-3);
    align-items: start;
  }

  .card {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding: var(--space-3);
    border: var(--border-width) solid var(--color-border-strong);
    border-radius: var(--radius-md);
    font-size: var(--text-sm);
  }

  .head {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: var(--space-2);
  }

  .choice {
    color: var(--color-link);
    font-weight: var(--weight-semibold);
  }

  /* Folded: the first lines only. */
  .text {
    max-height: calc(3 * var(--leading-normal) * 1em);
    overflow: hidden;
    color: var(--color-text-muted);
  }

  .text.open {
    max-height: none;
  }

  .text :global(p) {
    margin-bottom: var(--space-2);
  }

  .more {
    align-self: flex-start;
    padding: 0;
    border: none;
    background: none;
    color: var(--color-link);
    font-size: var(--text-xs);
    font-weight: var(--weight-medium);
    cursor: pointer;
  }

  .muted {
    color: var(--color-text-muted);
  }

  .small {
    flex: none;
    font-size: var(--text-xs);
  }

  .error {
    margin-bottom: var(--space-3);
    color: var(--color-danger);
    font-size: var(--text-sm);
  }
</style>
