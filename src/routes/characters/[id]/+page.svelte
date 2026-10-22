<script lang="ts">
  import { page } from "$app/state";
  import CharacterSheet from "$lib/views/characters/sheet/CharacterSheet.svelte";

  // `?campaign=<id>`; without it the character is one stored app-wide.
  const campaign = $derived(page.url.searchParams.get("campaign"));
  const id = $derived(page.params.id ?? "");
</script>

{#key `${campaign}/${id}`}
  <CharacterSheet {campaign} {id} />
{/key}
