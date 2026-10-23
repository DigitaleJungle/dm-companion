<script lang="ts">
  import { imageUrl } from "$lib/rules/images";
  import { rules } from "$lib/stores/rules.svelte";

  // The imported picture of a species, class, subclass or background; its initial on a tinted panel when there's none.
  // It fills its parent, which sets the size (position: relative and an aspect ratio), so every picture is cropped the same.
  // A picture whose shape is far from the frame's (a wide scene in a tall frame) isn't cut: it's shown whole on a blurred
  // copy of itself.
  let {
    path,
    name,
    focus = "top",
    frame = null,
  }: {
    path: string;
    name: string;
    /** Which part stays in view when the picture is cropped ("top" suits portraits, "center" scenes). */
    focus?: "top" | "center";
    /** The frame's width ÷ height, to show far-off shapes whole; null: always crop. */
    frame?: number | null;
  } = $props();

  /** Cropping more than this (as a ratio between the picture's and the frame's shape) cuts too much: show it whole. */
  const MAX_CROP = 1.5;

  let src = $state<string | null>(null);
  let failed = $state(false);
  let whole = $state(false);

  $effect(() => {
    const p = path;
    src = null;
    failed = false;
    whole = false;
    if (rules.status?.images) imageUrl(p).then((url) => (src = url));
  });

  function measure(e: Event) {
    if (!frame) return;
    const img = e.currentTarget as HTMLImageElement;
    const ratio = img.naturalWidth / img.naturalHeight;
    whole = ratio / frame > MAX_CROP || frame / ratio > MAX_CROP;
  }
</script>

<div class="art">
  {#if src && !failed}
    {#if whole}<img class="backdrop" {src} alt="" aria-hidden="true" />{/if}
    <img {src} alt="" loading="lazy" decoding="async" class:whole style:object-position={focus} onload={measure} onerror={() => (failed = true)} />
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
  }

  img.whole {
    object-fit: contain;
  }

  /* Behind a picture shown whole: the same picture, filling the frame, blurred and dimmed. */
  .backdrop {
    object-fit: cover;
    filter: blur(var(--space-4)) brightness(0.7);
    transform: scale(1.15);
  }

  .initial {
    color: var(--color-text-muted);
    font-size: var(--text-2xl);
    font-weight: var(--weight-bold);
  }
</style>
