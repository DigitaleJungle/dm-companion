<script lang="ts">
  import { tick } from "svelte";
  import CampaignSettingsDialog from "$lib/components/CampaignSettingsDialog.svelte";
  import InfoTip from "$lib/components/InfoTip.svelte";
  import EntityPopover from "$lib/components/rules/EntityPopover.svelte";
  import { createCharacter, saveCharacter, type Character, type CharacterCard } from "$lib/api/characters";
  import type { Campaign } from "$lib/api/campaigns";
  import { catalogRows } from "$lib/api/rules";
  import { errorMessage } from "$lib/api/storage";
  import { MAX_LEVEL, gearOf, gearOptions, inSources, lineageTarget, type GearEntry, type GearGroup } from "$lib/characters/rules";
  import { SIZES } from "$lib/rules/format";
  import { campaigns, refreshCampaigns } from "$lib/stores/campaigns.svelte";
  import { refreshRules, rules } from "$lib/stores/rules.svelte";
  import { strings } from "$lib/strings";
  import AbilitiesStep from "./AbilitiesStep.svelte";
  import ChoiceList from "./ChoiceList.svelte";
  import ReviewStep from "./ReviewStep.svelte";
  import SkillsStep from "./SkillsStep.svelte";
  import {
    OPTION_KEYS,
    STEPS,
    backgroundGroups,
    chooseBackground,
    chooseCampaign,
    chooseClass,
    chooseSpecies,
    chooseSubspecies,
    classGroups,
    draft,
    editedCharacter,
    lineagesOf,
    loadCharacter,
    resetDraft,
    sizesOf,
    startingInventory,
    stepComplete,
    subspeciesOf,
    toCharacter,
    type Options,
  } from "./draft.svelte";

  let {
    open = $bindable(false),
    oncreated,
    edit = null,
    onsaved,
    startCampaign = null,
  }: {
    open?: boolean;
    oncreated?: (card: CharacterCard) => void;
    /** Creating from inside a campaign: the new character starts in it. */
    startCampaign?: Campaign | null;
    /** Set to edit a saved character instead of creating one: the wizard opens filled in and saves over it. */
    edit?: { campaign: string | null; character: Character } | null;
    onsaved?: () => void;
  } = $props();

  const t = strings.characters.wizard;
  const e = t.edit;
  const plain = new Intl.NumberFormat();
  const gold = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 });
  const list = new Intl.ListFormat(undefined, { type: "conjunction" });
  const g = t.gear;

  let dialog: HTMLDialogElement | undefined = $state();
  let leaveDialog: HTMLDialogElement | undefined = $state();
  let scroller: HTMLDivElement | undefined = $state();
  let heading: HTMLHeadingElement | undefined = $state();
  let options = $state<Options | null>(null);
  let loadError = $state<string | null>(null);
  let saving = $state(false);
  let saveError = $state<string | null>(null);
  let sourcesOpen = $state(false);

  const step = $derived(STEPS[draft.step]);
  const activeCampaigns = $derived(campaigns.list?.campaigns ?? []);
  const campaign = $derived(activeCampaigns.find((c) => c.id === draft.campaignId) ?? null);
  const sources = $derived(campaign ? campaign.sources : null);
  const allowed = <T extends { source: string }>(rows: T[]) => rows.filter((r) => inSources(r.source, sources));
  const speciesRows = $derived(allowed(options?.species ?? []));
  const classRows = $derived(allowed((options?.classes ?? []).filter((c) => !c.data.isSidekick)));
  const backgroundRows = $derived(allowed(options?.backgrounds ?? []));
  const skills = $derived.by(() => {
    const byKey = new Map<string, { key: string; name: string; ability: string }>();
    for (const row of options?.skills ?? []) byKey.set(row.name.toLowerCase(), { key: row.name.toLowerCase(), name: row.name, ability: String(row.data.ability ?? "") });
    return [...byKey.values()].sort((a, b) => a.name.localeCompare(b.name));
  });
  const complete = $derived(stepComplete(step, options));
  // While editing, "dirty" means the choices differ from the character as it was loaded.
  let loaded = $state<string | null>(null);
  const snapshot = () => JSON.stringify({ ...draft, step: 0, reached: 0 });
  const dirty = $derived(
    edit ? loaded !== null && snapshot() !== loaded : draft.reached > 0 || draft.name.trim() !== "" || draft.player.trim() !== "",
  );

  const lineages = $derived(lineagesOf(draft.species));
  const lineageKey = $derived(lineageTarget(draft.species?.data._versions, draft.species?.data.entries)?.toLowerCase() ?? null);
  const subs = $derived(subspeciesOf(options, draft.species));
  const sizes = $derived(sizesOf(draft.species));
  const hasLead = $derived(sizes.length > 1 || subs.length > 0 || (lineages.length > 0 && !lineageKey));
  const speciesChoices = $derived(lineages.length && lineageKey ? { [lineageKey]: lineageSelect } : {});
  // Starting equipment is chosen when creating; editing leaves the inventory to the sheet.
  const classGear = $derived(edit ? [] : classGroups());
  const backgroundGear = $derived(edit ? [] : backgroundGroups());
  const typeName = (types: string[]) => g.anyOf(types.map((type) => g.types[type] ?? type));
  function gearText(entries: GearEntry[]) {
    const { gear, copper } = gearOf(entries, typeName);
    const parts = [...gear.map((x) => (x.quantity > 1 ? g.count(x.name, plain.format(x.quantity)) : x.name)), ...(copper ? [g.gp(gold.format(copper / 100))] : [])];
    return parts.length ? list.format(parts) : g.nothing;
  }

  async function load() {
    loadError = null;
    try {
      const [species, subspecies, classes, backgrounds, skillRows] = await Promise.all([
        catalogRows("species", OPTION_KEYS.species),
        catalogRows("subspecies", OPTION_KEYS.subspecies),
        catalogRows("class", OPTION_KEYS.class),
        catalogRows("background", OPTION_KEYS.background),
        catalogRows("skill", OPTION_KEYS.skill),
      ]);
      options = { species, subspecies, classes, backgrounds, skills: skillRows };
    } catch (e) {
      loadError = t.loadError(errorMessage(e));
    }
  }

  /** Editing: fill the wizard from the character once the rules data is in. */
  async function fillFromCharacter(target: { campaign: string | null; character: Character }) {
    if (!options) await load();
    if (!options) return;
    loadCharacter(target.character, target.campaign, options);
    loaded = snapshot();
  }

  // Each opening starts a fresh character (or the one being edited); the rules data is loaded once.
  $effect(() => {
    if (open && dialog && !dialog.open) {
      resetDraft();
      loaded = null;
      saveError = null;
      saving = false;
      refreshCampaigns();
      if (!rules.status) refreshRules();
      if (edit) fillFromCharacter(edit);
      else {
        if (startCampaign) chooseCampaign(startCampaign.id, startCampaign.sources);
        if (!options) load();
      }
      dialog.showModal();
    } else if (!open && dialog?.open) {
      dialog.close();
    }
  });

  function requestClose() {
    if (dirty && !saving) leaveDialog?.showModal();
    else open = false;
  }

  function discard() {
    leaveDialog?.close();
    open = false;
  }

  async function goToStep(index: number) {
    draft.step = index;
    draft.reached = Math.max(draft.reached, index);
    await tick();
    scroller?.scrollTo({ top: 0 });
    heading?.focus();
  }

  async function save() {
    saving = true;
    saveError = null;
    try {
      if (edit) {
        await saveCharacter(edit.campaign, edit.character.id, editedCharacter(edit.character));
        open = false;
        onsaved?.();
      } else {
        const card = await createCharacter(draft.campaignId, { ...toCharacter(), ...(await startingInventory(typeName)) });
        open = false;
        oncreated?.(card);
      }
    } catch (err) {
      saveError = (edit ? e.saveError : t.saveError)(errorMessage(err));
    } finally {
      saving = false;
    }
  }
