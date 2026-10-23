<script lang="ts">
  import Spinner from "$lib/components/Spinner.svelte";
  import EntityView from "$lib/components/rules/EntityView.svelte";
  import type { InventoryItem } from "$lib/api/characters";
  import { findEntity, type Entity } from "$lib/api/rules";
  import { errorMessage } from "$lib/api/storage";
  import { coinsOf } from "$lib/characters/rules";
  import type { ArmorKind, Weapon } from "$lib/characters/sheet";
  import { DAMAGE_TYPES } from "$lib/rules/format";
  import { strings } from "$lib/strings";
  import type { Sheet } from "./sheet.svelte";

  // One inventory item, everything about it: a rules item shows its full entry and what the character has of it;
  // a custom item is a form, so its weight, price, armor or weapon numbers can be set (saved as you go).
  let { open = $bindable(false), sheet, index }: { open?: boolean; sheet: Sheet; index: number } = $props();

  const t = strings.characters.sheet.item;
  const plain = new Intl.NumberFormat();
  const decimal = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 });
  const ARMOR: ArmorKind[] = ["light", "medium", "heavy", "shield"];

  let dialog: HTMLDialogElement | undefined = $state();
  let entity = $state<Entity | null>(null);
  let loadError = $state<string | null>(null);

  const item = $derived(sheet.character?.inventory?.[index] ?? null);
  const custom = $derived(!!item && !item.source);
  const readOnly = $derived(sheet.readOnly);

  $effect(() => {
    if (open && dialog && !dialog.open) {
      entity = null;
      loadError = null;
      if (item?.source) findEntity("item", item.name, item.source).then((e) => (entity = e)).catch((e) => (loadError = errorMessage(e)));
      dialog.showModal();
    } else if (!open && dialog?.open) {
      dialog.close();
    }
  });

  /** Changes this item and saves it shortly after, like every change on the sheet. */
  function set(apply: (it: InventoryItem) => void) {
    sheet.change((c) => {
      const it = c.inventory?.[index];
      if (it) apply(it);
    });
  }

  const number = (value: string) => (value.trim() === "" ? null : Number(value.replace(",", ".")));
  function setWeapon(apply: (w: Weapon) => void) {
    set((it) => {
      const w: Weapon = { ...(it.weapon ?? {}) };
      apply(w);
      it.weapon = w;
    });
  }
  const price = (cp: number | undefined) =>
    cp ? Object.entries(coinsOf(cp)).map(([coin, n]) => strings.characters.sheet.inventory.coinAmount(plain.format(n), coin)).join(" ") : t.none;
</script>

<dialog
  bind:this={dialog}
  class="item-dialog"
  aria-labelledby="item-title"
  oncancel={(e) => {
    e.preventDefault();
    open = false;
  }}
