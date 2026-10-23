<script lang="ts" module>
  /** One pickable thing; `preview` makes its name open the rules preview; `taken`: already had (shown ticked, can't be picked);
   * `alert`: a (!) that shows this text on hover or click, while it is ticked; `tag`: a short label after the name (a spell's "BA"). */
  export type PickItem = {
    key: string;
    name: string;
    tag?: { short: string; long: string };
    note?: string;
    group?: string;
    preview?: { kind: string; name: string; source: string };
    taken?: boolean;
    alert?: string;
  };
</script>

<script lang="ts">
  import InfoTip from "$lib/components/InfoTip.svelte";
  import { openPreview } from "$lib/rules/preview.svelte";
  import { strings } from "$lib/strings";

  // Pick up to `max` items from a list (spells, invocations, skills…), with a filter for long lists.
  let { id, label, items, max, selected = $bindable([]) }: { id: string; label: string; items: PickItem[]; max: number; selected?: string[] } = $props();

  const t = strings.characters.levelUpDialog;
  const plain = new Intl.NumberFormat();
  const FILTER_FROM = 12;
  let filter = $state("");

  const visible = $derived.by(() => {
    const needle = filter.trim().toLowerCase();
    return needle ? items.filter((i) => i.name.toLowerCase().includes(needle) || selected.includes(i.key)) : items;
  });
  const full = $derived(selected.length >= max);

  function toggle(key: string, on: boolean) {
    selected = on ? [...selected, key] : selected.filter((k) => k !== key);
  }
</script>

<fieldset class="picklist">
  <legend class="head">
    <span class="label-text">{label}</span>
    <span class="count" class:done={selected.length === max}>{t.chosen(plain.format(selected.length), plain.format(max))}</span>
  </legend>
  {#if items.length > FILTER_FROM}
    <label class="sr-only" for="{id}-filter">{t.filter(label)}</label>
    <input id="{id}-filter" class="filter" type="search" bind:value={filter} placeholder={t.filterPlaceholder} autocomplete="off" />
  {/if}
  {#if items.length === 0}
    <p class="muted">{t.nothingToPick}</p>
  {:else}
    <ul class="items">
      {#each visible as item, i (item.key)}
        {#if item.group && item.group !== visible[i - 1]?.group}<li class="group" aria-hidden="true">{item.group}</li>{/if}
        {@const on = item.taken || selected.includes(item.key)}
        <li class="item" class:taken={item.taken}>
          <input
            id="{id}-{i}"
            type="checkbox"
            checked={on}
            disabled={item.taken || (full && !on)}
            onchange={(e) => toggle(item.key, e.currentTarget.checked)}
          />
          <label for="{id}-{i}" class="name">{item.name}</label>
          {#if item.tag}<span class="tag" title={item.tag.long}><span aria-hidden="true">{item.tag.short}</span><span class="sr-only">{item.tag.long}</span></span>{/if}
          {#if on && item.alert}<InfoTip id="{id}-{i}-alert" label={t.preparedTwiceOf(item.name)} text={item.alert} icon="alert" />{/if}
          {#if item.note}<span class="note">{item.note}</span>{/if}
          {#if item.preview}
            {@const ref = item.preview}
            <button type="button" class="info" aria-label={t.readRules(item.name)} title={t.readRules(item.name)} onclick={(e) => openPreview(ref, e.currentTarget)}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2" /><path d="M12 11v6M12 7.5v.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" /></svg>
            </button>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
</fieldset>

<style>
  .picklist {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    min-width: 0;
    margin: 0;
    padding: 0;
    border: none;
  }

  .head {
    display: flex;
    align-items: baseline;
    gap: var(--space-3);
    margin-bottom: var(--space-1);
    padding: 0;
  }

  .label-text {
    font-size: var(--text-sm);
    font-weight: var(--weight-semibold);
  }

  .count {
    color: var(--color-text-muted);
    font-size: var(--text-xs);
  }

  .count.done {
    color: var(--color-success);
    font-weight: var(--weight-semibold);
  }

  .filter {
    width: min(100%, var(--select-width));
    min-height: var(--control-height-sm);
    padding: 0 var(--space-3);
    border: var(--border-width) solid var(--color-border-strong);
    border-radius: var(--radius-sm);
    background: var(--color-surface);
    font-size: var(--text-sm);
  }

  .items {
    list-style: none;
    margin: 0;
    padding: var(--space-1);
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(100%, var(--select-width)), 1fr));
    gap: 0 var(--space-4);
    max-height: var(--picklist-height);
    overflow-y: auto;
    border: var(--border-width) solid var(--color-border);
    border-radius: var(--radius-md);
  }

  .group {
    grid-column: 1 / -1;
    padding: var(--space-2) var(--space-1) var(--space-1);
    color: var(--color-text-muted);
    font-size: var(--text-xs);
    font-weight: var(--weight-bold);
    letter-spacing: var(--tracking-label);
    text-transform: uppercase;
  }

  .item {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    min-width: 0;
    padding: var(--space-1);
    font-size: var(--text-sm);
  }

  .name {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    cursor: pointer;
  }

  .note {
    flex: none;
    color: var(--color-text-muted);
    font-size: var(--text-xs);
  }

  .tag {
    flex: none;
    padding: 0 var(--space-1);
    border: var(--border-width) solid var(--color-border-strong);
    border-radius: var(--radius-sm);
    color: var(--color-text-muted);
    font-size: var(--text-xs);
    font-weight: var(--weight-semibold);
  }

  /* A note (where a spell came from, a weapon's mastery) sits right before the (i). */
  .note {
    margin-left: auto;
  }

  .note + .info {
    margin-left: 0;
  }

  .taken .name {
    color: var(--color-text-muted);
    cursor: default;
  }


  .info {
    flex: none;
    display: inline-grid;
    place-items: center;
    width: var(--control-height-sm);
    height: var(--control-height-sm);
    margin-left: auto;
    padding: 0;
    border: none;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--color-text-muted);
    cursor: pointer;
  }

  .info:hover {
    background: var(--color-surface-sunken);
    color: var(--color-link);
  }

  .info svg {
    width: var(--space-4);
    height: var(--space-4);
  }

  .muted {
    color: var(--color-text-muted);
    font-size: var(--text-sm);
  }
</style>
