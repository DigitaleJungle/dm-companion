<script lang="ts">
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import SearchBar from "$lib/components/SearchBar.svelte";
  import SettingsButton from "$lib/components/SettingsButton.svelte";
  import { campaigns, createCampaign, refreshCampaigns } from "$lib/stores/campaigns.svelte";
  import { errorMessage } from "$lib/api/storage";
  import { strings } from "$lib/strings";
  import { version } from "../../../../package.json";

  const t = strings.start;
  const formatDate = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

  let name = $state("");
  let creating = $state(false);
  let createError = $state<string | null>(null);

  const list = $derived(campaigns.list);

  onMount(refreshCampaigns);

  async function create(event: SubmitEvent) {
    event.preventDefault();
    if (!name.trim() || creating) return;
    creating = true;
    createError = null;
    try {
      const campaign = await createCampaign(name);
      await goto(`/campaign/${campaign.id}`);
    } catch (e) {
      createError = t.createError(errorMessage(e));
      creating = false;
    }
  }
</script>

<div class="start">
  <main>
    <h1>{strings.appName}</h1>

    <SearchBar placeholder={strings.search.allCampaignsPlaceholder} />

    <section class="campaigns" aria-labelledby="campaigns-title">
      <h2 id="campaigns-title" class="label">{t.campaigns}</h2>

      {#if campaigns.loadError}
        <p class="error" role="alert">{campaigns.loadError}</p>
      {:else if list === null}
        <p class="muted" role="status">{t.loading}</p>
      {:else}
        {#if list.campaigns.length === 0}
          <p class="muted">{t.empty}</p>
        {:else}
          <ul>
            {#each list.campaigns as campaign (campaign.id)}
              <li>
                <a class="campaign" href="/campaign/{campaign.id}">
                  <span class="name">{campaign.name}</span>
                  <span class="when">{t.lastOpened(formatDate.format(campaign.lastOpenedAt))}</span>
                </a>
              </li>
            {/each}
          </ul>
        {/if}
        {#if list.unreadable.length > 0}
          <p class="error" role="alert">{t.unreadable(list.unreadable.join(", "))}</p>
        {/if}
      {/if}

      <form class="create" onsubmit={create}>
        <label for="new-campaign" class="sr-only">{t.newCampaign}</label>
        <input
          id="new-campaign"
          bind:value={name}
          placeholder={t.namePlaceholder}
          maxlength="100"
          autocomplete="off"
          aria-describedby={createError ? "create-error" : undefined}
        />
        <button class="btn btn-primary" type="submit" disabled={!name.trim() || creating}>
          {creating ? t.creating : t.create}
        </button>
      </form>
      {#if createError}<p id="create-error" class="error" role="alert">{createError}</p>{/if}
    </section>
  </main>

  <a class="btn library-link" href="/library">
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M4 19.5V5a2 2 0 0 1 2-2h14v16H6.5A2.5 2.5 0 0 0 4 21.5v-2z" /><path d="M8 7h8" />
    </svg>
    {strings.library.open}
  </a>

  <div class="corner">
    <SettingsButton />
  </div>
  <p class="version">{t.version(version)}</p>
</div>

<style>
  .start {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: var(--space-8) var(--space-4);
  }

  main {
    width: min(100%, var(--start-width));
    margin: auto 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-7);
  }

  h1 {
    text-align: center;
    font-size: var(--text-2xl);
    font-weight: var(--weight-bold);
    letter-spacing: var(--tracking-tight);
  }

  .campaigns {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    border: var(--border-width) solid var(--color-border);
    border-radius: var(--radius-lg);
    background: var(--color-surface);
    box-shadow: var(--shadow-card);
    overflow: hidden;
  }

  li + li {
    border-top: var(--border-width) solid var(--color-border);
  }

  .campaign {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--space-4);
    padding: var(--space-4) var(--space-5);
    color: var(--color-text);
    text-decoration: none;
  }

  .campaign:hover {
    background: var(--color-surface-sunken);
  }

  .campaign:focus-visible {
    outline-offset: calc(-1 * var(--focus-ring));
  }

  .name {
    font-weight: var(--weight-semibold);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .when,
  .muted,
  .version {
    color: var(--color-text-muted);
    font-size: var(--text-sm);
  }

  .when {
    flex: none;
  }

  .create {
    display: flex;
    gap: var(--space-2);
  }

  .create input {
    flex: 1;
    min-width: 0;
    min-height: var(--control-height-lg);
    padding: 0 var(--space-4);
    border: var(--border-width) solid var(--color-border-strong);
    border-radius: var(--radius-md);
    background: var(--color-surface);
  }

  .create input::placeholder {
    color: var(--color-text-muted);
  }

  .error {
    padding: var(--space-3) var(--space-4);
    border-radius: var(--radius-md);
    background: var(--color-danger-soft);
    color: var(--color-danger);
    font-size: var(--text-sm);
  }

  .corner {
    position: fixed;
    left: var(--space-4);
    bottom: var(--space-4);
  }

  .library-link {
    position: fixed;
    top: var(--space-4);
    right: var(--space-4);
    gap: var(--space-2);
    color: var(--color-text);
    text-decoration: none;
  }

  .library-link svg {
    width: var(--icon-size);
    height: var(--icon-size);
  }

  .version {
    margin-top: var(--space-7);
    font-size: var(--text-xs);
  }

  @media (max-width: 720px) {
    .campaign {
      flex-direction: column;
      gap: var(--space-1);
    }
  }
</style>
