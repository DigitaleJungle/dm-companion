<script lang="ts">
  import { usageKey, type FeatureUsage } from "$lib/api/featureUsage";
  import { errorMessage } from "$lib/api/storage";
  import { featureUse, resolveUse, structuredUse, type ResolvedUse } from "$lib/characters/features";
  import { ABILITY_NAMES } from "$lib/rules/format";
  import { featureUsage, loadFeatureUsage, saveFeatureUsage } from "$lib/stores/featureUsage.svelte";
  import { strings } from "$lib/strings";

  // The Usage section of a feature's preview card: how it's used, as the sheet sees it (filled in by hand, else the
  // rules data, else its text), and a form to fill it in once for every character (app-wide).
  let { ref, data }: { ref: { kind: string; name: string; source?: string }; data: Record<string, unknown> } = $props();

  const t = strings.featureUsage;
  const plain = new Intl.NumberFormat();
  const ABILITIES = Object.keys(ABILITY_NAMES);

  $effect(() => void loadFeatureUsage());
  const key = $derived(usageKey(ref, data));
  const manual = $derived(featureUsage.map[key]);
  const detected = $derived(resolveUse(featureUse(data.entries), structuredUse(data), undefined));
  const current = $derived(resolveUse(featureUse(data.entries), structuredUse(data), manual));

  function summary(u: ResolvedUse): string[] {
    const s = t.summary;
    const uses = u.table
      ? s.table(u.table)
      : !u.uses
        ? null
        : "count" in u.uses
          ? s.uses(plain.format(u.uses.count))
          : "ability" in u.uses
            ? s.ability(u.uses.ability.toUpperCase())
            : "proficiency" in u.uses
              ? s.proficiency
              : s.perLevel(plain.format(u.uses.perLevel));
    return [
      u.time ? t.time[u.time] : null,
      uses,
      u.freeCast ? s.freeCast(u.spells.join(", ")) : null,
      u.short ? s.short(t.short[u.short].toLowerCase()) : null,
      u.long && !u.short ? s.long : null,
      u.drawsFrom ? s.drawsFrom(u.drawsFrom) : null,
      u.range ? s.range(u.range) : null,
      u.damage ? s.damage(u.damage) : null,
      u.save ? s.save(u.save.toUpperCase()) : null,
    ].filter((x): x is string => !!x);
  }

  // ---- The form: "" in a field means "as detected" ----
  let editing = $state(false);
  let saving = $state(false);
  let error = $state<string | null>(null);
  let form = $state(blank());

  function blank() {
    return { usage: "", countKind: "", countValue: "", spell: "", short: "", long: "", time: "", range: "", damage: "", save: "", drawsFrom: "" };
  }

  function edit() {
    const m = manual ?? {};
    const c = m.count ?? {};
    const countKind = c.fixed !== undefined ? "fixed" : c.ability ? "ability" : c.proficiency ? "proficiency" : c.perLevel !== undefined ? "perLevel" : c.table ? "table" : "";
    const countValue = c.fixed !== undefined ? String(c.fixed) : (c.ability ?? (c.perLevel !== undefined ? String(c.perLevel) : (c.table ?? "")));
    form = {
      usage: m.usage ?? "",
      countKind,
      countValue,
      spell: m.spell ?? "",
      short: m.short ?? "",
      long: m.long === undefined ? "" : m.long ? "yes" : "no",
      time: m.time ?? "",
      range: m.range ?? "",
      damage: m.damage ?? "",
      save: m.save ?? "",
      drawsFrom: m.drawsFrom ?? "",
    };
    error = null;
    editing = true;
  }

  /** What the form says, left-out fields dropped; a count that isn't a whole number 0–999 is an error. */
  function fromForm(): FeatureUsage | string {
    const f = form;
    const text = (v: string) => (v.trim() ? v.trim() : undefined);
    const n = Number(f.countValue);
    const whole = Number.isInteger(n) && n >= 0 && n <= 999;
    let count: FeatureUsage["count"];
    if (f.countKind === "fixed" || f.countKind === "perLevel") {
      if (!whole) return t.fields.count;
      count = f.countKind === "fixed" ? { fixed: n } : { perLevel: n };
    } else if (f.countKind === "ability") count = { ability: ABILITIES.includes(f.countValue) ? f.countValue : "cha" };
    else if (f.countKind === "proficiency") count = { proficiency: true };
    else if (f.countKind === "table") {
      if (!text(f.countValue)) return t.fields.count;
      count = { table: f.countValue.trim() };
    }
    const usage: FeatureUsage = {
      usage: (f.usage || undefined) as FeatureUsage["usage"],
      count,
      spell: f.usage === "spell" ? text(f.spell) : undefined,
      short: (f.short || undefined) as FeatureUsage["short"],
      long: f.long === "" ? undefined : f.long === "yes",
      time: (f.time || undefined) as FeatureUsage["time"],
      range: text(f.range),
      damage: text(f.damage),
      save: f.save || undefined,
      drawsFrom: text(f.drawsFrom),
    };
    return Object.fromEntries(Object.entries(usage).filter(([, v]) => v !== undefined)) as FeatureUsage;
  }

  async function save(usage: FeatureUsage | null) {
    saving = true;
    error = null;
    try {
      await saveFeatureUsage(key, usage && Object.keys(usage).length ? usage : null);
      editing = false;
    } catch (e) {
      error = t.saveError(errorMessage(e));
    } finally {
      saving = false;
    }
  }

  function submit(e: SubmitEvent) {
    e.preventDefault();
    const usage = fromForm();
    if (typeof usage === "string") error = t.saveError(usage);
    else void save(usage);
  }

  const shown = (value: string | null | undefined) => (value ? t.detectedOption(value) : t.detectedNone);
  const id = $derived(`usage-${key.replace(/\W+/g, "-")}`);
