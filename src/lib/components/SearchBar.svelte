<script lang="ts">
  import { strings } from "$lib/strings";

  let { placeholder = strings.search.placeholder }: { placeholder?: string } = $props();
</script>

<search class="search-bar">
  <label for="global-search" class="sr-only">{strings.search.label}</label>
  <input id="global-search" type="search" {placeholder} disabled />
  <span class="soon">{strings.comingSoon}</span>
</search>

<style>
  .search-bar {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  input {
    width: 100%;
    min-height: var(--control-height-xl);
    padding: 0 var(--space-5);
    border: var(--border-width) solid var(--color-border-strong);
    border-radius: var(--radius-lg);
    background: var(--color-surface);
    font-size: var(--text-xl);
  }

  input:disabled {
    cursor: not-allowed;
    background: var(--color-surface-sunken);
    border-color: var(--color-border);
  }

  input::placeholder {
    color: var(--color-text-placeholder);
    font-size: var(--text-md);
  }
</style>
