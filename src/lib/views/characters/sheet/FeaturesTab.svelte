<script lang="ts">
  import { plainText } from "$lib/rules/tags";
  import { strings } from "$lib/strings";
  import type { Sheet } from "./sheet.svelte";

  // Class features up to the character's level, species traits and feats, as cards.
  let { sheet }: { sheet: Sheet } = $props();

  const t = strings.characters.sheet.features;
  const plain = new Intl.NumberFormat();
  type Card = { name: string; from: string; text?: string };
  type Data = Record<string, unknown>;

  const cards = $derived.by((): Card[] => {
    const c = sheet.character;
    if (!c) return [];
    const main = c.classes[0];
    // Feature refs look like "Name|Class|ClassSource|Level", or { classFeature: "…" } for subclass steps.
    const classFeatures = (Array.isArray(sheet.cls?.classFeatures) ? sheet.cls.classFeatures : []).flatMap((f): Card[] => {
      const ref = typeof f === "string" ? f : String((f as Data)?.classFeature ?? "");
      const parts = ref.split("|");
      const level = Number(parts.at(-1));
      return parts[0] && main && level <= sheet.level ? [{ name: parts[0], from: t.classLevel(main.name, plain.format(level)) }] : [];
    });
    // shortcut: class features show their names only; their text needs a lookup per feature that can tell classes apart, which comes with level up.
    const traits = (Array.isArray(sheet.species?.entries) ? sheet.species.entries : []).flatMap((e): Card[] => {
      const entry = e as Data;
      if (typeof entry?.name !== "string") return [];
      const first = (Array.isArray(entry.entries) ? entry.entries : []).find((x) => typeof x === "string");
      return [{ name: entry.name, from: c.species?.name ?? "", text: typeof first === "string" ? plainText(first) : undefined }];
    });
    const feats = (c.feats ?? []).map((f) => ({ name: f.name, from: t.feat }));
    return [...classFeatures, ...traits, ...feats];
  });
</script>

{#if cards.length === 0}
  <p class="muted">{t.empty}</p>
{:else}
  <ul class="cards">
    {#each cards as card, i (i)}
      <li class="card">
        <div class="head"><b>{card.name}</b><span class="muted small">{card.from}</span></div>
        {#if card.text}<p class="muted text">{card.text}</p>{/if}
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

  .text {
    display: -webkit-box;
    -webkit-line-clamp: 3;
    line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .muted {
    color: var(--color-text-muted);
  }

  .small {
    flex: none;
    font-size: var(--text-xs);
  }
</style>
