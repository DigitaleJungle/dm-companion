<script lang="ts">
  import { tick } from "svelte";
  import { strings } from "$lib/strings";
  import { errorMessage } from "$lib/api/storage";
  import {
    campaigns,
    archiveCampaign,
    deleteCampaign,
    refreshCampaigns,
    renameCampaign,
    restoreCampaign,
    setCampaignSources,
  } from "$lib/stores/campaigns.svelte";
  import { rules, refreshRules } from "$lib/stores/rules.svelte";

  let { campaignId, open = $bindable(false) }: { campaignId: string; open?: boolean } = $props();

  const t = strings.campaignSettings;
  let dialog: HTMLDialogElement | undefined = $state();

  const archived = $derived(campaigns.list?.archived.some((c) => c.id === campaignId) ?? false);
  const campaign = $derived(
    campaigns.list?.campaigns.find((c) => c.id === campaignId) ??
      campaigns.list?.archived.find((c) => c.id === campaignId) ??
      (campaigns.current?.id === campaignId ? campaigns.current : null),
  );
  const books = $derived(
    (rules.status?.library?.sources ?? []).filter((s) => s.isBook || s.entities > 0).sort((a, b) => a.name.localeCompare(b.name)),
  );
  const chosen = $derived(new Set((campaign?.sources ?? []).map((s) => s.toLowerCase())));
  let filter = $state("");
  const visible = $derived.by(() => {
    const needle = filter.trim().toLowerCase();
    return needle ? books.filter((b) => b.name.toLowerCase().includes(needle) || b.id.toLowerCase().includes(needle)) : books;
  });
  const visibleChosen = $derived(visible.filter((b) => chosen.has(b.id.toLowerCase())).length);

  let renaming = $state(false);
  let newName = $state("");
  let confirmingDelete = $state(false);
  let busy = $state(false);
  let error = $state<string | null>(null);

  // Native modal dialog: keeps focus inside, closes on Escape, returns focus to the opener.
  $effect(() => {
    if (open && !dialog?.open) {
      renaming = false;
      confirmingDelete = false;
      filter = "";
      error = null;
      if (!campaigns.list) refreshCampaigns();
      if (!rules.status) refreshRules();
      dialog?.showModal();
    }
    if (!open && dialog?.open) dialog.close();
  });

  async function run(action: () => Promise<void>) {
    busy = true;
    error = null;
    try {
      await action();
    } catch (e) {
      error = t.error(errorMessage(e));
    } finally {
      busy = false;
    }
  }

  async function startRename() {
    if (!campaign) return;
    newName = campaign.name;
    renaming = true;
    await tick();
    document.getElementById("campaign-name-input")?.focus();
  }

  async function saveRename(event: SubmitEvent) {
    event.preventDefault();
    await run(async () => {
      await renameCampaign(campaignId, newName);
      renaming = false;
    });
  }

  function onNameKeydown(event: KeyboardEvent) {
    if (event.key === "Escape") {
      event.preventDefault(); // cancel the rename, not the dialog
      renaming = false;
    }
  }

  function setSources(next: string[]) {
    run(() => setCampaignSources(campaignId, next));
  }

  function toggleSource(id: string, on: boolean) {
    const current = campaign?.sources ?? [];
    setSources(on ? [...current, id] : current.filter((s) => s.toLowerCase() !== id.toLowerCase()));
  }

  async function askDelete() {
    confirmingDelete = true;
    await tick();
    document.getElementById("cancel-campaign-delete")?.focus();
  }

  async function confirmDelete() {
    await run(async () => {
      await deleteCampaign(campaignId);
      open = false;
    });
  }

  function onBackdropClick(event: MouseEvent) {
    if (event.target === dialog) open = false;
  }
</script>

