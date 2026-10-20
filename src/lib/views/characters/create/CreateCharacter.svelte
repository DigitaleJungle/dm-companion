<script lang="ts">
  import { onMount, tick } from "svelte";
  import { beforeNavigate, goto } from "$app/navigation";
  import CampaignSettingsDialog from "$lib/components/CampaignSettingsDialog.svelte";
  import EntityPopover from "$lib/components/rules/EntityPopover.svelte";
  import { createCharacter } from "$lib/api/characters";
  import { catalogRows } from "$lib/api/rules";
  import { errorMessage } from "$lib/api/storage";
  import { inSources } from "$lib/characters/rules";
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
    chooseBackground,
    chooseCampaign,
    chooseClass,
    chooseSpecies,
    chooseSubspecies,
    created,
    draft,
    lineagesOf,
    resetDraft,
    sizesOf,
    stepComplete,
    subspeciesOf,
    toCharacter,
    type Options,
  } from "./draft.svelte";

  const t = strings.characters.wizard;
  const plain = new Intl.NumberFormat();

  let options = $state<Options | null>(null);
  let loadError = $state<string | null>(null);
  let saving = $state(false);
  let saveError = $state<string | null>(null);
  let saved = false;
  let heading: HTMLHeadingElement | undefined = $state();
  let leaveDialog: HTMLDialogElement | undefined = $state();
  let pendingUrl: string | null = null;
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
  const dirty = $derived(draft.reached > 0 || draft.name.trim() !== "" || draft.player.trim() !== "");

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

  onMount(() => {
    resetDraft();
    refreshCampaigns();
    if (!rules.status) refreshRules();
    load();
  });

  async function goToStep(index: number) {
    draft.step = index;
    draft.reached = Math.max(draft.reached, index);
    await tick();
    heading?.focus();
    window.scrollTo({ top: 0 });
  }

  async function save() {
    saving = true;
    saveError = null;
    try {
      const card = await createCharacter(draft.campaignId, toCharacter());
      saved = true;
      created.name = card.name;
      await goto("/characters");
    } catch (e) {
      saveError = t.saveError(errorMessage(e));
      saving = false;
    }
  }

  beforeNavigate(({ to, cancel }) => {
    if (saved || !dirty || !to) return;
    cancel();
    pendingUrl = to.url.pathname + to.url.search;
    leaveDialog?.showModal();
  });

  function discard() {
    leaveDialog?.close();
    saved = true;
    if (pendingUrl) goto(pendingUrl);
  }
</script>

