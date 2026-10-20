<script lang="ts">
  import { onMount, tick } from "svelte";
  import { flip } from "svelte/animate";
  import Card from "$lib/components/Card.svelte";
  import { reduceMotion } from "$lib/stores/theme.svelte";
  import Menu from "$lib/components/Menu.svelte";
  import { strings } from "$lib/strings";
  import { getHomeCards, setHomeCards } from "$lib/api/homeLayout";
  import { errorMessage as reason } from "$lib/api/storage";
  import { CARD_IDS, addCard, hiddenCards, moveCard, removeCard, type CardId } from "./cards";

  let { name }: { name: string } = $props();

  const t = strings.home;
  const l = t.layout;
  const titles: Record<CardId, string> = {
    encounters: t.encounters.title,
    party: t.party.title,
    legendKeeper: t.legendKeeper.title,
    notes: t.notes.title,
    continue: t.continue.title,
    tools: t.tools.title,
  };

  let order = $state<CardId[] | null>(null); // null while loading
  let loadError = $state<string | null>(null);
  let saveError = $state<string | null>(null);
  let undo = $state<{ id: CardId; order: CardId[] } | null>(null);
  const hidden = $derived(order ? hiddenCards(order) : []);


  onMount(async () => {
    try {
      order = (await getHomeCards()) ?? [...CARD_IDS];
    } catch (e) {
      loadError = l.loadError(reason(e));
      order = [...CARD_IDS];
    }
  });

  async function save(next: CardId[]) {
    order = next;
    saveError = null;
    try {
      await setHomeCards(next);
    } catch (e) {
      saveError = l.saveError(reason(e));
    }
  }

  // Keyed list items move in the DOM, which drops focus; put it back where the user expects it.
  async function focusAfter(id: string) {
    await tick();
    document.getElementById(id)?.focus();
  }

  function move(id: CardId, by: number) {
    if (!order) return;
    undo = null;
    save(moveCard(order, id, order.indexOf(id) + by));
    focusAfter(`menu-${id}`);
  }

  function remove(id: CardId) {
    if (!order) return;
    undo = { id, order };
    save(removeCard(order, id));
    focusAfter("add-card");
  }

  function add(id: CardId) {
    if (!order) return;
    undo = null;
    save(addCard(order, id));
    focusAfter(`menu-${id}`);
  }

  function undoRemove() {
    if (!undo) return;
    const { id, order: previous } = undo;
    undo = null;
    save(previous);
    focusAfter(`menu-${id}`);
  }

  // Live reorder: the dragged card takes the place of whatever card it enters.
  let dragging = $state<CardId | null>(null);
  let beforeDrag: CardId[] = [];
  let dropped = false;
  let lastEntered: CardId | null = null;

  function onDragStart(event: DragEvent, id: CardId) {
    if (!order) return;
    dragging = id;
    beforeDrag = order;
    dropped = false;
    lastEntered = id;
    undo = null;
    const slot = (event.currentTarget as HTMLElement).closest(".slot");
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", id);
      if (slot) event.dataTransfer.setDragImage(slot, 24, 24);
    }
  }

  // dragenter also fires for every child of a card, so only react when the pointer reaches a different card;
  // otherwise the two cards would swap back and forth.
  function onDragEnter(target: CardId) {
    if (!order || !dragging || target === lastEntered) return;
    lastEntered = target;
    if (target !== dragging) order = moveCard(order, dragging, order.indexOf(target));
  }

  function onDragEnd() {
    // Escape or a drop outside the grid cancels the drag and restores the old order.
    if (dropped && order) save(order);
    else order = beforeDrag;
    dragging = null;
  }
</script>

