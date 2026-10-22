<script lang="ts">
  import { onMount } from "svelte";
  import { beforeNavigate } from "$app/navigation";
  import SettingsButton from "$lib/components/SettingsButton.svelte";
  import { campaigns, refreshCampaigns } from "$lib/stores/campaigns.svelte";
  import { refreshRules, rules } from "$lib/stores/rules.svelte";
  import { speciesLabel } from "$lib/characters/rules";
  import { strings } from "$lib/strings";
  import CharacterAvatar from "../CharacterAvatar.svelte";
  import { avatarCandidates, classLine } from "../format";
  import InventoryTab from "./InventoryTab.svelte";
  import OverviewTab from "./OverviewTab.svelte";
  import PlayPanel from "./PlayPanel.svelte";
  import { Sheet } from "./sheet.svelte";

  let { campaign, id }: { campaign: string | null; id: string } = $props();

  const t = strings.characters.sheet;
  const ct = strings.characters;
  const plain = new Intl.NumberFormat();
  const TABS = ["overview", "features", "spells", "inventory", "notes"] as const;
  type Tab = (typeof TABS)[number];
  // Built in later phases; shown so the sheet's shape is clear.
  const SOON = new Set<Tab>(["features", "spells"]);

  // The route is keyed on campaign and id, so a different character gets a fresh component.
  // svelte-ignore state_referenced_locally
  const sheet = new Sheet(campaign, id);
  let tab = $state<Tab>("overview");

  onMount(() => {
    if (!campaigns.list) refreshCampaigns();
    if (!rules.status) refreshRules();
    sheet.load();
    return () => void sheet.flush();
  });
  beforeNavigate(() => void sheet.flush());

  const c = $derived(sheet.character);
  const campaignInfo = $derived(
    campaign === null ? null : [...(campaigns.list?.campaigns ?? []), ...(campaigns.list?.archived ?? [])].find((x) => x.id === campaign) ?? null,
  );
  const campaignName = $derived(campaign === null ? ct.noCampaign : (campaignInfo?.name ?? ct.unknownCampaign));
  const sources = $derived(campaign === null ? null : (campaignInfo?.sources ?? []));
  const species = $derived(c?.species ? speciesLabel(c.species.name, c.species.lineage ?? c.species.subspecies?.name) : null);

  function onTabKeydown(event: KeyboardEvent) {
    const open = TABS.filter((x) => !SOON.has(x));
    const at = open.indexOf(tab);
    const next = event.key === "ArrowRight" ? open[(at + 1) % open.length] : event.key === "ArrowLeft" ? open[(at - 1 + open.length) % open.length] : null;
    if (!next) return;
    event.preventDefault();
    tab = next;
    document.getElementById(`sheet-tab-${next}`)?.focus();
  }
</script>

<svelte:window onbeforeunload={() => void sheet.flush()} />

