<script lang="ts">
  import "$lib/styles/tokens.css";
  import "$lib/styles/base.css";
  import type { Snippet } from "svelte";
  import AppShell from "$lib/components/AppShell.svelte";

  let { children }: { children: Snippet } = $props();
</script>

<AppShell>
  {@render children()}
</AppShell>