<dialog bind:this={dialog} aria-labelledby="campaign-settings-title" onclose={() => (open = false)} onclick={onBackdropClick}>
  <header>
    <h2 id="campaign-settings-title">{t.title}</h2>
    <button class="btn close" aria-label={t.close} onclick={() => (open = false)}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" /></svg>
    </button>
  </header>

  <div class="body">
    {#if !campaign}
      <p class="muted">{campaigns.list ? t.notFound : strings.start.loading}</p>
    {:else}
      <section class="block" aria-label={t.renameLabel}>
        {#if renaming}
          <form class="row" onsubmit={saveRename}>
            <label for="campaign-name-input" class="sr-only">{t.renameLabel}</label>
            <input id="campaign-name-input" class="name-input" bind:value={newName} maxlength="100" autocomplete="off" onkeydown={onNameKeydown} />
            <button class="btn btn-primary small" type="submit" disabled={busy || !newName.trim()}>{t.save}</button>
            <button class="btn small" type="button" onclick={() => (renaming = false)}>{t.cancel}</button>
          </form>
        {:else}
          <div class="row">
            <p class="name">{campaign.name}</p>
            {#if !archived}<button class="btn small" disabled={busy} onclick={startRename}>{t.rename}</button>{/if}
          </div>
        {/if}
      </section>

      {#if error}<p class="error" role="alert">{error}</p>{/if}

      <section class="block" aria-labelledby="campaign-status-title">
        <h3 id="campaign-status-title" class="subheading">{t.status}</h3>
        {#if archived}
          <p class="muted">{t.archivedNote}</p>
          <div><button class="btn small" disabled={busy} onclick={() => run(() => restoreCampaign(campaignId))}>{t.restore}</button></div>
        {:else}
          <div class="row">
            <span class="badge">{t.active}</span>
            <button class="btn small" disabled={busy} onclick={() => run(() => archiveCampaign(campaignId))}>{t.archive}</button>
          </div>
        {/if}
      </section>

      <section class="block" aria-labelledby="campaign-books-title">
        <div class="row">
          <h3 id="campaign-books-title" class="subheading">{t.sourcebooks}</h3>
          {#if books.length}<span class="count">{t.sourcebooksCount(books.filter((b) => chosen.has(b.id.toLowerCase())).length, books.length)}</span>{/if}
        </div>
        {#if !rules.status?.library}
          <p class="muted">{t.noRules}</p>
        {:else}
          {#if archived}<p class="muted">{t.archivedNote}</p>{/if}
          <div class="row">
            <label for="campaign-books-filter" class="sr-only">{strings.settings.rules.filterLabel}</label>
            <input id="campaign-books-filter" class="filter" type="search" bind:value={filter} placeholder={strings.settings.rules.filterPlaceholder} autocomplete="off" />
            <!-- Select/deselect act on the books the filter shows. -->
            <button
              class="btn small"
              disabled={busy || archived || visibleChosen === visible.length}
              onclick={() => setSources([...(campaign?.sources ?? []), ...visible.filter((b) => !chosen.has(b.id.toLowerCase())).map((b) => b.id)])}
            >
              {t.selectAll}
            </button>
            <button
              class="btn small"
              disabled={busy || archived || visibleChosen === 0}
              onclick={() => setSources((campaign?.sources ?? []).filter((s) => !visible.some((b) => b.id.toLowerCase() === s.toLowerCase())))}
            >
              {t.deselectAll}
            </button>
          </div>
          {#if visible.length === 0}<p class="muted">{strings.settings.rules.noMatches}</p>{/if}
          <ul class="books" hidden={visible.length === 0}>
            {#each visible as book (book.id)}
              <li>
                <label class="book">
                  <input
                    type="checkbox"
                    checked={chosen.has(book.id.toLowerCase())}
                    disabled={archived}
                    aria-label={t.toggleSource(book.name)}
                    onchange={(e) => toggleSource(book.id, e.currentTarget.checked)}
                  />
                  <span>{book.name}</span>
                  <span class="abbr">{book.id}</span>
                </label>
              </li>
            {/each}
          </ul>
        {/if}
      </section>

      <section class="block danger" aria-labelledby="campaign-delete-title">
        <h3 id="campaign-delete-title" class="subheading">{t.deleteTitle}</h3>
        {#if confirmingDelete}
          <div class="confirm" role="alertdialog" aria-labelledby="campaign-delete-text">
            <p id="campaign-delete-text">{t.confirmDelete(campaign.name)}</p>
            <div class="row end">
              <button id="cancel-campaign-delete" class="btn small" onclick={() => (confirmingDelete = false)}>{t.cancel}</button>
              <button class="btn btn-danger small" disabled={busy} onclick={confirmDelete}>{t.confirm}</button>
            </div>
          </div>
        {:else}
          <div><button class="btn btn-danger small" disabled={busy} onclick={askDelete}>{t.delete}</button></div>
        {/if}
      </section>
    {/if}
  </div>
</dialog>

<style>
  dialog {
    width: min(var(--dialog-width), calc(100vw - 2 * var(--space-4)));
    max-height: calc(100vh - 2 * var(--space-4));
    padding: 0;
    border: var(--border-width) solid var(--color-border);
    border-radius: var(--radius-lg);
    background: var(--color-surface);
    color: var(--color-text);
    box-shadow: var(--shadow-drawer);
    overflow: hidden;
  }

  dialog[open] {
    display: flex;
    flex-direction: column;
  }

  dialog::backdrop {
    background: var(--color-backdrop);
  }

  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-4) var(--space-4) var(--space-4) var(--space-6);
    border-bottom: var(--border-width) solid var(--color-border);
  }

  h2 {
    font-size: var(--text-xl);
    font-weight: var(--weight-bold);
  }

  .close {
    padding: 0;
    width: var(--control-height);
    border-color: transparent;
    background: transparent;
  }

  .close svg {
    width: var(--icon-size);
    height: var(--icon-size);
  }

  .body {
    display: flex;
    flex-direction: column;
    gap: var(--space-6);
    overflow-y: auto;
    padding: var(--space-5) var(--space-6) var(--space-6);
  }

  .block {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .row.end {
    justify-content: flex-end;
  }

  .name {
    flex: 1;
    min-width: 0;
    font-size: var(--text-lg);
    font-weight: var(--weight-semibold);
    overflow-wrap: anywhere;
  }

  .name-input {
    flex: 1;
    min-width: 0;
    min-height: var(--control-height);
    padding: 0 var(--space-3);
    border: var(--border-width) solid var(--color-border-strong);
    border-radius: var(--radius-md);
    background: var(--color-surface);
    font-size: var(--text-md);
  }

  .subheading {
    flex: 1;
    font-size: var(--text-md);
    font-weight: var(--weight-semibold);
  }

  .badge {
    padding: var(--space-1) var(--space-2);
    border-radius: var(--radius-sm);
    background: var(--color-accent-soft);
    color: var(--color-link);
    font-size: var(--text-xs);
    font-weight: var(--weight-semibold);
  }

  .count {
    color: var(--color-text-muted);
    font-size: var(--text-sm);
    font-variant-numeric: tabular-nums;
  }

  .filter {
    flex: 1;
    min-width: 0;
    min-height: var(--control-height-sm);
    padding: 0 var(--space-3);
    border: var(--border-width) solid var(--color-border-strong);
    border-radius: var(--radius-sm);
    background: var(--color-surface);
    font-size: var(--text-sm);
  }

  .filter::placeholder {
    color: var(--color-text-placeholder);
  }

  .books[hidden] {
    display: none;
  }

  .books {
    margin: 0;
    padding: 0;
    list-style: none;
    border: var(--border-width) solid var(--color-border);
    border-radius: var(--radius-md);
    max-height: var(--campaign-books-height);
    overflow-y: auto;
  }

  .books li + li {
    border-top: var(--border-width) solid var(--color-border);
  }

  .book {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-3);
    font-size: var(--text-sm);
    cursor: pointer;
  }

  .book span:first-of-type {
    flex: 1;
  }

  .abbr {
    color: var(--color-text-muted);
    font-size: var(--text-xs);
  }

  input[type="checkbox"] {
    accent-color: var(--color-accent);
  }

  .confirm {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding: var(--space-3) var(--space-4);
    border: var(--border-width) solid var(--color-danger);
    border-radius: var(--radius-md);
    background: var(--color-danger-soft);
    font-size: var(--text-sm);
  }

  .small {
    min-height: var(--control-height-sm);
    padding: 0 var(--space-3);
  }

  .muted {
    color: var(--color-text-muted);
    font-size: var(--text-sm);
  }

  .error {
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-sm);
    background: var(--color-danger-soft);
    color: var(--color-danger);
    font-size: var(--text-sm);
  }
</style>
