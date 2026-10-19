<script lang="ts">
  import { onMount, tick } from "svelte";
  import { SvelteSet } from "svelte/reactivity";
  import { open as openFile } from "@tauri-apps/plugin-dialog";
  import { strings } from "$lib/strings";
  import { errorMessage } from "$lib/api/storage";
  import { getSettings, setSettings } from "$lib/api/settings";
  import type { SourceInfo } from "$lib/api/rules";
  import { compareVersions, latestReleaseVersion, UpdateCheckError } from "$lib/rules/version";
  import InfoTip from "$lib/components/InfoTip.svelte";
  import {
    rules,
    refreshRules,
    importRules,
    importRuleImages,
    removeRuleImages,
    removeRuleSources,
    allowRuleSource,
  } from "$lib/stores/rules.svelte";

  const t = strings.settings.rules;
  const formatDate = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });
  const formatNumber = new Intl.NumberFormat();
  const archiveFilter = [{ name: ".tar.gz", extensions: ["gz", "tgz"] }];

  let importError = $state<string | null>(null);
  let actionError = $state<string | null>(null);
  let actionDone = $state<string | null>(null);
  let repo = $state("");
  let repoMessage = $state<{ ok: boolean; text: string } | null>(null);
  let checking = $state(false);
  let checkResult = $state<string | null>(null);
  let filter = $state("");
  const selected = new SvelteSet<string>();
  let confirming = $state(false);

  const library = $derived(rules.status?.library ?? null);
  const groups = $derived.by(() => {
    const needle = filter.trim().toLowerCase();
    const byGroup = new Map<string, SourceInfo[]>();
    for (const source of library?.sources ?? []) {
      if (needle && !source.name.toLowerCase().includes(needle) && !source.id.toLowerCase().includes(needle)) continue;
      byGroup.set(source.group, [...(byGroup.get(source.group) ?? []), source]);
    }
    return [...byGroup.entries()];
  });
  const percent = $derived(rules.busy ? Math.min(100, Math.round((rules.busy.done / Math.max(1, rules.busy.total)) * 100)) : 0);

  onMount(async () => {
    refreshRules();
    try {
      repo = (await getSettings()).rulesUpdateRepo ?? "";
    } catch (e) {
      repoMessage = { ok: false, text: t.repoError(errorMessage(e)) };
    }
  });

  async function pickAndImport(kind: "data" | "images") {
    importError = null;
    const path = await openFile({ multiple: false, directory: false, filters: archiveFilter, title: kind === "data" ? t.pickerTitle : t.imagesPickerTitle });
    if (typeof path !== "string") return; // cancelled
    try {
      await (kind === "data" ? importRules(path) : importRuleImages(path));
      checkResult = null;
      selected.clear();
    } catch (e) {
      importError = t.importError(errorMessage(e));
    }
  }

  async function saveRepo(event: SubmitEvent) {
    event.preventDefault();
    try {
      const saved = await setSettings({ rulesUpdateRepo: repo.trim() || null });
      repo = saved.rulesUpdateRepo ?? "";
      repoMessage = { ok: true, text: t.repoSaved };
    } catch (e) {
      repoMessage = { ok: false, text: t.repoError(errorMessage(e)) };
    }
  }

  async function checkForUpdates() {
    if (!library || !repo.trim()) return;
    checking = true;
    checkResult = null;
    try {
      const latest = await latestReleaseVersion(repo.trim());
      checkResult = compareVersions(latest, library.version) > 0 ? t.available(latest, library.version) : t.upToDate(library.version);
    } catch (e) {
      const reason = e instanceof UpdateCheckError ? e.message : String(e);
      checkResult = reason === "offline" ? t.checkOffline : reason === "notFound" ? t.checkNotFound : t.checkError(reason);
    } finally {
      checking = false;
    }
  }

  function toggle(id: string, on: boolean) {
    if (on) selected.add(id);
    else selected.delete(id);
    actionDone = null;
  }

  function toggleGroup(sources: SourceInfo[], on: boolean) {
    sources.forEach((s) => toggle(s.id, on));
  }

  async function askRemove() {
    confirming = true;
    await tick();
    document.getElementById("cancel-remove")?.focus();
  }

  async function removeSelected() {
    const ids = [...selected];
    actionError = null;
    try {
      await removeRuleSources(ids);
      selected.clear();
      confirming = false;
      actionDone = t.removedDone(ids.length);
      await tick();
      document.getElementById("source-filter")?.focus();
    } catch (e) {
      actionError = t.actionError(errorMessage(e));
    }
  }

  async function act(action: () => Promise<void>) {
    actionError = null;
    try {
      await action();
    } catch (e) {
      actionError = t.actionError(errorMessage(e));
    }
  }
