<script lang="ts">
  import { findEntity, type Entity } from "$lib/api/rules";
  import { errorMessage } from "$lib/api/storage";
  import { LINK_KINDS } from "$lib/rules/tags";
  import { strings } from "$lib/strings";
  import EntityView from "./EntityView.svelte";

  let { tag, name, source }: { tag: string; name: string; source?: string } = $props();

  let entity = $state<Entity | null>(null);
  let status = $state<"waiting" | "loading" | "missing" | "error" | "ready">("waiting");
  let error = $state("");

  // Books embed hundreds of these; only fetch the ones that scroll near the screen.
  function whenNearScreen(node: HTMLElement) {
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting) || status !== "waiting") return;
        observer.disconnect();
        status = "loading";
        findEntity(LINK_KINDS[tag] ?? tag, name, source).then(
          (found) => {
            entity = found;
            status = found ? "ready" : "missing";
          },
          (e) => {
            error = errorMessage(e);
            status = "error";
          },
        );
      },
      { rootMargin: "600px 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }
</script>

<div class="embed" {@attach whenNearScreen}>
  {#if status === "ready" && entity}
    <EntityView {entity} compact />
  {:else}
    <p class="placeholder">
      <strong>{name}</strong>
      {#if status === "missing"}— {strings.library.notFound}{:else if status === "error"}— {strings.library.loadError(error)}{/if}
    </p>
  {/if}
</div>

<style>
  .embed {
    margin: var(--space-4) 0;
    padding: var(--space-4) var(--space-5);
    border: var(--border-width) solid var(--color-border);
    border-radius: var(--radius-md);
    background: var(--color-surface);
  }

  .placeholder {
    margin: 0;
    color: var(--color-text-muted);
  }
</style>
