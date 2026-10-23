<script lang="ts">
  import type { Snippet } from "svelte";

  // `icon`: the (i), a red (!) for something to check, or a gold star (a weapon's mastery).
  // `children`, when given, is shown instead of `text` (for formatting, like a bold name); `text` stays for screen readers.
  let {
    id,
    label,
    text,
    icon = "info",
    children,
  }: { id: string; label: string; text: string; icon?: "info" | "alert" | "star"; children?: Snippet } = $props();

  let trigger: HTMLButtonElement | undefined = $state();
  let tip: HTMLSpanElement | undefined = $state();

  // The tip opens in the top layer (a popover), so a scrolling table or list around it can't clip it.
  function show() {
    if (!trigger || !tip || tip.matches(":popover-open")) return;
    tip.showPopover();
    const at = trigger.getBoundingClientRect();
    const gap = 4;
    const left = Math.max(gap, Math.min(at.left, window.innerWidth - tip.offsetWidth - gap));
    const below = at.bottom + gap;
    const top = below + tip.offsetHeight > window.innerHeight ? at.top - tip.offsetHeight - gap : below;
    tip.style.left = `${left}px`;
    tip.style.top = `${top}px`;
  }

  function hide() {
    if (tip?.matches(":popover-open") && !trigger?.matches(":hover, :focus")) tip.hidePopover();
  }
</script>

<!-- Shows on hover, focus and click; the text is also the button's description for screen readers. -->
<span class="info-tip">
  <button
    bind:this={trigger}
    type="button"
    class="trigger"
    class:alert={icon === "alert"}
    class:star={icon === "star"}
    aria-label={label}
    aria-describedby={id}
    onmouseenter={show}
    onmouseleave={hide}
    onfocus={show}
    onblur={hide}
    onclick={show}
  >
    <svg viewBox="0 0 24 24" aria-hidden="true">
      {#if icon === "star"}
        <path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z" fill="currentColor" />
      {:else}
        <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2" />
        <path d={icon === "alert" ? "M12 7v6M12 16h.01" : "M12 11v5M12 8h.01"} stroke="currentColor" stroke-width="2" stroke-linecap="round" />
      {/if}
    </svg>
  </button>
  <span bind:this={tip} {id} role="tooltip" class="tip" popover="manual" aria-label={children ? text : undefined}>{#if children}{@render children()}{:else}{text}{/if}</span>
</span>

<style>
  .info-tip {
    display: inline-flex;
    vertical-align: middle;
  }

  .trigger {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: var(--control-height-sm);
    height: var(--control-height-sm);
    padding: 0;
    border: none;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--color-text-muted);
    cursor: help;
  }

  .trigger:hover {
    color: var(--color-text);
  }

  .trigger.alert,
  .trigger.alert:hover {
    color: var(--color-danger);
  }

  .trigger.star,
  .trigger.star:hover {
    color: var(--color-inspiration-strong);
  }

  svg {
    width: var(--icon-size);
    height: var(--icon-size);
  }

  .tip {
    position: fixed;
    inset: auto;
    margin: 0;
    width: max-content;
    max-width: var(--tooltip-width);
    padding: var(--space-2) var(--space-3);
    border: var(--border-width) solid var(--color-border);
    border-radius: var(--radius-md);
    background: var(--color-surface);
    box-shadow: var(--shadow-drawer);
    color: var(--color-text);
    font-size: var(--text-sm);
    font-weight: var(--weight-regular);
    line-height: var(--leading-normal);
    text-align: left;
    /* Not the nowrap of a table cell it sits in. */
    white-space: normal;
  }
</style>
