<script lang="ts">
  import type { Snippet } from "svelte";
  import { page } from "$app/state";
  import AppShell from "$lib/components/AppShell.svelte";
  import { openCampaign } from "$lib/api/campaigns";
  import { errorMessage } from "$lib/api/storage";
  import { campaigns } from "$lib/stores/campaigns.svelte";
  import { strings } from "$lib/strings";

  let { children }: { children: Snippet } = $props();

  let error = $state<string | null>(null);

  $effect(() => {
    const id = page.params.id ?? "";
    campaigns.current = null;
    error = null;
    let current = true; // ignore a slow answer for a campaign we've already left
    openCampaign(id).then(
      (c) => current && (campaigns.current = c),
      (e) => current && (error = strings.campaign.openError(errorMessage(e))),
    );
    return () => {
      current = false;
      campaigns.current = null;
    };
  });
</script>

<!-- Pages under this layout only render once the campaign is loaded. -->
{#if campaigns.current}
  <AppShell campaign={campaigns.current}>
    {@render children()}
  </AppShell>
{:else}
  <main class="status">
    {#if error}
      <p class="error" role="alert">{error}</p>
      <a class="btn" href="/">{strings.campaign.backToStart}</a>
    {:else}
      <p role="status">{strings.campaign.loading}</p>
    {/if}
  </main>
{/if}

<style>
  .status {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-4);
    max-width: var(--dialog-width);
    margin: 0 auto;
    padding: var(--space-8) var(--space-4);
    color: var(--color-text-muted);
  }

  .error {
    padding: var(--space-3) var(--space-4);
    border-radius: var(--radius-md);
    background: var(--color-danger-soft);
    color: var(--color-danger);
  }
</style>
