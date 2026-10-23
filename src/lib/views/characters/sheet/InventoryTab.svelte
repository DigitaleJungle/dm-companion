<script lang="ts">
  import type { Coin, InventoryItem } from "$lib/api/characters";
  import { catalogRows, type CatalogRow } from "$lib/api/rules";
  import { errorMessage } from "$lib/api/storage";
  import { inSources } from "$lib/characters/rules";
  import { ATTUNEMENT_LIMIT, carryingCapacity, inventoryItem } from "$lib/characters/sheet";
  import { DAMAGE_TYPES } from "$lib/rules/format";
  import { strings } from "$lib/strings";
  import type { Sheet } from "./sheet.svelte";

  /** `sources`: the campaign's sourcebooks, or null (no campaign) for every book. */
  let { sheet, sources }: { sheet: Sheet; sources: string[] | null } = $props();

  const t = strings.characters.sheet.inventory;
  const plain = new Intl.NumberFormat();
  const pounds = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 });
  const COINS: Coin[] = ["cp", "sp", "ep", "gp", "pp"];
  const MAX_RESULTS = 30;
  // Item fields kept on the character, so the sheet never needs a lookup for armor class, weight or attacks.
  const ITEM_KEYS = ["type", "weight", "ac", "reqAttune", "weapon", "weaponCategory", "dmg1", "dmgType", "property", "range", "mastery"];

  const items = $derived(sheet.character?.inventory ?? []);
  const coins = $derived(sheet.character?.coins ?? {});
  const attuned = $derived(items.filter((i) => i.attuned).length);
  const totalWeight = $derived(items.reduce((sum, i) => sum + (i.weight ?? 0) * i.quantity, 0));
  const capacity = $derived(sheet.scores ? carryingCapacity(sheet.scores.str, sheet.character?.species?.size) : null);
  const carriedShare = $derived(capacity ? Math.min(100, Math.round((totalWeight / capacity) * 100)) : 0);

  const note = (item: InventoryItem) =>
    item.armor && typeof item.ac === "number"
      ? t.acNote(item.armor === "shield" ? `+${item.ac}` : plain.format(item.ac))
      : item.weapon?.dmg
        ? [item.weapon.dmg, DAMAGE_TYPES[item.weapon.dmgType ?? ""]].filter(Boolean).join(" ")
        : "";

  // ---- Adding items: the item catalog is loaded the first time the add panel opens ----
  let adding = $state(false);
  let search = $state("");
  let resultsOpen = $state(false);
  let custom = $state("");
  let catalog = $state<CatalogRow[] | null>(null);
  let catalogError = $state<string | null>(null);
  let loading = false;

  async function loadCatalog() {
    if (catalog || loading) return;
    loading = true;
    try {
      const rows = await catalogRows("item", ITEM_KEYS);
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
    add(inventoryItem(row));
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

  function toggleAdding() {
    adding = !adding;
    if (adding) loadCatalog();
  }
</script>

<section aria-labelledby="inventory-title" class="inventory">
  <h2 id="inventory-title" class="sr-only">{t.title}</h2>

  <div class="summary">
    <fieldset class="coins">
      <legend class="sr-only">{t.coins}</legend>
      {#each COINS as coin (coin)}
        <label class="coin" title={t.coinNames[coin]}>
          <abbr title={t.coinNames[coin]}>{t.coinCodes[coin]}</abbr>
          <input
            type="text"
            inputmode="numeric"
            aria-label={t.coinNames[coin]}
            value={coins[coin] ?? 0}
            disabled={sheet.readOnly}
            onchange={(e) => setCoin(coin, e.currentTarget.value)}
          />
        </label>
      {/each}
    </fieldset>

    <div class="carrying">
      <span>{t.carrying(pounds.format(totalWeight), capacity === null ? strings.characters.sheet.unknown : pounds.format(capacity), plain.format(attuned), plain.format(ATTUNEMENT_LIMIT))}</span>
      <div class="bar" role="meter" aria-label={t.carryingLabel} aria-valuemin={0} aria-valuemax={100} aria-valuenow={carriedShare}>
        <div class="fill" style:width="{carriedShare}%"></div>
      </div>
    </div>

    {#if !sheet.readOnly}
      <button class="btn btn-primary" aria-expanded={adding} aria-controls="inventory-add" onclick={toggleAdding}>{adding ? t.doneAdding : t.add}</button>
    {/if}
  </div>

  {#if adding && !sheet.readOnly}
    <div id="inventory-add" class="add">
      <!-- The results float over the page below the field instead of pushing it down. -->
      <div
        class="search-wrap"
        role="presentation"
        onfocusout={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) resultsOpen = false;
        }}
        onkeydown={(e) => {
          if (e.key === "Escape" && resultsOpen) {
            e.preventDefault();
            resultsOpen = false;
            document.getElementById("item-search")?.focus();
          }
        }}
      >
        <label for="item-search" class="sr-only">{t.searchLabel}</label>
        <input
          id="item-search"
          class="field"
          type="search"
          bind:value={search}
          oninput={() => (resultsOpen = true)}
          onfocus={() => (resultsOpen = true)}
          placeholder={t.searchPlaceholder}
          autocomplete="off"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={resultsOpen && !!search.trim()}
          aria-controls="item-results"
        />
        {#if catalogError}
          <p class="error" role="alert">{catalogError}</p>
        {:else if resultsOpen && search.trim()}
          <div id="item-results" class="dropdown">
            {#if !catalog}
              <p class="muted small" role="status">{t.loadingItems}</p>
            {:else if matches.length === 0}
              <p class="muted small">{t.noResults}</p>
            {:else}
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
          </div>
        {/if}
      </div>

      <form class="custom" onsubmit={addCustom}>
        <label for="custom-item" class="sr-only">{t.customLabel}</label>
        <input id="custom-item" class="field" type="text" bind:value={custom} placeholder={t.customPlaceholder} autocomplete="off" />
        <button type="submit" class="btn small" disabled={!custom.trim()}>{t.addCustom}</button>
      </form>
    </div>
  {/if}

  {#if items.length === 0}
    <p class="muted">{t.empty}</p>
  {:else}
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th scope="col">{t.equip}</th>
            <th scope="col">{t.name}</th>
            <th scope="col">{t.quantity}</th>
            <th scope="col">{t.weight}</th>
            <th scope="col">{t.notes}</th>
            <th scope="col"><span class="sr-only">{t.actions}</span></th>
          </tr>
        </thead>
        <tbody>
          {#each items as item, i (`${i}-${item.name}`)}
            <tr>
              <td>
                <input
                  type="checkbox"
                  aria-label={t.equippedOf(item.name)}
                  checked={!!item.equipped}
                  disabled={sheet.readOnly}
                  onchange={(e) => edit(i, (it) => (it.equipped = e.currentTarget.checked))}
                />
              </td>
              <th scope="row">{item.name}{#if item.source}<span class="source"> {item.source}</span>{/if}</th>
              <td>
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
              <td class="muted">{item.weight ? t.pounds(pounds.format(item.weight * item.quantity)) : ""}</td>
              <td class="muted">
                <span class="notes">
                  {note(item)}
                  {#if item.attunement}
                    <label class="attune">
                      <input
                        type="checkbox"
                        checked={!!item.attuned}
                        disabled={sheet.readOnly || (!item.attuned && attuned >= ATTUNEMENT_LIMIT)}
                        onchange={(e) => edit(i, (it) => (it.attuned = e.currentTarget.checked))}
                      />
                      {t.attuned}
                    </label>
                  {/if}
                </span>
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
  {/if}
</section>

<style>
  .inventory {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  .summary {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-4);
  }

  .coins {
    display: flex;
    gap: var(--space-2);
    margin: 0;
    padding: 0;
    border: none;
  }

  .coin {
    width: var(--coin-box-width);
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: var(--space-1);
    border: var(--border-width) solid var(--color-border-strong);
    border-radius: var(--radius-md);
    color: var(--color-text-muted);
    font-size: var(--text-xs);
  }

  .coin abbr {
    text-decoration: none;
  }

  .coin input {
    width: 100%;
    padding: 0;
    border: none;
    background: transparent;
    color: var(--color-text);
    font-size: var(--text-md);
    font-weight: var(--weight-bold);
    font-variant-numeric: tabular-nums;
    text-align: center;
  }

  .coin:has(input:focus-visible) {
    outline: var(--focus-ring) solid var(--color-focus);
    outline-offset: var(--border-width);
  }

  .coin input:focus-visible {
    outline: none;
  }

  .carrying {
    flex: 1 1 calc(8 * var(--space-6));
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    color: var(--color-text-muted);
    font-size: var(--text-xs);
  }

  .bar {
    height: var(--space-2);
    overflow: hidden;
    border: var(--border-width) solid var(--color-border-strong);
    border-radius: var(--radius-pill);
  }

  .fill {
    height: 100%;
    background: var(--color-text-muted);
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
    padding: var(--space-2);
    border-bottom: var(--border-width) solid var(--color-border);
    text-align: left;
    vertical-align: middle;
  }

  thead th {
    color: var(--color-text-muted);
    font-size: var(--text-xs);
    font-weight: var(--weight-semibold);
    letter-spacing: var(--tracking-label);
    text-transform: uppercase;
    white-space: nowrap;
  }

  tbody th {
    font-weight: var(--weight-semibold);
  }

  .qty {
    width: calc(2 * var(--space-6));
    min-height: var(--control-height-sm);
    padding: 0 var(--space-2);
    border: var(--border-width) solid var(--color-border-strong);
    border-radius: var(--radius-sm);
    background: var(--color-surface);
    font-variant-numeric: tabular-nums;
    text-align: right;
  }

  input[type="checkbox"] {
    width: var(--space-4);
    height: var(--space-4);
    accent-color: var(--color-accent);
  }

  .notes {
    display: inline-flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-1) var(--space-3);
  }

  .attune {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
  }

  .source {
    color: var(--color-text-muted);
    font-size: var(--text-xs);
    font-weight: var(--weight-regular);
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

  .search-wrap {
    position: relative;
    display: flex;
    flex-direction: column;
  }

  .dropdown {
    position: absolute;
    top: calc(100% + var(--space-1));
    left: 0;
    right: 0;
    z-index: var(--z-menu);
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    padding: var(--space-1);
    border: var(--border-width) solid var(--color-border);
    border-radius: var(--radius-md);
    background: var(--color-surface);
    box-shadow: var(--shadow-drawer);
  }

  .dropdown > p {
    padding: var(--space-1) var(--space-2);
  }

  .results {
    list-style: none;
    margin: 0;
    padding: 0;
    max-height: var(--campaign-books-height);
    overflow-y: auto;
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
