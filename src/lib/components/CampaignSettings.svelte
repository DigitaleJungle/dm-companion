<script lang="ts">
  import { onMount, tick } from "svelte";
  import { strings } from "$lib/strings";
  import { errorMessage } from "$lib/api/storage";
  import type { Campaign } from "$lib/api/campaigns";
  import {
    campaigns,
    createCampaign,
    refreshCampaigns,
    renameCampaign,
    archiveCampaign,
    restoreCampaign,
    deleteArchivedCampaign,
  } from "$lib/stores/campaigns.svelte";

  const t = strings.settings.campaigns;

  let renaming = $state<string | null>(null); // id being renamed
  let newName = $state("");
  let confirmingDelete = $state<string | null>(null); // archived id awaiting confirmation
  let busy = $state(false);
  let error = $state<{ id: string; message: string } | null>(null);

  onMount(refreshCampaigns);

  async function focus(id: string) {
    await tick();
    document.getElementById(id)?.focus();
  }

  // Runs one change at a time and shows a failure on the row it belongs to.
  async function run(id: string, action: () => Promise<void>, focusAfter?: string) {
    busy = true;
    error = null;
    try {
      await action();
      if (focusAfter) focus(focusAfter);
    } catch (e) {
      error = { id, message: t.error(errorMessage(e)) };
    } finally {
      busy = false;
    }
  }

  function startRename(campaign: Campaign) {
    renaming = campaign.id;
    newName = campaign.name;
    error = null;
    focus(`rename-input-${campaign.id}`);
  }

  function cancelRename(id: string) {
    renaming = null;
    focus(`rename-${id}`);
  }

  async function saveRename(event: SubmitEvent, id: string) {
    event.preventDefault();
    await run(id, async () => {
      await renameCampaign(id, newName);
      renaming = null;
    }, `rename-${id}`);
  }

  function onRenameKeydown(event: KeyboardEvent, id: string) {
    if (event.key === "Escape") {
      event.preventDefault(); // cancel the rename, not the whole Settings dialog
      cancelRename(id);
    }
  }

  // Adding from Settings stays here (unlike the Start screen, which opens the new campaign).
  let addName = $state("");
  async function add(event: SubmitEvent) {
    event.preventDefault();
    await run("add", async () => {
      await createCampaign(addName);
      addName = "";
    });
  }

  function askDelete(id: string) {
    confirmingDelete = id;
    error = null;
    focus(`cancel-delete-${id}`);
  }

  function cancelDelete(id: string) {
    confirmingDelete = null;
    focus(`delete-${id}`);
  }

  async function confirmDelete(id: string) {
    await run(id, async () => {
      await deleteArchivedCampaign(id);
      confirmingDelete = null;
    }, "archived-title");
  }
</script>

