<script lang="ts">
  import Entries from "$lib/components/rules/Entries.svelte";
  import { getEntity, type CatalogRow } from "$lib/api/rules";
  import { errorMessage } from "$lib/api/storage";
  import { emptyPick } from "$lib/characters/rules";
  import { featChoices, refKey, type SavedFeat, type SpellFilter } from "$lib/characters/levelup";
  import { ABILITY_NAMES } from "$lib/rules/format";
  import { sourceName } from "$lib/stores/rules.svelte";
  import { strings } from "$lib/strings";
  import PickList, { type PickItem } from "./PickList.svelte";

  // One feat decision: which feat (ASI first), its text, then what the feat itself asks for.
  let {
    id,
    candidates,
    pick = $bindable(),
    level,
    skills,
    proficient,
    expertise,
    spellItems,
  }: {
    id: string;
    /** Feats the character may take here, `check` when a prerequisite needs the DM. */
    candidates: { row: CatalogRow; check: boolean }[];
    pick: SavedFeat;
    level: number;
    skills: { key: string; name: string }[];
    proficient: string[];
    expertise: string[];
    /** The spells a filter allows, as pickable items keyed "name|source". */
    spellItems: (filter: SpellFilter) => PickItem[];
  } = $props();

  const t = strings.characters.levelUpDialog;
  let text = $state<unknown>(null);
  let textError = $state<string | null>(null);
  // The picked feat's full catalog row (its choices come from the rules data, the pick keeps only its name and book).
  const row = $derived(pick.feat ? (candidates.find((c) => refKey(c.row) === refKey(pick.feat!))?.row ?? null) : null);
  const choices = $derived(row ? featChoices(row, level) : null);
  const grant = $derived(choices?.spells[pick.grant] ?? null);
  const bonusOption = $derived(choices?.bonus[pick.bonus.option] ?? null);

  function choose(value: string) {
    const found = candidates.find((c) => refKey(c.row) === value)?.row ?? null;
    pick.feat = found ? { name: found.name, source: found.source } : null;
    pick.bonus = emptyPick(found ? featChoices(found, level).bonus[0] : undefined);
    pick.skills = [];
    pick.expertise = [];
    pick.grant = 0;
    pick.spells = [];
  }

  // The feat's rules text, also for a feat that was already picked when the level opened.
  $effect(() => {
    const r = row;
    text = null;
    textError = null;
    if (r) getEntity(r.id).then((e) => (text = e?.data.entries ?? null)).catch((e) => (textError = errorMessage(e)));
  });

  function chooseGrant(index: number) {
    pick.grant = index;
    pick.spells = [];
  }

  const skillChoiceItems = $derived.by((): PickItem[] => {
    const from = choices?.skills.choices.flatMap((c) => c.from ?? skills.map((s) => s.key)) ?? [];
    return skills.filter((s) => from.includes(s.key) && (!proficient.includes(s.key) || pick.skills.includes(s.key))).map((s) => ({ key: s.key, name: s.name }));
  });
  const skillCount = $derived(choices?.skills.choices.reduce((n, c) => n + c.count, 0) ?? 0);
  const expertiseItems = $derived(
    skills.filter((s) => [...proficient, ...pick.skills].includes(s.key) && (!expertise.includes(s.key) || pick.expertise.includes(s.key))).map((s) => ({ key: s.key, name: s.name })),
  );
  const bonusLabel = (amounts: number[]) => t.bonusOption(amounts.map((a) => `+${a}`).join(" / "));
</script>

