<script lang="ts">
  import { tick, type Snippet } from "svelte";
  import EntityView from "$lib/components/rules/EntityView.svelte";
  import { getEntity, type CatalogRow, type Entity } from "$lib/api/rules";
  import { errorMessage } from "$lib/api/storage";
  import { sourceName } from "$lib/stores/rules.svelte";
  import { strings } from "$lib/strings";
  import ChoiceArt from "./ChoiceArt.svelte";

  // Two stages: a filterable grid of picture cards; after picking, an overview of the pick with its choices.
  let {
    id,
    label,
    rows,
    selected,
    onselect,
    facts,
    art,
    choices,
  }: {
    id: string;
    label: string;
    rows: CatalogRow[];
    selected: CatalogRow | null;
    onselect: (row: CatalogRow) => void;
    /** Short facts on each card and in the overview. */
    facts: (row: CatalogRow) => string[];
    /** The entry's picture in the imported images. */
    art: (row: CatalogRow) => string;
    /** The choices the picked entry asks for. */
    choices?: Snippet;
  } = $props();

  const t = strings.characters.wizard.pick;
  let filter = $state("");
  let entity = $state<Entity | null>(null);
  let entityError = $state<string | null>(null);
  // Coming back to a step that has a pick shows its overview.
  // svelte-ignore state_referenced_locally
  let browsing = $state(!selected);
  let grid: HTMLUListElement | undefined = $state();
  let heading: HTMLHeadingElement | undefined = $state();

  const visible = $derived.by(() => {
    const needle = filter.trim().toLowerCase();
    const sorted = [...rows].sort((a, b) => a.name.localeCompare(b.name) || a.source.localeCompare(b.source));
    return needle ? sorted.filter((r) => r.name.toLowerCase().includes(needle) || r.source.toLowerCase().includes(needle)) : sorted;
  });

  $effect(() => {
    const row = selected;
    entity = null;
    entityError = null;
    if (row) getEntity(row.id).then((e) => (entity = e)).catch((e) => (entityError = errorMessage(e)));
  });

  async function pick(row: CatalogRow) {
    if (selected?.id !== row.id) onselect(row);
    browsing = false;
    await tick();
    heading?.scrollIntoView({ block: "start" });
    heading?.focus();
  }

  async function change() {
    browsing = true;
    await tick();
    const current = grid?.querySelector<HTMLButtonElement>('[aria-pressed="true"]');
    current?.scrollIntoView({ block: "center" });
    current?.focus();
  }
</script>

