<script lang="ts">
  import Entries from "$lib/components/rules/Entries.svelte";
  import { openPreview } from "$lib/rules/preview.svelte";
  import { strings } from "$lib/strings";
  import type { FeatureCard } from "./features.svelte";
  import type { Sheet } from "./sheet.svelte";

  // One feature as a row of a .sheet-table. On the Features & traits tab ("features"): a checkbox to show it on the
  // Actions tab, then Name, Time, Uses and Rest. On the Actions tab ("actions"): Name, Time, then its uses and rest
  // across the other columns. The name opens its preview card, or unfolds a species trait's text under the row.
  let { sheet, card, mode }: { sheet: Sheet; card: FeatureCard; mode: "features" | "actions" } = $props();

  const t = strings.characters.sheet.features;
  const tl = strings.characters.levelUpDialog;
  const none = strings.characters.sheet.spells.none;
  const plain = new Intl.NumberFormat();
  // Up to this many uses are boxes to tick; a bigger pool (Lay On Hands) is a counter.
  const MAX_BOXES = 8;

  const f = $derived(sheet.features);
  const use = $derived(f.useOf(card));
  const cast = $derived(use.time ? tl.cast[use.time] : null);
  // Its uses and rest are its pool's when it draws from one (Turn Undead ticks Channel Divinity's boxes).
  const pool = $derived(f.poolOf(card));
  const poolUse = $derived(pool === card ? use : f.useOf(pool));
  const uses = $derived(f.usesOf(card));
  const max = $derived(uses.max);
  const used = $derived(uses.used);
  const key = $derived(uses.key);
  const columns = $derived(mode === "features" ? 5 : 6);
  let expanded = $state(false);
</script>