<div class="home">
  <section class="header" aria-label={strings.shell.campaign}>
    <div class="intro">
      <h1>{name}</h1>
      <p class="muted">{t.subtitle}</p>
    </div>
    <div class="start">
      <button class="btn-primary btn" disabled>{t.startSession}</button>
      <span class="soon">{strings.comingSoon}</span>
    </div>
  </section>

  {#if loadError}<p class="error" role="alert">{loadError}</p>{/if}
  {#if saveError}<p class="error" role="alert">{saveError}</p>{/if}

  {#if order === null}
    <p class="empty" role="status">{l.loading}</p>
  {:else}
    <ul class="grid">
      {#each order as id, i (id)}
        <li
          class="slot"
          class:dragging={dragging === id}
          animate:flip={{ duration: reduceMotion() ? 0 : 200 }}
          ondragenter={() => onDragEnter(id)}
          ondragover={(e) => dragging && e.preventDefault()}
          ondrop={(e) => {
            e.preventDefault();
            dropped = true;
          }}
        >
          <Card title={titles[id]} ondragstart={(e) => onDragStart(e, id)} ondragend={onDragEnd}>
            {#snippet controls()}
              <Menu
                id="menu-{id}"
                label={l.cardOptions(titles[id])}
                triggerClass="icon-btn"
                items={[
                  { label: l.moveLeft, disabled: i === 0, onselect: () => move(id, -1) },
                  { label: l.moveRight, disabled: i === (order?.length ?? 0) - 1, onselect: () => move(id, 1) },
                  { label: l.remove, onselect: () => remove(id) },
                ]}
              >
                {#snippet trigger()}
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M6 12h.01M12 12h.01M18 12h.01" stroke="currentColor" stroke-width="3" stroke-linecap="round" />
                  </svg>
                {/snippet}
              </Menu>
            {/snippet}

            {#if id === "encounters"}
              <p class="empty">{t.encounters.empty}</p>
              <div class="new">
                <button class="btn small" disabled>{t.encounters.new}</button>
                <span class="soon">{strings.comingSoon}</span>
              </div>
            {:else if id === "party"}
              <p class="empty">{t.party.empty}</p>
            {:else if id === "legendKeeper"}
              <p class="empty">{t.legendKeeper.empty}</p>
            {:else if id === "notes"}
              <label for="home-notes" class="sr-only">{t.notes.label}</label>
              <textarea id="home-notes" rows="5" disabled></textarea>
              <span class="soon">{strings.comingSoon}</span>
            {:else if id === "continue"}
              <p class="empty">{t.continue.empty}</p>
            {:else if id === "tools"}
              <div class="tools">
                <button class="btn" disabled>{t.tools.rollDice}</button>
                <button class="btn" disabled>{t.tools.conditions}</button>
                <button class="btn" disabled>{t.tools.randomNpcName}</button>
                <button class="btn" disabled>{t.tools.blankPlayerScreen}</button>
              </div>
              <span class="soon">{strings.comingSoon}</span>
            {/if}
          </Card>
        </li>
      {/each}

      {#if hidden.length > 0}
        <li class="add-slot">
          <Menu
            id="add-card"
            label={l.addCard}
            align="start"
            triggerClass="add-tile"
            items={hidden.map((id) => ({ label: titles[id], onselect: () => add(id) }))}
          >
            {#snippet trigger()}
              <span aria-hidden="true">+</span>
              {l.addCard}
            {/snippet}
          </Menu>
        </li>
      {/if}
    </ul>
  {/if}

  {#if undo}
    <div class="toast" role="status">
      <span>{l.removed(titles[undo.id])}</span>
      <button class="btn small" onclick={undoRemove}>{l.undo}</button>
      <button class="icon-btn" aria-label={l.dismiss} title={l.dismiss} onclick={() => (undo = null)}>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M7 7l10 10M17 7L7 17" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
        </svg>
      </button>
    </div>
  {/if}
</div>

<style>
  .home {
    display: flex;
    flex-direction: column;
    gap: var(--space-6);
    max-width: var(--content-max-width);
    padding: var(--space-5) var(--space-7) var(--space-7);
  }

  .header {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    justify-content: space-between;
    gap: var(--space-5);
  }

  .intro {
    flex: 1 1 360px;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  h1 {
    font-size: var(--text-2xl);
    font-weight: var(--weight-bold);
    line-height: var(--leading-tight);
    letter-spacing: var(--tracking-tight);
  }

  .muted,
  .empty {
    color: var(--color-text-muted);
  }

  .empty {
    font-size: var(--text-sm);
  }

  .start {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: var(--space-1);
  }

  textarea {
    width: 100%;
    padding: var(--space-3);
    border: var(--border-width) solid var(--color-border-strong);
    border-radius: var(--radius-md);
    background: var(--color-surface);
    font-size: var(--text-sm);
    resize: vertical;
  }

  textarea:disabled {
    cursor: not-allowed;
    background: var(--color-surface-sunken);
    border-color: var(--color-border);
  }

  .error {
    padding: var(--space-3) var(--space-4);
    border-radius: var(--radius-md);
    background: var(--color-danger-soft);
    color: var(--color-danger);
    font-size: var(--text-sm);
  }

  .grid {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(300px, 100%), 1fr));
    gap: var(--space-4);
    align-items: start;
  }

  /* The dragged card stays in place as an outlined gap while the others slide around it */
  .slot.dragging :global(.card) {
    border-style: dashed;
    border-color: var(--color-accent);
    background: var(--color-accent-soft);
    box-shadow: none;
  }

  .slot.dragging :global(.card > *) {
    opacity: 0.4;
  }

  .add-slot :global(.add-tile) {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    width: 100%;
    min-height: var(--add-tile-height);
    border: var(--border-width) dashed var(--color-border-strong);
    border-radius: var(--radius-lg);
    background: transparent;
    color: var(--color-text-muted);
    font-size: var(--text-sm);
    font-weight: var(--weight-medium);
    cursor: pointer;
  }

  .add-slot :global(.add-tile:hover),
  .add-slot :global(.add-tile[aria-expanded="true"]) {
    border-color: var(--color-accent);
    color: var(--color-link);
    background: var(--color-accent-soft);
  }

  .new {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .small {
    min-height: var(--control-height-sm);
    padding: 0 var(--space-3);
  }

  .tools {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--space-2);
  }

  .toast {
    position: fixed;
    right: var(--space-6);
    bottom: var(--space-6);
    z-index: var(--z-menu);
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-2) var(--space-2) var(--space-2) var(--space-4);
    border: var(--border-width) solid var(--color-border);
    border-radius: var(--radius-md);
    background: var(--color-surface);
    box-shadow: var(--shadow-drawer);
    font-size: var(--text-sm);
  }

  @media (max-width: 720px) {
    .home {
      padding: var(--space-4);
    }

    .start {
      align-items: flex-start;
    }

    .toast {
      left: var(--space-4);
      right: var(--space-4);
      bottom: var(--space-4);
    }
  }
</style>
