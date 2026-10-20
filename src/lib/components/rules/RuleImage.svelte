<script lang="ts">
  import { rules } from "$lib/stores/rules.svelte";
  import { imageUrl } from "$lib/rules/images";
  import { plainText } from "$lib/rules/tags";
  import type { Entry } from "./Entries.svelte";

  let { image }: { image: Entry } = $props();

  // Only imported images are shown; external URLs are never fetched.
  const path = $derived(rules.status?.images && image?.href?.type === "internal" ? (image.href.path as string) : null);
  const title = $derived(image?.title ? plainText(String(image.title)) : "");
  let src = $state<string | null>(null);

  $effect(() => {
    src = null;
    if (path) imageUrl(path).then((url) => (src = url));
  });
</script>

{#if path && src}
  <figure>
    <img {src} alt={title} loading="lazy" decoding="async" width={image.width} height={image.height} />
    {#if title}<figcaption>{title}</figcaption>{/if}
  </figure>
{/if}

<style>
  figure {
    margin: var(--space-4) 0;
  }

  img {
    display: block;
    max-width: 100%;
    height: auto;
    border-radius: var(--radius-md);
  }

  figcaption {
    margin-top: var(--space-2);
    color: var(--color-text-muted);
    font-size: var(--text-sm);
  }
</style>
