<script lang="ts">
  import type { Coin, InventoryItem } from "$lib/api/characters";
  import { catalogRows, type CatalogRow } from "$lib/api/rules";
  import { errorMessage } from "$lib/api/storage";
  import { inSources } from "$lib/characters/rules";
  import { ATTUNEMENT_LIMIT, armorKind } from "$lib/characters/sheet";
  import { strings } from "$lib/strings";
  import type { Sheet } from "./sheet.svelte";

  /** `sources`: the campaign's sourcebooks, or null (no campaign) for every book. */
  let { sheet, sources }: { sheet: Sheet; sources: string[] | null } = $props();

  const t = strings.characters.sheet.inventory;
  const plain = new Intl.NumberFormat();
  const pounds = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 });
  const COINS: Coin[] = ["cp", "sp", "ep", "gp", "pp"];
  const MAX_RESULTS = 30;

  const items = $derived(sheet.character?.inventory ?? []);
  const coins = $derived(sheet.character?.coins ?? {});
  const attuned = $derived(items.filter((i) => i.attuned).length);
  const totalWeight = $derived(items.reduce((sum, i) => sum + (i.weight ?? 0) * i.quantity, 0));

  // ---- Adding items: the item catalog is loaded the first time it's searched ----
  let search = $state("");
  let custom = $state("");
  let catalog = $state<CatalogRow[] | null>(null);
  let catalogError = $state<string | null>(null);
  let loading = false;

  async function loadCatalog() {
    if (catalog || loading) return;
    loading = true;
    try {
      const rows = await catalogRows("item", ["type", "weight", "ac", "reqAttune"]);
      catalog = rows.filter((r) => inSources(r.source, sources));
    } catch (e) {
      catalogError = t.itemsError(errorMessage(e));
    } finally {
      loading = false;
    }
  }

  const matches = $derived.by(() => {
    const needle = search.trim().toLowerCase();
    if (!needle || !catalog) return [];
    return catalog.filter((r) => r.name.toLowerCase().includes(needle)).sort((a, b) => a.name.localeCompare(b.name) || a.source.localeCompare(b.source));
  });

  function edit(index: number, apply: (item: InventoryItem) => void) {
    sheet.change((c) => {
      const item = c.inventory?.[index];
      if (item) apply(item);
    });
  }

  function add(item: InventoryItem) {
    sheet.change((c) => {
      const list = c.inventory ?? [];
      // The same catalog item again only raises its quantity.
      const same = item.source ? list.find((i) => i.name === item.name && i.source === item.source) : undefined;
      if (same) same.quantity += 1;
      else c.inventory = [...list, item];
    });
  }

  function addFromCatalog(row: CatalogRow) {
    const armor = armorKind(row.data.type);
    add({
      name: row.name,
      source: row.source,
      quantity: 1,
      ...(typeof row.data.weight === "number" ? { weight: row.data.weight } : {}),
      ...(row.data.reqAttune ? { attunement: true } : {}),
      ...(armor ? { armor, ...(typeof row.data.ac === "number" ? { ac: row.data.ac } : {}) } : {}),
    });
    search = "";
  }

  function addCustom(e: SubmitEvent) {
    e.preventDefault();
    const name = custom.trim();
    if (!name) return;
    add({ name, quantity: 1 });
    custom = "";
  }

  function remove(index: number) {
    sheet.change((c) => (c.inventory = (c.inventory ?? []).filter((_, i) => i !== index)));
  }

  const whole = (value: string) => (/^\d+$/.test(value.trim()) ? Number(value.trim()) : null);

  function setQuantity(index: number, value: string) {
    const n = whole(value);
    if (n !== null && n > 0) edit(index, (item) => (item.quantity = n));
  }

  function setCoin(coin: Coin, value: string) {
    const n = whole(value === "" ? "0" : value);
    if (n !== null) sheet.change((c) => (c.coins = { ...c.coins, [coin]: n }));
  }
</script>

