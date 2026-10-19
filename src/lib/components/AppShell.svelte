<script lang="ts">
  import type { Snippet } from "svelte";
  import { page } from "$app/state";
  import { afterNavigate } from "$app/navigation";
  import { strings } from "$lib/strings";
  import SettingsDialog from "$lib/components/SettingsDialog.svelte";

  let { children }: { children: Snippet } = $props();

  // Narrow windows only: the sidebar becomes a drawer behind the menu toggle.
  let menuOpen = $state(false);
  let settingsOpen = $state(false);
  let toggle: HTMLButtonElement | undefined = $state();

  function closeMenu() {
    menuOpen = false;
    toggle?.focus();
  }

  afterNavigate(() => {
    menuOpen = false;
  });

  function onKeydown(event: KeyboardEvent) {
    // While settings is open, Escape belongs to the dialog; the drawer stays open behind it.
    if (menuOpen && !settingsOpen && event.key === "Escape") closeMenu();
  }

  const nav = strings.shell.nav;
  // href is null until the screen is built; those items render disabled with "Coming soon".
  const items: { label: string; href: string | null }[] = [
    { label: nav.home, href: "/" },
    { label: nav.runEncounter, href: null },
    { label: nav.encounterBuilder, href: null },
    { label: nav.characters, href: null },
    { label: nav.legendKeeper, href: null },
  ];
</script>

<svelte:window onkeydown={onKeydown} />

<div class="shell">
  {#if menuOpen}
    <button class="backdrop" tabindex="-1" aria-label={strings.shell.closeMenu} onclick={closeMenu}></button>
  {/if}

  <nav id="sidebar" class="sidebar" class:open={menuOpen} aria-label={strings.shell.mainNav}>
    <div class="app-name">{strings.appName}</div>

    <div class="group">
      <span class="label">{strings.shell.campaign}</span>
      <button class="btn campaign" disabled>{strings.shell.noCampaign}</button>
      <span class="soon">{strings.comingSoon}</span>
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
      <button
        class="btn settings"
        aria-label={strings.shell.openSettings}
        title={strings.shell.openSettings}
        aria-haspopup="dialog"
        onclick={() => (settingsOpen = true)}
      >
        <!-- Gear icon from Lucide (ISC licence) -->
        <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path
            d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"
          />
          <circle cx="12" cy="12" r="3" />
        </svg>
      </button>
    </div>
  </nav>

  <SettingsDialog bind:open={settingsOpen} />

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

      <search class="search">
        <label for="global-search" class="sr-only">{strings.shell.searchLabel}</label>
        <input id="global-search" type="search" placeholder={strings.shell.searchPlaceholder} disabled />
        <span class="soon">{strings.comingSoon}</span>
      </search>
    </header>

    <main class="content">
      {@render children()}
    </main>
  </div>
</div>

<style>
  .shell {
    display: flex;
    min-height: 100vh;
  }

  .sidebar {
    flex: 0 0 var(--sidebar-width);
    display: flex;
    flex-direction: column;
    gap: var(--space-6);
    padding: var(--space-5) var(--space-3);
    background: var(--color-surface);
    border-right: var(--border-width) solid var(--color-border);
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

  .campaign {
    justify-content: flex-start;
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

  .settings {
    padding: 0;
    width: var(--control-height);
    border-color: transparent;
    background: transparent;
    color: var(--color-text-muted);
  }

  .settings:hover {
    background: var(--color-surface-sunken);
    color: var(--color-text);
  }

  .settings svg {
    width: var(--icon-size);
    height: var(--icon-size);
  }

  .column {
    flex: 1;
    min-width: 0;
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
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    max-width: var(--content-max-width);
    padding: var(--space-5) var(--space-7) var(--space-3);
  }

  .search input {
    width: 100%;
    min-height: var(--control-height-xl);
    padding: 0 var(--space-5);
    border: var(--border-width) solid var(--color-border-strong);
    border-radius: var(--radius-lg);
    background: var(--color-surface);
    font-size: var(--text-xl);
  }

  .search input:disabled {
    cursor: not-allowed;
    background: var(--color-surface-sunken);
    border-color: var(--color-border);
  }

  .search input::placeholder {
    color: var(--color-text-muted);
  }

  .content {
    flex: 1;
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

  @media (prefers-reduced-motion: reduce) {
    .sidebar,
    .sidebar.open {
      transition: none;
    }
  }
</style>
