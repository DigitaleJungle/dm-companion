<script lang="ts">
  import { getEntity, listEntities, type Entity, type EntitySummary } from "$lib/api/rules";
  import { errorMessage } from "$lib/api/storage";
  import { strings } from "$lib/strings";
  import EntityView from "$lib/components/rules/EntityView.svelte";

  let {
    kind,
    entityId,
    onselect,
  }: { kind: string; entityId: number | null; onselect: (kind: string, id: number | null) => void } = $props();

  const t = strings.library;
  const PAGE = 100;
  const CATEGORIES = [
    "spell", "creature", "item", "feat", "background", "species", "class", "subclass", "optionalfeature",
    "condition", "disease", "variantrule", "action", "language", "skill", "sense", "itemProperty", "itemMastery", "hazard", "trap",
  ];

  let filter = $state("");
  let query = $state(""); // the filter, applied after a short pause in typing
  let items = $state<EntitySummary[]>([]);
  let more = $state(false);
  let listStatus = $state<"loading" | "ready" | "error">("loading");
  let listError = $state("");
  let entity = $state<Entity | null>(null);
  let entityStatus = $state<"none" | "loading" | "ready" | "missing" | "error">("none");
  let entityError = $state("");

  $effect(() => {
    const value = filter;
    const timer = setTimeout(() => (query = value), 150);
    return () => clearTimeout(timer);
  });

  async function load(append: boolean) {
    const offset = append ? items.length : 0;
    listStatus = "loading";
    try {
      const page = await listEntities(kind, query, offset, PAGE + 1);
      more = page.length > PAGE;
      items = append ? [...items, ...page.slice(0, PAGE)] : page.slice(0, PAGE);
      listStatus = "ready";
    } catch (e) {
      listError = errorMessage(e);
      listStatus = "error";
    }
  }

  $effect(() => {
    void kind;
    void query;
    load(false);
  });

  $effect(() => {
    const id = entityId;
    if (id === null) {
      entityStatus = "none";
      return;
    }
    let live = true;
    entityStatus = "loading";
    getEntity(id).then(
      (found) => {
        if (!live) return;
        entity = found;
        entityStatus = found ? "ready" : "missing";
      },
      (e) => {
        if (!live) return;
        entityError = errorMessage(e);
        entityStatus = "error";
      },
    );
    return () => (live = false);
  });

  function pickCategory(next: string) {
    filter = "";
    query = "";
    onselect(next, null);
  }
</script>

<div class="catalog">
  <nav class="column" aria-labelledby="categories-title">
    <h2 id="categories-title" class="column-title">{t.categories}</h2>
    <ul>
      {#each CATEGORIES as category (category)}
        <li>
          <button class="item" aria-current={category === kind ? "page" : undefined} onclick={() => pickCategory(category)}>
            {t.categoryNames[category] ?? category}
          </button>
        </li>
      {/each}
    </ul>
  </nav>

  <section class="column list" aria-labelledby="list-title">
    <h2 id="list-title" class="column-title">{t.categoryNames[kind] ?? kind}</h2>
    <label for="catalog-filter" class="sr-only">{t.filter}</label>
    <input id="catalog-filter" class="filter" type="search" bind:value={filter} placeholder={t.filter} autocomplete="off" />
    {#if listStatus === "error"}
      <p class="error" role="alert">{t.loadError(listError)}</p>
    {:else if listStatus === "ready" && items.length === 0}
      <p class="muted">{t.noEntries}</p>
    {:else}
      <ul>
        {#each items as item (item.id)}
          <li>
            <button class="item" aria-current={item.id === entityId ? "page" : undefined} onclick={() => onselect(kind, item.id)}>
              <span class="item-name">{item.name}</span>
              <span class="item-source">{item.source}</span>
            </button>
          </li>
        {/each}
      </ul>
      {#if more}
        <button class="btn small more" disabled={listStatus === "loading"} onclick={() => load(true)}>{t.showMore}</button>
      {/if}
    {/if}
  </section>

  <article class="pane" aria-label={entity?.name ?? t.catalog}>
    <div class="page">
      {#if entityStatus === "none"}
        <p class="muted">{t.chooseEntry}</p>
      {:else if entityStatus === "loading"}
        <p class="muted" role="status">{t.loading}</p>
      {:else if entityStatus === "missing"}
        <p class="muted">{t.notFound}</p>
      {:else if entityStatus === "error"}
        <p class="error" role="alert">{t.loadError(entityError)}</p>
      {:else if entity}
        <EntityView {entity} />
      {/if}
    </div>
  </article>
</div>

<style>
  .catalog {
    display: grid;
    grid-template-columns: var(--library-books-width) var(--library-contents-width) 1fr;
    height: 100%;
    min-height: 0;
  }

  .column {
    min-height: 0;
    overflow-y: auto;
    padding: var(--space-5) var(--space-3);
    border-right: var(--border-width) solid var(--color-border);
    background: var(--color-surface);
  }

  .column-title {
    padding: 0 var(--space-3) var(--space-3);
    font-size: var(--text-lg);
    font-weight: var(--weight-bold);
  }

  ul {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .item {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--space-2);
    width: 100%;
    padding: var(--space-2) var(--space-3);
    border: none;
    border-radius: var(--radius-md);
    background: transparent;
    text-align: left;
    line-height: var(--leading-tight);
    cursor: pointer;
  }

  .item:hover {
    background: var(--color-surface-sunken);
  }

  .item[aria-current="page"] {
    background: var(--color-accent-soft);
    color: var(--color-link);
    font-weight: var(--weight-semibold);
  }

  .item-name {
    min-width: 0;
  }

  .item-source {
    flex: none;
    color: var(--color-text-muted);
    font-size: var(--text-xs);
    font-weight: var(--weight-regular);
  }

  .filter {
    width: calc(100% - 2 * var(--space-3));
    min-height: var(--control-height);
    margin: 0 var(--space-3) var(--space-3);
    padding: 0 var(--space-3);
    border: var(--border-width) solid var(--color-border-strong);
    border-radius: var(--radius-md);
    background: var(--color-surface);
  }

  .filter::placeholder {
    color: var(--color-text-placeholder);
  }

  .more {
    margin: var(--space-3);
  }

  .small {
    min-height: var(--control-height-sm);
    padding: 0 var(--space-3);
  }

  .pane {
    min-width: 0;
    min-height: 0;
    overflow-y: auto;
    background: var(--color-bg);
  }

  .page {
    max-width: var(--reading-width);
    padding: var(--space-7) var(--space-8);
  }

  .muted {
    padding: 0 var(--space-3);
    color: var(--color-text-muted);
    font-size: var(--text-sm);
  }

  .error {
    padding: var(--space-3);
    color: var(--color-danger);
    font-size: var(--text-sm);
  }

  @media (max-width: 900px) {
    .catalog {
      display: flex;
      flex-direction: column;
      height: auto;
    }

    .column {
      max-height: var(--library-stacked-height);
      border-right: none;
      border-bottom: var(--border-width) solid var(--color-border);
    }

    .pane {
      overflow: visible;
    }

    .page {
      padding: var(--space-5) var(--space-4);
    }
  }
</style>