<div class="wizard">
  <header class="top">
    <a class="btn back" href="/characters">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" /></svg>
      {t.cancel}
    </a>
    <h1>{t.title}</h1>
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

  <main>
    <h2 bind:this={heading} tabindex="-1">
      <span class="muted">{t.stepOf(plain.format(draft.step + 1), plain.format(STEPS.length))}</span>
      {t.steps[step]}
    </h2>

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

      <div class="body">
        {#if step === "basics"}
          <div class="fields">
            <label class="field">
              <span class="label-text">{t.basics.name}</span>
              <input class="text" bind:value={draft.name} maxlength="100" autocomplete="off" required />
            </label>
            <label class="field">
              <span class="label-text">{t.basics.player} <span class="muted">({t.basics.playerHint})</span></span>
              <input class="text" bind:value={draft.player} maxlength="100" autocomplete="off" />
            </label>
            <label class="field">
              <span class="label-text">{t.basics.campaign}</span>
              <select
                value={draft.campaignId ?? ""}
                onchange={(e) => {
                  const id = e.currentTarget.value || null;
                  chooseCampaign(id, activeCampaigns.find((c) => c.id === id)?.sources ?? null);
                }}
              >
                <option value="">{t.basics.noCampaign}</option>
                {#each activeCampaigns as c (c.id)}<option value={c.id}>{c.name}</option>{/each}
              </select>
              {#if campaign}<span class="muted small">{t.basics.campaignHint}</span>{/if}
            </label>
          </div>
        {:else if step === "species"}
          {@const lineages = lineagesOf(draft.species)}
          {@const subs = subspeciesOf(options, draft.species)}
          {@const sizes = sizesOf(draft.species)}
          <ChoiceList id="species" label={t.steps.species} rows={speciesRows} selected={draft.species} onselect={chooseSpecies}>
            {#if lineages.length}
              <label class="field">
                <span class="label-text">{t.pick.lineage}</span>
                <select bind:value={draft.lineage}>
                  <option value={null}>{t.pick.choose}</option>
                  {#each lineages as l (l)}<option value={l}>{l}</option>{/each}
                </select>
              </label>
            {/if}
            {#if subs.length}
              <label class="field">
                <span class="label-text">{t.pick.subspecies}</span>
                <select value={draft.subspecies?.id ?? ""} onchange={(e) => chooseSubspecies(subs.find((s) => String(s.id) === e.currentTarget.value) ?? null)}>
                  <option value="">{t.pick.choose}</option>
                  {#each subs as s (s.id)}<option value={String(s.id)}>{s.name || draft.species?.name} ({s.source})</option>{/each}
                </select>
              </label>
            {/if}
            {#if sizes.length > 1}
              <label class="field">
                <span class="label-text">{t.pick.size}</span>
                <select bind:value={draft.size}>
                  <option value={null}>{t.pick.choose}</option>
                  {#each sizes as s (s)}<option value={s}>{SIZES[s] ?? s}</option>{/each}
                </select>
              </label>
            {/if}
          </ChoiceList>
        {:else if step === "class"}
          <ChoiceList id="class" label={t.steps.class} rows={classRows} selected={draft.cls} onselect={chooseClass} />
        {:else if step === "background"}
          <ChoiceList id="background" label={t.steps.background} rows={backgroundRows} selected={draft.background} onselect={chooseBackground} />
        {:else if step === "abilities"}
          <AbilitiesStep />
        {:else if step === "skills"}
          <SkillsStep {skills} />
        {:else}
          <ReviewStep {skills} campaignName={campaign?.name ?? strings.characters.noCampaign} />
        {/if}
      </div>

      {#if saveError}<p class="error" role="alert">{saveError}</p>{/if}

      <div class="actions">
        {#if draft.step > 0}<button class="btn" onclick={() => goToStep(draft.step - 1)}>{t.back}</button>{/if}
        {#if step === "review"}
          <button class="btn btn-primary" disabled={!complete || saving} onclick={save}>{saving ? t.saving : t.finish}</button>
        {:else}
          <button class="btn btn-primary" disabled={!complete} onclick={() => goToStep(draft.step + 1)}>{t.next}</button>
        {/if}
      </div>
    {/if}
  </main>
</div>

<EntityPopover />

<dialog bind:this={leaveDialog} class="leave" aria-labelledby="leave-title">
  <h2 id="leave-title">{t.leaveTitle}</h2>
  <p>{t.leaveBody}</p>
  <div class="actions">
    <button class="btn" onclick={() => leaveDialog?.close()}>{t.keepEditing}</button>
    <button class="btn btn-danger" onclick={discard}>{t.discard}</button>
  </div>
</dialog>

{#if campaign}<CampaignSettingsDialog campaignId={campaign.id} bind:open={sourcesOpen} />{/if}

<style>
  .wizard {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
  }

  .top {
    display: flex;
    align-items: center;
    gap: var(--space-4);
    padding: var(--space-3) var(--space-5);
    border-bottom: var(--border-width) solid var(--color-border);
    background: var(--color-surface);
  }

  .top h1 {
    font-size: var(--text-md);
    font-weight: var(--weight-semibold);
  }

  .back {
    gap: var(--space-1);
    padding-left: var(--space-2);
    color: var(--color-text);
    text-decoration: none;
  }

  .back svg {
    width: var(--icon-size);
    height: var(--icon-size);
  }

  .stepper {
    padding: var(--space-3) var(--space-5);
    border-bottom: var(--border-width) solid var(--color-border);
    background: var(--color-surface);
  }

  .stepper ol {
    list-style: none;
    margin: 0 auto;
    padding: 0;
    width: min(100%, var(--content-max-width));
    display: flex;
    flex-wrap: wrap;
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

  main {
    width: min(100%, var(--content-max-width));
    margin: 0 auto;
    padding: var(--space-6) var(--space-5) var(--space-8);
    display: flex;
    flex-direction: column;
    gap: var(--space-5);
  }

  main h2 {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    font-size: var(--text-xl);
    font-weight: var(--weight-bold);
    letter-spacing: var(--tracking-tight);
  }

  main h2 .muted {
    font-size: var(--text-sm);
    font-weight: var(--weight-regular);
    letter-spacing: normal;
  }

  main h2:focus {
    outline: none;
  }

  .body {
    display: flex;
    flex-direction: column;
    gap: var(--space-5);
  }

  .fields {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    width: min(100%, var(--dialog-width));
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
    min-width: var(--menu-min-width);
    cursor: pointer;
  }

  .actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-2);
    padding-top: var(--space-4);
    border-top: var(--border-width) solid var(--color-border);
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

  .error {
    background: var(--color-danger-soft);
    color: var(--color-danger);
  }

  .muted {
    color: var(--color-text-muted);
  }

  .small {
    font-size: var(--text-sm);
  }

  .leave {
    width: min(100% - 2 * var(--space-4), var(--dialog-width));
    padding: var(--space-6);
    border: var(--border-width) solid var(--color-border);
    border-radius: var(--radius-lg);
    background: var(--color-surface);
    color: var(--color-text);
  }

  .leave::backdrop {
    background: var(--color-backdrop);
  }

  .leave h2 {
    font-size: var(--text-lg);
    font-weight: var(--weight-semibold);
  }

  .leave p {
    margin: var(--space-2) 0 var(--space-5);
    color: var(--color-text-muted);
  }

  .leave .actions {
    padding-top: 0;
    border-top: none;
  }
</style>
