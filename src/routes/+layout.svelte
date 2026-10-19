<script lang="ts">
  import "$lib/styles/tokens.css";
  import "$lib/styles/base.css";
  import type { Snippet } from "svelte";
  import { goto } from "$app/navigation";
  import AppShell from "$lib/components/AppShell.svelte";

  let { children }: { children: Snippet } = $props();

  // Only built screens get a shortcut; F2–F5 and Ctrl/⌘ K arrive with their screens.
  function onKeydown(event: KeyboardEvent) {
    if (event.key === "F1") {
      event.preventDefault(); // otherwise the WebView opens its help
      goto("/");
    }
  }
</script>

<svelte:window onkeydown={onKeydown} />

<AppShell>
  {@render children()}
</AppShell>
