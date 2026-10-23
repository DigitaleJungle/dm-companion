<script lang="ts">
  import { tick } from "svelte";
  import EntityPopover from "$lib/components/rules/EntityPopover.svelte";
  import Spinner from "$lib/components/Spinner.svelte";
  import { errorMessage } from "$lib/api/storage";
  import { emptyLevelPicks, type LevelPicks, type LevelRecord } from "$lib/characters/levelup";
  import { hitDieFaces } from "$lib/characters/sheet";
  import { enablePreviews } from "$lib/rules/preview.svelte";
  import { notify } from "$lib/stores/notifications.svelte";
  import { rules } from "$lib/stores/rules.svelte";
  import { strings } from "$lib/strings";
  import type { Character } from "$lib/api/characters";
  import LevelPanel from "./LevelPanel.svelte";
  import { levelNeedsChoice, loadLevelData, saveLevel, type LevelData } from "./levelData";

  // Edit → Levels: every class level in a sidebar; the picked one opens on the right with all its choices to change.
  // Works on a saved character (the sheet) and on one being created (the wizard's Configure), through `onsave`.
  let {
    open = $bindable(false),
    character,
    clsData,
    skills,
    sources,
    readOnly = false,
    onsave,
  }: {
    open?: boolean;
    character: Character;
    /** The class's full rules entry; null when the rules data doesn't have it. */
    clsData: Record<string, unknown> | null;
    skills: { key: string; name: string }[];
    sources: string[] | null;
    readOnly?: boolean;
    /** Gets the character with the saved level (and the later levels it changed). */
    onsave: (character: Character) => void;
  } = $props();

  enablePreviews();

  const t = strings.characters.levelsDialog;
  const tl = strings.characters.levelUpDialog;
  const plain = new Intl.NumberFormat();
  const published = (source: string) => rules.status?.library?.sources.find((s) => s.id.toLowerCase() === source.toLowerCase())?.published ?? "";

  let dialog: HTMLDialogElement | undefined = $state();
  let leaveDialog: HTMLDialogElement | undefined = $state();
  let data = $state<LevelData | null>(null);
  let loadError = $state<string | null>(null);
  let selected = $state(1);
  let picks = $state<LevelPicks>(emptyLevelPicks());
  let original = $state("");
  /** What to do once unsaved changes are discarded: open another level, or close. */
  let afterDiscard: (() => void) | null = null;
  let list: HTMLUListElement | undefined = $state();
  /** Which class `data` was loaded for; another class (the wizard's pick changed) loads again. */
  let loadedFor = "";

  const c = $derived(character);
  const main = $derived(c.classes[0]);
  const faces = $derived(hitDieFaces(clsData));
  const levels = $derived(Array.from({ length: main.level }, (_, i) => i + 1));
  const recordOf = (level: number): LevelRecord | undefined => (c.levels ?? []).find((r) => r.level === level);
  // Compared without the empty feat slots and lists the panel adds while showing a level.
  const normalized = (p: LevelPicks) =>
    JSON.stringify({
      ...p,
      feats: Object.fromEntries(Object.entries(p.feats).filter(([, f]) => f.feat)),
      keys: Object.fromEntries(Object.entries(p.keys).filter(([, v]) => v.length)),
    });
  const dirty = $derived(normalized(picks) !== original);
  const needs = $derived(data ? new Set(levels.filter((l) => levelNeedsChoice(c, data!, l))) : new Set<number>());

  /** "Subclass: Champion · Feat: Alert" style summary of what a level picked. */
  function summary(level: number): string {
    const g = recordOf(level)?.gains;
    if (!g) return t.notRecorded;
    const parts = [
      ...(g.subclass ? [g.subclass.name] : []),
      ...g.feats.map((f) => f.name),
      ...g.options.map((o) => o.name),
      ...g.optional.map((o) => o.name),
      ...(g.spells.filter((s) => !s.always).length ? [t.spells(plain.format(g.spells.filter((s) => !s.always).length))] : []),
      ...g.masteries.map((m) => m.name),
    ];
    return parts.length ? parts.join(", ") : t.hpOnly;
  }

  function select(level: number) {
    selected = level;
    const record = recordOf(level);
    // Saved picks, or for a level without a record the fixed hit points to start from.
    picks = record?.picks ? structuredClone($state.snapshot(record.picks)) : { ...emptyLevelPicks(), hp: level > 1 ? { how: "average", value: faces / 2 + 1 } : null };
    if (!record?.picks && typeof record?.hp === "number") picks.hp = { how: "manual", value: record.hp };
    original = normalized(picks);
  }

  /** Runs an action that leaves this level, asking first when it has unsaved changes. */
  function guarded(action: () => void) {
    if (dirty && !readOnly) {
      afterDiscard = action;
      leaveDialog?.showModal();
    } else action();
  }

  async function load() {
    loadError = null;
    try {
      loadedFor = `${main.name}|${main.source}`;
      data = await loadLevelData(main, clsData ?? {}, published);
      const first = levels.find((l) => levelNeedsChoice(c, data!, l)) ?? 1;
      select(first);
    } catch (e) {
      loadError = tl.loadError(errorMessage(e));
    }
  }

  $effect(() => {
    if (open && dialog && !dialog.open) {
      if (clsData && (!data || loadedFor !== `${main.name}|${main.source}`)) load();
      else if (data) select(levels.find((l) => levelNeedsChoice(c, data!, l)) ?? 1);
      dialog.showModal();
    } else if (!open && dialog?.open) {
      dialog.close();
    }
  });

  function save() {
    if (!data || readOnly) return;
    const saved = saveLevel($state.snapshot(c) as Character, data, selected, $state.snapshot(picks) as LevelPicks, faces);
    onsave(saved.character);
    const reopened = saved.reopened;
    notify(reopened.length ? t.savedReopened(plain.format(selected), reopened.map((l) => plain.format(l)).join(", ")) : t.saved(plain.format(selected)));
    original = normalized(picks);
  }

  async function onListKey(e: KeyboardEvent) {
    const i = levels.indexOf(selected);
    const next = e.key === "ArrowDown" ? i + 1 : e.key === "ArrowUp" ? i - 1 : e.key === "Home" ? 0 : e.key === "End" ? levels.length - 1 : null;
    if (next === null || next < 0 || next >= levels.length) return;
    e.preventDefault();
    guarded(() => select(levels[next]));
    await tick();
    list?.querySelector<HTMLButtonElement>('[aria-current="true"]')?.focus();
  }

  function close() {
    guarded(() => (open = false));
  }

  function discard() {
    leaveDialog?.close();
    original = normalized(picks); // let the action through
    afterDiscard?.();
    afterDiscard = null;
  }