<section aria-labelledby="inventory-title" class="inventory">
  <h2 id="inventory-title" class="sr-only">{t.title}</h2>

  {#if items.length === 0}
    <p class="muted">{t.empty}</p>
  {:else}
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th scope="col">{t.name}</th>
            <th scope="col" class="numeric">{t.quantity}</th>
            <th scope="col" class="numeric">{t.weight}</th>
            <th scope="col">{t.equipped}</th>
            <th scope="col">{t.attuned}</th>
            <th scope="col"><span class="sr-only">{t.actions}</span></th>
          </tr>
        </thead>
        <tbody>
          {#each items as item, i (`${i}-${item.name}`)}
            <tr>
              <td>{item.name}{#if item.source}<span class="source"> {item.source}</span>{/if}</td>
              <td class="numeric">
                <input
                  class="qty"
                  type="text"
                  inputmode="numeric"
                  aria-label={t.quantityOf(item.name)}
                  value={item.quantity}
                  disabled={sheet.readOnly}
                  onchange={(e) => setQuantity(i, e.currentTarget.value)}
                />
              </td>
              <td class="numeric">{item.weight ? t.pounds(pounds.format(item.weight * item.quantity)) : ""}</td>
              <td>
                <input
                  type="checkbox"
                  aria-label={t.equippedOf(item.name)}
                  checked={!!item.equipped}
                  disabled={sheet.readOnly}
                  onchange={(e) => edit(i, (it) => (it.equipped = e.currentTarget.checked))}
                />
              </td>
              <td>
                {#if item.attunement}
                  <input
                    type="checkbox"
                    aria-label={t.attunedOf(item.name)}
                    checked={!!item.attuned}
                    disabled={sheet.readOnly || (!item.attuned && attuned >= ATTUNEMENT_LIMIT)}
                    onchange={(e) => edit(i, (it) => (it.attuned = e.currentTarget.checked))}
                  />
                {/if}
              </td>
              <td>
                <button class="icon-btn" aria-label={t.remove(item.name)} title={t.remove(item.name)} disabled={sheet.readOnly} onclick={() => remove(i)}>
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" /></svg>
                </button>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
    <p class="muted small">
      {t.totalWeight(pounds.format(totalWeight))} · {t.attunement(plain.format(attuned), plain.format(ATTUNEMENT_LIMIT))}
    </p>
  {/if}

  {#if !sheet.readOnly}
    <div class="add">
      <h3 class="label">{t.add}</h3>
      <label for="item-search" class="sr-only">{t.searchLabel}</label>
      <input id="item-search" class="field" type="search" bind:value={search} onfocus={loadCatalog} placeholder={t.searchPlaceholder} autocomplete="off" />
      {#if catalogError}
        <p class="error" role="alert">{catalogError}</p>
      {:else if search.trim() && !catalog}
        <p class="muted small" role="status">{t.loadingItems}</p>
      {:else if search.trim() && matches.length === 0}
        <p class="muted small">{t.noResults}</p>
      {:else if matches.length}
        <ul class="results">
          {#each matches.slice(0, MAX_RESULTS) as row (row.id)}
            <li>
              <button class="result" aria-label={t.addOne(row.name)} onclick={() => addFromCatalog(row)}>
                <span>{row.name}</span>
                <span class="source">{row.source}</span>
              </button>
            </li>
          {/each}
        </ul>
        {#if matches.length > MAX_RESULTS}<p class="muted small">{t.moreResults(plain.format(MAX_RESULTS))}</p>{/if}
      {/if}

      <form class="custom" onsubmit={addCustom}>
        <label for="custom-item" class="sr-only">{t.customLabel}</label>
        <input id="custom-item" class="field" type="text" bind:value={custom} placeholder={t.customPlaceholder} autocomplete="off" />
        <button type="submit" class="btn small" disabled={!custom.trim()}>{t.addCustom}</button>
      </form>
    </div>
  {/if}

  <fieldset class="coins">
    <legend class="label">{t.coins}</legend>
    {#each COINS as coin (coin)}
      <label class="coin">
        <span>{t.coinNames[coin]}</span>
        <input type="text" inputmode="numeric" value={coins[coin] ?? 0} disabled={sheet.readOnly} onchange={(e) => setCoin(coin, e.currentTarget.value)} />
      </label>
    {/each}
  </fieldset>
</section>

<style>
  .inventory {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
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
    padding: var(--space-2) var(--space-3);
    border-bottom: var(--border-width) solid var(--color-border);
    text-align: left;
    vertical-align: middle;
  }

  th {
    background: var(--color-surface-sunken);
    border-bottom: calc(2 * var(--border-width)) solid var(--color-border-strong);
    color: var(--color-text-muted);
    font-size: var(--text-xs);
    font-weight: var(--weight-semibold);
    letter-spacing: var(--tracking-label);
    text-transform: uppercase;
    white-space: nowrap;
  }

  .numeric {
    text-align: right;
    font-variant-numeric: tabular-nums;
  }

  .qty {
    width: calc(2 * var(--space-6));
    min-height: var(--control-height-sm);
    padding: 0 var(--space-2);
    border: var(--border-width) solid var(--color-border-strong);
    border-radius: var(--radius-sm);
    background: var(--color-surface);
    text-align: right;
  }

  input[type="checkbox"] {
    width: var(--space-4);
    height: var(--space-4);
    accent-color: var(--color-accent);
  }

  .source {
    color: var(--color-text-muted);
    font-size: var(--text-xs);
  }

  .label {
    color: var(--color-text-muted);
    font-size: var(--text-xs);
    font-weight: var(--weight-semibold);
    letter-spacing: var(--tracking-label);
    text-transform: uppercase;
  }

  .add {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    max-width: var(--dialog-width);
  }

  .field {
    min-height: var(--control-height);
    padding: 0 var(--space-3);
    border: var(--border-width) solid var(--color-border-strong);
    border-radius: var(--radius-md);
    background: var(--color-surface);
  }

  .field::placeholder {
    color: var(--color-text-placeholder);
  }

  .results {
    list-style: none;
    margin: 0;
    padding: var(--space-1);
    max-height: var(--campaign-books-height);
    overflow-y: auto;
    border: var(--border-width) solid var(--color-border);
    border-radius: var(--radius-md);
    background: var(--color-surface);
  }

  .result {
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

  .result:hover {
    background: var(--color-surface-sunken);
  }

  .custom {
    display: flex;
    gap: var(--space-2);
  }

  .custom .field {
    flex: 1;
    min-width: 0;
  }

  .coins {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-3);
    margin: 0;
    padding: 0;
    border: none;
  }

  .coins legend {
    margin-bottom: var(--space-2);
    padding: 0;
  }

  .coin {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    font-size: var(--text-sm);
  }

  .coin input {
    width: calc(4 * var(--space-6));
    min-height: var(--control-height-sm);
    padding: 0 var(--space-2);
    border: var(--border-width) solid var(--color-border-strong);
    border-radius: var(--radius-sm);
    background: var(--color-surface);
    font-variant-numeric: tabular-nums;
    text-align: right;
  }

  .muted {
    color: var(--color-text-muted);
  }

  .small {
    font-size: var(--text-sm);
  }

  .error {
    color: var(--color-danger);
    font-size: var(--text-sm);
  }
</style>
