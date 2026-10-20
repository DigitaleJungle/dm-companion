<script lang="ts">
  import { onMount, tick } from "svelte";
  import { SvelteMap, SvelteSet } from "svelte/reactivity";
  import { catalogRows, getEntity, type CatalogRow, type Entity } from "$lib/api/rules";
  import { getSettings, setSettings } from "$lib/api/settings";
  import { errorMessage } from "$lib/api/storage";
  import { rules } from "$lib/stores/rules.svelte";
  import { strings } from "$lib/strings";
  import { SOURCE_COLUMN, TABS, applyFilters, category, sortRows, type FilterOption } from "$lib/rules/catalog";
  import EntityView from "$lib/components/rules/EntityView.svelte";

  let {
    group,
    kind,
    entityId,
    allowedSources = null,
    onnavigate,
  }: {
    group: string;
    kind: string;
    entityId: number | null;
    /** Lower-case source ids to show (a campaign's sourcebooks); null shows everything. */
    allowedSources?: Set<string> | null;
    onnavigate: (group: string, kind: string, entityId: number | null) => void;
  } = $props();

  const t = strings.library;
  const PAGE = 50;
  const formatNumber = new Intl.NumberFormat();
  const config = $derived(category(kind));
  const tabKinds = $derived(TABS.find((tab) => tab.id === group)?.kinds ?? []);
  const what = $derived(kind === "all" ? t.entriesWord : (t.categoryNames[kind] ?? kind).toLowerCase());

  // ---- Books (sources) shown in the Catalog, remembered in settings -------------------------------
  const sources = $derived(
    (rules.status?.library?.sources ?? [])
      .filter((s) => s.entities > 0 && (!allowedSources || allowedSources.has(s.id.toLowerCase())))
      .sort((a, b) => a.name.localeCompare(b.name)),
  );
  const hidden = new SvelteSet<string>();
  const shownCount = $derived(sources.filter((s) => !hidden.has(s.id)).length);
  let settingsError = $state<string | null>(null);

  onMount(async () => {
    try {
      for (const id of (await getSettings()).catalogHiddenSources ?? []) hidden.add(id);
    } catch (e) {
      settingsError = t.loadError(errorMessage(e));
    }
  });

  async function saveHidden() {
    try {
      await setSettings({ catalogHiddenSources: [...hidden] });
      settingsError = null;
    } catch (e) {
      settingsError = t.loadError(errorMessage(e));
    }
  }

  function toggleSource(id: string, shown: boolean) {
    if (shown) hidden.delete(id);
    else hidden.add(id);
    page = 0;
    saveHidden();
  }

  // Only touches the books listed here (a campaign's), leaving any others as they were.
  function setAll(shown: boolean) {
    for (const s of sources) {
      if (shown) hidden.delete(s.id);
      else hidden.add(s.id);
    }
    page = 0;
    saveHidden();
  }

  // ---- Rows of the current category ----------------------------------------------------------------
  const cache = new SvelteMap<string, CatalogRow[]>();
  let loadError = $state<string | null>(null);
  const rows = $derived(cache.get(kind) ?? null);

  $effect(() => {
    const k = kind;
    const keys = config.keys;
    if (cache.has(k)) return;
    loadError = null;
    catalogRows(k === "all" ? null : k, keys).then(
      (loaded) => cache.set(k, loaded),
      (e) => (loadError = t.loadError(errorMessage(e))),
    );
  });

  // ---- Search, filters, sorting, paging (reset when the category changes) -------------------------
  let search = $state("");
  let ticked = $state<Record<string, Set<string>>>({});
  let sortColumn = $state<string | null>(null);
  let descending = $state(false);
  let page = $state(0);

  $effect(() => {
    void kind;
    search = "";
    ticked = {};
    sortColumn = null;
    descending = false;
    page = 0;
  });

  const inBooks = $derived(
    (rows ?? []).filter((r) => !hidden.has(r.source) && (!allowedSources || allowedSources.has(r.source.toLowerCase()))),
  );
  const options = $derived(
    Object.fromEntries(config.filters.map((f) => [f.id, f.options ?? f.optionsFrom?.(inBooks) ?? []])) as Record<string, FilterOption[]>,
  );
  const matching = $derived.by(() => {
    const needle = search.trim().toLowerCase();
    const searched = needle ? inBooks.filter((r) => r.name.toLowerCase().includes(needle)) : inBooks;
    const filtered = applyFilters(searched, config.filters, ticked, options);
    return sortRows(filtered, [...config.columns, SOURCE_COLUMN].find((c) => c.id === sortColumn) ?? null, descending);
  });
  const pageCount = $derived(Math.max(1, Math.ceil(matching.length / PAGE)));
  const pageRows = $derived(matching.slice(page * PAGE, page * PAGE + PAGE));
  const anyFilter = $derived(Object.values(ticked).some((set) => set.size > 0));

  function toggleOption(filterId: string, label: string, on: boolean) {
    const next = new Set(ticked[filterId] ?? []);
    if (on) next.add(label);
    else next.delete(label);
    ticked = { ...ticked, [filterId]: next };
    page = 0;
  }

  function sortBy(id: string | null) {
    if (sortColumn === id) descending = !descending;
    else {
      sortColumn = id;
      descending = false;
    }
    page = 0;
  }

  const ariaSort = (id: string | null) => (sortColumn === id ? (descending ? "descending" : "ascending") : undefined);

  let tableTop: HTMLElement | undefined = $state();
  async function goToPage(n: number) {
    page = Math.max(0, Math.min(pageCount - 1, n));
    await tick();
    tableTop?.scrollIntoView({ block: "start" });
  }

  // ---- The opened entry ----------------------------------------------------------------------------
  let entity = $state<Entity | null>(null);
  let entityStatus = $state<"loading" | "ready" | "missing" | "error">("loading");
  let entityError = $state("");

  $effect(() => {
    const id = entityId;
    if (id === null) return;
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
</script>

<div class="catalog">
  <aside class="books" aria-labelledby="catalog-books">
    <h2 id="catalog-books" class="column-title">{t.booksLabel}</h2>
    <div class="book-tools">
      <button class="btn small" disabled={shownCount === sources.length} onclick={() => setAll(true)}>{t.selectAll}</button>
      <button class="btn small" disabled={shownCount === 0} onclick={() => setAll(false)}>{t.deselectAll}</button>
      <span class="count">{t.booksCount(shownCount, sources.length)}</span>
    </div>
    {#if settingsError}<p class="error" role="alert">{settingsError}</p>{/if}
    <ul>
      {#each sources as source (source.id)}
        <li>
          <label class="book">
            <input type="checkbox" checked={!hidden.has(source.id)} onchange={(e) => toggleSource(source.id, e.currentTarget.checked)} />
            <span>{source.name}</span>
          </label>
        </li>
      {/each}
    </ul>
  </aside>

  <div class="main">
    <nav class="tabs" aria-label={t.categoriesLabel}>
      {#each TABS as tab (tab.id)}
        <button
          class="tab"
          aria-current={tab.id === group ? "page" : undefined}
          onclick={() => onnavigate(tab.id, tab.id === "all" ? "all" : tab.kinds[0], null)}
        >
          {t.catalogTabs[tab.id]}
        </button>
      {/each}
    </nav>

    {#if tabKinds.length}
      <div class="subtabs">
        {#each tabKinds as k (k)}
          <button class="subtab" aria-current={k === kind ? "page" : undefined} onclick={() => onnavigate(group, k, null)}>{t.categoryNames[k] ?? k}</button>
        {/each}
      </div>
    {/if}

    {#if entityId !== null}
      <div class="entity-page">
        <button class="btn back" onclick={() => onnavigate(group, kind, null)}>← {t.backTo(t.categoryNames[kind] ?? t.catalogTabs.all)}</button>
        <div class="page-body">
          {#if entityStatus === "loading"}
            <p class="muted" role="status">{t.loading}</p>
          {:else if entityStatus === "missing"}
            <p class="muted">{t.notFound}</p>
          {:else if entityStatus === "error"}
            <p class="error" role="alert">{t.loadError(entityError)}</p>
          {:else if entity}
            <EntityView {entity} />
          {/if}
        </div>
      </div>
    {/if}

    <!-- Kept mounted while an entry is open, so its filters, page and scroll survive the Back button. -->
    <div class="list" hidden={entityId !== null}>
      <div class="search-row">
        <label for="catalog-search" class="sr-only">{t.searchLabel}</label>
        <input id="catalog-search" class="search" type="search" bind:value={search} oninput={() => (page = 0)} placeholder={t.search} autocomplete="off" />
        <span class="muted" role="status">{rows ? t.results(matching.length) : t.loading}</span>
      </div>

      <section class="results" aria-labelledby="catalog-title">
        <div class="results-head">
          <h2 id="catalog-title" class="results-title">{kind === "all" ? t.catalogTabs.all : (t.categoryNames[kind] ?? kind)}</h2>
          {#if config.filters.length}
            <div class="filters">
              {#each config.filters as filter (filter.id)}
                <!-- A filter with a single choice can't narrow anything down. -->
                {#if (options[filter.id]?.length ?? 0) > 1}
                  <fieldset class="filter">
                    <legend>{filter.label}:</legend>
                    {#each options[filter.id] as option (option.label)}
                      <label class="option">
                        <input
                          type="checkbox"
                          checked={ticked[filter.id]?.has(option.label) ?? false}
                          onchange={(e) => toggleOption(filter.id, option.label, e.currentTarget.checked)}
                        />
                        {option.label}
                      </label>
                    {/each}
                  </fieldset>
                {/if}
              {/each}
              {#if anyFilter}<button class="link" onclick={() => ((ticked = {}), (page = 0))}>{t.clearFilters}</button>{/if}
            </div>
          {/if}
        </div>

        {#if loadError}
          <p class="error" role="alert">{loadError}</p>
        {:else if rows && sources.length && shownCount === 0}
          <p class="muted pad">{t.noBooksSelected}</p>
        {:else if rows && matching.length === 0}
          <p class="muted pad">{t.noEntries}</p>
        {:else if rows}
          <p class="showing" bind:this={tableTop}>
            {t.showing(formatNumber.format(page * PAGE + 1), formatNumber.format(Math.min(matching.length, (page + 1) * PAGE)), formatNumber.format(matching.length), what)}
          </p>
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th scope="col" aria-sort={ariaSort(null)}>
                    <button class="sort" onclick={() => sortBy(null)} aria-label={t.sortBy(t.columns.name)}>{t.columns.name}<span class="arrow" aria-hidden="true">{sortColumn === null ? (descending ? "↓" : "↑") : ""}</span></button>
                  </th>
                  {#each config.columns as column (column.id)}
                    <th scope="col" class:numeric={column.numeric} aria-sort={ariaSort(column.id)}>
                      <button class="sort" onclick={() => sortBy(column.id)} aria-label={t.sortBy(column.label)}>{column.label}<span class="arrow" aria-hidden="true">{sortColumn === column.id ? (descending ? "↓" : "↑") : ""}</span></button>
                    </th>
                  {/each}
                  <th scope="col" aria-sort={ariaSort(SOURCE_COLUMN.id)}>
                    <button class="sort" onclick={() => sortBy(SOURCE_COLUMN.id)} aria-label={t.sortBy(SOURCE_COLUMN.label)}>{SOURCE_COLUMN.label}<span class="arrow" aria-hidden="true">{sortColumn === SOURCE_COLUMN.id ? (descending ? "↓" : "↑") : ""}</span></button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {#each pageRows as row (row.id)}
                  <tr>
                    <td class="name"><button class="row-link" onclick={() => onnavigate(group, kind, row.id)}>{row.name}</button></td>
                    {#each config.columns as column (column.id)}
                      <td class:numeric={column.numeric}>{column.value(row)}</td>
                    {/each}
                    <td class="source">{row.source}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
          {#if pageCount > 1}
            <nav class="pager" aria-label={t.pageNav}>
              <button class="btn small" disabled={page === 0} onclick={() => goToPage(page - 1)}>{t.previous}</button>
              <span class="muted">{page + 1} / {pageCount}</span>
              <button class="btn small" disabled={page >= pageCount - 1} onclick={() => goToPage(page + 1)}>{t.next}</button>
            </nav>
          {/if}
        {:else}
          <p class="muted pad" role="status">{t.loading}</p>
        {/if}
      </section>
    </div>
  </div>
</div>

<style>
  .catalog {
    display: grid;
    grid-template-columns: var(--library-books-width) 1fr;
    height: 100%;
    min-height: 0;
  }

  .books {
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

  .book-tools {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: 0 var(--space-3) var(--space-3);
  }

  .count {
    margin-left: auto;
    color: var(--color-text-muted);
    font-size: var(--text-sm);
    font-variant-numeric: tabular-nums;
  }

  ul {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .book {
    display: flex;
    align-items: flex-start;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-md);
    line-height: var(--leading-tight);
    cursor: pointer;
  }

  .book:hover {
    background: var(--color-surface-sunken);
  }

  input[type="checkbox"] {
    flex: none;
    margin: 2px 0 0;
    accent-color: var(--color-accent);
  }

  .main {
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
    overflow-y: auto;
    background: var(--color-bg);
  }

  .tabs {
    position: sticky;
    top: 0;
    z-index: 1;
    display: flex;
    gap: var(--space-1);
    padding: 0 var(--space-5);
    border-bottom: var(--border-width) solid var(--color-border);
    background: var(--color-surface);
  }

  .tab {
    padding: var(--space-3) var(--space-4);
    border: none;
    border-bottom: var(--focus-ring) solid transparent;
    background: transparent;
    color: var(--color-text-muted);
    font-size: var(--text-md);
    font-weight: var(--weight-medium);
    cursor: pointer;
  }

  .tab[aria-current="page"] {
    border-bottom-color: var(--color-accent);
    color: var(--color-link);
  }

  .subtabs {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    padding: var(--space-4) var(--space-5) 0;
  }

  .subtab {
    padding: var(--space-2) var(--space-4);
    border: var(--border-width) solid var(--color-border);
    border-radius: var(--radius-md);
    background: var(--color-surface);
    cursor: pointer;
  }

  .subtab[aria-current="page"] {
    border-color: var(--color-accent);
    background: var(--color-accent-soft);
    color: var(--color-link);
    font-weight: var(--weight-semibold);
  }

  .list[hidden] {
    display: none;
  }

  .search-row {
    display: flex;
    align-items: center;
    gap: var(--space-4);
    padding: var(--space-5);
  }

  .search {
    flex: 0 1 var(--dialog-width);
    min-height: var(--control-height);
    padding: 0 var(--space-3);
    border: var(--border-width) solid var(--color-border-strong);
    border-radius: var(--radius-md);
    background: var(--color-surface);
  }

  .search::placeholder {
    color: var(--color-text-placeholder);
  }

  .results {
    margin: 0 var(--space-5) var(--space-5);
    border: var(--border-width) solid var(--color-border);
    border-radius: var(--radius-lg);
    background: var(--color-surface);
  }

  .results-head {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    padding: var(--space-5);
    border-bottom: var(--border-width) solid var(--color-border);
  }

  .results-title {
    font-size: var(--text-xl);
    font-weight: var(--weight-bold);
  }

  .filters {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2) var(--space-5);
  }

  .filter {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-1) var(--space-3);
    margin: 0;
    padding: 0;
    border: none;
  }

  legend {
    float: left;
    padding: 0;
    margin-right: var(--space-1);
    color: var(--color-text-muted);
    font-size: var(--text-sm);
  }

  .option {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    font-size: var(--text-sm);
    cursor: pointer;
  }

  .option input {
    margin: 0;
  }

  .link {
    padding: 0;
    border: none;
    background: none;
    color: var(--color-link);
    font-size: var(--text-sm);
    text-decoration: underline;
    cursor: pointer;
  }

  .showing {
    padding: var(--space-3) var(--space-5);
    background: var(--color-surface-sunken);
    color: var(--color-text-muted);
    font-size: var(--text-sm);
    scroll-margin-top: var(--space-8);
  }

  .table-wrap {
    overflow-x: auto;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    font-size: var(--text-sm);
  }

  th,
  td {
    padding: var(--space-3) var(--space-4);
    border-bottom: var(--border-width) solid var(--color-border);
    text-align: left;
    vertical-align: top;
  }

  th {
    padding: 0;
    white-space: nowrap;
  }

  .sort {
    display: inline-flex;
    gap: var(--space-1);
    width: 100%;
    padding: var(--space-3) var(--space-4);
    border: none;
    background: none;
    font-weight: var(--weight-semibold);
    text-align: inherit;
    cursor: pointer;
  }

  .numeric,
  .numeric .sort {
    justify-content: flex-end;
    text-align: right;
    font-variant-numeric: tabular-nums;
  }

  .arrow {
    min-width: 1ch;
    color: var(--color-link);
  }

  tbody tr {
    position: relative;
  }

  tbody tr:hover {
    background: var(--color-surface-sunken);
  }

  .row-link {
    padding: 0;
    border: none;
    background: none;
    color: var(--color-text);
    font-weight: var(--weight-medium);
    text-align: left;
    cursor: pointer;
  }

  /* The whole row is clickable; the name button stays the keyboard target. */
  .row-link::after {
    content: "";
    position: absolute;
    inset: 0;
  }

  .row-link:focus-visible {
    outline: none;
  }

  tr:has(.row-link:focus-visible) {
    outline: var(--focus-ring) solid var(--color-focus);
    outline-offset: calc(-1 * var(--focus-ring));
  }

  .source {
    color: var(--color-text-muted);
  }

  .pager {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-3);
    padding: var(--space-4);
  }

  .small {
    min-height: var(--control-height-sm);
    padding: 0 var(--space-3);
  }

  .entity-page {
    padding: var(--space-5);
  }

  .back {
    margin-bottom: var(--space-4);
  }

  .page-body {
    max-width: var(--reading-width);
    padding: var(--space-6);
    border: var(--border-width) solid var(--color-border);
    border-radius: var(--radius-lg);
    background: var(--color-surface);
  }

  .muted {
    color: var(--color-text-muted);
    font-size: var(--text-sm);
  }

  .pad {
    padding: var(--space-5);
  }

  .error {
    padding: var(--space-3) var(--space-5);
    color: var(--color-danger);
    font-size: var(--text-sm);
  }

  @media (max-width: 900px) {
    .catalog {
      display: flex;
      flex-direction: column;
      height: auto;
    }

    .books {
      max-height: var(--library-stacked-height);
      border-right: none;
      border-bottom: var(--border-width) solid var(--color-border);
    }

    .main {
      overflow: visible;
    }
  }
</style>
