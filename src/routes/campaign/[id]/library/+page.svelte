<script lang="ts">
  import LibraryView from "$lib/views/library/LibraryView.svelte";
  import { campaigns } from "$lib/stores/campaigns.svelte";
</script>

{#if campaigns.current}
  <LibraryView basePath="/campaign/{campaigns.current.id}/library" campaign={campaigns.current} />
{/if}
