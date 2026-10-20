<script lang="ts">
  import { tick } from "svelte";
  import { findEntity, type Entity } from "$lib/api/rules";
  import { errorMessage } from "$lib/api/storage";
  import { closePreview, isPreviewAnchor, preview, previewBack, setPreviewCard } from "$lib/rules/preview.svelte";
  import { strings } from "$lib/strings";
  import EntityView from "./EntityView.svelte";

  const t = strings.library;
  const MARGIN = 12;

  let card: HTMLDivElement | undefined = $state();
  let entity = $state<Entity | null>(null);
  let status = $state<"loading" | "missing" | "error" | "ready">("loading");
  let error = $state("");
  const current = $derived(preview.trail.at(-1) ?? null);

  /** Below the reference, or above it when there's more room there. */
  const position = $derived.by(() => {
    const rect = preview.anchorRect;
    if (!rect) return { left: MARGIN, top: MARGIN, maxHeight: 400, above: false };
    const width = Math.min(440, window.innerWidth - 2 * MARGIN);
    const below = window.innerHeight - rect.bottom - MARGIN;
    const above = rect.top - MARGIN;
    const showAbove = below < 320 && above > below;
    return {
      left: Math.max(MARGIN, Math.min(rect.left, window.innerWidth - width - MARGIN)),
      top: showAbove ? rect.top - 6 : rect.bottom + 6,
      maxHeight: Math.max(200, (showAbove ? above : below) - 6),
      above: showAbove,
    };
  });

  $effect(() => {
    setPreviewCard(card ?? null);
  });

  $effect(() => {
    const ref = current;
    if (!ref) return;
    let live = true; // ignore a slow answer for a reference we've moved past
    status = "loading";
    entity = null;
    findEntity(ref.kind, ref.name, ref.source).then(
      (found) => {
        if (!live) return;
        entity = found;
        status = found ? "ready" : "missing";
        tick().then(() => card?.focus());
      },
      (e) => {
        if (!live) return;
        error = errorMessage(e);
        status = "error";
      },
    );
    return () => (live = false);
  });

  function onKeydown(event: KeyboardEvent) {
    if (current && event.key === "Escape") {
      event.preventDefault();
      closePreview();
    }
  }

  function onPointerdown(event: PointerEvent) {
    const target = event.target as Node;
    if (current && card && !card.contains(target) && !isPreviewAnchor(target)) closePreview();
  }
</script>

<svelte:window onkeydown={onKeydown} onpointerdown={onPointerdown} onresize={() => current && closePreview()} />

{#if current}
  <div
    bind:this={card}
    class="card"
    class:above={position.above}
    role="dialog"
    aria-label={t.previewTitle(entity?.name ?? current.name)}
    tabindex="-1"
    style:left="{position.left}px"
    style:top="{position.top}px"
    style:max-height="{position.maxHeight}px"
  >
    <div class="bar">
      {#if preview.trail.length > 1}
        <button class="btn small" onclick={previewBack}>← {t.previewBack}</button>
      {/if}
      <button class="icon-btn close" aria-label={t.closePreview} title={t.closePreview} onclick={closePreview}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10M17 7L7 17" stroke="currentColor" stroke-width="2" stroke-linecap="round" /></svg>
      </button>
    </div>
    {#if status === "ready" && entity}
      <EntityView {entity} compact />
    {:else if status === "loading"}
      <p class="muted" role="status">{t.loading}</p>
    {:else if status === "missing"}
      <p><strong>{current.name}</strong></p>
      <p class="muted">{t.notFound}</p>
    {:else}
      <p class="error" role="alert">{t.loadError(error)}</p>
    {/if}
  </div>
{/if}

<style>
  .card {
    position: fixed;
    z-index: var(--z-menu);
    width: min(var(--preview-width), calc(100vw - 2 * var(--space-3)));
    overflow-y: auto;
    padding: var(--space-3) var(--space-5) var(--space-5);
    border: var(--border-width) solid var(--color-border);
    border-radius: var(--radius-lg);
    background: var(--color-surface);
    box-shadow: var(--shadow-drawer);
    font-size: var(--text-sm);
  }

  .card.above {
    transform: translateY(-100%);
  }

  .card:focus-visible {
    outline: var(--focus-ring) solid var(--color-focus);
  }

  .bar {
    display: flex;
    justify-content: space-between;
    margin-bottom: var(--space-1);
  }

  .close {
    margin-left: auto;
  }

  .small {
    min-height: var(--control-height-sm);
    padding: 0 var(--space-3);
  }

  .muted {
    color: var(--color-text-muted);
  }

  .error {
    color: var(--color-danger);
  }
</style>