{#if browsing || !selected}
  <div class="picker">
    <div class="toolbar">
      <p class="list-label" aria-hidden="true">{label} <span class="required" aria-hidden="true">*</span></p>
      <label for="{id}-filter" class="sr-only">{t.filter(label)}</label>
      <input id="{id}-filter" class="filter" type="search" bind:value={filter} placeholder={t.filterPlaceholder} autocomplete="off" />
    </div>

    {#if rows.length === 0}
      <p class="muted">{t.empty}</p>
    {:else if visible.length === 0}
      <p class="muted">{t.none}</p>
    {:else}
      <ul class="grid" bind:this={grid} aria-label="{label} ({strings.characters.wizard.basics.required})">
        {#each visible as row (row.id)}
          <li>
            <button class="card" aria-pressed={selected?.id === row.id} onclick={() => pick(row)}>
              <span class="card-art"><ChoiceArt path={art(row)} name={row.name} /></span>
              <span class="card-body">
                <span class="card-top">
                  <span class="name">{row.name}</span>
                  <span class="source" title={sourceName(row.source)}>{row.source}</span>
                </span>
                <span class="fact">{facts(row).join(" · ")}</span>
              </span>
            </button>
          </li>
        {/each}
      </ul>
    {/if}
  </div>
{:else}
  <section class="overview" aria-labelledby="{id}-picked">
    <div class="hero">
      <div class="hero-art"><ChoiceArt path={art(selected)} name={selected.name} /></div>
      <div class="hero-text">
        <div class="name-row">
          <h3 id="{id}-picked" class="hero-name" bind:this={heading} tabindex="-1">{selected.name}</h3>
          <button class="change" onclick={change}><span aria-hidden="true">←</span> {t.change(label)}</button>
        </div>
        <p class="muted">{sourceName(selected.source)} ({selected.source})</p>
        {#if facts(selected).length}
          <ul class="chips">
            {#each facts(selected) as fact, i (i)}<li class="chip">{fact}</li>{/each}
          </ul>
        {/if}
        {#if choices}
          <div class="choices">
            {@render choices()}
          </div>
        {/if}
      </div>
    </div>

    <div class="rules">
      {#if entityError}
        <p class="error" role="alert">{entityError}</p>
      {:else if entity}
        <EntityView {entity} compact />
      {:else}
        <p class="muted" role="status">{t.loadingEntry}</p>
      {/if}
    </div>
  </section>
{/if}

<style>
  .picker,
  .overview {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  .toolbar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
  }

  .list-label {
    font-size: var(--text-sm);
    font-weight: var(--weight-semibold);
  }

  .filter {
    width: min(100%, var(--select-width));
    min-height: var(--control-height);
    padding: 0 var(--space-3);
    border: var(--border-width) solid var(--color-border-strong);
    border-radius: var(--radius-md);
    background: var(--color-surface);
    font-size: var(--text-sm);
  }

  .filter::placeholder {
    color: var(--color-text-placeholder);
  }

  .grid {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(100%, var(--choice-card-width)), 1fr));
    gap: var(--space-4);
  }

  .card {
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
    padding: 0;
    overflow: hidden;
    border: var(--border-width) solid var(--color-border);
    border-radius: var(--radius-lg);
    background: var(--color-surface);
    box-shadow: var(--shadow-card);
    color: var(--color-text);
    text-align: left;
    cursor: pointer;
  }

  .card:hover {
    border-color: var(--color-border-strong);
  }

  .card:hover .name {
    color: var(--color-link);
  }

  .card[aria-pressed="true"] {
    border-color: var(--color-link);
    box-shadow: 0 0 0 var(--focus-ring) var(--color-link);
  }

  .card-art {
    position: relative;
    display: block;
    flex: none;
    aspect-ratio: 4 / 3;
    overflow: hidden;
    border-bottom: var(--border-width) solid var(--color-border);
  }

  .card-body {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    padding: var(--space-3) var(--space-4) var(--space-4);
  }

  .card-top {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--space-2);
  }

  .name {
    font-size: var(--text-lg);
    font-weight: var(--weight-semibold);
  }

  .source {
    flex: none;
    color: var(--color-text-muted);
    font-size: var(--text-xs);
  }

  .fact {
    color: var(--color-text-muted);
    font-size: var(--text-sm);
  }

  .hero {
    display: grid;
    grid-template-columns: var(--choice-hero-art-width) 1fr;
    gap: var(--space-5);
    align-items: start;
  }

  .hero-art {
    position: relative;
    aspect-ratio: 4 / 5;
    overflow: hidden;
    border: var(--border-width) solid var(--color-border);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-card);
  }

  .hero-text {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-2);
    min-width: 0;
  }

  .hero-name {
    font-size: var(--text-2xl);
    font-weight: var(--weight-bold);
    letter-spacing: var(--tracking-tight);
    line-height: var(--leading-tight);
  }

  .hero-name:focus {
    outline: none;
  }

  .chips {
    list-style: none;
    margin: var(--space-2) 0 0;
    padding: 0;
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }

  .chip {
    padding: var(--space-1) var(--space-3);
    border-radius: var(--radius-pill);
    background: var(--color-accent-soft);
    color: var(--color-link);
    font-size: var(--text-sm);
    font-weight: var(--weight-medium);
  }

  .name-row {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: var(--space-3);
  }

  /* A quiet link back to the grid. */
  .change {
    padding: 0;
    border: none;
    background: none;
    color: var(--color-link);
    font-size: var(--text-sm);
    font-weight: var(--weight-medium);
    cursor: pointer;
  }

  .change:hover {
    color: var(--color-accent-hover);
  }

  .choices {
    align-self: stretch;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-4);
    margin-top: var(--space-3);
  }

  .rules {
    padding-top: var(--space-4);
    border-top: var(--border-width) solid var(--color-border);
  }

  /* The overview already names the entry. */
  .rules :global(.entity > header) {
    display: none;
  }

  /* The rules text has its own line above; the entry's facts (a class's hit die…) don't need a second one. */
  .rules :global(.entity > header + .facts) {
    padding-top: 0;
    border-top: none;
  }

  /* Keep the entry text tight. */
  .rules :global(.heading) {
    margin: var(--space-4) 0 var(--space-1);
    font-size: var(--text-md);
  }

  .rules :global(p),
  .rules :global(ul) {
    margin-bottom: var(--space-2);
  }

  .muted {
    color: var(--color-text-muted);
    font-size: var(--text-sm);
  }

  .error {
    color: var(--color-danger);
    font-size: var(--text-sm);
  }

  @media (max-width: 720px) {
    .hero {
      grid-template-columns: 1fr;
    }

    .hero-art {
      width: min(100%, var(--choice-hero-art-width));
    }
  }
</style>
