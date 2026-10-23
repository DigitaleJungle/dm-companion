<script lang="ts">
  import type { CatalogRow } from "$lib/api/rules";
  import { inSources } from "$lib/characters/rules";
  import { strings } from "$lib/strings";
  import { draft, grantedLanguages, openLanguageSlots } from "./draft.svelte";

  // Every character knows Common and two standard languages. Languages the species or background grant fill those
  // two first; the rest are picked here. Extra languages can always be added.
  let { languages, sources }: { languages: CatalogRow[]; sources: string[] | null } = $props();

  const t = strings.characters.wizard.languages;
  const title = (s: string) => s.replace(/(^|[\s(/-])(\w)/g, (_, a: string, b: string) => a + b.toUpperCase());

  // One entry per language name (reprints share it), from the campaign's books.
  const all = $derived(
    [...new Map(languages.filter((r) => inSources(r.source, sources)).map((r) => [r.name.toLowerCase(), r])).values()].sort((a, b) => a.name.localeCompare(b.name)),
  );
  const standard = $derived(all.filter((r) => String(r.data.type ?? "standard") === "standard"));
  const granted = $derived(grantedLanguages());
  const slots = $derived(openLanguageSlots());
  const taken = $derived(new Set(["common", ...granted, ...draft.languages, ...draft.extraLanguages]));

  function setSlot(i: number, value: string) {
    const next = Array.from({ length: slots }, (_, j) => draft.languages[j] ?? "");
    next[i] = value;
    draft.languages = next;
  }
</script>

<section class="languages" aria-labelledby="wizard-languages">
  <h3 id="wizard-languages" class="label">{t.title}</h3>
  <p class="muted">{t.rule}</p>
  <ul class="known">
    <li class="chip">{t.common}</li>
    {#each granted as l (l)}<li class="chip">{title(l)} <span class="muted small">{t.granted}</span></li>{/each}
  </ul>

  {#if slots > 0}
    <div class="row">
      {#each Array.from({ length: slots }, (_, i) => i) as i (i)}
        <label class="field">
          <span class="label-text">{t.slot(String(i + 1))} <span class="required" aria-hidden="true">*</span></span>
          <select value={draft.languages[i] ?? ""} onchange={(e) => setSlot(i, e.currentTarget.value)}>
            <option value="">{t.choose}</option>
            {#each standard as r (r.id)}
              {@const key = r.name.toLowerCase()}
              <option value={key} disabled={taken.has(key) && draft.languages[i] !== key}>{r.name}</option>
            {/each}
          </select>
        </label>
      {/each}
    </div>
  {/if}

  <div class="extras">
    {#each draft.extraLanguages as l (l)}
      <span class="chip">
        {title(l)}
        <button class="remove" aria-label={t.remove(title(l))} onclick={() => (draft.extraLanguages = draft.extraLanguages.filter((x) => x !== l))}>×</button>
      </span>
    {/each}
    <label class="field">
      <span class="label-text">{t.add}</span>
      <select
        value=""
        onchange={(e) => {
          const v = e.currentTarget.value;
          if (v) draft.extraLanguages = [...draft.extraLanguages, v];
          e.currentTarget.value = "";
        }}
      >
        <option value="">{t.choose}</option>
        {#each all.filter((r) => !taken.has(r.name.toLowerCase())) as r (r.id)}<option value={r.name.toLowerCase()}>{r.name}</option>{/each}
      </select>
    </label>
  </div>
</section>

<style>
  .languages {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    margin-top: var(--space-5);
    padding-top: var(--space-5);
    border-top: var(--border-width) solid var(--color-border);
  }

  .known,
  .extras,
  .row {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    gap: var(--space-2) var(--space-4);
  }

  .known {
    list-style: none;
    margin: 0;
    padding: 0;
    gap: var(--space-2);
  }

  .chip {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    padding: var(--space-1) var(--space-3);
    border-radius: var(--radius-pill);
    background: var(--color-accent-soft);
    color: var(--color-link);
    font-size: var(--text-sm);
  }

  .remove {
    padding: 0 var(--space-1);
    border: none;
    background: none;
    color: inherit;
    font-size: var(--text-md);
    line-height: 1;
    cursor: pointer;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .field select {
    width: min(100%, var(--select-width));
  }

  .label-text {
    font-size: var(--text-sm);
    font-weight: var(--weight-semibold);
  }

  .muted {
    color: var(--color-text-muted);
    font-size: var(--text-sm);
  }

  .small {
    font-size: var(--text-xs);
  }
</style>
