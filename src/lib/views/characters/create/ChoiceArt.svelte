<script lang="ts">
  import { imageUrl } from "$lib/rules/images";
  import { rules } from "$lib/stores/rules.svelte";

  // The imported picture of a species, class or background; its initial on a tinted panel when there's none.
  // It fills its parent, which sets the size (position: relative and an aspect ratio), so every picture is cropped the same.
  let { path, name }: { path: string; name: string } = $props();

  let src = $state<string | null>(null);
  let failed = $state(false);

  $effect(() => {
    const p = path;
    src = null;
    failed = false;
    if (rules.status?.images) imageUrl(p).then((url) => (src = url));
  });
</script>

<div class="art">
  {#if src && !failed}
    <img {src} alt="" loading="lazy" decoding="async" onerror={() => (failed = true)} />
  {:else}
    <span class="initial" aria-hidden="true">{name.charAt(0)}</span>
  {/if}
</div>

<style>
  .art {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    overflow: hidden;
    background: var(--color-surface-sunken);
  }

  img {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    object-position: top;
  }

  .initial {
    color: var(--color-text-muted);
    font-size: var(--text-2xl);
    font-weight: var(--weight-bold);
  }
</style>
