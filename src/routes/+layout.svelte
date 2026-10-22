<script lang="ts">
  import "$lib/styles/tokens.css";
  import "$lib/styles/base.css";
  import type { Snippet } from "svelte";
  import { onMount } from "svelte";
  import { loadTheme } from "$lib/stores/theme.svelte";
  import Notification from "$lib/components/Notification.svelte";

  let { children }: { children: Snippet } = $props();

  onMount(loadTheme);
</script>

{@render children()}
<Notification />