>
  {#if open && item}
    <header class="top">
      <h2 id="item-title">{item.name}</h2>
      <button class="icon-btn" aria-label={t.close} onclick={() => (open = false)}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" /></svg>
      </button>
    </header>

    <div class="body">
      {#if custom}
        <fieldset class="form" disabled={readOnly}>
          <label class="field wide">
            <span class="label-text">{t.name}</span>
            <input class="text" value={item.name} maxlength="100" onchange={(e) => e.currentTarget.value.trim() && set((it) => (it.name = e.currentTarget.value.trim()))} />
          </label>
          <label class="field">
            <span class="label-text">{t.quantity}</span>
            <input class="text" type="number" min="0" value={item.quantity} onchange={(e) => { const n = number(e.currentTarget.value); if (n !== null && n >= 0) set((it) => (it.quantity = Math.round(n))); }} />
          </label>
          <label class="field">
            <span class="label-text">{t.weight}</span>
            <input class="text" type="number" min="0" step="0.1" value={item.weight ?? ""} onchange={(e) => { const n = number(e.currentTarget.value); set((it) => (n === null || n < 0 ? delete it.weight : (it.weight = n))); }} />
          </label>
          <label class="field">
            <span class="label-text">{t.priceGp}</span>
            <input class="text" type="number" min="0" step="0.01" value={item.value ? item.value / 100 : ""} onchange={(e) => { const n = number(e.currentTarget.value); set((it) => (n === null || n <= 0 ? delete it.value : (it.value = Math.round(n * 100)))); }} />
          </label>
          <label class="field check">
            <input type="checkbox" checked={!!item.attunement} onchange={(e) => set((it) => (it.attunement = e.currentTarget.checked))} />
            <span>{t.needsAttunement}</span>
          </label>

          <label class="field">
            <span class="label-text">{t.armor}</span>
            <select value={item.armor ?? ""} onchange={(e) => set((it) => (e.currentTarget.value ? (it.armor = e.currentTarget.value as ArmorKind) : (delete it.armor, delete it.ac)))}>
              <option value="">{t.notArmor}</option>
              {#each ARMOR as kind (kind)}<option value={kind}>{t.armorKinds[kind]}</option>{/each}
            </select>
          </label>
          {#if item.armor}
            <label class="field">
              <span class="label-text">{item.armor === "shield" ? t.shieldBonus : t.ac}</span>
              <input class="text" type="number" min="0" value={item.ac ?? ""} onchange={(e) => { const n = number(e.currentTarget.value); set((it) => (n === null ? delete it.ac : (it.ac = Math.round(n)))); }} />
            </label>
          {/if}

          <label class="field check wide">
            <input type="checkbox" checked={!!item.weapon} onchange={(e) => set((it) => (e.currentTarget.checked ? (it.weapon = { category: "simple", properties: [] }) : delete it.weapon))} />
            <span>{t.isWeapon}</span>
          </label>
          {#if item.weapon}
            <label class="field">
              <span class="label-text">{t.category}</span>
              <select value={item.weapon.category ?? "simple"} onchange={(e) => setWeapon((w) => (w.category = e.currentTarget.value))}>
                <option value="simple">{t.simple}</option>
                <option value="martial">{t.martial}</option>
              </select>
            </label>
            <label class="field">
              <span class="label-text">{t.damage}</span>
              <input class="text" value={item.weapon.dmg ?? ""} placeholder="1d6" onchange={(e) => setWeapon((w) => (w.dmg = e.currentTarget.value.trim() || undefined))} />
            </label>
            <label class="field">
              <span class="label-text">{t.damageType}</span>
              <select value={item.weapon.dmgType ?? ""} onchange={(e) => setWeapon((w) => (w.dmgType = e.currentTarget.value || undefined))}>
                <option value=""></option>
                {#each Object.entries(DAMAGE_TYPES) as [code, name] (code)}<option value={code}>{name}</option>{/each}
              </select>
            </label>
            <label class="field check">
              <input
                type="checkbox"
                checked={!!item.weapon.properties?.includes("F")}
                onchange={(e) => setWeapon((w) => (w.properties = e.currentTarget.checked ? [...(w.properties ?? []), "F"] : (w.properties ?? []).filter((p) => p !== "F")))}
              />
              <span>{t.finesse}</span>
            </label>
            <label class="field check">
              <input type="checkbox" checked={!!item.weapon.ranged} onchange={(e) => setWeapon((w) => (w.ranged = e.currentTarget.checked || undefined))} />
              <span>{t.ranged}</span>
            </label>
            {#if item.weapon.ranged}
              <label class="field">
                <span class="label-text">{t.range}</span>
                <input class="text" value={item.weapon.range ?? ""} placeholder="80/320" onchange={(e) => setWeapon((w) => (w.range = e.currentTarget.value.trim() || undefined))} />
              </label>
            {/if}
          {/if}

          <label class="field wide">
            <span class="label-text">{t.description}</span>
            <textarea rows="4" value={item.description ?? ""} onchange={(e) => set((it) => (it.description = e.currentTarget.value.trim() || undefined))}></textarea>
          </label>
        </fieldset>
      {:else}
        <dl class="facts">
          <div><dt>{t.quantity}</dt><dd>{plain.format(item.quantity)}</dd></div>
          <div><dt>{t.weight}</dt><dd>{item.weight ? t.pounds(decimal.format(item.weight)) : t.none}</dd></div>
          <div><dt>{t.price}</dt><dd>{price(item.value)}</dd></div>
          <div><dt>{t.state}</dt><dd>{[item.equipped ? t.equipped : "", item.attuned ? t.attuned : ""].filter(Boolean).join(", ") || t.none}</dd></div>
        </dl>
        {#if loadError}
          <p class="error" role="alert">{t.loadError(loadError)}</p>
        {:else if entity}
          <EntityView {entity} />
        {:else}
          <Spinner label={t.loading} />
        {/if}
      {/if}
    </div>
  {/if}
</dialog>

<style>
  .item-dialog {
    width: min(100% - 2 * var(--space-4), var(--dialog-width));
    max-height: 90vh;
    padding: 0;
    border: var(--border-width) solid var(--color-border);
    border-radius: var(--radius-lg);
    background: var(--color-surface);
    color: var(--color-text);
  }

  .item-dialog[open] {
    display: flex;
    flex-direction: column;
  }

  .item-dialog::backdrop {
    background: var(--color-backdrop);
  }

  .top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    padding: var(--space-3) var(--space-5);
    border-bottom: var(--border-width) solid var(--color-border);
  }

  .top h2 {
    font-size: var(--text-lg);
    font-weight: var(--weight-semibold);
  }

  .top svg {
    width: var(--icon-size);
    height: var(--icon-size);
  }

  .body {
    overflow-y: auto;
    padding: var(--space-5);
  }

  .form {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(100%, calc(6 * var(--space-6))), 1fr));
    gap: var(--space-3) var(--space-4);
    margin: 0;
    padding: 0;
    border: none;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .field.wide {
    grid-column: 1 / -1;
  }

  .field.check {
    flex-direction: row;
    align-items: center;
    align-self: end;
    min-height: var(--control-height);
    font-size: var(--text-sm);
  }

  .label-text {
    font-size: var(--text-sm);
    font-weight: var(--weight-semibold);
  }

  .text,
  textarea {
    min-height: var(--control-height);
    padding: 0 var(--space-3);
    border: var(--border-width) solid var(--color-border-strong);
    border-radius: var(--radius-md);
    background: var(--color-surface);
    color: var(--color-text);
    font: inherit;
  }

  textarea {
    padding: var(--space-2) var(--space-3);
    resize: vertical;
  }

  .facts {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-3) var(--space-6);
    margin: 0 0 var(--space-4);
    padding-bottom: var(--space-4);
    border-bottom: var(--border-width) solid var(--color-border);
  }

  .facts dt {
    color: var(--color-text-muted);
    font-size: var(--text-xs);
  }

  .facts dd {
    margin: 0;
    font-weight: var(--weight-semibold);
  }

  .error {
    color: var(--color-danger);
    font-size: var(--text-sm);
  }
</style>
