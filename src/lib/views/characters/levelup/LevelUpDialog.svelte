<script lang="ts">
  import EntityPopover from "$lib/components/rules/EntityPopover.svelte";
  import Spinner from "$lib/components/Spinner.svelte";
  import { errorMessage } from "$lib/api/storage";
  import { complete, emptyLevelPicks, type LevelPicks } from "$lib/characters/levelup";
  import { hitDieFaces } from "$lib/characters/sheet";
  import { enablePreviews } from "$lib/rules/preview.svelte";
  import { notify } from "$lib/stores/notifications.svelte";
  import { rules } from "$lib/stores/rules.svelte";
  import { strings } from "$lib/strings";
  import type { Sheet } from "../sheet/sheet.svelte";
  import LevelPanel from "./LevelPanel.svelte";
  import { loadLevelData, lookup, planFor, saveLevel, subclassAt, type LevelData } from "./levelData";

  // Level up in the character's class: the next level's panel and a button that adds it.
  let { open = $bindable(false), sheet, sources }: { open?: boolean; sheet: Sheet; sources: string[] | null } = $props();

  enablePreviews();

  const t = strings.characters.levelUpDialog;
  const plain = new Intl.NumberFormat();
  const published = (source: string) => rules.status?.library?.sources.find((s) => s.id.toLowerCase() === source.toLowerCase())?.published ?? "";

  let dialog: HTMLDialogElement | undefined = $state();
  let data = $state<LevelData | null>(null);
  let loadError = $state<string | null>(null);
  let picks = $state<LevelPicks>(emptyLevelPicks());

  const c = $derived(sheet.character!);
  const main = $derived(c.classes[0]);
  const level = $derived(main.level + 1);
  const faces = $derived(hitDieFaces(sheet.cls));
  const ready = $derived(!!data && complete(planFor(data, level, subclassAt(c, data, level, picks)), picks, lookup(data)));

  async function load() {
    loadError = null;
    try {
      data = await loadLevelData(main, sheet.cls ?? {}, published);
    } catch (e) {
      loadError = t.loadError(errorMessage(e));
    }
  }

  // Each opening starts over.
  $effect(() => {
    if (open && dialog && !dialog.open) {
      picks = emptyLevelPicks();
      if (!data && sheet.cls) load();
      dialog.showModal();
    } else if (!open && dialog?.open) {
      dialog.close();
    }
  });

  function finish() {
    if (!data || !ready) return;
    const { character } = saveLevel($state.snapshot(c) as typeof c, data, level, $state.snapshot(picks) as LevelPicks, faces);
    sheet.change((x) => Object.assign(x, character));
    notify(t.done(c.name, plain.format(level)));
    open = false;
  }
</script>

<dialog
  bind:this={dialog}
  class="levelup"
  aria-labelledby="levelup-title"
  oncancel={(e) => {
    e.preventDefault();
    open = false;
  }}
>
  {#if open}
    <header class="top">
      <h1 id="levelup-title">{t.title(main.name, plain.format(main.level), plain.format(level))}</h1>
      <button class="icon-btn" aria-label={t.close} onclick={() => (open = false)}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" /></svg>
      </button>
    </header>

    <div class="scroll">
      <div class="content">
        {#if loadError}
          <div class="error" role="alert"><p>{loadError}</p><button class="btn small" onclick={load}>{t.retry}</button></div>
        {:else if !sheet.cls}
          <p class="note">{t.noRules}</p>
        {:else if !data}
          <Spinner label={t.loading} />
        {:else}
          <svelte:boundary>
            <LevelPanel {data} character={c} {level} bind:picks {faces} skills={sheet.skills} {sources} />
            {#snippet failed(error)}<p class="error" role="alert">{t.panelError(errorMessage(error))}</p>{/snippet}
          </svelte:boundary>
        {/if}
      </div>
    </div>

    <footer class="bottom">
      <button class="btn" onclick={() => (open = false)}>{t.cancel}</button>
      <button class="btn level-up" disabled={!ready} onclick={finish}>{t.finish(plain.format(level))}</button>
    </footer>

    <EntityPopover />
  {/if}
</dialog>

<style>
  .levelup {
    width: min(100% - 2 * var(--space-4), var(--wizard-content-width));
    height: min(100% - 2 * var(--space-4), 90vh);
    max-width: none;
    max-height: none;
    padding: 0;
    border: var(--border-width) solid var(--color-border);
    border-radius: var(--radius-lg);
    background: var(--color-bg);
    color: var(--color-text);
    overflow: hidden;
  }

  .levelup[open] {
    display: flex;
    flex-direction: column;
  }

  .levelup::backdrop {
    background: var(--color-backdrop);
  }

  .top,
  .bottom {
    flex: none;
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-3) var(--space-5);
    background: var(--color-surface);
  }

  .top {
    justify-content: space-between;
    border-bottom: var(--border-width) solid var(--color-border);
  }

  .top h1 {
    font-size: var(--text-lg);
    font-weight: var(--weight-semibold);
  }

  .top svg {
    width: var(--icon-size);
    height: var(--icon-size);
  }

  .bottom {
    justify-content: flex-end;
    border-top: var(--border-width) solid var(--color-border);
  }

  .level-up {
    border-color: var(--color-success-fill);
    background: var(--color-success-fill);
    color: var(--color-accent-text);
    font-weight: var(--weight-semibold);
  }

  .level-up:hover:not(:disabled) {
    border-color: var(--color-success-fill-hover);
    background: var(--color-success-fill-hover);
  }

  .scroll {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
  }

  .content {
    width: min(100%, var(--reading-width));
    margin: 0 auto;
    padding: var(--space-5);
  }

  .note,
  .error {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-3) var(--space-4);
    border-radius: var(--radius-md);
    background: var(--color-surface-sunken);
    font-size: var(--text-sm);
  }

  .error {
    background: var(--color-danger-soft);
    color: var(--color-danger);
  }

</style>
