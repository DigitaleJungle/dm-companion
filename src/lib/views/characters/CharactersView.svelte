<script lang="ts">
  import { onMount, tick } from "svelte";
  import Menu from "$lib/components/Menu.svelte";
  import SettingsButton from "$lib/components/SettingsButton.svelte";
  import CharacterAvatar from "./CharacterAvatar.svelte";
  import { copyCharacter, deleteCharacter, listCharacters, type CharacterCard, type CharacterList } from "$lib/api/characters";
  import { errorMessage } from "$lib/api/storage";
  import { campaigns, refreshCampaigns } from "$lib/stores/campaigns.svelte";
  import { strings } from "$lib/strings";
  import { goto } from "$app/navigation";
  import { avatarCandidates, classLine, selectCharacters, sheetHref, totalLevel, type CharacterSort } from "./format";
  import CreateCharacterDialog from "./create/CreateCharacterDialog.svelte";

  const t = strings.characters;
  const formatNumber = new Intl.NumberFormat();

  let list = $state<CharacterList | null>(null);
  let loadError = $state<string | null>(null);
  let status = $state<string | null>(null);
  let copyError = $state<string | null>(null);
  let creating = $state(false);

  // A new character opens straight on its sheet.
  const onCreated = (card: CharacterCard) => goto(sheetHref(card));

  const campaignNames = $derived(new Map([...(campaigns.list?.campaigns ?? []), ...(campaigns.list?.archived ?? [])].map((c) => [c.id, c.name])));
  const campaignOf = (c: CharacterCard) => (c.campaignId === null ? t.noCampaign : (campaignNames.get(c.campaignId) ?? t.unknownCampaign));

  // ---- Search, filters and sort (in memory: the list is small) ----
  let search = $state("");
  let campaignFilter = $state("");
  let classFilter = $state("");
  let levelFilter = $state("");
  let sort = $state<CharacterSort>("name");
  const SORTS: CharacterSort[] = ["name", "campaign", "level"];

  // Options come from the characters themselves, so every choice finds someone.
  const characters = $derived(list?.characters ?? []);
  const uniqueSorted = (values: string[]) => [...new Set(values)].sort((a, b) => a.localeCompare(b));
  const campaignOptions = $derived(uniqueSorted(characters.map(campaignOf)));
  const classOptions = $derived(uniqueSorted(characters.flatMap((c) => c.classes.map((k) => k.name))));
  const levelOptions = $derived([...new Set(characters.map((c) => totalLevel(c.classes)).filter((l) => l > 0))].sort((a, b) => a - b));
  const shown = $derived(
    selectCharacters(
      characters,
      { search, campaign: campaignFilter || null, className: classFilter || null, level: levelFilter ? Number(levelFilter) : null },
      sort,
      campaignOf,
    ),
  );

  function clearFilters() {
    search = campaignFilter = classFilter = levelFilter = "";
  }

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

  function menuItems(character: CharacterCard) {
    const targets = (campaigns.list?.campaigns ?? []).filter((c) => c.id !== character.campaignId);
    const copies = targets.length
      ? targets.map((target) => ({ label: t.copyTo(target.name), onselect: () => copy(character, target.id, target.name) }))
      : [{ label: t.noOtherCampaign, disabled: true, onselect: () => {} }];
    // Archived campaigns are read-only until restored.
    const remove = character.archived
      ? { label: t.deleteArchived, disabled: true, onselect: () => {} }
      : { label: t.delete, onselect: () => askDelete(character) };
    return [...copies, remove];
  }

  // ---- Deleting: asked for in place on the card, since it can't be undone ----
  let deleting = $state<CharacterCard | null>(null);
  let busy = $state(false);
  const keyOf = (c: CharacterCard) => `${c.campaignId}/${c.id}`;

  async function askDelete(character: CharacterCard) {
    status = copyError = null;
    deleting = character;
    await tick();
    document.getElementById("cancel-character-delete")?.focus();
  }

  async function confirmDelete() {
    const character = deleting;
    if (!character) return;
    busy = true;
    try {
      await deleteCharacter(character.campaignId, character.id);
      deleting = null;
      await load();
      status = t.deleted(character.name);
    } catch (e) {
      copyError = t.deleteError(errorMessage(e));
    } finally {
      busy = false;
    }
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
        <div class="tools" role="search" aria-label={t.toolsLabel}>
          <label for="characters-search" class="sr-only">{t.searchLabel}</label>
          <input id="characters-search" class="search" type="search" bind:value={search} placeholder={t.searchPlaceholder} autocomplete="off" />
          <label class="field">
            <span>{t.campaignFilter}</span>
            <select bind:value={campaignFilter}>
              <option value="">{t.allCampaigns}</option>
              {#each campaignOptions as option (option)}<option value={option}>{option}</option>{/each}
            </select>
          </label>
          <label class="field">
            <span>{t.classFilter}</span>
            <select bind:value={classFilter}>
              <option value="">{t.allClasses}</option>
              {#each classOptions as option (option)}<option value={option}>{option}</option>{/each}
            </select>
          </label>
          <label class="field">
            <span>{t.levelFilter}</span>
            <select bind:value={levelFilter}>
              <option value="">{t.allLevels}</option>
              {#each levelOptions as option (option)}<option value={String(option)}>{formatNumber.format(option)}</option>{/each}
            </select>
          </label>
          <label class="field sort">
            <span>{t.sortLabel}</span>
            <select bind:value={sort}>
              {#each SORTS as option (option)}<option value={option}>{t.sorts[option]}</option>{/each}
            </select>
          </label>
        </div>

        {#if shown.length === 0}
          <div class="no-matches">
            <p class="muted">{t.noMatches}</p>
            <button class="btn small" onclick={clearFilters}>{t.clearFilters}</button>
          </div>
        {/if}
        <ul class="grid">
          {#each shown as character (`${character.campaignId}/${character.id}`)}
            <li class="card">
              <CharacterAvatar candidates={avatarCandidates(character.classes)} alt={character.name} />
              <div class="info">
                <h2 class="name"><a class="card-link" href={sheetHref(character)} aria-label={t.open(character.name)}>{character.name}</a></h2>
                <p>{character.classes.length ? classLine(character.classes) : t.noClass}</p>
                {#if character.classes.length}<p class="muted">{t.level(formatNumber.format(totalLevel(character.classes)))}</p>{/if}
                <p class="campaign">
                  <span>{campaignOf(character)}</span>
                  {#if character.archived}<span class="tag">{t.archived}</span>{/if}
                </p>
              </div>
              <div class="menu">
                <Menu id="character-{character.campaignId}-{character.id}" label={t.options(character.name)} triggerClass="icon-btn" items={menuItems(character)}>
                  {#snippet trigger()}
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M6 12h.01M12 12h.01M18 12h.01" stroke="currentColor" stroke-width="3" stroke-linecap="round" />
                    </svg>
                  {/snippet}
                </Menu>
              </div>
              {#if deleting && keyOf(deleting) === keyOf(character)}
                <div class="confirm" role="alertdialog" aria-labelledby="character-delete-text">
                  <p id="character-delete-text">{t.confirmDelete(character.name)}</p>
                  <div class="confirm-buttons">
                    <button id="cancel-character-delete" class="btn small" onclick={() => (deleting = null)}>{t.cancel}</button>
                    <button class="btn btn-danger small" disabled={busy} onclick={confirmDelete}>{t.confirm}</button>
                  </div>
                </div>
              {/if}
            </li>
          {/each}
        </ul>
      {/if}
      {#if list.unreadable.length > 0}
        <p class="error" role="alert">{t.unreadable(list.unreadable.join(", "))}</p>
      {/if}
    {/if}
  </main>

  <div class="corner"><SettingsButton /></div>
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

  /* Same corner as the Start screen. */
  .corner {
    position: fixed;
    left: var(--space-4);
    bottom: var(--space-4);
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
    padding: var(--space-6) var(--space-5) var(--corner-clearance);
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

  .tools {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    gap: var(--space-3);
  }

  .search {
    flex: 1 1 var(--select-width);
    min-height: var(--control-height);
    padding: 0 var(--space-3);
    border: var(--border-width) solid var(--color-border-strong);
    border-radius: var(--radius-md);
    background: var(--color-surface);
  }

  .search::placeholder {
    color: var(--color-text-placeholder);
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    color: var(--color-text-muted);
    font-size: var(--text-xs);
    font-weight: var(--weight-medium);
  }

  /* Sort sits apart from the filters, at the end of the row. */
  .sort {
    margin-left: auto;
  }

  select {
    min-height: var(--control-height);
    padding: 0 var(--space-3);
    border: var(--border-width) solid var(--color-border-strong);
    border-radius: var(--radius-md);
    background: var(--color-surface);
    color: var(--color-text);
    font-size: var(--text-sm);
    cursor: pointer;
  }

  .no-matches {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-3);
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
    position: relative;
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

  /* The whole card opens the sheet; the name link stays the keyboard target. */
  .card-link {
    color: inherit;
    text-decoration: none;
  }

  .card-link::after {
    content: "";
    position: absolute;
    inset: 0;
    border-radius: var(--radius-lg);
  }

  .card-link:focus-visible {
    outline: none;
  }

  .card:has(.card-link:focus-visible) {
    outline: var(--focus-ring) solid var(--color-focus);
    outline-offset: var(--border-width);
  }

  .card:hover {
    border-color: var(--color-border-strong);
  }

  /* Above the card-wide link, so the menu still opens. */
  .menu {
    position: relative;
    z-index: 1;
    flex: none;
    margin: calc(-1 * var(--space-1));
  }

  /* Covers the card (above its link) while a delete is being confirmed. */
  .confirm {
    position: absolute;
    inset: 0;
    z-index: 2;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: var(--space-3);
    padding: var(--space-4);
    border-radius: var(--radius-lg);
    background: var(--color-surface);
    font-size: var(--text-sm);
  }

  .confirm-buttons {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-2);
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
