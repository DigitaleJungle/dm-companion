<script lang="ts">
  import { onMount } from "svelte";
  import Menu from "$lib/components/Menu.svelte";
  import CharacterAvatar from "./CharacterAvatar.svelte";
  import { copyCharacter, listCharacters, type CharacterCard, type CharacterList } from "$lib/api/characters";
  import { errorMessage } from "$lib/api/storage";
  import { campaigns, refreshCampaigns } from "$lib/stores/campaigns.svelte";
  import { strings } from "$lib/strings";
  import { avatarCandidates, classLine, totalLevel } from "./format";
  import CreateCharacterDialog from "./create/CreateCharacterDialog.svelte";

  const t = strings.characters;
  const formatNumber = new Intl.NumberFormat();

  let list = $state<CharacterList | null>(null);
  let loadError = $state<string | null>(null);
  let status = $state<string | null>(null);
  let copyError = $state<string | null>(null);
  let creating = $state(false);

  async function onCreated(card: CharacterCard) {
    await load();
    status = t.created(card.name);
  }

  const campaignNames = $derived(new Map([...(campaigns.list?.campaigns ?? []), ...(campaigns.list?.archived ?? [])].map((c) => [c.id, c.name])));

  async function load() {
    loadError = null;
    try {
      list = await listCharacters();
    } catch (e) {
      loadError = t.loadError(errorMessage(e));
    }
  }

  onMount(() => {
    refreshCampaigns();
    load();
  });

  function copyItems(character: CharacterCard) {
    const targets = (campaigns.list?.campaigns ?? []).filter((c) => c.id !== character.campaignId);
    if (targets.length === 0) return [{ label: t.noOtherCampaign, disabled: true, onselect: () => {} }];
    return targets.map((target) => ({ label: t.copyTo(target.name), onselect: () => copy(character, target.id, target.name) }));
  }

  async function copy(character: CharacterCard, to: string, toName: string) {
    status = copyError = null;
    try {
      await copyCharacter(character.campaignId, character.id, to);
      await load();
      status = t.copied(character.name, toName);
    } catch (e) {
      copyError = t.copyError(errorMessage(e));
    }
  }
</script>

<div class="characters">
  <header class="top">
    <a class="btn back" href="/">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" /></svg>
      {t.back}
    </a>
  </header>

  <main>
    <div class="heading">
      <h1>{t.title}</h1>
      <button class="btn btn-primary" onclick={() => {
          status = null;
          creating = true;
        }}>{t.create}</button>
    </div>

    <p class="note" role="status">{status ?? ""}</p>
    {#if copyError}<p class="error" role="alert">{copyError}</p>{/if}

    {#if loadError}
      <div class="error" role="alert">
        <p>{loadError}</p>
        <button class="btn small" onclick={load}>{t.retry}</button>
      </div>
    {:else if list === null}
      <p class="muted" role="status">{t.loading}</p>
    {:else}
      {#if list.characters.length === 0}
        <p class="muted">{t.empty}</p>
      {:else}
        <ul class="grid">
          {#each list.characters as character (`${character.campaignId}/${character.id}`)}
            <li class="card">
              <CharacterAvatar candidates={avatarCandidates(character.classes)} alt={character.name} />
              <div class="info">
                <h2 class="name">{character.name}</h2>
                <p>{character.classes.length ? classLine(character.classes) : t.noClass}</p>
                {#if character.classes.length}<p class="muted">{t.level(formatNumber.format(totalLevel(character.classes)))}</p>{/if}
                <p class="campaign">
                  <span>{character.campaignId === null ? t.noCampaign : (campaignNames.get(character.campaignId) ?? t.unknownCampaign)}</span>
                  {#if character.archived}<span class="tag">{t.archived}</span>{/if}
                </p>
              </div>
              <div class="menu">
                <Menu id="character-{character.campaignId}-{character.id}" label={t.options(character.name)} triggerClass="icon-btn" items={copyItems(character)}>
                  {#snippet trigger()}
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M6 12h.01M12 12h.01M18 12h.01" stroke="currentColor" stroke-width="3" stroke-linecap="round" />
                    </svg>
                  {/snippet}
                </Menu>
              </div>
            </li>
          {/each}
        </ul>
      {/if}
      {#if list.unreadable.length > 0}
        <p class="error" role="alert">{t.unreadable(list.unreadable.join(", "))}</p>
      {/if}
    {/if}
  </main>
</div>

<CreateCharacterDialog bind:open={creating} oncreated={onCreated} />

<style>
  .characters {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
  }

  .top {
    display: flex;
    align-items: center;
    padding: var(--space-3) var(--space-5);
    border-bottom: var(--border-width) solid var(--color-border);
    background: var(--color-surface);
  }

  .back {
    gap: var(--space-1);
    padding-left: var(--space-2);
    color: var(--color-text);
    text-decoration: none;
  }

  .back svg {
    width: var(--icon-size);
    height: var(--icon-size);
  }

  main {
    width: min(100%, var(--content-max-width));
    margin: 0 auto;
    padding: var(--space-6) var(--space-5);
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  .heading {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
  }

  h1 {
    font-size: var(--text-xl);
    font-weight: var(--weight-bold);
    letter-spacing: var(--tracking-tight);
  }

  .grid {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(100%, var(--character-card-width)), 1fr));
    gap: var(--space-4);
  }

  .card {
    display: flex;
    align-items: flex-start;
    gap: var(--space-4);
    padding: var(--space-4);
    background: var(--color-surface);
    border: var(--border-width) solid var(--color-border);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-card);
  }

  .info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    font-size: var(--text-sm);
  }

  .name {
    font-size: var(--text-md);
    font-weight: var(--weight-semibold);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .campaign {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2);
    color: var(--color-text-muted);
  }

  .tag {
    padding: 0 var(--space-2);
    border-radius: var(--radius-sm);
    background: var(--color-surface-sunken);
    font-size: var(--text-xs);
  }

  .menu {
    flex: none;
    margin: calc(-1 * var(--space-1));
  }

  .muted {
    color: var(--color-text-muted);
  }

  .note:empty {
    display: none;
  }

  .note {
    color: var(--color-text-muted);
    font-size: var(--text-sm);
  }

  .error {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-3) var(--space-4);
    border-radius: var(--radius-md);
    background: var(--color-danger-soft);
    color: var(--color-danger);
    font-size: var(--text-sm);
  }
</style>
