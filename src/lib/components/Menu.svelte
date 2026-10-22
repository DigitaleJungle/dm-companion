<script lang="ts" module>
  /** An item runs `onselect`, or opens a submenu of `items` (one level deep). */
  export type MenuItem = { label: string; onselect?: () => void; items?: MenuItem[]; disabled?: boolean; current?: boolean };
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
  /** The label of the item whose submenu is open. */
  let sub = $state<string | null>(null);
  let root: HTMLDivElement | undefined = $state();
  let list: HTMLUListElement | undefined = $state();
  let button: HTMLButtonElement | undefined = $state();

  /** The items of one menu level, not those of a submenu inside it. */
  const itemsOf = (menu: Element | null | undefined) => [...(menu?.querySelectorAll<HTMLElement>(':scope > li > [role="menuitem"]') ?? [])];

  async function show(focusLast = false) {
    open = true;
    sub = null;
    await tick();
    const all = itemsOf(list);
    (focusLast ? all.at(-1) : all[0])?.focus();
  }

  function hide(returnFocus: boolean) {
    open = false;
    sub = null;
    if (returnFocus) button?.focus();
  }

  async function openSub(label: string) {
    sub = label;
    await tick();
    itemsOf(document.getElementById(subId(label)))[0]?.focus();
  }

  function closeSub() {
    const label = sub;
    sub = null;
    itemsOf(list).find((el) => el.dataset.sub === label)?.focus();
  }

  const subId = (label: string) => `${id}-sub-${label.replace(/\W+/g, "-")}`;

  /** Arrow keys, Home and End within one menu level. */
  function move(event: KeyboardEvent, all: HTMLElement[]) {
    const at = all.indexOf(document.activeElement as HTMLElement);
    const go = (i: number) => all[(i + all.length) % all.length]?.focus();
    if (event.key === "ArrowDown") go(at + 1);
    else if (event.key === "ArrowUp") go(at - 1);
    else if (event.key === "Home") go(0);
    else if (event.key === "End") go(all.length - 1);
    else return false;
    return true;
  }

  function onTriggerKeydown(event: KeyboardEvent) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      show(event.key === "ArrowUp");
    }
  }

  // Menu button pattern: arrows move between items, Right opens a submenu, Escape closes, Tab leaves.
  function onMenuKeydown(event: KeyboardEvent) {
    const parent = (document.activeElement as HTMLElement | null)?.dataset.sub;
    if (move(event, itemsOf(list))) sub = null;
    else if (event.key === "ArrowRight" && parent) openSub(parent);
    else if (event.key === "Escape") hide(true);
    else if (event.key === "Tab") hide(false);
    else return;
    event.preventDefault();
  }

  // In a submenu: arrows stay inside it, Left or Escape goes back to its item.
  function onSubKeydown(event: KeyboardEvent) {
    const moved = move(event, itemsOf(event.currentTarget as Element));
    if (!moved && (event.key === "ArrowLeft" || event.key === "Escape")) closeSub();
    else if (!moved && event.key === "Tab") hide(false);
    else if (!moved) return;
    event.preventDefault();
    event.stopPropagation();
  }

  function select(item: MenuItem) {
    if (item.disabled) return;
    if (item.items) {
      openSub(item.label);
      return;
    }
    hide(false);
    item.onselect?.();
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

  {#snippet entry(item: MenuItem)}
    <button
      role="menuitem"
      tabindex="-1"
      data-sub={item.items ? item.label : undefined}
      aria-haspopup={item.items ? "menu" : undefined}
      aria-expanded={item.items ? sub === item.label : undefined}
      aria-controls={item.items && sub === item.label ? subId(item.label) : undefined}
      aria-disabled={item.disabled || undefined}
      aria-current={item.current || undefined}
      onclick={() => select(item)}
    >
      <span>{item.label}</span>
      {#if item.current}
        <svg class="check" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M5 12l5 5 9-10" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      {/if}
      {#if item.items}
        <svg class="chevron" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M9 6l6 6-6 6" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      {/if}
    </button>
  {/snippet}

  {#if open}
    <ul bind:this={list} id="{id}-list" class="menu {align}" role="menu" aria-labelledby={id} tabindex="-1" onkeydown={onMenuKeydown}>
      {#each items as item (item.label)}
        <li role="none" class:has-sub={!!item.items} onpointerenter={() => (sub = item.items && !item.disabled ? item.label : null)}>
          {@render entry(item)}
          {#if item.items && sub === item.label}
            <ul id={subId(item.label)} class="menu sub {align}" role="menu" aria-label={item.label} tabindex="-1" onkeydown={onSubKeydown}>
              {#each item.items as child (child.label)}
                <li role="none">{@render entry(child)}</li>
              {/each}
            </ul>
          {/if}
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

  /* A submenu opens beside its item: to the left for menus on the right edge, to the right otherwise. */
  .has-sub {
    position: relative;
  }

  .menu.sub {
    top: calc(-1 * var(--space-1));
  }

  .menu.sub.end {
    right: calc(100% + var(--space-1));
  }

  .menu.sub.start {
    left: calc(100% + var(--space-1));
  }

  [role="menuitem"][aria-expanded="true"] {
    background: var(--color-surface-sunken);
  }

  .chevron {
    flex: none;
    width: var(--space-4);
    height: var(--space-4);
    color: var(--color-text-muted);
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
