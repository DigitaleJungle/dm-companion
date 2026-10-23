<script lang="ts">
  // A spinning ring for loading states; `label` is what screen readers hear. Stands still when animations are off.
  let { label }: { label: string } = $props();
</script>

<span class="spinner-wrap" role="status">
  <span class="spinner" aria-hidden="true"></span>
  <span class="sr-only">{label}</span>
</span>

<style>
  .spinner-wrap {
    display: flex;
    justify-content: center;
    padding: var(--space-6);
  }

  .spinner {
    width: var(--icon-size);
    height: var(--icon-size);
    border: calc(2 * var(--border-width)) solid var(--color-border-strong);
    border-top-color: var(--color-link);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  :global([data-motion="reduce"]) .spinner {
    animation: none;
  }
</style>
