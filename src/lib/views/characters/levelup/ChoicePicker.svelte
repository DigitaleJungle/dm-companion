<script lang="ts" module>
  import type { CatalogRow } from "$lib/api/rules";
  import type { Lookup, SpellFilter } from "$lib/characters/choices";
  import type { PickItem } from "./PickList.svelte";

  /** What every choice picks from, given once by the dialog that shows it. */
  export type ChoiceContext = {
    find: Lookup;
    /** Items for a pool ("skill", "tool", "artisan", "instrument", "language", "standard"), keyed "kind:name". */
    poolItems: (pool: string) => PickItem[];
    /** A named key ("skill:arcana", "tool:smith's tools") as an item. */
    namedItem: (key: string) => PickItem;
    /** Proficient skills and skills with expertise so far (keys). */
    proficient: string[];
    expertise: string[];
    /** Spells to learn that a filter allows. */
    spellItems: (filter: SpellFilter) => PickItem[];
    /** Known spells a filter allows (the target of Agonizing Blast). */
    targetItems: (filter: SpellFilter) => PickItem[];
    /** Feats of these categories the character may take now. */
    featCandidates: (categories: string[]) => Candidate[];
  };
  export type Candidate = { row: CatalogRow; check: boolean; disabled?: boolean };
</script>

<script lang="ts">
  import Self from "./ChoicePicker.svelte";
  import Entries from "$lib/components/rules/Entries.svelte";
  import { getEntity } from "$lib/api/rules";
  import { errorMessage } from "$lib/api/storage";
  import { emptyChoice, entryChoices, featSlots, refKey, type Entry, type SavedChoice } from "$lib/characters/choices";
  import { ABILITY_NAMES } from "$lib/rules/format";
  import { emptyPick } from "$lib/characters/rules";
  import { sourceName } from "$lib/stores/rules.svelte";
  import { strings } from "$lib/strings";
  import PickList from "./PickList.svelte";

  // One pick and everything it asks in turn: a dropdown of candidates (or a fixed entry, like a species), its rules
  // text, then its sub-choices — ability increase, skills/tools/languages, saving throw, expertise, spells, the known
  // spell it applies to, and feats it grants (each a picker of its own).
  let {
    id,
    label,
    level,
    candidates = null,
    entry = null,
    pick = $bindable(),
    ctx,
    preset = null,
    showText = true,
  }: {
    id: string;
    label?: string;
    level: number;
    /** A dropdown of these; null for a fixed `entry`. */
    candidates?: Candidate[] | null;
    entry?: Entry | null;
    pick: SavedChoice;
    ctx: ChoiceContext;
    /** Preselects the spell option with this name ("Drow", "Wizard Spells") and hides the option choice. */
    preset?: string | null;
    showText?: boolean;
  } = $props();

  const t = strings.characters.levelUpDialog;
  let text = $state<unknown>(null);
  let textError = $state<string | null>(null);

  const row = $derived(candidates ? (pick.ref ? (candidates.find((c) => refKey(c.row) === refKey(pick.ref!))?.row ?? null) : null) : null);
  const current = $derived<Entry | null>(candidates ? row : entry);
  const choices = $derived(current ? entryChoices(current.data, level) : null);
  // "Drow Lineage" picks the "Drow" option, "Wizard" the "Wizard Spells" one.
  const presetGrant = $derived.by(() => {
    const p = preset?.toLowerCase();
    if (!p || !choices) return -1;
    return choices.spells.findIndex((g) => g.name.toLowerCase().includes(p) || p.includes(g.name.toLowerCase()));
  });
  const grant = $derived(choices?.spells[pick.grant] ?? null);
  const bonusOption = $derived(choices?.bonus[pick.bonus.option] ?? null);
  const slots = $derived(choices ? featSlots(choices) : []);

  // The preset spell option (an Elf's lineage, Magic Initiate's class from the background) is taken as given.
  $effect(() => {
    if (presetGrant >= 0 && pick.grant !== presetGrant) pick.grant = presetGrant;
  });
  // Every feat it grants gets an empty pick to fill in.
  $effect(() => {
    if (slots.length !== pick.feats.length) pick.feats = slots.map((_, i) => pick.feats[i] ?? emptyChoice());
  });

  function choose(value: string) {
    const found = candidates?.find((c) => refKey(c.row) === value)?.row ?? null;
    const next = emptyChoice(found ? { name: found.name, source: found.source } : null);
    next.bonus = emptyPick(found ? entryChoices(found.data, level).bonus[0] : undefined);
    pick = next;
  }

  // The picked entry's rules text (a fixed entry's text is shown by the page around it).
  $effect(() => {
    const r = row;
    text = null;
    textError = null;
    if (r && showText) getEntity(r.id).then((e) => (text = e?.data.entries ?? null)).catch((e) => (textError = errorMessage(e)));
  });

  const profItems = (i: number) => {
    const p = choices!.profs[i];
    const items = [...p.from.map(ctx.namedItem), ...p.pools.flatMap(ctx.poolItems)];
    // Skills already proficient elsewhere aren't offered again (unless picked here).
    return [...new Map(items.map((it) => [it.key, it])).values()].filter((it) => !it.key.startsWith("skill:") || !ctx.proficient.includes(it.key.slice(6)) || (pick.profs[i] ?? []).includes(it.key));
  };
  const pickedSkills = $derived(pick.profs.flat().filter((k) => k.startsWith("skill:")).map((k) => k.slice(6)));
  const expertiseItems = $derived(
    ctx.poolItems("skill")
      .map((it) => ({ ...it, key: it.key.slice(6) }))
      .filter((it) => [...ctx.proficient, ...pickedSkills].includes(it.key) && (!ctx.expertise.includes(it.key) || pick.expertise.includes(it.key))),
  );
  const saveItems = $derived((choices?.saves ?? []).flatMap((s) => s.from).map((a) => ({ key: a, name: ABILITY_NAMES[a] })));
  const bonusLabel = (amounts: number[]) => t.bonusOption(amounts.map((a) => `+${a}`).join(" / "));