</script>

{#snippet lineageSelect()}
  <label class="inline-field">
    <span class="label-text">{t.pick.lineage} <span class="required" aria-hidden="true">*</span></span>
    <select bind:value={draft.lineage}>
      <option value={null}>{t.pick.choose}</option>
      {#each lineages as l (l)}<option value={l}>{l}</option>{/each}
    </select>
  </label>
{/snippet}

{#snippet gearChooser(origin: string, groups: GearGroup[], picks: (string | null)[])}
  {#each groups as group, i (i)}
    {@const keys = gearOptions(group)}
    {#if keys.length}
      <fieldset class="gear">
        <legend class="label-text">{g.label} <span class="required" aria-hidden="true">*</span></legend>
        {#each keys as key (key)}
          <label class="gear-option">
            <input type="radio" name="gear-{origin}-{i}" checked={picks[i] === key} onchange={() => (picks[i] = key)} />
            <span><b>{g.option(key.toUpperCase())}:</b> {gearText(group[key])}</span>
          </label>
        {/each}
        {#if group._?.length}<p class="muted hint">{g.always(gearText(group._))}</p>{/if}
      </fieldset>
    {:else if group._?.length}
      <p class="muted hint">{g.label}: {gearText(group._)}</p>
    {/if}
  {/each}
{/snippet}

{#snippet classLead()}
  <div class="inline-field">
    <label class="label-text" for="wizard-level">{t.level.label} <span class="required" aria-hidden="true">*</span></label>
    <select id="wizard-level" bind:value={draft.level} aria-describedby={draft.level > 1 ? "wizard-level-later" : undefined}>
      {#each Array.from({ length: MAX_LEVEL }, (_, i) => i + 1) as n (n)}<option value={n}>{plain.format(n)}</option>{/each}
    </select>
    {#if draft.level > 1}<p id="wizard-level-later" class="muted hint">{t.level.later}</p>{/if}
  </div>
  {@render gearChooser("class", classGear, draft.classGear)}
{/snippet}
{#snippet backgroundLead()}{@render gearChooser("background", backgroundGear, draft.backgroundGear)}{/snippet}

{#snippet speciesLead()}
  {#if lineages.length && !lineageKey}{@render lineageSelect()}{/if}
  {#if subs.length}
    <label class="inline-field">
      <span class="label-text">{t.pick.subspecies} <span class="required" aria-hidden="true">*</span></span>
      <select value={draft.subspecies ? String(draft.subspecies.id) : ""} onchange={(e) => chooseSubspecies(subs.find((s) => String(s.id) === e.currentTarget.value) ?? null)}>
        <option value="">{t.pick.choose}</option>
        {#each subs as s (s.id)}<option value={String(s.id)}>{s.name || draft.species?.name} ({s.source})</option>{/each}
      </select>
    </label>
  {/if}
  {#if sizes.length > 1}
    <label class="inline-field">
      <span class="label-text">{t.pick.size} <span class="required" aria-hidden="true">*</span></span>
      <select bind:value={draft.size}>
        <option value={null}>{t.pick.choose}</option>
        {#each sizes as s (s)}<option value={s}>{SIZES[s] ?? s}</option>{/each}
      </select>
    </label>
  {/if}
{/snippet}

<dialog
  bind:this={dialog}
  class="wizard"
  aria-labelledby="wizard-title"
  oncancel={(e) => {
    e.preventDefault();
    requestClose();
  }}
>
  {#if open}
    <header class="top">
      <h1 id="wizard-title">{edit ? e.title : t.title}</h1>
      <button class="icon-btn close" aria-label={t.close} onclick={requestClose}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" /></svg>
      </button>
    </header>

    <nav class="stepper" aria-label={t.stepsLabel}>
      <ol>
        {#each STEPS as s, i (s)}
          <li>
            <button
              class="step"
              class:done={i < draft.step}
              aria-current={i === draft.step ? "step" : undefined}
              disabled={i > draft.reached || !options}
              onclick={() => goToStep(i)}
            >
              <span class="number" aria-hidden="true">{plain.format(i + 1)}</span>
              {t.steps[s]}
            </button>
          </li>
        {/each}
      </ol>
    </nav>

    <div class="scroll" bind:this={scroller}>
      <div class="content">
        <div class="heading-row">
          <h2 bind:this={heading} tabindex="-1">
            <span class="muted">{t.stepOf(plain.format(draft.step + 1), plain.format(STEPS.length))}</span>
            {t.steps[step]}
          </h2>
          {#if options}
            <div class="actions">
              {#if draft.step > 0}<button class="btn" onclick={() => goToStep(draft.step - 1)}>{t.back}</button>{/if}
              {#if step === "review"}
                <button class="btn btn-primary" disabled={!complete || saving} onclick={save}>
                  {saving ? (edit ? e.saving : t.saving) : edit ? e.finish : t.finish}
                </button>
              {:else}
                <button class="btn btn-primary" disabled={!complete} onclick={() => goToStep(draft.step + 1)}>{t.next}</button>
              {/if}
            </div>
          {/if}
        </div>

        {#if saveError}<p class="error" role="alert">{saveError}</p>{/if}

        {#if loadError}
          <div class="error" role="alert"><p>{loadError}</p><button class="btn small" onclick={load}>{strings.characters.retry}</button></div>
        {:else if rules.status && !rules.status.library}
          <p class="note">{t.noRules}</p>
        {:else if !options}
          <p class="muted" role="status">{t.loading}</p>
        {:else}
          {#if campaign && campaign.sources.length === 0 && step !== "basics"}
            <div class="note">
              <p>{t.noSources}</p>
              <button class="btn small" onclick={() => (sourcesOpen = true)}>{t.chooseSources}</button>
            </div>
          {/if}

          {#if edit && (step === "species" || step === "class" || step === "background")}
            <p class="note warning" role="note">{e.warnings[step]}</p>
          {/if}

          <div class="body">
            {#if step === "basics"}
              <div class="fields">
                <label class="field">
                  <span class="label-text">{t.basics.name} <span class="required" aria-hidden="true">*</span></span>
                  <input class="text" bind:value={draft.name} maxlength="100" autocomplete="off" required aria-required="true" />
                </label>
                <label class="field">
                  <span class="label-text">{t.basics.player}</span>
                  <input class="text" bind:value={draft.player} maxlength="100" autocomplete="off" />
                </label>
                <div class="field">
                  <span class="label-row">
                    <label class="label-text" for="wizard-campaign">{t.basics.campaign}</label>
                    <InfoTip id="wizard-campaign-info" label={t.basics.campaignInfoLabel} text={t.basics.campaignInfo} />
                  </span>
                  <select
                    id="wizard-campaign"
                    disabled={!!edit}
                    aria-describedby={edit ? "wizard-campaign-fixed" : undefined}
                    value={draft.campaignId ?? ""}
                    onchange={(e) => {
                      const id = e.currentTarget.value || null;
                      chooseCampaign(id, activeCampaigns.find((c) => c.id === id)?.sources ?? null);
                    }}
                  >
                    <option value="">{t.basics.noCampaign}</option>
                    {#each activeCampaigns as c (c.id)}<option value={c.id}>{c.name}</option>{/each}
                  </select>
                  {#if edit}<p id="wizard-campaign-fixed" class="muted hint">{e.campaignFixed}</p>{/if}
                </div>
              </div>
            {:else if step === "species"}
              <ChoiceList
                id="species"
                label={t.steps.species}
                rows={speciesRows}
                selected={draft.species}
                onselect={chooseSpecies}
                lead={hasLead ? speciesLead : undefined}
                choices={speciesChoices}
              />
            {:else if step === "class"}
              <ChoiceList id="class" label={t.steps.class} rows={classRows} selected={draft.cls} onselect={chooseClass} lead={classLead} />
            {:else if step === "background"}
              <ChoiceList
                id="background"
                label={t.steps.background}
                rows={backgroundRows}
                selected={draft.background}
                onselect={chooseBackground}
                lead={backgroundGear.length ? backgroundLead : undefined}
              />
            {:else if step === "abilities"}
              <AbilitiesStep />
            {:else if step === "skills"}
              <SkillsStep {skills} />
            {:else}
              <ReviewStep {skills} campaignName={campaign?.name ?? strings.characters.noCampaign} />
            {/if}
          </div>
        {/if}
      </div>
    </div>

    <EntityPopover />
  {/if}

  <dialog bind:this={leaveDialog} class="leave" aria-labelledby="leave-title">
    <h2 id="leave-title">{t.leaveTitle}</h2>
    <p>{t.leaveBody}</p>
    <div class="leave-actions">
      <button class="btn" onclick={() => leaveDialog?.close()}>{t.keepEditing}</button>
      <button class="btn btn-danger" onclick={discard}>{t.discard}</button>
    </div>
  </dialog>
</dialog>

{#if open && campaign}<CampaignSettingsDialog campaignId={campaign.id} bind:open={sourcesOpen} />{/if}

<style>
  .wizard {
    width: min(100% - 2 * var(--space-4), var(--content-max-width));
    height: min(100% - 2 * var(--space-4), 90vh);
    max-width: none;
    max-height: none;
    padding: 0;
    border: var(--border-width) solid var(--color-border);
    border-radius: var(--radius-lg);
    background: var(--color-bg);
    color: var(--color-text);
    overflow: hidden;
  }

  .wizard[open] {
    display: flex;
    flex-direction: column;
  }

  .wizard::backdrop,
  .leave::backdrop {
    background: var(--color-backdrop);
  }

  .top {
    flex: none;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-4);
    padding: var(--space-3) var(--space-5);
    background: var(--color-surface);
  }

  .top h1 {
    font-size: var(--text-md);
    font-weight: var(--weight-semibold);
  }

  .close svg {
    width: var(--icon-size);
    height: var(--icon-size);
  }

  .stepper {
    flex: none;
    padding: 0 var(--space-5) var(--space-3);
    border-bottom: var(--border-width) solid var(--color-border);
    background: var(--color-surface);
  }

  .stepper ol {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: var(--space-1) var(--space-2);
  }

  .step {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-3);
    border: none;
    border-radius: var(--radius-md);
    background: transparent;
    color: var(--color-text-muted);
    font-size: var(--text-sm);
    white-space: nowrap;
    cursor: pointer;
  }

  .step:disabled {
    cursor: default;
    opacity: 0.6;
  }

  .step:not(:disabled):hover {
    background: var(--color-surface-sunken);
  }

  .step[aria-current="step"] {
    background: var(--color-accent-soft);
    color: var(--color-link);
    font-weight: var(--weight-semibold);
  }

  .number {
    display: inline-grid;
    place-items: center;
    width: var(--control-height-sm);
    height: var(--control-height-sm);
    border: var(--border-width) solid currentColor;
    border-radius: 50%;
    font-size: var(--text-xs);
  }

  .done .number {
    border-color: var(--color-link);
    background: var(--color-accent-soft);
    color: var(--color-link);
  }

  .scroll {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
  }

  .content {
    width: min(100%, var(--wizard-content-width));
    margin: 0 auto;
    padding: var(--space-5);
    display: flex;
    flex-direction: column;
    gap: var(--space-5);
  }

  .heading-row {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    justify-content: space-between;
    gap: var(--space-3);
  }

  .heading-row h2 {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    font-size: var(--text-xl);
    font-weight: var(--weight-bold);
    letter-spacing: var(--tracking-tight);
  }

  .heading-row h2 .muted {
    font-size: var(--text-sm);
    font-weight: var(--weight-regular);
    letter-spacing: normal;
  }

  .heading-row h2:focus {
    outline: none;
  }

  .actions {
    display: flex;
    gap: var(--space-2);
  }

  .body {
    display: flex;
    flex-direction: column;
    gap: var(--space-5);
    padding: var(--space-5);
    border: var(--border-width) solid var(--color-border);
    border-radius: var(--radius-lg);
    background: var(--color-surface);
  }

  .fields {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    width: min(100%, var(--dialog-width));
  }

  .field,
  .inline-field {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .inline-field {
    align-items: flex-start;
  }

  .gear {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    margin: 0;
    padding: 0;
    border: none;
  }

  .gear legend {
    margin-bottom: var(--space-1);
  }

  .gear-option {
    display: flex;
    align-items: baseline;
    gap: var(--space-2);
    font-size: var(--text-sm);
    cursor: pointer;
  }

  .inline-field select {
    width: min(100%, var(--select-width));
  }

  .label-row {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
  }

  .label-text {
    font-size: var(--text-sm);
    font-weight: var(--weight-semibold);
  }

  .wizard :global(input.text),
  .wizard :global(select),
  .wizard :global(input[type="number"]) {
    min-height: var(--control-height);
    padding: 0 var(--space-3);
    border: var(--border-width) solid var(--color-border-strong);
    border-radius: var(--radius-md);
    background: var(--color-surface);
    color: var(--color-text);
    font-size: var(--text-md);
  }

  .wizard :global(select) {
    cursor: pointer;
  }

  .note,
  .error {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-3) var(--space-4);
    border-radius: var(--radius-md);
    font-size: var(--text-sm);
  }

  .note {
    background: var(--color-surface-sunken);
  }

  /* Editing: what changing this step does to the rest of the character. */
  .note.warning {
    border-left: calc(3 * var(--border-width)) solid var(--color-inspiration-strong);
  }

  .hint {
    font-size: var(--text-xs);
  }

  .error {
    background: var(--color-danger-soft);
    color: var(--color-danger);
  }

  .muted {
    color: var(--color-text-muted);
  }

  .leave {
    width: min(100% - 2 * var(--space-4), var(--dialog-width));
    padding: var(--space-6);
    border: var(--border-width) solid var(--color-border);
    border-radius: var(--radius-lg);
    background: var(--color-surface);
    color: var(--color-text);
  }

  .leave h2 {
    font-size: var(--text-lg);
    font-weight: var(--weight-semibold);
  }

  .leave p {
    margin: var(--space-2) 0 var(--space-5);
    color: var(--color-text-muted);
  }

  .leave-actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-2);
  }

  @media (max-width: 720px) {
    .content,
    .body {
      padding: var(--space-4);
    }
  }
</style>
