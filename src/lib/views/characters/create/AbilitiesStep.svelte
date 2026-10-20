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
    bonusTotals,
    emptyAssignment,
    emptyPick,
    modifier,
    type Ability,
    type BonusOption,
    type BonusPick,
  } from "$lib/characters/rules";
  import { backgroundBonuses, baseScores, chooseMethod, draft, rolledValues, scores, speciesBonuses, type Method } from "./draft.svelte";

  const t = strings.characters.wizard.abilities;
  const signed = new Intl.NumberFormat(undefined, { signDisplay: "always" });
  const plain = new Intl.NumberFormat();
  const list = new Intl.ListFormat(undefined, { type: "conjunction" });
  const METHODS: Method[] = ["standard", "manual", "roll"];

  let rolling = $state(false);
  let rollError = $state<string | null>(null);

  const values = $derived(draft.method === "standard" ? STANDARD_ARRAY : rolledValues());
  const base = $derived(baseScores());
  const total = $derived(scores());
  const speciesOptions = $derived(speciesBonuses());
  const backgroundOptions = $derived(backgroundBonuses());
  const bonus = $derived.by(() => {
    const s = bonusTotals(speciesOptions, draft.speciesPick);
    const b = bonusTotals(backgroundOptions, draft.backgroundPick);
    return Object.fromEntries(ABILITIES.map((a) => [a, (s[a] ?? 0) + (b[a] ?? 0)])) as Record<Ability, number>;
  });
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

  function chooseOption(key: "species" | "background", options: BonusOption[], index: number) {
    setPick(key, emptyPick(options[index], index));
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

<fieldset class="methods">
  <legend class="label">{t.method}</legend>
  {#each METHODS as method (method)}
    <label class="radio">
      <input type="radio" name="ability-method" checked={draft.method === method} onchange={() => chooseMethod(method)} />
      {t.methods[method]}
    </label>
  {/each}
</fieldset>

{#if draft.method === "roll"}
  <div class="rolls">
    <button class="btn" onclick={roll} disabled={rolling}>{rolling ? t.rolling : draft.rolls.length ? t.reroll : t.roll}</button>
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
  </div>
{:else if draft.method === "standard"}
  <p class="muted">{t.values(list.format(STANDARD_ARRAY.map((v) => plain.format(v))))}</p>
{:else}
  <p class="muted">{t.manualRange(MANUAL_MIN, MANUAL_MAX)}</p>
{/if}

{#each sections as section (section.key)}
  {@const option = section.options[pickFor(section.key).option]}
  <fieldset class="bonuses">
    <legend class="label">{t.bonuses(section.from)}</legend>
    {#if section.options.length > 1}
      <div class="options">
        {#each section.options as option, i (i)}
          <label class="radio">
            <input type="radio" name="{section.key}-bonus-option" checked={pickFor(section.key).option === i} onchange={() => chooseOption(section.key, section.options, i)} />
            {optionLabel(option)}
          </label>
        {/each}
      </div>
    {/if}
    {#if option}
      {#if Object.keys(option.fixed).length}
        <p class="muted">{t.fixed(Object.entries(option.fixed).map(([a, n]) => `${ABILITY_NAMES[a]} ${signed.format(n)}`).join(", "))}</p>
      {/if}
      {#each option.choices as choice, c (c)}
        <div class="picks">
          {#each choice.amounts as amount, slot (slot)}
            <label>
              <span class="small">{t.pickFor(signed.format(amount))}</span>
              <select value={pickFor(section.key).picks[c]?.[slot] ?? ""} onchange={(e) => pickAbility(section.key, c, slot, e.currentTarget.value)}>
                <option value="">{t.unassigned}</option>
                {#each choice.from as ability (ability)}
                  <option value={ability}>{ABILITY_NAMES[ability]}</option>
                {/each}
              </select>
            </label>
          {/each}
        </div>
        {#if duplicate(pickFor(section.key).picks[c])}<p class="error" role="alert">{t.differentAbilities}</p>{/if}
      {/each}
    {/if}
  </fieldset>
{/each}

<table class="scores">
  <thead>
    <tr>
      <th scope="col"><span class="sr-only">{strings.characters.wizard.review.abilities}</span></th>
      <th scope="col">{t.base}</th>
      <th scope="col">{t.bonus}</th>
      <th scope="col">{t.total}</th>
      <th scope="col">{t.modifier}</th>
    </tr>
  </thead>
  <tbody>
    {#each ABILITIES as ability (ability)}
      <tr>
        <th scope="row">{ABILITY_NAMES[ability]}</th>
        <td>
          {#if draft.method === "manual"}
            <input
              class="score-input"
              type="number"
              min={MANUAL_MIN}
              max={MANUAL_MAX}
              value={draft.manual[ability]}
              aria-label={t.assign(ABILITY_NAMES[ability])}
              onchange={(e) => setManual(ability, e.currentTarget.value)}
            />
          {:else}
            <select
              value={draft.assignment[ability] ?? ""}
              aria-label={t.assign(ABILITY_NAMES[ability])}
              disabled={values.length === 0}
              onchange={(e) => assign(ability, e.currentTarget.value)}
            >
              <option value="">{t.unassigned}</option>
              {#each values as value, i (i)}
                <option value={i} disabled={ABILITIES.some((other) => other !== ability && draft.assignment[other] === i)}>{plain.format(value)}</option>
              {/each}
            </select>
          {/if}
        </td>
        <td>{bonus[ability] ? signed.format(bonus[ability]) : ""}</td>
        <td><strong>{total ? plain.format(total[ability]) : base ? "" : t.unassigned}</strong></td>
        <td>{total ? signed.format(modifier(total[ability])) : ""}</td>
      </tr>
    {/each}
  </tbody>
</table>
<p class="muted small">{t.cap(SCORE_CAP)}</p>

<style>
  fieldset {
    margin: 0;
    padding: 0;
    border: none;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .methods,
  .options {
    flex-direction: row;
    flex-wrap: wrap;
    gap: var(--space-2) var(--space-5);
  }

  .methods legend {
    width: 100%;
    margin-bottom: var(--space-2);
  }

  .radio {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    cursor: pointer;
  }

  .rolls {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-3);
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

  .bonuses {
    padding-top: var(--space-2);
  }

  .picks {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-3);
  }

  .picks label {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .scores {
    width: min(100%, var(--dialog-width));
    border-collapse: collapse;
    font-variant-numeric: tabular-nums;
  }

  .scores th,
  .scores td {
    padding: var(--space-2) var(--space-3);
    border-bottom: var(--border-width) solid var(--color-border);
    text-align: left;
  }

  .scores thead th {
    color: var(--color-text-muted);
    font-size: var(--text-xs);
    font-weight: var(--weight-semibold);
  }

  .scores tbody th {
    font-weight: var(--weight-semibold);
  }

  .score-input {
    width: calc(var(--control-height) * 2);
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
