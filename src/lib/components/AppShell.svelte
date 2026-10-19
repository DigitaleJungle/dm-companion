<script lang="ts">
  import type { Snippet } from "svelte";
  import { page } from "$app/state";
  import { afterNavigate } from "$app/navigation";
  import { strings } from "$lib/strings";
  import { modKey } from "$lib/platform";

  let { children }: { children: Snippet } = $props();

  // Narrow windows only: the sidebar becomes a drawer behind the menu toggle.
  let menuOpen = $state(false);
  let toggle: HTMLButtonElement | undefined = $state();

  function closeMenu() {
    menuOpen = false;
    toggle?.focus();
  }

  afterNavigate(() => {
    menuOpen = false;
  });

  function onKeydown(event: KeyboardEvent) {
    if (menuOpen && event.key === "Escape") closeMenu();
  }

  const nav = strings.shell.nav;
  // href is null until the screen is built; those items render disabled with "Coming soon".
  const items: { label: string; shortcut: string; href: string | null }[] = [
    { label: nav.home, shortcut: "F1", href: "/" },
    { label: nav.search, shortcut: modKey("K"), href: null },
    { label: nav.runEncounter, shortcut: "F2", href: null },
    { label: nav.encounterBuilder, shortcut: "F3", href: null },
    { label: nav.characters, shortcut: "F4", href: null },
    { label: nav.legendKeeper, shortcut: "F5", href: null },
  ];
</script>

<svelte:window onkeydown={onKeydown} />

<div class="shell">
  <header class="topbar">
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
  </header>

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
              <span class="nav-label">{item.label}</span>
              <kbd>{item.shortcut}</kbd>
            </a>
          {:else}
            <span class="nav-item disabled">
              <span class="nav-label">
                {item.label}
                <span class="soon">{strings.comingSoon}</span>
              </span>
              <kbd>{item.shortcut}</kbd>
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
  </nav>

  <main class="content">
    {@render children()}
  </main>
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

  kbd {
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    color: var(--color-text-muted);
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

  .content {
    flex: 1;
    min-width: 0;
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

    .topbar {
      position: sticky;
      top: 0;
      z-index: calc(var(--z-drawer) - 2);
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
