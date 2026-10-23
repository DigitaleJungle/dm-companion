<script lang="ts">
  import { imageUrl } from "$lib/rules/images";

  // The character's own picture when it has one; else paths into the imported rules images, best first; else a person icon.
  let { candidates, alt, own = null }: { candidates: string[]; alt: string; own?: string | null } = $props();

  let index = $state(0);
  let src = $state<string | null>(null);

  $effect(() => {
    const path = candidates[index];
    src = null;
    if (own) src = own;
    else if (path) imageUrl(path).then((url) => (src = url));
  });
</script>

<div class="avatar">
  {#if src}
    <img {src} {alt} onerror={() => (own ? (own = null) : index++)} />
  {:else}
    <svg viewBox="0 0 24 24" role="img" aria-label={alt} fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" />
    </svg>
  {/if}
</div>

<style>
  .avatar {
    flex: none;
    display: grid;
    place-items: center;
    width: var(--avatar-size);
    aspect-ratio: 1;
    overflow: hidden;
    border-radius: var(--radius-md);
    background: var(--color-surface-sunken);
    color: var(--color-text-muted);
  }

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    object-position: top;
  }

  svg {
    width: 60%;
    height: 60%;
  }
</style>
