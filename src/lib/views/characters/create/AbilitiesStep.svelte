<script lang="ts">
  import { rollDice } from "$lib/api/dice";
  import { errorMessage } from "$lib/api/storage";
  import { ABILITY_NAMES } from "$lib/rules/format";
  import { strings } from "$lib/strings";
  import {
    ABILITIES,
    MANUAL_MAX,
    MANUAL_MIN,
    ROLL_NOTATION,
    SCORE_CAP,
    STANDARD_ARRAY,
    emptyAssignment,
    emptyPick,
    proficiencyBonus,
    type Ability,
    type BonusOption,
    type BonusPick,
  } from "$lib/characters/rules";
  import AbilityCards from "./AbilityCards.svelte";
  import { abilityTotal, backgroundBonuses, chooseMethod, draft, levelIncreases, rolledValues, savingThrows, speciesBonuses, type Method } from "./draft.svelte";

  const t = strings.characters.wizard.abilities;
  const signed = new Intl.NumberFormat(undefined, { signDisplay: "always" });
  const plain = new Intl.NumberFormat();
  const list = new Intl.ListFormat(undefined, { type: "conjunction" });
  const METHODS: Method[] = ["standard", "manual", "roll"];

  let rolling = $state(false);
  let rollError = $state<string | null>(null);

  const values = $derived(draft.method === "standard" ? STANDARD_ARRAY : rolledValues());
  const speciesOptions = $derived(speciesBonuses());
  const backgroundOptions = $derived(backgroundBonuses());
  const totals = $derived(Object.fromEntries(ABILITIES.map((a) => [a, abilityTotal(a)])) as Record<Ability, number | null>);
  const saves = $derived(new Set(savingThrows()));
  const sections = $derived(
    [
      { key: "species" as const, from: draft.species?.name ?? "", options: speciesOptions },
      { key: "background" as const, from: draft.background?.name ?? "", options: backgroundOptions },
    ].filter((s) => s.options.length > 0),
  );

  async function roll() {
    rolling = true;
    rollError = null;
    try {
      draft.rolls = await Promise.all(ABILITIES.map(() => rollDice(ROLL_NOTATION)));
      draft.assignment = emptyAssignment();
    } catch (e) {
      rollError = t.rollError(errorMessage(e));
    } finally {
      rolling = false;
    }
  }

  function assign(ability: Ability, value: string) {
    draft.assignment[ability] = value === "" ? null : Number(value);
  }

  function setManual(ability: Ability, value: string) {
    const n = Math.round(Number(value));
    if (Number.isFinite(n)) draft.manual[ability] = Math.min(MANUAL_MAX, Math.max(MANUAL_MIN, n));
  }

  const pickFor = (key: "species" | "background") => (key === "species" ? draft.speciesPick : draft.backgroundPick);
  function setPick(key: "species" | "background", pick: BonusPick) {
    if (key === "species") draft.speciesPick = pick;
    else draft.backgroundPick = pick;
  }

  function pickAbility(key: "species" | "background", choice: number, slot: number, value: string) {
    const pick = pickFor(key);
    pick.picks[choice] ??= [];
    pick.picks[choice][slot] = value === "" ? null : (value as Ability);
  }

  const optionLabel = (option: BonusOption) =>
    [
      ...Object.entries(option.fixed).map(([a, n]) => `${ABILITY_NAMES[a]} ${signed.format(n)}`),
      ...option.choices.map((c) => c.amounts.map((n) => signed.format(n)).join(" / ")),
    ].join(", ");

  const duplicate = (picks: (Ability | null)[] | undefined) => {
    const set = (picks ?? []).filter(Boolean);
    return new Set(set).size !== set.length;
  };
</script>

