<script lang="ts">
  import type { Snippet } from "svelte";
  import EntityView from "$lib/components/rules/EntityView.svelte";
  import { getEntity, type CatalogRow, type Entity } from "$lib/api/rules";
  import { errorMessage } from "$lib/api/storage";
  import { strings } from "$lib/strings";

  // A filterable list of rules entries on the left, the picked entry's full text on the right.
  let {
    id,
    label,
    rows,
    selected,
    onselect,
    lead,
    choices = {},
  }: {
    id: string;
    label: string;
    rows: CatalogRow[];
    selected: CatalogRow | null;
    onselect: (row: CatalogRow) => void;
    /** Choices shown under the entry title. */
    lead?: Snippet;
    /** Choices shown under the entry with that (lowercase) name. */
    choices?: Record<string, Snippet>;
  } = $props();

  const t = strings.characters.wizard.pick;
  let filter = $state("");
  let entity = $state<Entity | null>(null);
  let entityError = $state<string | null>(null);

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
</script>

<div class="choice">
  <div class="list">
    <label for="{id}-filter" class="sr-only">{t.filter(label)}</label>
    <input id="{id}-filter" class="filter" type="search" bind:value={filter} placeholder={t.filterPlaceholder} autocomplete="off" />
    {#if rows.length === 0}
      <p class="muted">{t.empty}</p>
    {:else if visible.length === 0}
      <p class="muted">{t.none}</p>
    {:else}
      <ul aria-label={label}>
        {#each visible as row (row.id)}
          <li>
            <button class="row" aria-pressed={selected?.id === row.id} onclick={() => onselect(row)}>
              <span class="name">{row.name}</span>
              <span class="source">{row.source}</span>
            </button>
          </li>
        {/each}
      </ul>
    {/if}
  </div>

  <div class="details">
    {#if selected}
      {#if entityError}
        <p class="error" role="alert">{entityError}</p>
      {:else if entity}
        <EntityView {entity} compact {lead} {choices} />
      {:else}
        <p class="muted" role="status">{t.loadingEntry}</p>
      {/if}
    {:else}
      <p class="muted">{t.selectHint}</p>
    {/if}
  </div>
</div>

<style>
  .choice {
    display: grid;
    grid-template-columns: var(--library-books-width) 1fr;
    gap: var(--space-5);
    align-items: start;
  }

  .list {
    position: sticky;
    top: var(--space-4);
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    max-height: calc(100vh - 2 * var(--space-8));
    min-height: 0;
  }

  .filter {
    min-height: var(--control-height-sm);
    padding: 0 var(--space-3);
    border: var(--border-width) solid var(--color-border-strong);
    border-radius: var(--radius-sm);
    background: var(--color-surface);
    font-size: var(--text-sm);
  }

  .filter::placeholder {
    color: var(--color-text-placeholder);
  }

  ul {
    list-style: none;
    margin: 0;
    padding: var(--space-1);
    overflow-y: auto;
    border: var(--border-width) solid var(--color-border);
    border-radius: var(--radius-md);
    background: var(--color-surface);
  }

  .row {
    display: flex;
    width: 100%;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-3);
    border: none;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--color-text);
    font-size: var(--text-sm);
    text-align: left;
    cursor: pointer;
  }

  .row:hover {
    background: var(--color-surface-sunken);
  }

  .row[aria-pressed="true"] {
    background: var(--color-accent-soft);
    color: var(--color-link);
    font-weight: var(--weight-semibold);
  }

  .source {
    flex: none;
    color: var(--color-text-muted);
    font-size: var(--text-xs);
  }

  .details {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    padding: var(--space-4);
    border: var(--border-width) solid var(--color-border);
    border-radius: var(--radius-lg);
    background: var(--color-surface);
  }

  /* Keep the entry text tight: it sits next to a list, not on its own page. */
  .details :global(.heading) {
    margin: var(--space-4) 0 var(--space-1);
    font-size: var(--text-md);
  }

  .details :global(p),
  .details :global(ul) {
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
    .choice {
      grid-template-columns: 1fr;
    }

    .list {
      position: static;
      max-height: 40vh;
    }
  }
</style>
