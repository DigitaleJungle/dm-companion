<script lang="ts">
  import CharactersView from "$lib/views/characters/CharactersView.svelte";
  import { campaigns } from "$lib/stores/campaigns.svelte";
</script>

{#if campaigns.current}
  <CharactersView campaign={campaigns.current} />
{/if}
