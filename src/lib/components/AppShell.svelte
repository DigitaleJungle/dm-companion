<script lang="ts">
  import { onMount, type Snippet } from "svelte";
  import { page } from "$app/state";
  import { afterNavigate, goto } from "$app/navigation";
  import { strings } from "$lib/strings";
  import { campaigns, refreshCampaigns } from "$lib/stores/campaigns.svelte";
  import Menu from "$lib/components/Menu.svelte";
  import SearchBar from "$lib/components/SearchBar.svelte";
  import SettingsButton from "$lib/components/SettingsButton.svelte";
  import CampaignSettingsDialog from "$lib/components/CampaignSettingsDialog.svelte";
  import Gear from "$lib/components/icons/Gear.svelte";
  import type { Campaign } from "$lib/api/campaigns";

  let { campaign, children }: { campaign: Campaign; children: Snippet } = $props();

  // Narrow windows only: the sidebar becomes a drawer behind the menu toggle.
  let menuOpen = $state(false);
  let settingsOpen = $state(false);
  let campaignSettingsOpen = $state(false);
  let toggle: HTMLButtonElement | undefined = $state();

  function closeMenu() {
    menuOpen = false;
    toggle?.focus();
  }

  afterNavigate(() => {
    menuOpen = false;
  });

  function onKeydown(event: KeyboardEvent) {
    // While a dialog is open, Escape belongs to it; the drawer stays open behind it.
    if (menuOpen && !settingsOpen && !campaignSettingsOpen && event.key === "Escape") closeMenu();
  }

  onMount(() => {
    if (!campaigns.list) refreshCampaigns();
  });

  // Until the list loads, the switcher offers just Home and the open campaign.
  const switchItems = $derived([
    { label: strings.shell.startScreen, onselect: () => goto("/") },
    ...(campaigns.list?.campaigns ?? [campaign]).map((c) => ({
      label: c.name,
      current: c.id === campaign.id,
      onselect: () => goto(`/campaign/${c.id}`),
    })),
  ]);

  const nav = strings.shell.nav;
  // href is null until the screen is built; those items render disabled with "Coming soon".
  const items: { label: string; href: string | null }[] = $derived([
    { label: nav.home, href: `/campaign/${campaign.id}` },
    { label: nav.campaignLibrary, href: `/campaign/${campaign.id}/library` },
    { label: nav.runEncounter, href: null },
    { label: nav.encounterBuilder, href: null },
    { label: nav.characters, href: `/campaign/${campaign.id}/characters` },
    { label: nav.legendKeeper, href: null },
  ]);
</script>

<svelte:window onkeydown={onKeydown} />

