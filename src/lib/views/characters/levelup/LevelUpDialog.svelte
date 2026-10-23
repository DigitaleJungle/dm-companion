<script lang="ts">
  import Spinner from "$lib/components/Spinner.svelte";
  import { errorMessage } from "$lib/api/storage";
  import { complete, emptyLevelPicks, type LevelPicks } from "$lib/characters/levelup";
  import { hitDieFaces } from "$lib/characters/sheet";
  import { enablePreviews } from "$lib/rules/preview.svelte";
  import { notify } from "$lib/stores/notifications.svelte";
  import { sourcePublished } from "$lib/stores/rules.svelte";
  import { strings } from "$lib/strings";
  import type { Sheet } from "../sheet/sheet.svelte";
  import LevelDialogFrame from "./LevelDialogFrame.svelte";
  import LevelPanel from "./LevelPanel.svelte";
  import { loadLevelData, lookup, planFor, saveLevel, subclassAt, type LevelData } from "./levelData";

  // Level up in the character's class: the next level's panel and a button that adds it.
  let { open = $bindable(false), sheet, sources }: { open?: boolean; sheet: Sheet; sources: string[] | null } = $props();

  enablePreviews();

  const t = strings.characters.levelUpDialog;
  const plain = new Intl.NumberFormat();

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
      data = await loadLevelData(main, sheet.cls ?? {}, sourcePublished);
    } catch (e) {
      loadError = t.loadError(errorMessage(e));
    }
  }

  // Each opening starts over.
  function opened() {
    picks = emptyLevelPicks();
    if (!data && sheet.cls) load();
  }

  function finish() {
    if (!data || !ready) return;
    // `level` follows the character, so it reads one higher once the change is in.
    const reached = level;
    const { character } = saveLevel($state.snapshot(c) as typeof c, data, reached, $state.snapshot(picks) as LevelPicks, faces);
    sheet.change((x) => Object.assign(x, character));
    notify(t.done(c.name, plain.format(reached)));
    open = false;
  }
</script>

<LevelDialogFrame {open} id="levelup" title={t.title(main.name, plain.format(main.level), plain.format(level))} onopen={opened} onclose={() => (open = false)}>
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

  {#snippet footer()}
    <button class="btn" onclick={() => (open = false)}>{t.cancel}</button>
    <button class="btn level-up" disabled={!ready} onclick={finish}>{t.finish(plain.format(level))}</button>
  {/snippet}
</LevelDialogFrame>

<style>
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
