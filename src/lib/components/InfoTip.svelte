<script lang="ts">
  // `alert`: a red (!) instead of the (i), for something to check.
  let { id, label, text, alert = false }: { id: string; label: string; text: string; alert?: boolean } = $props();
</script>

<!-- Shows on hover, focus and click; the text is also the button's description for screen readers. -->
<span class="info-tip">
  <button type="button" class="trigger" class:alert aria-label={label} aria-describedby={id}>
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2" />
      <path d={alert ? "M12 7v6M12 16h.01" : "M12 11v5M12 8h.01"} stroke="currentColor" stroke-width="2" stroke-linecap="round" />
    </svg>
  </button>
  <span {id} role="tooltip" class="tip">{text}</span>
</span>

<style>
  .info-tip {
    position: relative;
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

  svg {
    width: var(--icon-size);
    height: var(--icon-size);
  }

  .tip {
    position: absolute;
    top: calc(100% + var(--space-1));
    left: 0;
    z-index: var(--z-menu);
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
    visibility: hidden;
    opacity: 0;
    transition: opacity var(--duration-drawer) ease;
  }

  /* Focus, not only focus-visible, so a click opens it too. */
  .info-tip:hover .tip,
  .trigger:focus + .tip {
    visibility: visible;
    opacity: 1;
  }

  :global([data-motion="reduce"]) .tip {
    transition: none;
  }
</style>
