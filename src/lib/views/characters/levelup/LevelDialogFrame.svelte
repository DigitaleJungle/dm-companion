<script lang="ts">
  import { untrack, type Snippet } from "svelte";
  import EntityPopover from "$lib/components/rules/EntityPopover.svelte";
  import { strings } from "$lib/strings";

  // The large modal both level dialogs (Level up, Edit → Levels) share: a header with the title and ✕, the body
  // between, a footer bar for the buttons, and the rules preview card. Escape and ✕ ask `onclose`, which may say no.
  let {
    open,
    id,
    title,
    onopen,
    onclose,
    children,
    footer,
    extra,
  }: {
    open: boolean;
    id: string;
    title: string;
    /** Runs each time the dialog opens (loading, choosing what to show). */
    onopen?: () => void;
    onclose: () => void;
    children: Snippet;
    footer: Snippet;
    /** Rendered inside the dialog even while closed (a nested confirm dialog). */
    extra?: Snippet;
  } = $props();

  let dialog: HTMLDialogElement | undefined = $state();

  $effect(() => {
    if (open && dialog && !dialog.open) {
      untrack(() => onopen?.());
      dialog.showModal();
    } else if (!open && dialog?.open) {
      dialog.close();
    }
  });
</script>

<dialog
  bind:this={dialog}
  class="frame"
  aria-labelledby="{id}-title"
  oncancel={(e) => {
    e.preventDefault();
    onclose();
  }}
>
  {#if open}
    <header class="top">
      <h1 id="{id}-title">{title}</h1>
      <button class="icon-btn" aria-label={strings.characters.levelUpDialog.close} onclick={onclose}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" /></svg>
      </button>
    </header>
    <div class="middle">{@render children()}</div>
    <footer class="bottom">{@render footer()}</footer>
    <EntityPopover />
  {/if}
  {@render extra?.()}
</dialog>

<style>
  .frame {
    width: min(100% - 2 * var(--space-4), var(--wizard-content-width));
    height: min(100% - 2 * var(--space-4), 90vh);
    max-width: none;
    max-height: none;
    padding: 0;
    border: var(--border-width) solid var(--color-border);
    border-radius: var(--radius-lg);
    background: var(--color-bg);
    color: var(--color-text);
    overflow: hidden;
  }

  .frame[open] {
    display: flex;
    flex-direction: column;
  }

  .frame::backdrop {
    background: var(--color-backdrop);
  }

  .top,
  .bottom {
    flex: none;
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-3) var(--space-5);
    background: var(--color-surface);
  }

  .top {
    justify-content: space-between;
    border-bottom: var(--border-width) solid var(--color-border);
  }

  .top h1 {
    font-size: var(--text-lg);
    font-weight: var(--weight-semibold);
  }

  .top svg {
    width: var(--icon-size);
    height: var(--icon-size);
  }

  .middle {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }

  .bottom {
    justify-content: flex-end;
    border-top: var(--border-width) solid var(--color-border);
  }
</style>
