<script lang="ts">
  import { fly } from "svelte/transition";
  import { dismiss, notification } from "$lib/stores/notifications.svelte";
  import { reduceMotion } from "$lib/stores/theme.svelte";
  import { strings } from "$lib/strings";

  // The single notification popup in the bottom-right corner. Clicking it closes it.
  // Only an entrance animation: a replaced one must vanish at once, so there's never two on screen.
  const motion = () => ({ y: 16, duration: reduceMotion() ? 0 : 200 });
</script>

<!-- The live region always exists, so screen readers hear each new message. -->
<div class="region" role="status" aria-live="polite">
  {#if notification.current}
    {#key notification.current.id}
      <button class="popup" title={strings.notification.dismiss} in:fly={motion()} onclick={dismiss}>
        <span class="message">{notification.current.message}</span>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10M17 7L7 17" stroke="currentColor" stroke-width="2" stroke-linecap="round" /></svg>
        <span class="sr-only">{strings.notification.dismiss}</span>
      </button>
    {/key}
  {/if}
</div>

<style>
  .region {
    position: fixed;
    right: var(--space-4);
    bottom: var(--space-4);
    z-index: var(--z-notification);
    max-width: min(var(--notification-width), calc(100vw - 2 * var(--space-4)));
  }

  .popup {
    display: flex;
    align-items: flex-start;
    gap: var(--space-3);
    width: 100%;
    padding: var(--space-3) var(--space-4);
    border: var(--border-width) solid var(--color-border-strong);
    border-radius: var(--radius-md);
    background: var(--color-surface);
    box-shadow: var(--shadow-drawer);
    color: var(--color-text);
    font-size: var(--text-sm);
    line-height: var(--leading-normal);
    text-align: left;
    cursor: pointer;
  }

  .popup:hover {
    background: var(--color-surface-sunken);
  }

  .message {
    flex: 1;
    min-width: 0;
  }

  svg {
    flex: none;
    width: var(--space-4);
    height: var(--space-4);
    margin-top: calc(var(--space-1) / 2);
    color: var(--color-text-muted);
  }
</style>
