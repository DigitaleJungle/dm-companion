<script lang="ts">
  import { strings } from "$lib/strings";

  let { open = $bindable(false) }: { open?: boolean } = $props();
  let dialog: HTMLDialogElement | undefined = $state();

  // Native modal dialog: keeps focus inside, closes on Escape, returns focus to the opener.
  $effect(() => {
    if (open && !dialog?.open) dialog?.showModal();
    if (!open && dialog?.open) dialog.close();
  });

  function onBackdropClick(event: MouseEvent) {
    if (event.target === dialog) open = false;
  }
</script>

<dialog bind:this={dialog} aria-labelledby="settings-title" onclose={() => (open = false)} onclick={onBackdropClick}>
  <div class="panel">
    <header>
      <h2 id="settings-title">{strings.settings.title}</h2>
      <button class="btn close" aria-label={strings.settings.close} onclick={() => (open = false)}>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
        </svg>
      </button>
    </header>
    <p class="empty">{strings.settings.empty}</p>
  </div>
</dialog>

<style>
  dialog {
    width: min(var(--dialog-width), calc(100vw - 2 * var(--space-4)));
    padding: 0;
    border: var(--border-width) solid var(--color-border);
    border-radius: var(--radius-lg);
    background: var(--color-surface);
    color: var(--color-text);
    box-shadow: var(--shadow-drawer);
  }

  dialog::backdrop {
    background: var(--color-backdrop);
  }

  .panel {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    padding: var(--space-6);
  }

  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
  }

  h2 {
    font-size: var(--text-xl);
    font-weight: var(--weight-bold);
  }

  .close {
    padding: 0;
    width: var(--control-height);
  }

  .close svg {
    width: var(--icon-size);
    height: var(--icon-size);
  }

  .empty {
    color: var(--color-text-muted);
    font-size: var(--text-sm);
  }
</style>