</script>

<dialog
  bind:this={dialog}
  class="levels"
  aria-labelledby="levels-title"
  oncancel={(e) => {
    e.preventDefault();
    close();
  }}
>
  {#if open}
    <header class="top">
      <h1 id="levels-title">{t.title(c.name)}</h1>
      <button class="icon-btn" aria-label={tl.close} onclick={close}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" /></svg>
      </button>
    </header>

    {#if loadError}
      <div class="message"><div class="error" role="alert"><p>{loadError}</p><button class="btn small" onclick={load}>{tl.retry}</button></div></div>
    {:else if !clsData}
      <div class="message"><p class="note">{tl.noRules}</p></div>
    {:else if !data}
      <div class="message"><Spinner label={tl.loading} /></div>
    {:else}
      <div class="body">
        <nav class="side" aria-label={t.levels}>
          <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
          <ul bind:this={list} onkeydown={onListKey}>
            {#each levels as level (level)}
              <li>
                <button class="level" aria-current={level === selected} onclick={() => guarded(() => select(level))}>
                  <span class="level-name">
                    {tl.classLevel(main.name, plain.format(level))}
                    {#if needs.has(level)}<span class="dot" title={tl.choiceNeeded}></span><span class="sr-only">({tl.choiceNeeded})</span>{/if}
                  </span>
                  <span class="level-sum">{summary(level)}</span>
                </button>
              </li>
            {/each}
          </ul>
        </nav>

        <div class="scroll">
          <div class="content">
            {#if readOnly}<p class="note">{t.readOnly}</p>{/if}
            {#key selected}
              <svelte:boundary>
                <LevelPanel {data} character={c} level={selected} bind:picks {faces} {skills} {sources} {readOnly} />
                {#snippet failed(error)}<p class="error" role="alert">{tl.panelError(errorMessage(error))}</p>{/snippet}
              </svelte:boundary>
            {/key}
          </div>
        </div>
      </div>
    {/if}

    <footer class="bottom">
      <button class="btn" onclick={close}>{t.close}</button>
      {#if !readOnly}
        <button class="btn btn-primary" disabled={!data || !dirty} onclick={save}>{t.save(plain.format(selected))}</button>
      {/if}
    </footer>

    <EntityPopover />
  {/if}

  <dialog bind:this={leaveDialog} class="leave" aria-labelledby="levels-leave-title">
    <h2 id="levels-leave-title">{t.leaveTitle(plain.format(selected))}</h2>
    <p>{t.leaveBody}</p>
    <div class="leave-actions">
      <button class="btn" onclick={() => leaveDialog?.close()}>{t.keepEditing}</button>
      <button class="btn btn-danger" onclick={discard}>{t.discard}</button>
    </div>
  </dialog>
</dialog>

<style>
  .levels {
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

  .levels[open] {
    display: flex;
    flex-direction: column;
  }

  .levels::backdrop,
  .leave::backdrop {
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

  .body {
    flex: 1;
    min-height: 0;
    display: flex;
  }

  .side {
    flex: none;
    width: var(--settings-side-width);
    overflow-y: auto;
    border-right: var(--border-width) solid var(--color-border);
    background: var(--color-surface);
  }

  .side ul {
    list-style: none;
    margin: 0;
    padding: var(--space-2);
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .level {
    display: flex;
    flex-direction: column;
    gap: 2px;
    width: 100%;
    padding: var(--space-2) var(--space-3);
    border: none;
    border-radius: var(--radius-md);
    background: transparent;
    color: var(--color-text);
    text-align: left;
    cursor: pointer;
  }

  .level:hover {
    background: var(--color-surface-sunken);
  }

  .level[aria-current="true"] {
    background: var(--color-accent-soft);
    color: var(--color-link);
  }

  .level-name {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    font-size: var(--text-sm);
    font-weight: var(--weight-semibold);
  }

  .level-sum {
    overflow: hidden;
    color: var(--color-text-muted);
    font-size: var(--text-xs);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .dot {
    width: var(--space-2);
    height: var(--space-2);
    border-radius: 50%;
    background: var(--color-danger);
  }

  .scroll {
    flex: 1;
    min-width: 0;
    overflow-y: auto;
  }

  .content {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    width: min(100%, var(--reading-width));
    margin: 0 auto;
    padding: var(--space-5);
  }

  .message {
    flex: 1;
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


  .leave {
    width: min(100% - 2 * var(--space-4), var(--dialog-width));
    padding: var(--space-6);
    border: var(--border-width) solid var(--color-border);
    border-radius: var(--radius-lg);
    background: var(--color-surface);
    color: var(--color-text);
  }

  .leave h2 {
    font-size: var(--text-lg);
    font-weight: var(--weight-semibold);
  }

  .leave p {
    margin: var(--space-2) 0 var(--space-5);
    color: var(--color-text-muted);
  }

  .leave-actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-2);
  }

  @media (max-width: 720px) {
    .body {
      flex-direction: column;
    }

    .side {
      width: auto;
      max-height: 30vh;
      border-right: none;
      border-bottom: var(--border-width) solid var(--color-border);
    }
  }
</style>
