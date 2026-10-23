<script lang="ts">
  import { strings } from "$lib/strings";
  import { passesTime, type TimeKind } from "$lib/characters/sheet";
  import FeatureRow from "./FeatureRow.svelte";
  import type { Sheet } from "./sheet.svelte";

  // Class and subclass features up to the character's level, species traits, feats, and picks made when leveling
  // (Divine Order, invocations…), as rows like the Spells tab (FeatureRow): when it's used (A, BA, R), its uses to tick
  // off and which rest gives them back, all read from its rules text. The checkbox in front shows it on the Actions tab.
  // `filter`: the sheet's time filter (Action, Bonus action, Reaction, Other); empty shows everything.
  let { sheet, filter = [] }: { sheet: Sheet; filter?: TimeKind[] } = $props();

  const t = strings.characters.sheet.features;
  const f = $derived(sheet.features);
  $effect(() => f.load());

  const GROUPS = ["class", "traits", "feats", "other"] as const;
  const all = $derived(GROUPS.map((g) => [g, f.cards.filter((card) => card.group === g)] as const).filter(([, list]) => list.length > 0));
  // The time filter keeps the features used that way; a group left empty is hidden.
  const groups = $derived(all.map(([g, list]) => [g, list.filter((card) => passesTime(filter, f.useOf(card).time))] as const).filter(([, list]) => list.length > 0));
</script>

{#if f.error}<p class="error" role="alert">{t.loadError(f.error)}</p>{/if}
{#if all.length === 0}
  <p class="muted">{t.empty}</p>
{:else if groups.length === 0}
  <p class="muted">{strings.characters.sheet.timeFilter.none}</p>
{:else}
  <table class="sheet-table compact">
    <thead>
      <tr>
        <th scope="col"><span class="sr-only">{t.col.onActions}</span></th>
        <th scope="col">{t.col.name}</th>
        <th scope="col">{t.col.time}</th>
        <th scope="col">{t.col.uses}</th>
        <th scope="col">{t.col.rest}</th>
      </tr>
    </thead>
    {#each groups as [group, list] (group)}
      <tbody>
        <tr><th scope="colgroup" colspan="5" class="group-name">{t.groups[group]}</th></tr>
        {#each list as card (card.key)}
          <FeatureRow {sheet} {card} mode="features" />
        {/each}
      </tbody>
    {/each}
  </table>
{/if}

<style>
  /* The checkbox column comes first; the name column (second) takes the room. */
  .sheet-table :global(thead th:first-child) {
    width: auto;
  }

  .sheet-table :global(thead th:nth-child(2)) {
    width: 100%;
  }

  .muted {
    color: var(--color-text-muted);
  }

  .error {
    margin-bottom: var(--space-3);
    color: var(--color-danger);
    font-size: var(--text-sm);
  }
</style>
