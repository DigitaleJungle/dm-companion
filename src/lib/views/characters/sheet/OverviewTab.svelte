<script lang="ts">
  import { ABILITIES, checkBonus, modifier, proficiencyBonus, type Ability } from "$lib/characters/rules";
  import { armorClass } from "$lib/characters/sheet";
  import { strings } from "$lib/strings";
  import AbilityCards from "../create/AbilityCards.svelte";
  import type { Sheet } from "./sheet.svelte";

  let { sheet }: { sheet: Sheet } = $props();

  const t = strings.characters.sheet.overview;
  const signed = new Intl.NumberFormat(undefined, { signDisplay: "always" });
  const plain = new Intl.NumberFormat();
  const unknown = strings.characters.sheet.unknown;

  const scores = $derived(sheet.scores);
  const pb = $derived(proficiencyBonus(sheet.level));
  const proficient = $derived(new Set(sheet.character?.skills ?? []));
  const saves = $derived(new Set((sheet.character?.savingThrows ?? []) as Ability[]));
  const skillRows = $derived(
    sheet.skills.map((s) => ({ ...s, proficient: proficient.has(s.key), bonus: scores ? checkBonus(scores[s.ability] ?? 10, proficient.has(s.key), pb) : null })),
  );
  const perception = $derived(skillRows.find((s) => s.key === "perception")?.bonus ?? (scores ? modifier(scores.wis) : null));
  const computedAc = $derived(scores ? armorClass(scores.dex, sheet.character?.inventory ?? []) : null);
  const override = $derived(sheet.character?.acOverride ?? null);
  const speed = $derived.by(() => {
    const raw = sheet.species?.speed;
    const walk = typeof raw === "number" ? raw : (raw as { walk?: number } | undefined)?.walk;
    return typeof walk === "number" ? walk : null;
  });

  function setOverride(value: string) {
    const n = value.trim() === "" ? null : Number(value);
    if (n !== null && (!Number.isInteger(n) || n < 0)) return;
    sheet.change((c) => (c.acOverride = n));
  }
</script>

<dl class="stats">
  <div class="stat">
    <dt>{t.armorClass}</dt>
    <dd class="value">{override ?? (computedAc === null ? unknown : plain.format(computedAc))}</dd>
    <dd class="override">
      <label for="ac-override" class="sr-only">{t.acOverrideLabel}</label>
      <input
        id="ac-override"
        type="text"
        inputmode="numeric"
        placeholder={t.acOverride}
        value={override ?? ""}
        disabled={sheet.readOnly}
        onchange={(e) => setOverride(e.currentTarget.value)}
      />
      {#if override !== null && computedAc !== null}<span class="hint">{t.acComputed(plain.format(computedAc))}</span>{/if}
    </dd>
  </div>
  <div class="stat"><dt>{t.initiative}</dt><dd class="value">{scores ? signed.format(modifier(scores.dex)) : unknown}</dd></div>
  <div class="stat"><dt>{t.speed}</dt><dd class="value">{speed === null ? unknown : t.feet(plain.format(speed))}</dd></div>
  <div class="stat"><dt>{t.proficiency}</dt><dd class="value">{signed.format(pb)}</dd></div>
  <div class="stat"><dt>{t.passivePerception}</dt><dd class="value">{perception === null ? unknown : plain.format(10 + perception)}</dd></div>
</dl>

<section aria-labelledby="overview-abilities">
  <h2 id="overview-abilities" class="label">{t.abilities}</h2>
  <AbilityCards scores={(scores ?? Object.fromEntries(ABILITIES.map((a) => [a, null]))) as Record<Ability, number | null>} {saves} proficiency={pb} />
</section>

<section aria-labelledby="overview-skills">
  <h2 id="overview-skills" class="label">{t.skills}</h2>
  {#if skillRows.length === 0}
    <p class="muted">{unknown}</p>
  {:else}
    <ul class="skills">
      {#each skillRows as skill (skill.key)}
        <li class:on={skill.proficient}>
          <span class="dot" aria-hidden="true"></span>
          <span>{skill.name}</span>
          <span class="bonus">{skill.bonus === null ? unknown : signed.format(skill.bonus)}</span>
          {#if skill.proficient}<span class="sr-only">({t.proficient})</span>{/if}
        </li>
      {/each}
    </ul>
  {/if}
</section>

<style>
  .stats {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(100%, var(--menu-min-width)), 1fr));
    gap: var(--space-3);
    margin: 0;
  }

  .stat {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    padding: var(--space-3);
    border: var(--border-width) solid var(--color-border);
    border-radius: var(--radius-md);
    background: var(--color-surface);
  }

  dt,
  .label {
    color: var(--color-text-muted);
    font-size: var(--text-xs);
    font-weight: var(--weight-semibold);
    letter-spacing: var(--tracking-label);
    text-transform: uppercase;
  }

  dd {
    margin: 0;
  }

  .value {
    font-size: var(--text-xl);
    font-weight: var(--weight-bold);
    font-variant-numeric: tabular-nums;
  }

  .override {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .override input {
    width: 100%;
    min-height: var(--control-height-sm);
    padding: 0 var(--space-2);
    border: var(--border-width) solid var(--color-border-strong);
    border-radius: var(--radius-sm);
    background: var(--color-surface);
    font-size: var(--text-sm);
  }

  .override input::placeholder {
    color: var(--color-text-placeholder);
  }

  .hint {
    color: var(--color-text-muted);
    font-size: var(--text-xs);
  }

  section {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .skills {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(100%, var(--select-width)), 1fr));
    gap: var(--space-1) var(--space-5);
    font-size: var(--text-sm);
  }

  .skills li {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    color: var(--color-text-muted);
  }

  .skills li.on {
    color: var(--color-text);
    font-weight: var(--weight-semibold);
  }

  .dot {
    width: var(--space-2);
    height: var(--space-2);
    border: var(--border-width) solid currentColor;
    border-radius: 50%;
  }

  .on .dot {
    background: currentColor;
  }

  .bonus {
    margin-left: auto;
    font-variant-numeric: tabular-nums;
  }

  .muted {
    color: var(--color-text-muted);
  }
</style>
