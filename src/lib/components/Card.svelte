<script lang="ts">
  import type { Snippet } from "svelte";

  let {
    title,
    controls,
    ondragstart,
    ondragend,
    children,
  }: {
    title: string;
    controls?: Snippet;
    /** When set, a drag handle appears next to the controls while the card is hovered. */
    ondragstart?: (event: DragEvent) => void;
    ondragend?: (event: DragEvent) => void;
    children: Snippet;
  } = $props();
</script>

<section class="card" aria-label={title}>
  <header>
    <h2 class="label">{title}</h2>
    {#if ondragstart}
      <!-- Mouse-only drag handle; keyboard users move cards from the controls menu -->
      <span class="handle" draggable="true" aria-hidden="true" {ondragstart} {ondragend}>
        <svg viewBox="0 0 24 24">
          <path d="M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01" stroke="currentColor" stroke-width="3" stroke-linecap="round" />
        </svg>
      </span>
    {/if}
    {#if controls}<div class="controls">{@render controls()}</div>{/if}
  </header>
  {@render children()}
</section>

<style>
  .card {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    height: 100%;
    padding: var(--space-5);
    background: var(--color-surface);
    border: var(--border-width) solid var(--color-border);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-card);
  }

  header {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    min-height: var(--control-height-sm);
  }

  h2 {
    flex: 1;
  }

  .handle {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: var(--control-height-sm);
    height: var(--control-height-sm);
    border-radius: var(--radius-sm);
    color: var(--color-text-muted);
    cursor: grab;
    opacity: 0;
    transition: opacity var(--duration-drawer) ease;
  }

  .card:hover .handle {
    opacity: 1;
  }

  .handle:hover {
    background: var(--color-surface-sunken);
    color: var(--color-text);
  }

  .handle svg {
    width: var(--icon-size);
    height: var(--icon-size);
  }

  header:has(.handle) {
    gap: var(--space-1);
  }

  header:has(.handle) h2 {
    margin-right: var(--space-2);
  }

  .controls {
    margin-right: calc(-1 * var(--space-2));
  }

  :global([data-motion="reduce"]) .handle {
    transition: none;
  }
</style>
