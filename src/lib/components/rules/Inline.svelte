<script lang="ts">
  import { parseTags, type Segment } from "$lib/rules/tags";
  import { openPreview, previewsEnabled } from "$lib/rules/preview.svelte";
  import Inline from "./Inline.svelte";

  let { text, segments }: { text?: string; segments?: Segment[] } = $props();

  const linked = previewsEnabled();
  const parts = $derived(segments ?? parseTags(text ?? ""));
</script>

<!-- Kept on few lines on purpose: whitespace between inline elements would show up as stray spaces. -->
{#each parts as part, i (i)}{#if part.type === "text"}{part.text}{:else if part.type === "link"}{#if linked}<button type="button" class="ref" onclick={(e) => openPreview(part, e.currentTarget)}>{part.text}</button>{:else}{part.text}{/if}{:else if part.style === "b"}<strong><Inline segments={part.children} /></strong>{:else if part.style === "i"}<em><Inline segments={part.children} /></em>{:else if part.style === "u"}<u><Inline segments={part.children} /></u>{:else if part.style === "s"}<s><Inline segments={part.children} /></s>{:else}<span class="note"><Inline segments={part.children} /></span>{/if}{/each}

<style>
  .ref {
    display: inline;
    padding: 0;
    border: none;
    background: none;
    color: var(--color-link);
    font: inherit;
    text-align: inherit;
    text-decoration: underline;
    text-decoration-color: color-mix(in srgb, var(--color-link) 40%, transparent);
    text-underline-offset: 2px;
    cursor: pointer;
  }

  .ref:hover {
    text-decoration-color: currentColor;
  }

  .note {
    color: var(--color-text-muted);
    font-style: italic;
  }
</style>