<div class="sheet">
  <header class="top">
    <a class="btn back" href="/characters">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" /></svg>
      {t.back}
    </a>
    {#if c && !sheet.archived}
      <span class="save-state" role="status">
        {#if sheet.save.status === "error"}
          <span class="error-text">{sheet.save.error}</span>
          <button class="btn small" onclick={() => sheet.retry()}>{t.retry}</button>
        {:else}
          {t.status[sheet.save.status]}
        {/if}
      </span>
    {/if}
  </header>

  <main>
    {#if sheet.notFound}
      <div class="empty">
        <p>{t.notFound}</p>
        <a class="btn" href="/characters">{t.backToList}</a>
      </div>
    {:else if sheet.loadError}
      <div class="error" role="alert">
        <p>{sheet.loadError}</p>
        <button class="btn small" onclick={() => ((sheet.loadError = null), sheet.load())}>{t.retry}</button>
      </div>
    {:else if !c}
      <p class="muted" role="status">{t.loading}</p>
    {:else}
      <div class="identity">
        <CharacterAvatar candidates={avatarCandidates(c.classes)} alt={c.name} />
        <div class="who">
          <h1>{c.name}</h1>
          <p>
            {c.classes.length ? classLine(c.classes) : ct.noClass}
            {#if c.classes.length}<span class="muted"> · {ct.level(plain.format(sheet.level))}</span>{/if}
          </p>
          <p class="muted">
            {[species, c.background?.name, campaignName, c.player ? t.playedBy(c.player) : null].filter(Boolean).join(" · ")}
          </p>
        </div>
      </div>

      {#if sheet.archived}<p class="banner" role="note">{t.archived}</p>{/if}
      {#if sheet.rulesError}
        <p class="banner error-text" role="alert">{sheet.rulesError}</p>
      {:else if rules.status && !rules.status.library}
        <p class="banner" role="note">{t.noRules}</p>
      {/if}

      <div class="layout">
        <div class="tabs-area">
          <div class="tabs" role="tablist" aria-label={t.tabsLabel} tabindex="-1" onkeydown={onTabKeydown}>
            {#each TABS as name (name)}
              {#if SOON.has(name)}
                <span class="tab soon" aria-disabled="true">{t.tabs[name]} <span class="tag">{strings.comingSoon}</span></span>
              {:else}
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
              {/if}
            {/each}
          </div>

          <div id="sheet-panel" class="panel" role="tabpanel" aria-labelledby="sheet-tab-{tab}">
            {#if tab === "overview"}
              <OverviewTab {sheet} />
            {:else if tab === "inventory"}
              <InventoryTab {sheet} {sources} />
            {:else if tab === "notes"}
              <label for="sheet-notes" class="sr-only">{t.notesLabel}</label>
              <textarea
                id="sheet-notes"
                class="notes"
                placeholder={t.notesPlaceholder}
                value={c.notes ?? ""}
                disabled={sheet.readOnly}
                oninput={(e) => {
                  const value = e.currentTarget.value;
                  sheet.change((x) => (x.notes = value));
                }}
              ></textarea>
            {/if}
          </div>
        </div>

        <div class="play"><PlayPanel {sheet} /></div>
      </div>
    {/if}
  </main>

  <div class="corner"><SettingsButton /></div>
</div>

<style>
  .sheet {
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
    margin-left: auto;
    color: var(--color-text-muted);
    font-size: var(--text-sm);
  }

  .corner {
    position: fixed;
    left: var(--space-4);
    bottom: var(--space-4);
  }

  main {
    width: min(100%, var(--content-max-width));
    margin: 0 auto;
    padding: var(--space-6) var(--space-5) var(--corner-clearance);
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  .identity {
    display: flex;
    align-items: center;
    gap: var(--space-4);
  }

  .who {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  h1 {
    font-size: var(--text-xl);
    font-weight: var(--weight-bold);
    letter-spacing: var(--tracking-tight);
  }

  .layout {
    display: grid;
    grid-template-columns: minmax(0, 1fr) var(--play-panel-width);
    gap: var(--space-5);
    align-items: start;
  }

  .tabs-area {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  .tabs {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1);
    padding: var(--space-1);
    border-radius: var(--radius-md);
    background: var(--color-surface-sunken);
  }

  .tab {
    padding: var(--space-1) var(--space-4);
    border: none;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--color-text-muted);
    font-weight: var(--weight-medium);
    cursor: pointer;
  }

  .tab[aria-selected="true"] {
    background: var(--color-accent);
    color: var(--color-accent-text);
  }

  .tab.soon {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    cursor: default;
  }

  .tag {
    font-size: var(--text-xs);
  }

  .panel {
    display: flex;
    flex-direction: column;
    gap: var(--space-5);
  }

  .notes {
    width: 100%;
    min-height: var(--notes-min-height);
    padding: var(--space-3);
    border: var(--border-width) solid var(--color-border-strong);
    border-radius: var(--radius-md);
    background: var(--color-surface);
    font: inherit;
    line-height: var(--leading-normal);
    resize: vertical;
  }

  .notes::placeholder {
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

  /* Narrow windows: the play panel moves above the tabs, where it's needed most during a session. */
  @media (max-width: 900px) {
    .layout {
      grid-template-columns: 1fr;
    }

    .play {
      order: -1;
    }
  }
</style>
