<script lang="ts">
  import type { Snippet } from "svelte";
  import { ABILITY_NAMES } from "$lib/rules/format";
  import { strings } from "$lib/strings";
  import { ABILITIES, checkBonus, modifier, type Ability } from "$lib/characters/rules";

  // The six abilities side by side: score (or a control to set it), then modifier and saving throw.
  let {
    scores,
    saves,
    proficiency,
    control,
    required = false,
  }: {
    scores: Record<Ability, number | null>;
    /** Abilities whose saving throw adds the proficiency bonus. */
    saves: Set<Ability>;
    proficiency: number;
    /** Replaces the plain score, e.g. an input or a select. */
    control?: Snippet<[Ability]>;
    /** Marks each ability's control as required. */
    required?: boolean;
  } = $props();

  const t = strings.characters.wizard.abilities;
  const signed = new Intl.NumberFormat(undefined, { signDisplay: "always" });
  const plain = new Intl.NumberFormat();
</script>

<ul class="cards">
  {#each ABILITIES as ability (ability)}
    {@const score = scores[ability]}
    <li class="item">
      <div class="card">
      <span class="name">{ABILITY_NAMES[ability]}{#if required}{" "}<span class="required" aria-hidden="true">*</span>{/if}</span>
      {#if control}
        {@render control(ability)}
      {:else}
        <span class="score">{score === null ? t.unassigned : plain.format(score)}</span>
      {/if}
      <span class="mod"><span class="sr-only">{t.modifier} </span>{score === null ? t.unassigned : signed.format(modifier(score))}</span>
      <span class="save" class:on={saves.has(ability)}>
        {t.save(score === null ? t.unassigned : signed.format(checkBonus(score, saves.has(ability), proficiency)))}
        {#if saves.has(ability)}<span class="sr-only">({t.proficientSave})</span>{/if}
      </span>
      </div>
    </li>
  {/each}
</ul>

<style>
  .cards {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(6, minmax(0, 1fr));
    gap: var(--space-3);
  }

  .item {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .card {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-1);
    padding: var(--space-3) var(--space-2);
    border: var(--border-width) solid var(--color-border);
    border-radius: var(--radius-md);
    background: var(--color-surface);
    font-variant-numeric: tabular-nums;
    text-align: center;
  }

  .name {
    font-size: var(--text-sm);
    font-weight: var(--weight-semibold);
  }

  .card :global(.score) {
    font-size: var(--text-2xl);
    font-weight: var(--weight-bold);
    line-height: var(--leading-tight);
  }

  .mod {
    color: var(--color-text-muted);
  }

  .save {
    color: var(--color-text-muted);
    font-size: var(--text-xs);
  }

  .save.on {
    color: var(--color-link);
    font-weight: var(--weight-semibold);
  }

  @media (max-width: 900px) {
    .cards {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
  }

  @media (max-width: 480px) {
    .cards {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
</style>