<div class="method">
  <label class="field">
    <span class="label-text">{t.method} <span class="required" aria-hidden="true">*</span></span>
    <select value={draft.method} onchange={(e) => chooseMethod(e.currentTarget.value as Method)}>
      {#each METHODS as method (method)}<option value={method}>{t.methods[method]}</option>{/each}
    </select>
  </label>
  {#if draft.method === "roll"}
    <button class="btn" onclick={roll} disabled={rolling}>{rolling ? t.rolling : draft.rolls.length ? t.reroll : t.roll}</button>
  {:else if draft.method === "standard"}
    <p class="muted">{t.values(list.format(STANDARD_ARRAY.map((v) => plain.format(v))))}</p>
  {:else}
    <p class="muted">{t.manualRange(MANUAL_MIN, MANUAL_MAX)}</p>
  {/if}
</div>

{#if draft.method === "roll"}
  {#if rollError}<p class="error" role="alert">{rollError}</p>{/if}
  {#if draft.rolls.length}
    <ol class="roll-list">
      {#each draft.rolls as r, i (i)}
        <li>
          <span class="muted">{t.rolled(i + 1)}</span>
          <span class="dice">
            {#each r.dice as die, j (j)}
              <span class="die" class:dropped={!die.kept}>{plain.format(die.value)}{#if !die.kept}<span class="sr-only"> ({t.dropped})</span>{/if}</span>
            {/each}
          </span>
          <strong>{plain.format(r.total)}</strong>
        </li>
      {/each}
    </ol>
  {/if}
{/if}

<!-- What levels add is in the totals below too, as on the sheet. -->
{#if ABILITIES.some((a) => levelIncreases()[a])}
  {@const fromLevels = ABILITIES.filter((a) => levelIncreases()[a]).map((a) => `${ABILITY_NAMES[a]} ${signed.format(levelIncreases()[a]!)}`)}
  <p class="kept">{strings.characters.wizard.edit.levelBonuses(list.format(fromLevels))}</p>
{/if}
{#if draft.keptBonuses}
  {@const kept = ABILITIES.filter((a) => draft.keptBonuses?.[a]).map((a) => `${ABILITY_NAMES[a]} ${signed.format(draft.keptBonuses![a]!)}`)}
  <div class="kept">
    <p>{kept.length ? strings.characters.wizard.edit.keptBonuses(list.format(kept)) : strings.characters.wizard.edit.noKeptBonuses}</p>
    {#if sections.length}<button class="btn small" onclick={() => (draft.keptBonuses = null)}>{strings.characters.wizard.edit.chooseAgain}</button>{/if}
  </div>
{:else}
{#each sections as section (section.key)}
  {@const option = section.options[pickFor(section.key).option]}
  <fieldset class="bonuses">
    <legend class="label">{t.bonuses(section.from)}</legend>
    <div class="bonus-row">
      {#if section.options.length > 1}
        <label class="field">
          <span class="label-text">{t.option} <span class="required" aria-hidden="true">*</span></span>
          <select
            value={String(pickFor(section.key).option)}
            onchange={(e) => setPick(section.key, emptyPick(section.options[Number(e.currentTarget.value)], Number(e.currentTarget.value)))}
          >
            {#each section.options as o, i (i)}<option value={String(i)}>{optionLabel(o)}</option>{/each}
          </select>
        </label>
      {/if}
      {#if option && Object.keys(option.fixed).length}
        <p class="muted">{t.fixed(Object.entries(option.fixed).map(([a, n]) => `${ABILITY_NAMES[a]} ${signed.format(n)}`).join(", "))}</p>
      {/if}
      {#each option?.choices ?? [] as choice, c (c)}
        {#each choice.amounts as amount, slot (slot)}
          <label class="field">
            <span class="label-text">{t.pickFor(signed.format(amount))} <span class="required" aria-hidden="true">*</span></span>
            <select value={pickFor(section.key).picks[c]?.[slot] ?? ""} onchange={(e) => pickAbility(section.key, c, slot, e.currentTarget.value)}>
              <option value="">{t.unassigned}</option>
              {#each choice.from as ability (ability)}<option value={ability}>{ABILITY_NAMES[ability]}</option>{/each}
            </select>
          </label>
        {/each}
      {/each}
    </div>
    {#each option?.choices ?? [] as _, c (c)}
      {#if duplicate(pickFor(section.key).picks[c])}<p class="error" role="alert">{t.differentAbilities}</p>{/if}
    {/each}
  </fieldset>
{/each}
{/if}

<AbilityCards scores={totals} {saves} proficiency={proficiencyBonus(1)} required>
  {#snippet control(ability: Ability)}
    {#if draft.method === "manual"}
      <input
        class="score score-input"
        type="number"
        min={MANUAL_MIN}
        max={MANUAL_MAX}
        value={draft.manual[ability]}
        aria-label={t.assign(ABILITY_NAMES[ability])}
        onchange={(e) => setManual(ability, e.currentTarget.value)}
      />
    {:else}
      <span class="score">{totals[ability] === null ? t.unassigned : plain.format(totals[ability]!)}</span>
      <select
        class="value-select"
        value={draft.assignment[ability] === null ? "" : String(draft.assignment[ability])}
        aria-label={t.assign(ABILITY_NAMES[ability])}
        disabled={values.length === 0}
        onchange={(e) => assign(ability, e.currentTarget.value)}
      >
        <option value="">{t.unassigned}</option>
        {#each values as value, i (i)}
          <option value={String(i)} disabled={ABILITIES.some((other) => other !== ability && draft.assignment[other] === i)}>{plain.format(value)}</option>
        {/each}
      </select>
    {/if}
  {/snippet}
</AbilityCards>
<p class="muted small">{t.cap(SCORE_CAP)}</p>

<style>
  .kept {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-3) var(--space-4);
    border-radius: var(--radius-md);
    background: var(--color-surface-sunken);
    font-size: var(--text-sm);
  }

  .method,
  .bonus-row {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    gap: var(--space-3) var(--space-4);
  }

  .method p,
  .bonus-row p {
    padding-bottom: var(--space-2);
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .label-text {
    font-size: var(--text-sm);
    font-weight: var(--weight-semibold);
  }

  fieldset {
    margin: 0;
    padding: 0;
    border: none;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .roll-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(100%, var(--select-width)), 1fr));
    gap: var(--space-2) var(--space-5);
  }

  .roll-list li {
    display: flex;
    align-items: center;
    gap: var(--space-3);
  }

  .dice {
    display: inline-flex;
    gap: var(--space-1);
  }

  .die {
    display: inline-grid;
    place-items: center;
    min-width: var(--control-height-sm);
    height: var(--control-height-sm);
    border: var(--border-width) solid var(--color-border-strong);
    border-radius: var(--radius-sm);
    font-variant-numeric: tabular-nums;
  }

  .die.dropped {
    border-style: dashed;
    color: var(--color-text-muted);
    text-decoration: line-through;
  }

  .score-input {
    width: 100%;
    max-width: calc(var(--control-height) * 2);
    text-align: center;
  }

  .value-select {
    width: 100%;
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
