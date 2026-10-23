<script lang="ts">
  import { tick } from "svelte";
  import type { Coin, InventoryItem } from "$lib/api/characters";
  import { catalogRows, findEntity, type CatalogRow } from "$lib/api/rules";
  import { coinsOf } from "$lib/characters/rules";
  import { errorMessage } from "$lib/api/storage";
  import { inSources } from "$lib/characters/rules";
  import { ATTUNEMENT_LIMIT, carryingCapacity, inventoryItem, pay, withdraw } from "$lib/characters/sheet";
  import { notify } from "$lib/stores/notifications.svelte";
  import { DAMAGE_TYPES } from "$lib/rules/format";
  import { strings } from "$lib/strings";
  import ItemDialog from "./ItemDialog.svelte";
  import type { Sheet } from "./sheet.svelte";

  /** `sources`: the campaign's sourcebooks, or null (no campaign) for every book. */
  let { sheet, sources }: { sheet: Sheet; sources: string[] | null } = $props();

  const t = strings.characters.sheet.inventory;
  const plain = new Intl.NumberFormat();
  const pounds = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 });
  const COINS: Coin[] = ["cp", "sp", "ep", "gp", "pp"];
  const MAX_RESULTS = 30;
  // Item fields kept on the character, so the sheet never needs a lookup for armor class, weight or attacks.
  const ITEM_KEYS = ["type", "weight", "value", "ac", "reqAttune", "weapon", "weaponCategory", "dmg1", "dmgType", "property", "range", "mastery"];

  const items = $derived(sheet.character?.inventory ?? []);
  const coins = $derived(sheet.character?.coins ?? {});
  const attuned = $derived(items.filter((i) => i.attuned).length);
  const totalWeight = $derived(items.reduce((sum, i) => sum + (i.weight ?? 0) * i.quantity, 0));
  const capacity = $derived(sheet.scores ? carryingCapacity(sheet.scores.str, sheet.character?.species?.size) : null);
  const carriedShare = $derived(capacity ? Math.min(100, Math.round((totalWeight / capacity) * 100)) : 0);

  // Prices per item. Items added before prices were kept get theirs looked up for showing (the file stays as it is).
  let looked = $state<Record<string, number | null>>({});
  const itemKey = (item: InventoryItem) => `${item.name}|${item.source}`.toLowerCase();
  $effect(() => {
    for (const item of items) {
      if (!item.source || item.value !== undefined || itemKey(item) in looked) continue;
      const key = itemKey(item);
      looked[key] = null;
      findEntity("item", item.name, item.source)
        .then((e) => (looked[key] = typeof e?.data.value === "number" ? e.data.value : null))
        .catch(() => {});
    }
  });
  /** A price in copper as the fewest coins ("15 gp", "2 sp 5 cp"); "" when there's none. */
  const priceText = (cp: unknown) =>
    typeof cp === "number" && cp > 0 ? Object.entries(coinsOf(cp)).map(([coin, n]) => t.coinAmount(plain.format(n), coin)).join(" ") : "";
  const priceOf = (item: InventoryItem) => priceText(item.value ?? (item.source ? looked[itemKey(item)] : null));

  const note = (item: InventoryItem) =>
    item.armor && typeof item.ac === "number"
      ? t.acNote(item.armor === "shield" ? `+${item.ac}` : plain.format(item.ac))
      : item.weapon?.dmg
        ? [item.weapon.dmg, DAMAGE_TYPES[item.weapon.dmgType ?? ""]].filter(Boolean).join(" ")
        : "";

  // ---- Adding items: the item catalog is loaded the first time the search field gets focus ----
  let search = $state("");
  let resultsOpen = $state(false);
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

  /** The item whose details are open (rules entry, or a form for a custom item). */
  let viewing = $state<number | null>(null);

  // ---- Order: drag an item's grip onto another row, or move it with the arrow keys ----
  let dragFrom = $state<number | null>(null);
  let dropAt = $state<number | null>(null);

  function move(from: number, to: number) {
    sheet.change((c) => {
      const list = [...(c.inventory ?? [])];
      const [item] = list.splice(from, 1);
      list.splice(to, 0, item);
      c.inventory = list;
    });
  }

  // Each add is its own line, even for an item already there: two Daggers can each be equipped and attack.
  function add(item: InventoryItem) {
    sheet.change((c) => (c.inventory = [...(c.inventory ?? []), item]));
  }

  // Picking a result fills the field; Add or Buy (right of it) puts it in the inventory.
  let picked = $state<{ row: CatalogRow } | { custom: string } | null>(null);
  const pickedPrice = $derived(picked && "row" in picked && typeof picked.row.data.value === "number" ? picked.row.data.value : 0);
  const afterPaying = $derived(pickedPrice ? pay(coins, pickedPrice) : null);

  function pick(choice: { row: CatalogRow } | { custom: string }) {
    picked = choice;
    search = "row" in choice ? choice.row.name : choice.custom;
    resultsOpen = false;
  }

  function addPicked(buy: boolean) {
    if (!picked) return;
    const item = "row" in picked ? inventoryItem(picked.row) : { name: picked.custom, quantity: 1 };
    add(item);
    if (buy && afterPaying) {
      const paid = afterPaying;
      sheet.change((c) => (c.coins = paid));
      notify(t.bought(item.name, priceText(pickedPrice)));
    }
    picked = null;
    search = "";
  }

  function remove(index: number) {
    sheet.change((c) => (c.inventory = (c.inventory ?? []).filter((_, i) => i !== index)));
  }

  const whole = (value: string) => (/^\d+$/.test(value.trim()) ? Number(value.trim()) : null);

  function setQuantity(index: number, value: string) {
    const n = whole(value);
    // 0 keeps the item listed (used up arrows, empty flasks); ✕ removes it.
    if (n !== null) edit(index, (item) => (item.quantity = n));
  }

  function addCoin(coin: Coin) {
    sheet.change((c) => (c.coins = { ...c.coins, [coin]: (c.coins?.[coin] ?? 0) + 1 }));
  }

  /** Takes out one coin, breaking a bigger one when there's none of that kind. */
  function takeCoin(coin: Coin) {
    const next = withdraw(coins, coin);
    if (next) sheet.change((c) => (c.coins = next));
  }

  function setCoin(coin: Coin, value: string) {
    const n = whole(value === "" ? "0" : value);
    if (n !== null) sheet.change((c) => (c.coins = { ...c.coins, [coin]: n }));
  }

