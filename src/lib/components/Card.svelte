<script lang="ts">
  import type { Snippet } from "svelte";

  let { title, action, children }: { title: string; action?: Snippet; children: Snippet } = $props();
</script>

<section class="card" aria-label={title}>
  <header>
    <h2 class="label">{title}</h2>
    {#if action}<div class="action">{@render action()}</div>{/if}
  </header>
  {@render children()}
</section>

<style>
  .card {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    padding: var(--space-5);
    background: var(--color-surface);
    border: var(--border-width) solid var(--color-border);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-card);
  }

  header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--space-3);
  }

  .action {
    text-align: right;
  }
</style>
