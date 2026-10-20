<script lang="ts">
  import { onMount } from "svelte";
  import { strings } from "$lib/strings";
  import { errorMessage } from "$lib/api/storage";
  import type { Campaign } from "$lib/api/campaigns";
  import { campaigns, createCampaign, refreshCampaigns } from "$lib/stores/campaigns.svelte";
  import CampaignSettingsDialog from "$lib/components/CampaignSettingsDialog.svelte";
  import Gear from "$lib/components/icons/Gear.svelte";

  const t = strings.settings.campaigns;

  let addName = $state("");
  let adding = $state(false);
  let addError = $state<string | null>(null);
  let editing = $state<string | null>(null); // campaign whose settings are open
  let dialogOpen = $state(false);

  onMount(refreshCampaigns);

  // Adding from Settings stays here (unlike the Start screen, which opens the new campaign).
  async function add(event: SubmitEvent) {
    event.preventDefault();
    adding = true;
    addError = null;
    try {
      await createCampaign(addName);
      addName = "";
    } catch (e) {
      addError = t.error(errorMessage(e));
    } finally {
      adding = false;
    }
  }

  function openSettings(campaign: Campaign) {
    editing = campaign.id;
    dialogOpen = true;
  }
</script>

{#snippet rows(list: Campaign[], archived: boolean)}
  <ul>
    {#each list as campaign (campaign.id)}
      <li class="row">
        <span class="name" class:archived>{campaign.name}</span>
        <button
          class="icon-btn"
          aria-label={strings.campaignSettings.openFor(campaign.name)}
          title={strings.campaignSettings.openFor(campaign.name)}
          aria-haspopup="dialog"
          onclick={() => openSettings(campaign)}
        >
          <Gear />
        </button>
      </li>
    {/each}
  </ul>
{/snippet}

<div class="campaign-settings">
  <h3 class="title">{t.title}</h3>

  {#if campaigns.loadError}
    <p class="error" role="alert">{campaigns.loadError}</p>
  {:else if campaigns.list === null}
    <p class="muted" role="status">{strings.start.loading}</p>
  {:else}
    <section aria-labelledby="active-title">
      <h4 id="active-title" class="subheading">{t.active}</h4>
      {#if campaigns.list.campaigns.length === 0}
        <p class="muted">{t.noActive}</p>
      {:else}
        {@render rows(campaigns.list.campaigns, false)}
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
          aria-describedby={addError ? "add-error" : undefined}
        />
        <button class="btn" type="submit" disabled={adding || !addName.trim()}>{t.add}</button>
      </form>
      {#if addError}<p id="add-error" class="error" role="alert">{addError}</p>{/if}
    </section>

    <section aria-labelledby="archived-title">
      <h4 id="archived-title" class="subheading">{t.archived}</h4>
      {#if campaigns.list.archived.length === 0}
        <p class="muted">{t.noArchived}</p>
      {:else}
        {@render rows(campaigns.list.archived, true)}
      {/if}
    </section>
  {/if}
</div>

{#if editing}
  <CampaignSettingsDialog campaignId={editing} bind:open={dialogOpen} />
{/if}

<style>
  .campaign-settings {
    display: flex;
    flex-direction: column;
    gap: var(--space-5);
  }

  .title {
    font-size: var(--text-lg);
    font-weight: var(--weight-semibold);
  }

  .subheading {
    font-size: var(--text-md);
    font-weight: var(--weight-semibold);
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

  .row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-2) var(--space-2) var(--space-3);
  }

  .row + .row {
    border-top: var(--border-width) solid var(--color-border);
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

  .icon-btn :global(.gear) {
    width: var(--icon-size);
    height: var(--icon-size);
  }

  .add {
    display: flex;
    gap: var(--space-2);
  }

  .name-input {
    flex: 1;
    min-width: 0;
    min-height: var(--control-height);
    padding: 0 var(--space-3);
    border: var(--border-width) solid var(--color-border-strong);
    border-radius: var(--radius-md);
    background: var(--color-surface);
  }

  .name-input::placeholder {
    color: var(--color-text-placeholder);
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