<div class="shell">
  {#if menuOpen}
    <button class="backdrop" tabindex="-1" aria-label={strings.shell.closeMenu} onclick={closeMenu}></button>
  {/if}

  <nav id="sidebar" class="sidebar" class:open={menuOpen} aria-label={strings.shell.mainNav}>
    <div class="app-name">{strings.appName}</div>

    <div class="group">
      <span class="label" id="campaign-label">{strings.shell.campaign}</span>
      <div class="campaign-row">
        <Menu id="campaign-switcher" label={strings.shell.switchCampaign(campaign.name)} align="start" triggerClass="btn campaign" items={switchItems}>
          {#snippet trigger()}
            <span class="campaign-name">{campaign.name}</span>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 9l4-4 4 4M8 15l4 4 4-4" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" /></svg>
          {/snippet}
        </Menu>
        <button
          class="icon-btn campaign-cog"
          aria-label={strings.campaignSettings.open}
          title={strings.campaignSettings.open}
          aria-haspopup="dialog"
          onclick={() => (campaignSettingsOpen = true)}
        >
          <Gear />
        </button>
      </div>
      <CampaignSettingsDialog campaignId={campaign.id} bind:open={campaignSettingsOpen} />
    </div>

    <ul class="nav">
      {#each items as item (item.label)}
        <li>
          {#if item.href}
            <a class="nav-item" href={item.href} aria-current={page.url.pathname === item.href ? "page" : undefined}>
              {item.label}
            </a>
          {:else}
            <span class="nav-item disabled">
              <span>
                {item.label}
                <span class="soon">{strings.comingSoon}</span>
              </span>
            </span>
          {/if}
        </li>
      {/each}
    </ul>

    <div class="player-box">
      <span class="label">{strings.shell.playerScreen}</span>
      <span class="status">{strings.shell.playerScreenStatus}</span>
      <button class="btn" disabled>{strings.shell.openOnDisplay2}</button>
      <span class="soon">{strings.comingSoon}</span>
    </div>

    <div class="footer">
      <SettingsButton bind:open={settingsOpen} />
    </div>
  </nav>

  <div class="column">
    <header class="top">
      <div class="topbar">
        <button
          bind:this={toggle}
          class="btn menu-toggle"
          aria-expanded={menuOpen}
          aria-controls="sidebar"
          aria-label={menuOpen ? strings.shell.closeMenu : strings.shell.openMenu}
          onclick={() => (menuOpen = !menuOpen)}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
          </svg>
        </button>
        <span class="app-name">{strings.appName}</span>
      </div>

      <div class="search">
        <SearchBar />
      </div>
    </header>

    <main class="content">
      {@render children()}
    </main>
  </div>
</div>

<style>
  .shell {
    display: flex;
    height: 100vh;
  }

  .sidebar {
    flex: 0 0 var(--sidebar-width);
    min-width: 0; /* long campaign names truncate instead of widening the sidebar */
    display: flex;
    flex-direction: column;
    gap: var(--space-6);
    padding: var(--space-5) var(--space-3);
    background: var(--color-surface);
    border-right: var(--border-width) solid var(--color-border);
    overflow-y: auto;
  }

  .app-name {
    padding: 0 var(--space-3);
    font-size: var(--text-lg);
    font-weight: var(--weight-bold);
  }

  .group {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding: 0 var(--space-3);
  }

  /* The switcher button renders inside Menu, so its styles reach in with :global. */
  .campaign-row :global(.campaign) {
    width: 100%;
    justify-content: space-between;
    color: var(--color-text);
  }

  .campaign-row :global(.campaign:hover) {
    background: var(--color-surface-sunken);
  }

  .campaign-name {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .campaign-row :global(.campaign svg) {
    flex: none;
    width: var(--icon-size);
    height: var(--icon-size);
    color: var(--color-text-muted);
  }

  .nav {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .nav-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
    min-height: var(--control-height);
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-md);
    color: var(--color-text);
    text-decoration: none;
    font-weight: var(--weight-medium);
  }

  a.nav-item:hover {
    background: var(--color-surface-sunken);
  }

  a.nav-item[aria-current="page"] {
    background: var(--color-accent-soft);
    color: var(--color-link);
  }

  .nav-item.disabled {
    color: var(--color-text-muted);
    font-weight: var(--weight-regular);
  }

  .player-box {
    margin-top: auto;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding: var(--space-3);
    border: var(--border-width) dashed var(--color-border-strong);
    border-radius: var(--radius-md);
  }

  .status {
    font-size: var(--text-sm);
  }

  .footer {
    display: flex;
    margin-top: calc(-1 * var(--space-3));
  }

  /* The content column scrolls (not the window), so pages like the Library can fill its height. */
  .column {
    flex: 1;
    min-width: 0;
    height: 100vh;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
  }

  /* Search stays visible at the top of every screen while the content scrolls */
  .top {
    position: sticky;
    top: 0;
    z-index: calc(var(--z-drawer) - 2);
    background: var(--color-bg);
  }

  .search {
    max-width: var(--content-max-width);
    padding: var(--space-5) var(--space-7) var(--space-3);
  }

  .content {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }

  .campaign-row {
    display: flex;
    align-items: center;
    gap: var(--space-1);
  }

  .campaign-row :global(.menu-root) {
    flex: 1;
    min-width: 0;
  }

  .campaign-cog {
    flex: none;
    width: var(--control-height);
    height: var(--control-height);
  }

  .campaign-cog :global(.gear) {
    width: var(--icon-size);
    height: var(--icon-size);
  }

  .topbar,
  .backdrop {
    display: none;
  }

  /* Small windows: the sidebar hides behind the menu toggle and slides in as a drawer */
  @media (max-width: 720px) {
    .shell {
      flex-direction: column;
    }

    .search {
      padding: var(--space-3) var(--space-4) var(--space-2);
    }

    .topbar {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      padding: var(--space-2) var(--space-3);
      background: var(--color-surface);
      border-bottom: var(--border-width) solid var(--color-border);
    }

    .menu-toggle {
      padding: 0;
      width: var(--control-height);
    }

    .menu-toggle svg {
      width: var(--icon-size);
      height: var(--icon-size);
    }

    .backdrop {
      display: block;
      position: fixed;
      inset: 0;
      z-index: calc(var(--z-drawer) - 1);
      border: none;
      background: var(--color-backdrop);
      cursor: default;
    }

    .sidebar {
      position: fixed;
      inset: 0 auto 0 0;
      z-index: var(--z-drawer);
      width: var(--drawer-width);
      overflow-y: auto;
      box-shadow: var(--shadow-drawer);
      transform: translateX(-100%);
      visibility: hidden; /* keeps the closed drawer out of the Tab order */
      transition:
        transform var(--duration-drawer) ease,
        visibility 0s linear var(--duration-drawer);
    }

    .sidebar.open {
      transform: none;
      visibility: visible;
      transition: transform var(--duration-drawer) ease;
    }
  }

  /* Animations off (Settings → Theme, or the OS when set to System). */
  :global([data-motion="reduce"]) .sidebar,
  :global([data-motion="reduce"]) .sidebar.open {
    transition: none;
  }
</style>