</script>

<div class="choice">
  {#if candidates}
    <label class="field">
      {#if label}<span class="label-text">{label} <span class="required" aria-hidden="true">*</span></span>{/if}
      <select value={pick.ref ? refKey(pick.ref) : ""} onchange={(e) => choose(e.currentTarget.value)} aria-label={label ? undefined : t.choose}>
        <option value="">{t.choose}</option>
        {#each candidates as c (c.row.id)}
          <option value={refKey(c.row)} disabled={c.disabled && refKey(c.row) !== (pick.ref ? refKey(pick.ref) : "")}>
            {c.row.name}{c.check ? ` ${t.checkPrereq}` : ""} · {sourceName(c.row.source)}
          </option>
        {/each}
      </select>
    </label>
  {/if}

  {#if candidates && pick.ref && !row}
    <p class="error" role="alert">{t.featMissing(pick.ref.name)}</p>
  {:else if current && choices}
    {#if candidates && showText}
      <div class="text">
        {#if textError}<p class="error" role="alert">{textError}</p>{:else if text}<Entries entry={text} depth={4} />{:else}<p class="muted">{t.loading}</p>{/if}
      </div>
    {/if}

    {#if choices.target}
      <label class="field">
        <span class="label-text">{t.target} <span class="required" aria-hidden="true">*</span></span>
        <select value={pick.target ?? ""} onchange={(e) => (pick.target = e.currentTarget.value || null)}>
          <option value="">{t.choose}</option>
          {#each ctx.targetItems(choices.target) as it (it.key)}<option value={it.key}>{it.name}</option>{/each}
        </select>
        {#if ctx.targetItems(choices.target).length === 0}<span class="muted">{t.noTarget}</span>{/if}
      </label>
    {/if}

    {#if choices.bonus.length}
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
                  const picks = (bonusOption?.choices ?? []).map((ch, i) => ch.amounts.map((_, j) => pick.bonus.picks[i]?.[j] ?? null));
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

    {#each choices.profs as p, i (i)}
      <PickList id="{id}-prof-{i}" label={t.proficiencies} items={profItems(i)} max={p.count} bind:selected={() => pick.profs[i] ?? [], (v) => (pick.profs[i] = v)} />
    {/each}
    {#if saveItems.length}
      <PickList id="{id}-saves" label={t.savingThrow} items={saveItems} max={choices.saves.reduce((n, s) => n + s.count, 0)} bind:selected={pick.saves} />
    {/if}
    {#if choices.expertise > 0}
      <PickList id="{id}-expertise" label={t.expertise} items={expertiseItems} max={choices.expertise} bind:selected={pick.expertise} />
    {/if}

    {#if choices.spells.length > 1 && presetGrant < 0}
      <label class="field">
        <span class="label-text">{t.spellOption}</span>
        <select value={String(pick.grant)} onchange={(e) => ((pick.grant = Number(e.currentTarget.value)), (pick.spells = []))}>
          {#each choices.spells as g, i (i)}<option value={String(i)}>{g.name}</option>{/each}
        </select>
      </label>
    {/if}
    {#if grant}
      {#if grant.fixed.length}
        <p class="muted">
          {t.alsoLearn(grant.fixed.map((s) => (s.atLevel > 1 ? t.atLevel(s.name.replace(/\b\w/g, (c) => c.toUpperCase()), String(s.atLevel)) : s.name.replace(/\b\w/g, (c) => c.toUpperCase()))).join(", "))}
        </p>
      {/if}
      {#each grant.choose as c, i (`${pick.grant}-${i}`)}
        <PickList
          id="{id}-spells-{i}"
          label={c.filter.levels.includes(0) ? t.cantrips : t.spells}
          items={ctx.spellItems(c.filter)}
          max={c.count}
          bind:selected={() => pick.spells[i] ?? [], (v) => (pick.spells[i] = v)}
        />
      {/each}
    {/if}

    {#each slots as categories, i (i)}
      {#if pick.feats[i]}
        <div class="nested">
          <Self id="{id}-feat-{i}" label={t.feat} {level} candidates={ctx.featCandidates(categories)} bind:pick={pick.feats[i]} {ctx} />
        </div>
      {/if}
    {/each}
  {/if}
</div>

<style>
  .choice {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    min-width: 0;
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

  /* A feat granted by this pick: indented under it. */
  .nested {
    padding-left: var(--space-4);
    border-left: calc(2 * var(--border-width)) solid var(--color-border);
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