</script>

<section class="usage" aria-labelledby="{id}-title">
  <div class="head">
    <h3 id="{id}-title">{t.title}</h3>
    {#if summary(current).length}<span class="badge" class:set={!!manual}>{manual ? t.set : t.detected}</span>{/if}
    {#if !editing}<button type="button" class="btn small" onclick={edit}>{t.edit}</button>{/if}
  </div>
  {#if featureUsage.loadError}<p class="error" role="alert">{t.loadError(featureUsage.loadError)}</p>{/if}

  {#if !editing}
    <p class="summary">{summary(current).join(" · ") || t.nothing}</p>
  {:else}
    <form class="form" onsubmit={submit}>
      <label>
        <span>{t.fields.usage}</span>
        <select bind:value={form.usage}>
          <option value="">{shown(detected.freeCast ? t.usage.spell : detected.uses ? t.usage.uses : null)}</option>
          {#each Object.entries(t.usage) as [value, label] (value)}<option {value}>{label}</option>{/each}
        </select>
      </label>
      <label>
        <span>{t.fields.count}</span>
        <span class="pair">
          <select bind:value={form.countKind}>
            <option value="">{shown(summary({ ...detected, time: null, freeCast: false, short: null, long: false, drawsFrom: null }).join(""))}</option>
            {#each Object.entries(t.countKind) as [value, label] (value)}<option {value}>{label}</option>{/each}
          </select>
          {#if form.countKind === "ability"}
            <select bind:value={form.countValue} aria-label={t.fields.countValue}>
              {#each ABILITIES as a (a)}<option value={a}>{ABILITY_NAMES[a]}</option>{/each}
            </select>
          {:else if form.countKind && form.countKind !== "proficiency"}
            <input bind:value={form.countValue} aria-label={t.fields.countValue} inputmode={form.countKind === "table" ? "text" : "numeric"} />
          {/if}
        </span>
      </label>
      {#if form.usage === "spell"}
        <label><span>{t.fields.spell}</span><input bind:value={form.spell} placeholder={detected.spells.join(", ")} /></label>
      {/if}
      <label>
        <span>{t.fields.short}</span>
        <select bind:value={form.short}>
          <option value="">{shown(detected.short ? t.short[detected.short] : null)}</option>
          {#each Object.entries(t.short) as [value, label] (value)}<option {value}>{label}</option>{/each}
        </select>
      </label>
      <label>
        <span>{t.fields.long}</span>
        <select bind:value={form.long}>
          <option value="">{shown(detected.long ? t.long.yes : null)}</option>
          <option value="yes">{t.long.yes}</option>
          <option value="no">{t.long.no}</option>
        </select>
      </label>
      <label>
        <span>{t.fields.time}</span>
        <select bind:value={form.time}>
          <option value="">{shown(detected.time ? t.time[detected.time] : null)}</option>
          {#each Object.entries(t.time) as [value, label] (value)}<option {value}>{label}</option>{/each}
        </select>
      </label>
      <label><span>{t.fields.range}</span><input bind:value={form.range} /></label>
      <label><span>{t.fields.damage}</span><input bind:value={form.damage} /></label>
      <label>
        <span>{t.fields.save}</span>
        <select bind:value={form.save}>
          <option value="">—</option>
          {#each ABILITIES as a (a)}<option value={a}>{ABILITY_NAMES[a]}</option>{/each}
        </select>
      </label>
      <label><span>{t.fields.drawsFrom}</span><input bind:value={form.drawsFrom} placeholder={detected.drawsFrom ?? ""} /></label>
      {#if error}<p class="error" role="alert">{error}</p>{/if}
      <div class="actions">
        {#if manual}<button type="button" class="btn small" disabled={saving} onclick={() => save(null)}>{t.clear}</button>{/if}
        <button type="button" class="btn small" disabled={saving} onclick={() => (editing = false)}>{t.cancel}</button>
        <button type="submit" class="btn btn-primary small" disabled={saving}>{t.save}</button>
      </div>
    </form>
  {/if}
</section>

<style>
  .usage {
    margin-top: var(--space-4);
    padding-top: var(--space-3);
    border-top: var(--border-width) solid var(--color-border);
  }

  .head {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .head h3 {
    font-size: var(--text-md);
    font-weight: var(--weight-semibold);
  }

  .head .btn {
    margin-left: auto;
  }

  .badge {
    padding: 0 var(--space-2);
    border-radius: var(--radius-pill);
    background: var(--color-surface-sunken);
    color: var(--color-text-muted);
    font-size: var(--text-xs);
  }

  .badge.set {
    background: var(--color-accent-soft);
    color: var(--color-link);
  }

  .summary {
    margin-top: var(--space-1);
    color: var(--color-text-muted);
    font-size: var(--text-sm);
  }

  .form {
    display: grid;
    gap: var(--space-2);
    margin-top: var(--space-2);
    font-size: var(--text-sm);
  }

  .form label {
    display: grid;
    grid-template-columns: minmax(0, 2fr) minmax(0, 3fr);
    align-items: center;
    gap: var(--space-2);
  }

  .pair {
    display: flex;
    gap: var(--space-1);
    min-width: 0;
  }

  .pair > * {
    min-width: 0;
    flex: 1;
  }

  .form select,
  .form input {
    min-height: var(--control-height-sm);
    padding: 0 var(--space-2);
    border: var(--border-width) solid var(--color-border-strong);
    border-radius: var(--radius-sm);
    background: var(--color-surface);
    color: var(--color-text);
  }

  .actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-2);
  }

  .error {
    color: var(--color-danger);
    font-size: var(--text-sm);
  }
</style>