</script>

<div class="rules-settings">
  <h3 class="title">{t.title}</h3>

  {#if rules.loadError}
    <p class="error" role="alert">{rules.loadError}</p>
  {/if}

  <section class="block" aria-labelledby="rules-source-title">
    <div class="heading-row">
      <h4 id="rules-source-title" class="subheading">{t.updateSource}</h4>
      <InfoTip id="rules-source-info" label={t.updateSourceInfo} text={t.updateSourceHelp} />
    </div>
    <label for="rules-repo" class="field-label">{t.repoLabel}</label>
    <form class="row" onsubmit={saveRepo}>
      <input id="rules-repo" class="text-input" bind:value={repo} placeholder={t.repoPlaceholder} autocomplete="off" spellcheck="false" />
      <button class="btn small" type="submit">{t.repoSave}</button>
    </form>
    {#if repoMessage}<p class={repoMessage.ok ? "muted" : "error"} role={repoMessage.ok ? "status" : "alert"}>{repoMessage.text}</p>{/if}
  </section>

  <!-- What's installed, and the actions on it -->
  <section class="status-card" aria-label={t.title}>
    <div class="status-line">
      <div class="facts">
        {#if library}
          <p class="version">{t.version(library.version)}</p>
          <p class="muted">{t.importedAt(formatDate.format(library.importedAt))}</p>
        {:else if rules.status}
          <p class="version">{t.none}</p>
        {/if}
        <p class="muted images">
          {#if rules.status?.images}
            {t.imagesInstalled(formatNumber.format(rules.status.images.files), formatDate.format(rules.status.images.importedAt))}
            <button class="link" disabled={!!rules.busy} onclick={() => act(removeRuleImages)}>{t.removeImages}</button>
          {:else}
            {t.imagesNone}
          {/if}
        </p>
      </div>
      <div class="actions">
        {#if library}
          <button class="btn small" disabled={checking || !repo.trim() || !!rules.busy} onclick={checkForUpdates}>
            {checking ? t.checking : t.check}
          </button>
        {/if}
        <div class="row">
          <button class="btn small" class:btn-primary={!library} disabled={!!rules.busy} onclick={() => pickAndImport("data")}>{t.import}</button>
          <button class="btn small" disabled={!!rules.busy} onclick={() => pickAndImport("images")}>{t.importImages}</button>
        </div>
      </div>
    </div>

    {#if library}
      {#if !repo.trim()}
        <p class="muted">{t.needsRepo}</p>
      {:else if checkResult}
        <p role="status">{checkResult}</p>
      {/if}
    {/if}

    {#if rules.busy}
      {@const label = rules.busy.task === "data" ? t.importing : t.importingImages}
      <div class="progress" role="status">
        <span>{label}</span>
        <progress max="100" value={percent} aria-label={label}></progress>
        <span class="muted">{t.progress(percent)}</span>
      </div>
    {/if}
    {#if importError}<p class="error" role="alert">{importError}</p>{/if}
    {#if actionError && !library}<p class="error" role="alert">{actionError}</p>{/if}
    <p class="attribution">{t.attribution}</p>
  </section>

  {#if rules.status?.removed.length}
    <section class="block" aria-labelledby="rules-removed">
      <div class="heading-row">
        <h4 id="rules-removed" class="subheading">{t.removedTitle(rules.status.removed.length)}</h4>
        <InfoTip id="rules-removed-info" label={t.removedInfo} text={t.allowHelp} />
      </div>
      <ul class="removed">
        {#each rules.status.removed as source (source.id)}
          <li>
            <span class="name">{source.name}</span>
            <span class="abbr">{source.id}</span>
            <button class="btn small" onclick={() => act(() => allowRuleSource(source.id))} aria-label={t.allowSource(source.name)}>{t.allow}</button>
          </li>
        {/each}
      </ul>
    </section>
  {/if}

  {#if library}
    <section class="block" aria-labelledby="rules-sources">
      <h4 id="rules-sources" class="subheading">{t.sources}</h4>

      <div class="toolbar">
        <label for="source-filter" class="sr-only">{t.filterLabel}</label>
        <input id="source-filter" class="text-input" type="search" bind:value={filter} placeholder={t.filterPlaceholder} autocomplete="off" />
        <button class="btn btn-danger small" disabled={selected.size === 0 || !!rules.busy} onclick={askRemove}>{t.removeSelected(selected.size)}</button>
      </div>

      {#if confirming && selected.size > 0}
        <div class="confirm" role="alertdialog" aria-labelledby="confirm-remove-text">
          <p id="confirm-remove-text">{t.confirmRemove(selected.size)}</p>
          <div class="row end">
            <button id="cancel-remove" class="btn small" onclick={() => (confirming = false)}>{t.cancel}</button>
            <button class="btn btn-danger small" disabled={!!rules.busy} onclick={removeSelected}>{t.confirmRemoveButton(selected.size)}</button>
          </div>
        </div>
      {/if}
      {#if actionError}<p class="error" role="alert">{actionError}</p>{/if}
      {#if actionDone}<p class="muted" role="status">{actionDone}</p>{/if}

      {#if groups.length === 0}
        <p class="muted">{t.noMatches}</p>
      {:else}
        <table>
          <thead>
            <tr>
              <th class="check" scope="col"><span class="sr-only">{t.columnSelect}</span></th>
              <th scope="col">{t.columnName}</th>
              <th scope="col">{t.columnAbbreviation}</th>
              <th class="num" scope="col">{t.columnEntries}</th>
            </tr>
          </thead>
          {#each groups as [group, sources] (group)}
            {@const groupName = t.groups[group] ?? group}
            {@const chosen = sources.filter((s) => selected.has(s.id)).length}
            <tbody>
              <tr class="group-row">
                <th class="check" scope="rowgroup">
                  <input
                    type="checkbox"
                    aria-label={t.selectGroup(groupName)}
                    checked={chosen === sources.length}
                    {@attach (node: HTMLInputElement) => {
                      node.indeterminate = chosen > 0 && chosen < sources.length;
                    }}
                    onchange={(e) => toggleGroup(sources, e.currentTarget.checked)}
                  />
                </th>
                <th colspan="3" scope="rowgroup">{groupName}</th>
              </tr>
              {#each sources as source (source.id)}
                <tr class:chosen={selected.has(source.id)}>
                  <td class="check">
                    <input
                      type="checkbox"
                      aria-label={t.selectSource(source.name)}
                      checked={selected.has(source.id)}
                      onchange={(e) => toggle(source.id, e.currentTarget.checked)}
                    />
                  </td>
                  <td class="name">{source.name}</td>
                  <td class="abbr">{source.id}</td>
                  <td class="num">{formatNumber.format(source.entities)}</td>
                </tr>
              {/each}
            </tbody>
          {/each}
        </table>
      {/if}
    </section>
  {/if}
</div>

<style>
  .rules-settings {
    display: flex;
    flex-direction: column;
    gap: var(--space-7);
  }

  .title {
    font-size: var(--text-lg);
    font-weight: var(--weight-semibold);
  }

  .subheading {
    font-size: var(--text-md);
    font-weight: var(--weight-semibold);
  }

  .muted {
    color: var(--color-text-muted);
    font-size: var(--text-sm);
  }

  .status-card {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    padding: var(--space-4) var(--space-5);
    border: var(--border-width) solid var(--color-border);
    border-radius: var(--radius-md);
    background: var(--color-bg);
  }

  .status-line {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--space-4);
    flex-wrap: wrap;
  }

  .version {
    font-size: var(--text-lg);
    font-weight: var(--weight-semibold);
  }

  .facts {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .images {
    margin-top: var(--space-1);
  }

  .actions {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: var(--space-2);
  }

  .heading-row {
    display: flex;
    align-items: center;
    gap: var(--space-1);
  }

  .link {
    margin-left: var(--space-2);
    padding: 0;
    border: none;
    background: none;
    color: var(--color-link);
    font-size: inherit;
    text-decoration: underline;
    cursor: pointer;
  }

  .link:disabled {
    color: var(--color-text-muted);
    cursor: default;
  }

  .attribution {
    padding-top: var(--space-3);
    border-top: var(--border-width) solid var(--color-border);
    color: var(--color-text-muted);
    font-size: var(--text-xs);
  }

  .block {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .row.end {
    justify-content: flex-end;
  }

  .field-label {
    margin-top: var(--space-1);
    font-size: var(--text-sm);
    font-weight: var(--weight-medium);
  }

  .text-input {
    flex: 1;
    min-width: 0;
    min-height: var(--control-height-sm);
    padding: 0 var(--space-3);
    border: var(--border-width) solid var(--color-border-strong);
    border-radius: var(--radius-sm);
    background: var(--color-surface);
    font-size: var(--text-sm);
  }

  .text-input::placeholder {
    color: var(--color-text-placeholder);
  }

  .small {
    min-height: var(--control-height-sm);
    padding: 0 var(--space-3);
  }

  .progress {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    font-size: var(--text-sm);
  }

  progress {
    flex: 1;
    accent-color: var(--color-accent);
  }

  .toolbar {
    display: flex;
    gap: var(--space-2);
    margin-top: var(--space-1);
  }

  .confirm {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding: var(--space-3) var(--space-4);
    border: var(--border-width) solid var(--color-danger);
    border-radius: var(--radius-md);
    background: var(--color-danger-soft);
    font-size: var(--text-sm);
  }

  table {
    width: 100%;
    border-collapse: collapse;
    font-size: var(--text-sm);
  }

  th,
  td {
    padding: var(--space-2) var(--space-3);
    text-align: left;
    border-bottom: var(--border-width) solid var(--color-border);
  }

  thead th {
    color: var(--color-text-muted);
    font-weight: var(--weight-medium);
  }

  .group-row th {
    padding-top: var(--space-4);
    font-weight: var(--weight-semibold);
  }

  tr.chosen td {
    background: var(--color-accent-soft);
  }

  .check {
    width: var(--control-height);
  }

  input[type="checkbox"] {
    accent-color: var(--color-accent);
  }

  .num {
    text-align: right;
    font-variant-numeric: tabular-nums;
  }

  .abbr {
    color: var(--color-text-muted);
    white-space: nowrap;
  }

  .removed {
    list-style: none;
    margin: 0;
    padding: 0;
    border: var(--border-width) solid var(--color-border);
    border-radius: var(--radius-md);
  }

  .removed li {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-2) var(--space-3);
    font-size: var(--text-sm);
  }

  .removed li + li {
    border-top: var(--border-width) solid var(--color-border);
  }

  .removed .name {
    flex: 1;
    min-width: 0;
    color: var(--color-text-muted);
  }

  .error {
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-sm);
    background: var(--color-danger-soft);
    color: var(--color-danger);
    font-size: var(--text-sm);
  }
</style>
