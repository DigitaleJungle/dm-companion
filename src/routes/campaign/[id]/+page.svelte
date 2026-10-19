<script lang="ts">
  import Home from "$lib/views/home/Home.svelte";
  import { campaigns } from "$lib/stores/campaigns.svelte";
</script>

{#if campaigns.current}
  <Home name={campaigns.current.name} />
{/if}