{#snippet usesCell()}
  {#if max === null}
    {#if poolUse.short || poolUse.long}
      <!-- It recharges, but its text doesn't say how often: the number is set by hand. -->
      <input
        class="max"
        type="number"
        min="0"
        max="99"
        inputmode="numeric"
        placeholder={t.usesPlaceholder}
        aria-label={t.setUses(card.name)}
        disabled={sheet.readOnly}
        onchange={(e) => {
          const n = Number(e.currentTarget.value);
          if (Number.isInteger(n) && n >= 0) sheet.setFeatureMax(key, n);
        }}
      />
    {:else if mode === "features"}<span class="muted">{none}</span>{/if}
  {:else if max <= MAX_BOXES}
    <span class="boxes" role="group" aria-label={t.usesOf(card.name)}>
      {#each Array.from({ length: max }, (_, i) => i + 1) as n (n)}
        <input
          type="checkbox"
          class="box"
          aria-label={t.useBox(card.name, n)}
          checked={used >= n}
          disabled={sheet.readOnly}
          onchange={(e) => sheet.setFeatureUsed(key, e.currentTarget.checked ? Math.max(used, n) : n - 1, max, poolUse.short)}
        />
      {/each}
    </span>
  {:else}
    <span class="counter" role="group" aria-label={t.usesOf(card.name)}>
      <button type="button" class="step" aria-label={t.spend(card.name)} disabled={sheet.readOnly || used >= max} onclick={() => sheet.setFeatureUsed(key, used + 1, max, poolUse.short)}>−</button>
      <span class="left">{t.left(plain.format(max - used), plain.format(max))}</span>
      <button type="button" class="step" aria-label={t.giveBack(card.name)} disabled={sheet.readOnly || used <= 0} onclick={() => sheet.setFeatureUsed(key, used - 1, max, poolUse.short)}>+</button>
    </span>
  {/if}
{/snippet}

{#snippet rest()}
  {#if poolUse.short}<span class="rest short">{t.rest.short}</span>{:else if poolUse.long}<span class="rest long">{t.rest.long}</span>{:else if mode === "features"}<span class="muted">{none}</span>{/if}
{/snippet}

<tr>
  {#if mode === "features"}
    <td class="pick">
      <input type="checkbox" class="box" aria-label={t.showOnActions(card.name)} title={t.showOnActions(card.name)} checked={f.onActions(card)} disabled={sheet.readOnly} onchange={(e) => f.setOnActions(card, e.currentTarget.checked)} />
    </td>
  {/if}
  <th scope="row">
    <span class="name-cell">
      {#if card.ref}
        <!-- The card also says where the feature comes from ("From: Paladin 3"). -->
        {@const ref = { ...card.ref, note: t.from(card.from) }}
        <button class="entry-link" onclick={(e) => openPreview(ref, e.currentTarget)}>{card.name}</button>
      {:else if card.text}
        <!-- A species trait has no entry of its own: its text unfolds under the row. -->
        <button class="entry-link" aria-expanded={expanded} aria-controls="feature-{mode}-{card.key}" onclick={() => (expanded = !expanded)}>{card.name}</button>
      {:else}{card.name}{/if}
      {#if card.choice}<span class="choice">{t.choice(card.choice)}</span>{/if}
    </span>
  </th>
  <td class="muted">
    {#if cast}<span title={cast.long}><span aria-hidden="true">{cast.short}</span><span class="sr-only">{cast.long}</span></span>{:else}{none}{/if}
  </td>
  {#if mode === "features"}
    <td>{@render usesCell()}</td>
    <td>{@render rest()}</td>
  {:else}
    <!-- On the Actions tab: what's filled in for it (range, a save with the class's spell save DC, damage), then its uses. -->
    {@const dc = sheet.spellSaveDc()}
    <td class="muted"><span class="cut" title={use.range ?? ""}>{use.range ?? none}</span></td>
    <td><span class="pill strong">{use.save ? strings.characters.sheet.spells.dc(dc === null ? strings.characters.sheet.unknown : plain.format(dc), use.save.toUpperCase()) : none}</span></td>
    <td><span class="pill wrap">{use.damage ?? none}</span></td>
    <td><span class="together">{@render usesCell()}{@render rest()}</span></td>
  {/if}
</tr>
{#if !card.ref && card.text && expanded}
  <tr class="unfolded">
    <td colspan={columns} id="feature-{mode}-{card.key}"><div class="text"><p class="from">{t.from(card.from)}</p><Entries entry={card.text} depth={5} /></div></td>
  </tr>
{/if}

<style>
  .pick {
    width: var(--space-4);
    padding-right: 0;
  }

  .choice {
    color: var(--color-link);
    font-weight: var(--weight-semibold);
  }

  .together {
    display: inline-flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2);
  }

  .boxes {
    display: inline-flex;
    flex-wrap: wrap;
    gap: var(--space-1);
  }

  .box {
    appearance: none;
    flex: none;
    width: var(--space-4);
    height: var(--space-4);
    margin: 0;
    border: calc(1.5 * var(--border-width)) solid var(--color-text-muted);
    border-radius: var(--radius-sm);
    background: var(--color-surface);
    cursor: pointer;
  }

  .box:checked {
    background: var(--color-text-muted);
  }

  .box:focus-visible,
  .step:focus-visible,
  .max:focus-visible {
    outline: var(--focus-ring) solid var(--color-focus);
    outline-offset: var(--border-width);
  }

  .box:disabled {
    cursor: default;
  }

  .counter {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    white-space: nowrap;
  }

  .step {
    width: var(--control-height-sm);
    height: var(--control-height-sm);
    padding: 0;
    border: var(--border-width) solid var(--color-border-strong);
    border-radius: var(--radius-sm);
    background: var(--color-surface);
    color: var(--color-text);
    cursor: pointer;
  }

  .step:disabled {
    color: var(--color-text-muted);
    cursor: default;
  }

  .left {
    font-variant-numeric: tabular-nums;
    font-weight: var(--weight-semibold);
  }

  .max {
    width: calc(3 * var(--space-6));
    min-height: var(--control-height-sm);
    padding: 0 var(--space-2);
    border: var(--border-width) solid var(--color-border-strong);
    border-radius: var(--radius-sm);
    background: var(--color-surface);
    color: var(--color-text);
  }

  /* Which rest gives the uses back: a clear badge. */
  .rest {
    display: inline-block;
    padding: 0 var(--space-2);
    border-radius: var(--radius-pill);
    font-weight: var(--weight-semibold);
    white-space: nowrap;
  }

  .rest.short {
    background: var(--color-accent-soft);
    color: var(--color-link);
  }

  .rest.long {
    background: var(--color-surface-sunken);
    color: var(--color-text);
  }

  .from {
    font-weight: var(--weight-semibold);
  }

  .unfolded .text {
    color: var(--color-text-muted);
  }

  .unfolded .text :global(p) {
    margin-bottom: var(--space-2);
  }

  .muted {
    color: var(--color-text-muted);
  }
</style>