<div class="feat">
  <label class="field">
    <span class="label-text">{t.feat} <span class="required" aria-hidden="true">*</span></span>
    <select value={pick.feat ? refKey(pick.feat) : ""} onchange={(e) => choose(e.currentTarget.value)}>
      <option value="">{t.chooseFeat}</option>
      {#each candidates as c (c.row.id)}
        <option value={refKey(c.row)}>{c.row.name}{c.check ? ` ${t.checkPrereq}` : ""} · {sourceName(c.row.source)}</option>
      {/each}
    </select>
  </label>

  {#if pick.feat && !row}
    <p class="error" role="alert">{t.featMissing(pick.feat.name)}</p>
  {:else if pick.feat}
    <div class="text">
      {#if textError}<p class="error" role="alert">{textError}</p>{:else if text}<Entries entry={text} depth={4} />{:else}<p class="muted">{t.loading}</p>{/if}
    </div>

    {#if choices && choices.bonus.length}
      <div class="row">
        {#if choices.bonus.length > 1}
          <label class="field">
            <span class="label-text">{t.bonus}</span>
            <select value={String(pick.bonus.option)} onchange={(e) => (pick.bonus = emptyPick(choices.bonus[Number(e.currentTarget.value)], Number(e.currentTarget.value)))}>
              {#each choices.bonus as o, i (i)}<option value={String(i)}>{bonusLabel(o.choices.flatMap((c) => c.amounts))}</option>{/each}
            </select>
          </label>
        {/if}
        {#each bonusOption?.choices ?? [] as choice, ci (ci)}
          {#each choice.amounts as amount, ai (ai)}
            <label class="field">
              <span class="label-text">{t.raise(`+${amount}`)}</span>
              <select
                value={pick.bonus.picks[ci]?.[ai] ?? ""}
                onchange={(e) => {
                  const picks = pick.bonus.picks.map((p) => [...p]);
                  picks[ci][ai] = (e.currentTarget.value || null) as never;
                  pick.bonus = { ...pick.bonus, picks };
                }}
              >
                <option value="">{t.chooseAbility}</option>
                {#each choice.from as ability (ability)}
                  <option value={ability} disabled={pick.bonus.picks[ci]?.some((p, j) => p === ability && j !== ai)}>{ABILITY_NAMES[ability]}</option>
                {/each}
              </select>
            </label>
          {/each}
        {/each}
      </div>
    {/if}

    {#if skillCount > 0}
      <PickList id="{id}-skills" label={t.skills} items={skillChoiceItems} max={skillCount} bind:selected={pick.skills} />
    {/if}
    {#if choices && choices.expertise > 0}
      <PickList id="{id}-expertise" label={t.expertise} items={expertiseItems} max={choices.expertise} bind:selected={pick.expertise} />
    {/if}

    {#if choices && choices.spells.length > 1}
      <label class="field">
        <span class="label-text">{t.spellOption}</span>
        <select value={String(pick.grant)} onchange={(e) => chooseGrant(Number(e.currentTarget.value))}>
          {#each choices.spells as g, i (i)}<option value={String(i)}>{g.name}</option>{/each}
        </select>
      </label>
    {/if}
    {#if grant}
      {#if grant.fixed.length}<p class="muted">{t.alsoLearn(grant.fixed.map((s) => s.name.replace(/\b\w/g, (c) => c.toUpperCase())).join(", "))}</p>{/if}
      {#each grant.choose as c, i (`${pick.grant}-${i}`)}
        <PickList
          id="{id}-spells-{i}"
          label={c.filter.levels.includes(0) ? t.cantrips : t.spells}
          items={spellItems(c.filter)}
          max={c.count}
          bind:selected={() => pick.spells[i] ?? [], (v) => (pick.spells[i] = v)}
        />
      {/each}
    {/if}
  {/if}
</div>

<style>
  .feat {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  .field {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-1);
  }

  .field select {
    width: min(100%, var(--select-width));
  }

  .label-text {
    font-size: var(--text-sm);
    font-weight: var(--weight-semibold);
  }

  .row {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-4);
  }

  .text {
    padding: var(--space-3) var(--space-4);
    border-left: calc(3 * var(--border-width)) solid var(--color-border-strong);
    font-size: var(--text-sm);
  }

  .text :global(p) {
    margin-bottom: var(--space-2);
  }

  .muted {
    color: var(--color-text-muted);
    font-size: var(--text-sm);
  }

  .error {
    color: var(--color-danger);
    font-size: var(--text-sm);
  }
</style>
