<script lang="ts" module>
  /** The character list the sheet was opened from (the app-wide one or a campaign's); kept while switching characters. */
  let backTo = $state("/characters");
</script>

<script lang="ts">
  import { onMount } from "svelte";
  import { afterNavigate, beforeNavigate, goto } from "$app/navigation";
  import Menu, { type MenuItem } from "$lib/components/Menu.svelte";
  import LevelUpDialog from "../levelup/LevelUpDialog.svelte";
  import LevelsDialog from "../levelup/LevelsDialog.svelte";
  import EntityPopover from "$lib/components/rules/EntityPopover.svelte";
  import { enablePreviews } from "$lib/rules/preview.svelte";
  import { MAX_LEVEL } from "$lib/characters/rules";
  import SettingsButton from "$lib/components/SettingsButton.svelte";
  import { listCharacters, type Character, type CharacterCard } from "$lib/api/characters";
  import CreateCharacterDialog from "../create/CreateCharacterDialog.svelte";
  import { rollDice } from "$lib/api/dice";
  import { errorMessage } from "$lib/api/storage";
  import { hitDieFaces, hitDieRoll, longRest, shortRest, takeHealing, TIME_KINDS, type TimeKind } from "$lib/characters/sheet";
  import { inspirationOnLongRest } from "$lib/characters/features";
  import { campaigns, refreshCampaigns } from "$lib/stores/campaigns.svelte";
  import { refreshRules, rules } from "$lib/stores/rules.svelte";
  import { notify } from "$lib/stores/notifications.svelte";
  import { strings } from "$lib/strings";
  import { sheetHref } from "../format";
  import ActionsTab from "./ActionsTab.svelte";
  import FeaturesTab from "./FeaturesTab.svelte";
  import InventoryTab from "./InventoryTab.svelte";
  import SheetHeader from "./SheetHeader.svelte";
  import SpellsTab from "./SpellsTab.svelte";
  import StatsColumn from "./StatsColumn.svelte";
  import { Sheet } from "./sheet.svelte";

  let { campaign, id }: { campaign: string | null; id: string } = $props();

  const t = strings.characters.sheet;
  const plain = new Intl.NumberFormat();
  const TABS = ["actions", "spells", "inventory", "features", "notes"] as const;
  type Tab = (typeof TABS)[number];
  const NOTES = ["personality", "ideals", "bonds", "flaws", "notes"] as const;
  const noteLabel = { personality: t.notes.personality, ideals: t.notes.ideals, bonds: t.notes.bonds, flaws: t.notes.flaws, notes: t.notes.backstory };

  // The route is keyed on campaign and id, so a different character gets a fresh component.
  // svelte-ignore state_referenced_locally
  const sheet = new Sheet(campaign, id);
  // Rule references in feature texts and spell names open a preview card.
  enablePreviews();
  let tab = $state<Tab>("actions");
  // The time filter, shared by the Actions, Spells and Features & traits tabs (kept while switching between them).
  let timeFilter = $state<TimeKind[]>([]);
  let party = $state<CharacterCard[]>([]);
  let rolling = $state(false);

  onMount(() => {
    if (!campaigns.list) refreshCampaigns();
    if (!rules.status) refreshRules();
    sheet.load();
    // The switcher lists the party: this character's campaign, or every character without one.
    listCharacters().then(
      (list) => (party = list.characters.filter((x) => x.campaignId === campaign)),
      () => (party = []), // the switcher is a convenience; the sheet works without it
    );
    return () => void sheet.flush();
  });
  beforeNavigate(() => void sheet.flush());
  afterNavigate(({ from }) => {
    const path = from?.url.pathname;
    if (path && /^(\/campaign\/[^/]+)?\/characters$/.test(path)) backTo = path;
  });

  const c = $derived(sheet.character);
  // Until the party loads, the switcher offers just this character. Last, a new character in the same campaign.
  let creating = $state(false);
  const switchItems = $derived<MenuItem[]>([
    ...(party.length ? party : c ? [{ campaignId: campaign, id, name: c.name }] : []).map((x) => ({
      label: x.name,
      current: x.id === id,
      onselect: () => x.id !== id && goto(sheetHref(x)),
    })),
    // An archived campaign takes no new characters.
    { label: t.newCharacter, disabled: sheet.archived, onselect: () => (creating = true) },
  ]);
  const campaignInfo = $derived(
    campaign === null ? null : [...(campaigns.list?.campaigns ?? []), ...(campaigns.list?.archived ?? [])].find((x) => x.id === campaign) ?? null,
  );
  const sources = $derived(campaign === null ? null : (campaignInfo?.sources ?? []));
  // The switcher is named after the group it switches within: the campaign's party, or the characters without one.
  const partyName = $derived(campaign === null ? t.unassigned : t.party(campaignInfo?.name ?? t.unknown));

  // ---- Rests ----
  const faces = $derived(hitDieFaces(sheet.cls));
  const hitDiceLeft = $derived(Math.max(0, sheet.level - sheet.resources.hitDiceSpent));

  function applyRest(vitals = sheet.vitals, resources = sheet.resources) {
    sheet.change((x) => {
      x.hp = { max: vitals.hp.max, current: vitals.hp.current, temp: vitals.hp.temp };
      x.deathSaves = vitals.deathSaves;
      x.hitDiceSpent = resources.hitDiceSpent;
      x.slotsUsed = resources.slotsUsed;
      x.pactSlotsUsed = resources.pactSlotsUsed;
    });
  }

  async function spendHitDie() {
    const notation = hitDieRoll(faces, sheet.scores?.con ?? 10);
    rolling = true;
    try {
      const roll = await rollDice(notation);
      const healed = Math.max(0, roll.total);
      applyRest(takeHealing(sheet.vitals, healed), { ...sheet.resources, hitDiceSpent: sheet.resources.hitDiceSpent + 1 });
      notify(t.rest.spentHitDie(notation, plain.format(healed)));
    } catch (e) {
      notify(t.rest.rollError(errorMessage(e)));
    } finally {
      rolling = false;
    }
  }

  const shortRestItems = $derived([
    {
      label: faces && hitDiceLeft ? t.rest.spendHitDie(plain.format(hitDiceLeft), plain.format(faces)) : t.rest.noHitDice,
      disabled: sheet.readOnly || !faces || !hitDiceLeft || rolling || sheet.vitals.hp.current >= sheet.vitals.hp.max,
      onselect: spendHitDie,
    },
    {
      label: t.rest.finishShort,
      disabled: sheet.readOnly,
      onselect: () => {
        applyRest(sheet.vitals, shortRest(sheet.resources));
        sheet.restFeatures("short");
        const ended = sheet.endConcentration();
        notify(ended ? `${t.rest.rested.short} ${ended}` : t.rest.rested.short);
      },
    },
  ]);

  // ---- Level up: in the current class, or into a new one ----
  // shortcut: Multiclass does nothing yet; it gets its own brief.
  let levelingUp = $state(false);
  let editingLevels = $state(false);
  // Edit → Character is the creation wizard filled in; Edit → Levels changes what each level picked (view-only when archived).
  const editItems = $derived<MenuItem[]>([
    { label: t.editMenu.character, disabled: sheet.readOnly, onselect: () => startEdit() },
    { label: t.editMenu.levels, onselect: () => (editingLevels = true) },
  ]);
  const levelUpItems = $derived<MenuItem[]>([
    { label: sheet.character?.classes[0]?.name ?? "", disabled: sheet.readOnly || sheet.level >= MAX_LEVEL, onselect: () => (levelingUp = true) },
    { label: t.levelUp.multiclass, disabled: sheet.readOnly || sheet.level >= MAX_LEVEL },
  ]);

  // ---- Edit sheet: the creation wizard, filled in with this character ----
  let editing = $state(false);
  let editTarget = $state<{ campaign: string | null; character: Character } | null>(null);

  async function startEdit() {
    await sheet.flush(); // the wizard starts from what's saved
    if (!sheet.character) return;
    editTarget = { campaign, character: $state.snapshot(sheet.character) as Character };
    editing = true;
  }

  async function onEdited() {
    await sheet.load();
    notify(t.edited(sheet.character?.name ?? ""));
  }

  function takeLongRest() {
    const rested = longRest(sheet.vitals, sheet.resources, sheet.level);
    applyRest(rested.vitals, rested.resources);
    sheet.restFeatures("long");
    // A feature like the Human's Resourceful gives Heroic Inspiration on every long rest.
    const inspiring = sheet.features.cards.find((card) => inspirationOnLongRest(card.text));
    if (inspiring) sheet.change((x) => (x.inspiration = true));
    const ended = sheet.endConcentration();
    notify([t.rest.rested.long, inspiring ? t.rest.inspiration(inspiring.name) : null, ended].filter(Boolean).join(" "));
  }

  function onTabKeydown(event: KeyboardEvent) {
    const at = TABS.indexOf(tab);
    const next = event.key === "ArrowRight" ? TABS[(at + 1) % TABS.length] : event.key === "ArrowLeft" ? TABS[(at - 1 + TABS.length) % TABS.length] : null;
    if (!next) return;
    event.preventDefault();
    tab = next;
    document.getElementById(`sheet-tab-${next}`)?.focus();
  }
