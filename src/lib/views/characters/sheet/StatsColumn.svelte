<script lang="ts">
  import { ABILITIES, checkBonus, modifier, proficiencyBonus, type Ability } from "$lib/characters/rules";
  import { proficiencyLists } from "$lib/characters/sheet";
  import { ABILITY_NAMES } from "$lib/rules/format";
  import { strings } from "$lib/strings";
  import type { Sheet } from "./sheet.svelte";

  // The sheet's left column: abilities, saving throws, senses and proficiencies, and skills.
  let { sheet }: { sheet: Sheet } = $props();

  const t = strings.characters.sheet;
  const signed = new Intl.NumberFormat(undefined, { signDisplay: "always" });
  const plain = new Intl.NumberFormat();
  const list = new Intl.ListFormat(undefined, { type: "conjunction" });

  const scores = $derived(sheet.scores);
  const pb = $derived(proficiencyBonus(sheet.level));
  const proficient = $derived(new Set(sheet.character?.skills ?? []));
  const saves = $derived(new Set((sheet.character?.savingThrows ?? []) as Ability[]));
  const skillRows = $derived(
    sheet.skills.map((s) => ({ ...s, proficient: proficient.has(s.key), bonus: scores ? checkBonus(scores[s.ability] ?? 10, proficient.has(s.key), pb) : null })),
  );
  const passive = (key: string, ability: Ability) => {
    const bonus = skillRows.find((s) => s.key === key)?.bonus ?? (scores ? modifier(scores[ability]) : null);
    return bonus === null ? t.unknown : plain.format(10 + bonus);
  };
  const lists = $derived(proficiencyLists(sheet.cls, sheet.background, sheet.species));
  // Only the categories the character has something in.
  const profRows = $derived(
    ([
      [t.senses.armor, lists.armor],
      [t.senses.weapons, lists.weapons],
      [t.senses.tools, lists.tools],
      [t.senses.languages, lists.languages],
    ] as const).filter(([, items]) => items.length > 0),
  );
</script>

<div class="column">
  <div class="split">
    <div class="stack">
      <ul class="abilities" aria-label={t.abilitiesLabel}>
        {#each ABILITIES as ability (ability)}
          {@const score = scores?.[ability] ?? null}
          <li class="ability">
            <span class="ability-name">
              <span class="full">{ABILITY_NAMES[ability]}</span>
              <span class="score">{score === null ? t.unknown : signed.format(modifier(score))}</span>
            </span>
            <span class="mod">{score === null ? t.unknown : plain.format(score)}</span>
          </li>
        {/each}
      </ul>

      <section class="box" aria-labelledby="sheet-saves">
        <h2 id="sheet-saves" class="label">{t.saves}</h2>
        <ul class="saves">
          {#each ABILITIES as ability (ability)}
            <li class="line">
              <span class="dot" class:on={saves.has(ability)} aria-hidden="true"></span>
              <span class="grow">{ability.toUpperCase()}{#if saves.has(ability)}<span class="sr-only"> ({t.proficient})</span>{/if}</span>
              <b>{scores ? signed.format(checkBonus(scores[ability], saves.has(ability), pb)) : t.unknown}</b>
            </li>
          {/each}
        </ul>
      </section>

      <section class="box" aria-labelledby="sheet-senses">
        <h2 id="sheet-senses" class="label">{t.senses.title}</h2>
        <p class="between"><span>{t.senses.perception}</span><b>{passive("perception", "wis")}</b></p>
        <p class="between"><span>{t.senses.insight}</span><b>{passive("insight", "wis")}</b></p>
        <p class="between"><span>{t.senses.investigation}</span><b>{passive("investigation", "int")}</b></p>
        {#each profRows as [label, items], i (label)}
          <p class="prof" class:first={i === 0}><b class="prof-label">{t.senses.label(label)}</b> {list.format(items)}</p>
        {/each}
      </section>
    </div>

    <section class="box skills" aria-labelledby="sheet-skills">
      <h2 id="sheet-skills" class="label">{t.skills}</h2>
      {#if skillRows.length === 0}
        <p class="muted">{t.unknown}</p>
      {:else}
        <ul>
          {#each skillRows as skill (skill.key)}
            <li class="line skill">
              <span class="dot" class:on={skill.proficient} aria-hidden="true"></span>
              <span class="grow">{skill.name}{#if skill.proficient}<span class="sr-only"> ({t.proficient})</span>{/if}</span>
              <span class="muted small">{skill.ability.toUpperCase()}</span>
              <b class="bonus">{skill.bonus === null ? t.unknown : signed.format(skill.bonus)}</b>
            </li>
          {/each}
        </ul>
      {/if}
    </section>
  </div>
</div>

<style>
  .column {
    display: flex;
    flex-direction: column;
    gap: var(--space-5);
  }

  ul {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .abilities {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--space-2);
  }

  .ability {
    min-width: 0;
    min-height: var(--ability-card-height);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
    padding: var(--space-1) var(--space-3);
    border: var(--border-width) solid var(--color-border-strong);
    border-radius: var(--radius-md);
    background: var(--color-surface);
  }

  .ability-name {
    min-width: 0;
    display: flex;
    flex-direction: column;
    font-size: var(--text-xs);
    line-height: var(--leading-tight);
    white-space: nowrap;
  }

  .full {
    overflow: hidden;
    text-overflow: ellipsis;
    font-weight: var(--weight-bold);
  }

  .score {
    color: var(--color-text-muted);
    font-size: var(--text-md);
    font-variant-numeric: tabular-nums;
  }

  .mod {
    font-size: var(--text-xl);
    font-weight: var(--weight-bold);
    font-variant-numeric: tabular-nums;
  }

  .split {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, calc(10 * var(--space-6))), 1fr));
    gap: var(--space-5);
    align-items: start;
  }

  .stack {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-5);
  }

  .box {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    padding: var(--space-3) var(--space-4);
    border: var(--border-width) solid var(--color-border-strong);
    border-radius: var(--radius-lg);
    background: var(--color-surface);
    font-size: var(--text-sm);
  }

  .label {
    margin-bottom: var(--space-1);
    color: var(--color-text-muted);
    font-size: var(--text-xs);
    font-weight: var(--weight-bold);
    letter-spacing: var(--tracking-label);
    text-transform: uppercase;
  }

  .saves {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0 var(--space-4);
  }

  .line {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    min-width: 0;
    padding: var(--space-1) 0;
  }

  .skill {
    padding: var(--space-1);
    border-bottom: var(--border-width) solid var(--color-border);
  }

  .skill:last-child {
    border-bottom: none;
  }

  .grow {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .dot {
    flex: none;
    width: var(--space-2);
    height: var(--space-2);
    border: calc(1.5 * var(--border-width)) solid var(--color-text-muted);
    border-radius: 50%;
  }

  .dot.on {
    border-color: var(--color-text);
    background: var(--color-text);
  }

  b,
  .bonus {
    font-variant-numeric: tabular-nums;
  }

  .bonus {
    min-width: calc(1.5 * var(--space-6));
    text-align: right;
  }

  .between {
    display: flex;
    justify-content: space-between;
    gap: var(--space-2);
  }

  .prof {
    color: var(--color-text-muted);
    font-size: var(--text-sm);
  }

  .prof-label {
    color: var(--color-text);
  }

  .prof.first {
    padding-top: var(--space-2);
  }

  .muted {
    color: var(--color-text-muted);
  }

  .small {
    font-size: var(--text-xs);
  }

</style>
