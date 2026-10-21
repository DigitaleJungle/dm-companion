<script lang="ts" module>
  export type MenuItem = { label: string; onselect: () => void; disabled?: boolean; current?: boolean };
</script>

<script lang="ts">
  import type { Snippet } from "svelte";
  import { tick } from "svelte";

  let {
    id,
    label,
    items,
    align = "end",
    triggerClass = "",
    trigger,
  }: {
    id: string;
    label: string;
    items: MenuItem[];
    align?: "start" | "end";
    triggerClass?: string;
    trigger: Snippet;
  } = $props();

  let open = $state(false);
  let root: HTMLDivElement | undefined = $state();
  let button: HTMLButtonElement | undefined = $state();

  const menuItems = () => [...(root?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];

  async function show(focusLast = false) {
    open = true;
    await tick();
    const all = menuItems();
    (focusLast ? all.at(-1) : all[0])?.focus();
  }

  function hide(returnFocus: boolean) {
    open = false;
    if (returnFocus) button?.focus();
  }

  function onTriggerKeydown(event: KeyboardEvent) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      show(event.key === "ArrowUp");
    }
  }

  // Menu button pattern: arrows move between items, Escape closes, Tab leaves.
  function onMenuKeydown(event: KeyboardEvent) {
    const all = menuItems();
    const at = all.indexOf(document.activeElement as HTMLElement);
    const go = (i: number) => all[(i + all.length) % all.length]?.focus();
    if (event.key === "ArrowDown") go(at + 1);
    else if (event.key === "ArrowUp") go(at - 1);
    else if (event.key === "Home") go(0);
    else if (event.key === "End") go(all.length - 1);
    else if (event.key === "Escape") hide(true);
    else if (event.key === "Tab") hide(false);
    else return;
    event.preventDefault();
  }

  function select(item: MenuItem) {
    if (item.disabled) return;
    hide(false);
    item.onselect();
  }

  function onWindowPointerdown(event: PointerEvent) {
    if (open && root && !root.contains(event.target as Node)) hide(false);
  }
</script>

<svelte:window onpointerdown={onWindowPointerdown} />

<div class="menu-root" bind:this={root}>
  <button
    bind:this={button}
    {id}
    class={triggerClass}
    aria-label={label}
    title={label}
    aria-haspopup="menu"
    aria-expanded={open}
    aria-controls="{id}-list"
    onclick={() => (open ? hide(true) : show())}
    onkeydown={onTriggerKeydown}
  >
    {@render trigger()}
  </button>

  {#if open}
    <ul id="{id}-list" class="menu {align}" role="menu" aria-labelledby={id} tabindex="-1" onkeydown={onMenuKeydown}>
      {#each items as item (item.label)}
        <li role="none">
          <button role="menuitem" tabindex="-1" aria-disabled={item.disabled || undefined} aria-current={item.current || undefined} onclick={() => select(item)}>
            <span>{item.label}</span>
            {#if item.current}
              <svg class="check" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M5 12l5 5 9-10" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            {/if}
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .menu-root {
    position: relative;
  }

  .menu {
    position: absolute;
    top: calc(100% + var(--space-1));
    z-index: var(--z-menu);
    min-width: var(--menu-min-width);
    margin: 0;
    padding: var(--space-1);
    list-style: none;
    background: var(--color-surface);
    border: var(--border-width) solid var(--color-border);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-drawer);
  }

  .menu.end {
    right: 0;
  }

  .menu.start {
    left: 0;
  }

  [role="menuitem"] {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    width: 100%;
    padding: var(--space-2) var(--space-3);
    border: none;
    border-radius: var(--radius-sm);
    background: transparent;
    text-align: left;
    font-size: var(--text-sm);
    white-space: nowrap;
    cursor: pointer;
  }

  [role="menuitem"]:hover,
  [role="menuitem"]:focus-visible {
    background: var(--color-surface-sunken);
  }

  .check {
    flex: none;
    width: var(--icon-size);
    height: var(--icon-size);
    color: var(--color-success);
  }

  [role="menuitem"][aria-disabled="true"] {
    color: var(--color-text-muted);
    cursor: default;
  }
</style>
