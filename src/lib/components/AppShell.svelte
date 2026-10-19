<script lang="ts">
  import type { Snippet } from "svelte";
  import { page } from "$app/state";
  import { strings } from "$lib/strings";
  import { modKey } from "$lib/platform";

  let { children }: { children: Snippet } = $props();

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

<div class="shell">
  <nav class="sidebar" aria-label={strings.shell.mainNav}>
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

  /* Small windows: the sidebar stacks above the content */
  @media (max-width: 720px) {
    .shell {
      flex-direction: column;
    }

    .sidebar {
      flex: none;
      border-right: none;
      border-bottom: var(--border-width) solid var(--color-border);
    }

    .player-box {
      margin-top: 0;
    }
  }
</style>