<div class="campaign-settings">
  <h3 class="title">{t.title}</h3>
  <p class="description">{t.description}</p>

  {#if campaigns.loadError}
    <p class="error" role="alert">{campaigns.loadError}</p>
  {:else if campaigns.list === null}
    <p class="muted" role="status">{strings.start.loading}</p>
  {:else}
    <section aria-labelledby="active-title">
      <h4 id="active-title" class="label">{t.active}</h4>
      {#if campaigns.list.campaigns.length === 0}
        <p class="muted">{t.noActive}</p>
      {:else}
        <ul>
          {#each campaigns.list.campaigns as campaign (campaign.id)}
            <li>
              {#if renaming === campaign.id}
                <form class="row" onsubmit={(e) => saveRename(e, campaign.id)}>
                  <label for="rename-input-{campaign.id}" class="sr-only">{t.renameLabel(campaign.name)}</label>
                  <input
                    id="rename-input-{campaign.id}"
                    class="name-input"
                    bind:value={newName}
                    maxlength="100"
                    autocomplete="off"
                    onkeydown={(e) => onRenameKeydown(e, campaign.id)}
                  />
                  <button class="btn btn-primary small" type="submit" disabled={busy || !newName.trim()}>{t.save}</button>
                  <button class="btn small" type="button" onclick={() => cancelRename(campaign.id)}>{t.cancel}</button>
                </form>
              {:else}
                <div class="row">
                  <span class="name">{campaign.name}</span>
                  <div class="actions" role="group" aria-label={t.actionsFor(campaign.name)}>
                    <button id="rename-{campaign.id}" class="btn small" disabled={busy} onclick={() => startRename(campaign)}>{t.rename}</button>
                    <button
                      id="archive-{campaign.id}"
                      class="btn small"
                      disabled={busy}
                      onclick={() => run(campaign.id, () => archiveCampaign(campaign.id), `restore-${campaign.id}`)}
                    >
                      {t.archive}
                    </button>
                  </div>
                </div>
              {/if}
              {#if error?.id === campaign.id}<p class="error" role="alert">{error.message}</p>{/if}
            </li>
          {/each}
        </ul>
      {/if}
      <form class="add" onsubmit={add}>
        <label for="add-campaign" class="sr-only">{t.addLabel}</label>
        <input
          id="add-campaign"
          class="name-input"
          bind:value={addName}
          placeholder={t.addPlaceholder}
          maxlength="100"
          autocomplete="off"
          aria-describedby={error?.id === "add" ? "add-error" : undefined}
        />
        <button class="btn small" type="submit" disabled={busy || !addName.trim()}>{t.add}</button>
      </form>
      {#if error?.id === "add"}<p id="add-error" class="error" role="alert">{error.message}</p>{/if}
    </section>

    <section aria-labelledby="archived-title">
      <h4 id="archived-title" class="label" tabindex="-1">{t.archived}</h4>
      {#if campaigns.list.archived.length === 0}
        <p class="muted">{t.noArchived}</p>
      {:else}
        <ul>
          {#each campaigns.list.archived as campaign (campaign.id)}
            <li>
              {#if confirmingDelete === campaign.id}
                <div class="confirm" role="alertdialog" aria-labelledby="confirm-{campaign.id}">
                  <p id="confirm-{campaign.id}">{t.confirmDelete(campaign.name)}</p>
                  <div class="actions">
                    <button id="cancel-delete-{campaign.id}" class="btn small" onclick={() => cancelDelete(campaign.id)}>{t.cancel}</button>
                    <button class="btn btn-danger small" disabled={busy} onclick={() => confirmDelete(campaign.id)}>{t.confirm}</button>
                  </div>
                </div>
              {:else}
                <div class="row">
                  <span class="name archived">{campaign.name}</span>
                  <div class="actions" role="group" aria-label={t.actionsFor(campaign.name)}>
                    <button
                      id="restore-{campaign.id}"
                      class="btn small"
                      disabled={busy}
                      onclick={() => run(campaign.id, () => restoreCampaign(campaign.id), `archive-${campaign.id}`)}
                    >
                      {t.restore}
                    </button>
                    <button id="delete-{campaign.id}" class="btn btn-danger small" disabled={busy} onclick={() => askDelete(campaign.id)}>
                      {t.delete}
                    </button>
                  </div>
                </div>
              {/if}
              {#if error?.id === campaign.id}<p class="error" role="alert">{error.message}</p>{/if}
            </li>
          {/each}
        </ul>
      {/if}
    </section>
  {/if}
</div>

<style>
  .campaign-settings {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  .title {
    font-size: var(--text-lg);
    font-weight: var(--weight-semibold);
  }

  .description {
    margin-top: calc(-1 * var(--space-2));
  }

  .description,
  .muted {
    color: var(--color-text-muted);
    font-size: var(--text-sm);
  }

  section {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    border: var(--border-width) solid var(--color-border);
    border-radius: var(--radius-md);
  }

  li {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-3);
  }

  li + li {
    border-top: var(--border-width) solid var(--color-border);
  }

  .row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    min-height: var(--control-height);
  }

  .name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-weight: var(--weight-medium);
  }

  .name.archived {
    color: var(--color-text-muted);
  }

  .name-input {
    flex: 1;
    min-width: 0;
    min-height: var(--control-height-sm);
    padding: 0 var(--space-2);
    border: var(--border-width) solid var(--color-border-strong);
    border-radius: var(--radius-sm);
    background: var(--color-surface);
  }

  .add {
    display: flex;
    gap: var(--space-2);
  }

  .add .name-input {
    min-height: var(--control-height);
    padding: 0 var(--space-3);
    border-radius: var(--radius-md);
  }

  .add .small {
    min-height: var(--control-height);
  }

  .name-input::placeholder {
    color: var(--color-text-placeholder);
  }

  .actions {
    display: flex;
    gap: var(--space-2);
    flex: none;
  }

  .small {
    min-height: var(--control-height-sm);
    padding: 0 var(--space-3);
  }

  .confirm {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding: var(--space-2) 0;
    font-size: var(--text-sm);
  }

  .confirm .actions {
    justify-content: flex-end;
  }

  .error {
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-sm);
    background: var(--color-danger-soft);
    color: var(--color-danger);
    font-size: var(--text-sm);
  }

  h4:focus-visible {
    outline-offset: 2px;
  }
</style>