</script>

<section aria-labelledby="inventory-title" class="inventory">
  <h2 id="inventory-title" class="sr-only">{t.title}</h2>

  <div class="summary">
    <fieldset class="coins">
      <legend class="sr-only">{t.coins}</legend>
      {#each COINS as coin (coin)}
        <div class="coin-group">
          <label class="coin" title={t.coinNames[coin]}>
            <abbr title={t.coinNames[coin]}>{t.coinCodes[coin]}</abbr>
            <input
              type="number"
              min="0"
              step="1"
              aria-label={t.coinNames[coin]}
              value={coins[coin] ?? 0}
              disabled={sheet.readOnly}
              onchange={(e) => setCoin(coin, e.currentTarget.value)}
            />
          </label>
          <span class="coin-steps">
            <button aria-label={t.lessCoin(t.coinNames[coin])} title={t.lessCoin(t.coinNames[coin])} disabled={sheet.readOnly || !withdraw(coins, coin)} onclick={() => takeCoin(coin)}>−</button>
            <button aria-label={t.moreCoin(t.coinNames[coin])} title={t.moreCoin(t.coinNames[coin])} disabled={sheet.readOnly} onclick={() => addCoin(coin)}>+</button>
          </span>
        </div>
      {/each}
    </fieldset>

    <div class="carrying">
      <span>{t.carrying(pounds.format(totalWeight), capacity === null ? strings.characters.sheet.unknown : pounds.format(capacity), plain.format(attuned), plain.format(ATTUNEMENT_LIMIT))}</span>
      <div class="bar" role="meter" aria-label={t.carryingLabel} aria-valuemin={0} aria-valuemax={100} aria-valuenow={carriedShare}>
        <div class="fill" style:width="{carriedShare}%"></div>
      </div>
    </div>

  </div>

  {#if !sheet.readOnly}
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
          oninput={() => ((resultsOpen = true), (picked = null))}
          onfocus={() => ((resultsOpen = true), loadCatalog())}
          placeholder={t.searchPlaceholder}
          autocomplete="off"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={resultsOpen && !!search.trim()}
          aria-controls="item-results"
        />
        <div class="pick-actions">
          <button class="btn" disabled={!picked} onclick={() => addPicked(false)}>{t.addPicked}</button>
          <button
            class="btn"
            disabled={!picked || !pickedPrice || !afterPaying}
            title={picked && pickedPrice && !afterPaying ? t.cantAfford : undefined}
            onclick={() => addPicked(true)}
          >
            {pickedPrice ? t.buyFor(priceText(pickedPrice)) : t.buy}
          </button>
        </div>
        {#if catalogError}
          <p class="error" role="alert">{catalogError}</p>
        {:else if resultsOpen && search.trim()}
          <div id="item-results" class="dropdown">
            {#if !catalog}
              <p class="muted small" role="status">{t.loadingItems}</p>
            {:else if matches.length === 0}
              <p class="muted small">{t.noResults}</p>
            {/if}
            {#if catalog && matches.length}
              <ul class="results">
                {#each matches.slice(0, MAX_RESULTS) as row (row.id)}
                  <li>
                    <button class="result" onclick={() => pick({ row })}>
                      <span>{row.name}</span>
                      <span class="price">{priceText(row.data.value)}</span>
                      <span class="source">{row.source}</span>
                    </button>
                  </li>
                {/each}
              </ul>
              {#if matches.length > MAX_RESULTS}<p class="muted small">{t.moreResults(plain.format(MAX_RESULTS))}</p>{/if}
            {/if}
            <!-- Anything typed can also be added as an item of its own. -->
            <button class="result custom-result" onclick={() => pick({ custom: search.trim() })}>{t.addAsCustom(search.trim())}</button>
          </div>
        {/if}
      </div>

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
            <th scope="col">{t.price}</th>
            <th scope="col">{t.notes}</th>
            <th scope="col"><span class="sr-only">{t.actions}</span></th>
          </tr>
        </thead>
        <tbody>
          {#each items as item, i (`${i}-${item.name}`)}
            <tr
              class:drop-target={dropAt === i && dragFrom !== null && dragFrom !== i}
              ondragover={(e) => {
                if (dragFrom === null) return;
                e.preventDefault();
                dropAt = i;
              }}
              ondrop={(e) => {
                e.preventDefault();
                if (dragFrom !== null) move(dragFrom, i);
                dragFrom = dropAt = null;
              }}
            >

              <td class="equip-cell">
                {#if !sheet.readOnly}
                  <!-- Drag to move the item; with the keyboard, focus it and use the arrow keys. -->
                  <button
                    class="grip"
                    draggable="true"
                    aria-label={t.moveOf(item.name)}
                    title={t.moveHint}
                    ondragstart={(e) => {
                      dragFrom = i;
                      e.dataTransfer?.setData("text/plain", item.name);
                    }}
                    ondragend={() => (dragFrom = dropAt = null)}
                    onkeydown={(e) => {
                      const to = e.key === "ArrowUp" ? i - 1 : e.key === "ArrowDown" ? i + 1 : null;
                      if (to === null || to < 0 || to >= items.length) return;
                      e.preventDefault();
                      move(i, to);
                      tick().then(() => document.querySelectorAll<HTMLButtonElement>(".grip")[to]?.focus());
                    }}
                  >
                    <svg viewBox="0 0 12 24" aria-hidden="true"><circle cx="3" cy="6" r="2" /><circle cx="9" cy="6" r="2" /><circle cx="3" cy="12" r="2" /><circle cx="9" cy="12" r="2" /><circle cx="3" cy="18" r="2" /><circle cx="9" cy="18" r="2" /></svg>
                  </button>
                {/if}
                <input
                  type="checkbox"
                  aria-label={t.equippedOf(item.name)}
                  checked={!!item.equipped}
                  disabled={sheet.readOnly}
                  onchange={(e) => edit(i, (it) => (it.equipped = e.currentTarget.checked))}
                />
              </td>
              <th scope="row">
                <button class="entry-link" onclick={() => (viewing = i)}>{item.name}</button>
              </th>
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
                <span class="steps">
                  <button class="step" aria-label={t.more(item.name)} title={t.more(item.name)} disabled={sheet.readOnly} onclick={() => edit(i, (x) => (x.quantity += 1))}>+</button>
                  <button class="step" aria-label={t.less(item.name)} title={t.less(item.name)} disabled={sheet.readOnly || item.quantity <= 0} onclick={() => edit(i, (x) => (x.quantity = Math.max(0, x.quantity - 1)))}>−</button>
                </span>
              </td>
              <td class="muted">{item.weight ? t.pounds(pounds.format(item.weight * item.quantity)) : ""}</td>
              <td class="muted">{priceOf(item)}</td>
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

{#if viewing !== null}<ItemDialog bind:open={() => viewing !== null, (v) => !v && (viewing = null)} {sheet} index={viewing} />{/if}

<style>
  .inventory {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  /* Coins and the carrying bar share one line; the bar's text wraps in its own column. Narrow windows stack them. */
  .summary {
    display: flex;
    align-items: center;
    gap: var(--space-4);
  }

  @media (max-width: 720px) {
    .summary {
      flex-wrap: wrap;
    }
  }

  .coins {
    display: flex;
    gap: var(--space-2);
    margin: 0;
    padding: 0;
    border: none;
  }

  /* A coin box and its − / + row underneath read as one block: one border, rounded only on the outside. */
  .coin-group {
    display: flex;
    flex-direction: column;
    width: var(--coin-box-width);
  }

  .coin-group .coin {
    border-bottom-left-radius: 0;
    border-bottom-right-radius: 0;
  }

  .coin-steps {
    display: flex;
    border: var(--border-width) solid var(--color-border-strong);
    border-top: none;
    border-radius: 0 0 var(--radius-md) var(--radius-md);
    overflow: hidden;
  }

  .coin-steps button {
    flex: 1;
    padding: 0;
    border: none;
    background: var(--color-surface-sunken);
    color: var(--color-text);
    font-size: var(--text-xs);
    line-height: var(--leading-normal);
    cursor: pointer;
  }

  .coin-steps button + button {
    border-left: var(--border-width) solid var(--color-border-strong);
  }

  .coin-steps button:hover:not(:disabled) {
    background: var(--color-border);
  }

  .coin-steps button:disabled {
    color: var(--color-text-muted);
    cursor: default;
  }

  .coin-steps button:focus-visible {
    outline: var(--focus-ring) solid var(--color-focus);
    outline-offset: calc(-1 * var(--focus-ring));
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
    /* No spin buttons: they take room on the right and push the number off-center (arrow keys still work). */
    appearance: textfield;
  }

  .coin input::-webkit-inner-spin-button,
  .coin input::-webkit-outer-spin-button {
    margin: 0;
    appearance: none;
  }

  .coin:has(input:focus-visible) {
    outline: var(--focus-ring) solid var(--color-focus);
    outline-offset: var(--border-width);
  }

  .coin input:focus-visible {
    outline: none;
  }

  .carrying {
    flex: 1 1 0;
    min-width: 0;
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

  /* A small grip before the Equip box, shown when the row is hovered or the grip has focus. */
  .equip-cell {
    white-space: nowrap;
  }

  .grip {
    display: inline-grid;
    place-items: center;
    width: var(--space-3);
    height: var(--space-4);
    margin-left: calc(-1 * var(--space-1));
    margin-right: var(--space-1);
    padding: 0;
    border: none;
    border-radius: var(--radius-sm);
    background: none;
    color: var(--color-text-muted);
    vertical-align: middle;
    opacity: 0;
    cursor: grab;
  }

  tr:hover .grip,
  .grip:focus-visible {
    opacity: 1;
  }

  /* Touch screens have no hover: keep it visible there. */
  @media (hover: none) {
    .grip {
      opacity: 1;
    }
  }

  .grip:hover {
    color: var(--color-text);
  }

  .grip svg {
    width: var(--space-2);
    height: var(--space-4);
    fill: currentColor;
  }

  /* The row whose place a dragged item will take. */
  tr.drop-target {
    background: var(--color-accent-soft);
    box-shadow: inset 0 0 0 var(--border-width) var(--color-link);
  }

  /* + above −, right of the quantity. */
  .steps {
    display: inline-flex;
    flex-direction: column;
    vertical-align: middle;
    margin-left: var(--space-1);
  }

  .step {
    display: grid;
    place-items: center;
    width: var(--space-5);
    height: calc(var(--control-height-sm) / 2);
    padding: 0;
    border: var(--border-width) solid var(--color-border-strong);
    background: var(--color-surface);
    color: var(--color-text);
    font-size: var(--text-xs);
    line-height: 1;
    cursor: pointer;
  }

  .step:first-child {
    border-radius: var(--radius-sm) var(--radius-sm) 0 0;
  }

  .step:last-child {
    margin-top: calc(-1 * var(--border-width));
    border-radius: 0 0 var(--radius-sm) var(--radius-sm);
  }

  .step:hover:not(:disabled) {
    background: var(--color-surface-sunken);
  }

  .step:disabled {
    color: var(--color-text-muted);
    cursor: default;
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

  /* The search field, with Add and Buy on its right; the results float below the field. */
  .search-wrap {
    position: relative;
    display: grid;
    grid-template-columns: 1fr auto;
    gap: var(--space-2);
  }

  .pick-actions {
    display: flex;
    gap: var(--space-2);
  }

  .price {
    margin-left: auto;
    color: var(--color-text-muted);
    font-size: var(--text-xs);
    font-variant-numeric: tabular-nums;
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

  /* The last row of the results: add what's typed as an item of its own. */
  .custom-result {
    border-top: var(--border-width) solid var(--color-border);
    border-radius: 0;
    color: var(--color-link);
    font-weight: var(--weight-medium);
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