</script>

<svelte:window onbeforeunload={() => void sheet.flush()} />

<div class="sheet">
  <header class="top">
    <a class="btn back" href={backTo}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" /></svg>
      {t.back}
    </a>
    {#if c}
      <!-- Same dropdown as the campaign switcher: the name with up/down arrows, a check on this character. -->
      <div class="switcher">
        <Menu id="character-switcher" label={t.switchCharacter(c.name)} align="start" triggerClass="btn switcher-btn" items={switchItems}>
          {#snippet trigger()}
            <span class="switcher-name">{partyName}</span>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 9l4-4 4 4M8 15l4 4 4-4" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" /></svg>
          {/snippet}
        </Menu>
      </div>
      <Menu id="edit-menu" label={t.editMenu.label} align="start" triggerClass="btn" items={editItems}>
        {#snippet trigger()}{t.editMenu.label}{/snippet}
      </Menu>
    {/if}
    {#if c && !sheet.archived}
      <span class="save-state" role="status">
        {#if sheet.save.status === "error"}
          <span class="error-text">{sheet.save.error}</span>
          <button class="btn small" onclick={() => sheet.retry()}>{t.retry}</button>
        {:else}
          {#if sheet.save.status === "saving"}
            <span class="spinner" aria-hidden="true"></span>
          {:else}
            <span class="dot {sheet.save.status}" aria-hidden="true"></span>
          {/if}
          {t.status[sheet.save.status]}
        {/if}
      </span>
    {/if}
    {#if c}
      <span class="spacer"></span>
      <Menu id="short-rest" label={t.rest.short} triggerClass="btn" items={shortRestItems}>
        {#snippet trigger()}{t.rest.short}{/snippet}
      </Menu>
      <button class="btn" disabled={sheet.readOnly} onclick={takeLongRest}>{t.rest.long}</button>
      <Menu id="level-up" label={t.levelUp.label} triggerClass="btn level-up" items={levelUpItems}>
        {#snippet trigger()}
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V5M6 11l6-6 6 6" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round" /></svg>
          {t.levelUp.label}
        {/snippet}
      </Menu>
    {/if}
  </header>

  <main>
    {#if sheet.notFound}
      <div class="empty">
        <p>{t.notFound}</p>
        <a class="btn" href={backTo}>{t.backToList}</a>
      </div>
    {:else if sheet.loadError}
      <div class="error" role="alert">
        <p>{sheet.loadError}</p>
        <button class="btn small" onclick={() => ((sheet.loadError = null), sheet.load())}>{t.retry}</button>
      </div>
    {:else if !c}
      <p class="muted" role="status">{t.loading}</p>
    {:else}
      {#if sheet.archived}<p class="banner" role="note">{t.archived}</p>{/if}
      {#if sheet.rulesError}
        <p class="banner error-text" role="alert">{sheet.rulesError}</p>
      {:else if rules.status && !rules.status.library}
        <p class="banner" role="note">{t.noRules}</p>
      {/if}

      <SheetHeader {sheet} />

      <div class="body">
        <div class="left"><StatsColumn {sheet} /></div>

        <section class="tabs-card">
          <div class="tabs" role="tablist" aria-label={t.tabsLabel} tabindex="-1" onkeydown={onTabKeydown}>
            {#each TABS as name (name)}
              <button
                id="sheet-tab-{name}"
                class="tab"
                role="tab"
                aria-selected={tab === name}
                aria-controls="sheet-panel"
                tabindex={tab === name ? 0 : -1}
                onclick={() => (tab = name)}
              >
                {t.tabs[name]}
              </button>
            {/each}
          </div>

          <!-- Filters the Actions, Spells and Features & traits tabs by when a row is used; none picked shows all. -->
          {#if tab === "actions" || tab === "spells" || tab === "features"}
            <div class="time-filter" role="group" aria-label={t.timeFilter.label}>
              {#each TIME_KINDS as kind (kind)}
                <button
                  type="button"
                  class="chip"
                  aria-pressed={timeFilter.includes(kind)}
                  onclick={() => (timeFilter = timeFilter.includes(kind) ? timeFilter.filter((k) => k !== kind) : [...timeFilter, kind])}
                >
                  {t.timeFilter.kinds[kind]}
                </button>
              {/each}
            </div>
          {/if}

          <div id="sheet-panel" class="panel" role="tabpanel" aria-labelledby="sheet-tab-{tab}">
            {#if tab === "actions"}
              <ActionsTab {sheet} filter={timeFilter} />
            {:else if tab === "spells"}
              <SpellsTab {sheet} filter={timeFilter} />
            {:else if tab === "inventory"}
              <InventoryTab {sheet} {sources} />
            {:else if tab === "features"}
              <FeaturesTab {sheet} filter={timeFilter} />
            {:else}
              <div class="notes">
                {#each NOTES as key (key)}
                  <label class="note-field">
                    <span>{noteLabel[key]}</span>
                    <textarea
                      rows="4"
                      placeholder={t.notes.placeholder}
                      value={c[key] ?? ""}
                      disabled={sheet.readOnly}
                      oninput={(e) => {
                        const value = e.currentTarget.value;
                        sheet.change((x) => (x[key] = value));
                      }}
                    ></textarea>
                  </label>
                {/each}
              </div>
            {/if}
          </div>
        </section>
      </div>
    {/if}
  </main>

  <div class="corner"><SettingsButton /></div>
</div>

<CreateCharacterDialog bind:open={editing} edit={editTarget} onsaved={onEdited} />
<CreateCharacterDialog bind:open={creating} oncreated={(card) => goto(sheetHref(card))} startCampaign={campaignInfo} />
{#if sheet.character}
  <LevelUpDialog bind:open={levelingUp} {sheet} {sources} />
  <LevelsDialog
    bind:open={editingLevels}
    character={sheet.character}
    clsData={sheet.cls}
    skills={sheet.skills}
    {sources}
    readOnly={sheet.readOnly}
    onsave={(next) => sheet.change((x) => Object.assign(x, next))}
  />
{/if}
<EntityPopover />

<style>
  .sheet {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
  }

  .top {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-3) var(--space-5);
    border-bottom: var(--border-width) solid var(--color-border-strong);
    background: var(--color-surface);
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

  .save-state {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    color: var(--color-text-muted);
    font-size: var(--text-sm);
  }

  /* Green when saved, grey while changes wait, a spinner while saving. */
  .dot,
  .spinner {
    flex: none;
    width: var(--space-2);
    height: var(--space-2);
    border-radius: 50%;
  }

  .dot.saved {
    background: var(--color-success);
  }

  .dot.pending {
    background: var(--color-text-muted);
  }

  .spinner {
    width: var(--space-3);
    height: var(--space-3);
    border: calc(2 * var(--border-width)) solid var(--color-border-strong);
    border-top-color: var(--color-text-muted);
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  :global([data-motion="reduce"]) .spinner {
    animation: none;
  }

  .spacer {
    flex: 1;
  }

  /* The sheet's main action: an attractive green button. */
  .top :global(.level-up) {
    gap: var(--space-2);
    min-height: var(--control-height);
    padding: 0 var(--space-5);
    border-color: var(--color-success-fill);
    background: var(--color-success-fill);
    color: var(--color-accent-text);
    font-weight: var(--weight-semibold);
    box-shadow: var(--shadow-card);
  }

  .top :global(.level-up:hover),
  .top :global(.level-up[aria-expanded="true"]) {
    border-color: var(--color-success-fill-hover);
    background: var(--color-success-fill-hover);
  }

  .top :global(.level-up svg) {
    width: var(--icon-size);
    height: var(--icon-size);
  }

  /* Styled like the campaign switcher in the campaign sidebar. */
  .switcher {
    min-width: 0;
    max-width: var(--select-width);
  }

  .switcher :global(.switcher-btn) {
    width: 100%;
    justify-content: space-between;
    gap: var(--space-2);
    color: var(--color-text);
  }

  .switcher :global(.switcher-btn:hover) {
    background: var(--color-surface-sunken);
  }

  .switcher :global(.switcher-btn svg) {
    flex: none;
    width: var(--icon-size);
    height: var(--icon-size);
    color: var(--color-text-muted);
  }

  .switcher-name {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .corner {
    position: fixed;
    left: var(--space-4);
    bottom: var(--space-4);
  }

  main {
    width: min(100%, var(--content-max-width));
    margin: 0 auto;
    padding: var(--space-4) var(--space-5) var(--corner-clearance);
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  .body {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    gap: var(--space-5);
  }

  .left {
    flex: 2 1 calc(25 * var(--space-6));
    min-width: 0;
    max-width: var(--sheet-left-max);
  }

  .tabs-card {
    flex: 999 1 calc(21 * var(--space-6));
    min-width: 0;
    display: flex;
    flex-direction: column;
    border: var(--border-width) solid var(--color-border-strong);
    border-radius: var(--radius-lg);
    background: var(--color-surface);
  }

  .time-filter {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    padding: var(--space-3) var(--space-4) 0;
  }

  .chip {
    min-height: var(--control-height-sm);
    padding: 0 var(--space-3);
    border: var(--border-width) solid var(--color-border-strong);
    border-radius: var(--radius-pill);
    background: var(--color-surface);
    color: var(--color-text);
    font-size: var(--text-xs);
    font-weight: var(--weight-semibold);
    cursor: pointer;
  }

  .chip:hover {
    border-color: var(--color-link);
  }

  .chip[aria-pressed="true"] {
    border-color: var(--color-link);
    background: var(--color-accent-soft);
    color: var(--color-link);
  }

  .chip:focus-visible {
    outline: var(--focus-ring) solid var(--color-focus);
    outline-offset: var(--border-width);
  }

  .tabs {
    display: flex;
    flex-wrap: wrap;
    padding: 0 var(--space-2);
    border-bottom: var(--border-width) solid var(--color-border-strong);
  }

  .tab {
    min-height: var(--control-height-lg);
    padding: 0 var(--space-4);
    border: none;
    border-bottom: calc(3 * var(--border-width)) solid transparent;
    background: transparent;
    color: var(--color-text-muted);
    font-size: var(--text-sm);
    cursor: pointer;
  }

  .tab:hover {
    color: var(--color-text);
  }

  .tab[aria-selected="true"] {
    border-bottom-color: var(--color-text);
    color: var(--color-text);
    font-weight: var(--weight-bold);
  }

  .panel {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    padding: var(--space-4);
  }

  .notes {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(100%, calc(10 * var(--space-6))), 1fr));
    gap: var(--space-3);
  }

  .note-field {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    color: var(--color-text-muted);
    font-size: var(--text-xs);
    font-weight: var(--weight-bold);
    letter-spacing: var(--tracking-label);
    text-transform: uppercase;
  }

  .note-field textarea {
    padding: var(--space-2) var(--space-3);
    border: var(--border-width) solid var(--color-border-strong);
    border-radius: var(--radius-md);
    background: var(--color-surface);
    color: var(--color-text);
    font: inherit;
    font-size: var(--text-sm);
    font-weight: var(--weight-regular);
    letter-spacing: normal;
    line-height: var(--leading-normal);
    text-transform: none;
    resize: vertical;
  }

  .note-field textarea::placeholder {
    color: var(--color-text-placeholder);
  }

  .banner {
    padding: var(--space-3) var(--space-4);
    border-radius: var(--radius-md);
    background: var(--color-surface-sunken);
    font-size: var(--text-sm);
  }

  .muted {
    color: var(--color-text-muted);
  }

  .error-text {
    color: var(--color-danger);
  }

  .error {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-3) var(--space-4);
    border-radius: var(--radius-md);
    background: var(--color-danger-soft);
    color: var(--color-danger);
    font-size: var(--text-sm);
  }

  .empty {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-3);
  }
</style>
