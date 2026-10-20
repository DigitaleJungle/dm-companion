<script lang="ts">
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import { strings } from "$lib/strings";
  import type { Campaign } from "$lib/api/campaigns";
  import { rules, refreshRules } from "$lib/stores/rules.svelte";
  import { enablePreviews, closePreview } from "$lib/rules/preview.svelte";
  import Reading from "./Reading.svelte";
  import Catalog from "./Catalog.svelte";
  import EntityPopover from "$lib/components/rules/EntityPopover.svelte";
  import SettingsDialog from "$lib/components/SettingsDialog.svelte";
  import CampaignSettingsDialog from "$lib/components/CampaignSettingsDialog.svelte";

  let {
    basePath,
    campaign,
  }: {
    /** Route this view lives at, e.g. "/library" or "/campaign/<id>/library". */
    basePath: string;
    /** In a campaign, only its sourcebooks are shown; null shows every imported book. */
    campaign: Campaign | null;
  } = $props();

  const t = strings.library;
  enablePreviews();
  onMount(refreshRules);

  let settingsOpen = $state(false);
  let campaignSettingsOpen = $state(false);
  const allowed = $derived(campaign ? new Set(campaign.sources.map((s) => s.toLowerCase())) : null);

  // Where you are lives in the address, so Back and Forward work inside the Library.
  const params = $derived(page.url.searchParams);
  const tab = $derived(params.get("tab") === "catalog" ? "catalog" : "reading");
  const book = $derived(params.get("book"));
  const chapter = $derived(Math.max(0, Number(params.get("chapter")) || 0));
  const heading = $derived(page.url.hash.slice(1));
  const group = $derived(params.get("group") ?? "all");
  const kind = $derived(params.get("kind") ?? (group === "all" ? "all" : "spell"));
  const entityId = $derived(params.get("e") ? Number(params.get("e")) : null);

  function go(query: Record<string, string | number | null>, hash = "") {
    closePreview();
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) if (value !== null) search.set(key, String(value));
    goto(`${basePath}?${search}${hash ? `#${hash}` : ""}`, { keepFocus: true, noScroll: true });
  }
</script>

<div class="library" class:embedded={!!campaign}>
  <header class="top">
    {#if !campaign}
      <a class="btn back" href="/">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" /></svg>
        {t.back}
      </a>
    {/if}
    <nav class="tabs" aria-label={t.tabs}>
      <a href="{basePath}?tab=reading" aria-current={tab === "reading" ? "page" : undefined}>{t.reading}</a>
      <a href="{basePath}?tab=catalog" aria-current={tab === "catalog" ? "page" : undefined}>{t.catalog}</a>
    </nav>
  </header>

  <div class="body">
    {#if rules.loadError}
      <p class="message error" role="alert">{rules.loadError}</p>
    {:else if !rules.status}
      <p class="message" role="status">{t.loading}</p>
    {:else if !rules.status.library}
      <div class="empty">
        <h1>{t.noData}</h1>
        <p>{t.noDataHelp}</p>
        <button class="btn btn-primary" onclick={() => (settingsOpen = true)}>{t.openSettings}</button>
      </div>
    {:else if campaign && campaign.sources.length === 0}
      <div class="empty">
        <h1>{strings.campaignSettings.noBooks}</h1>
        <button class="btn btn-primary" onclick={() => (campaignSettingsOpen = true)}>{strings.campaignSettings.chooseBooks}</button>
      </div>
    {:else if tab === "reading"}
      <Reading bookId={book} {chapter} {heading} allowedSources={allowed} onnavigate={(b, c, h) => go({ tab: "reading", book: b, chapter: c }, h)} />
    {:else}
      <Catalog {group} {kind} {entityId} allowedSources={allowed} onnavigate={(g, k, id) => go({ tab: "catalog", group: g, kind: k, e: id })} />
    {/if}
  </div>

  <EntityPopover {campaign} />
  <SettingsDialog bind:open={settingsOpen} section="rules" />
  {#if campaign}<CampaignSettingsDialog campaignId={campaign.id} bind:open={campaignSettingsOpen} />{/if}
</div>

<style>
  .library {
    display: flex;
    flex-direction: column;
    height: 100vh;
  }

  /* Inside the campaign shell: fill the content area below the search bar. */
  .library.embedded {
    flex: 1;
    min-height: 0;
    height: auto;
  }

  .top {
    flex: none;
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

  .tabs {
    display: flex;
    gap: var(--space-1);
    padding: var(--space-1);
    border-radius: var(--radius-md);
    background: var(--color-surface-sunken);
  }

  .tabs a {
    padding: var(--space-1) var(--space-4);
    border-radius: var(--radius-sm);
    color: var(--color-text-muted);
    font-weight: var(--weight-medium);
    text-decoration: none;
  }

  .tabs a[aria-current="page"] {
    background: var(--color-accent);
    color: var(--color-accent-text);
  }

  .body {
    flex: 1;
    min-height: 0;
  }

  .message {
    padding: var(--space-7);
    color: var(--color-text-muted);
  }

  .message.error {
    color: var(--color-danger);
  }

  .empty {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-3);
    max-width: var(--dialog-width);
    margin: var(--space-8) auto;
    padding: 0 var(--space-4);
  }

  .empty h1 {
    font-size: var(--text-xl);
    font-weight: var(--weight-bold);
  }

  .empty p {
    color: var(--color-text-muted);
  }

  @media (max-width: 900px) {
    .library {
      height: auto;
      min-height: 100vh;
    }
  }
</style>
