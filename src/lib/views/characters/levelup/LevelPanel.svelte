<script lang="ts">
  import Entries from "$lib/components/rules/Entries.svelte";
  import type { Character } from "$lib/api/characters";
  import { rollDice } from "$lib/api/dice";
  import type { CatalogRow } from "$lib/api/rules";
  import { errorMessage } from "$lib/api/storage";
  import {
    decisionComplete,
    emptyFeat,
    hpGain,
    levelHp,
    prerequisite,
    refKey,
    scoresWithLevels,
    spellMatches,
    type Decision,
    type Feature,
    type LevelPicks,
    type SpellFilter,
  } from "$lib/characters/levelup";
  import { inSources, modifier } from "$lib/characters/rules";
  import { masteryNames } from "$lib/characters/sheet";
  import { ordinal } from "$lib/rules/catalog";
  import { rules } from "$lib/stores/rules.svelte";
  import { strings } from "$lib/strings";
  import ChoiceList from "../create/ChoiceList.svelte";
  import { versionGroups } from "../create/cards";
  import FeatPicker from "./FeatPicker.svelte";
  import PickList, { type PickItem } from "./PickList.svelte";
  import { alwaysSpellsAt, lookup, planFor, prereqContext, stateBefore, subclassAt, type LevelData } from "./levelData";

  // One class level: its hit points, its features with their rules text, and every decision they ask for, filled in
  // from `picks`. Used for a new level (Level up) and to change a level that was already taken (Edit → Levels).
  let {
    data,
    character,
    level,
    picks = $bindable(),
    faces,
    skills,
    sources,
    readOnly = false,
  }: {
    data: LevelData;
    character: Character;
    level: number;
    picks: LevelPicks;
    faces: number;
    skills: { key: string; name: string }[];
    sources: string[] | null;
    readOnly?: boolean;
  } = $props();

  const t = strings.characters.levelUpDialog;
  const plain = new Intl.NumberFormat();
  const signed = new Intl.NumberFormat(undefined, { signDisplay: "always" });
  const published = (source: string) => rules.status?.library?.sources.find((s) => s.id.toLowerCase() === source.toLowerCase())?.published ?? "";
  const allowed = (s: string) => inSources(s, sources);
  const find = $derived(lookup(data));

  const main = $derived(character.classes[0]);
  const subclass = $derived(subclassAt(character, data, level, picks));
  const plan = $derived(planFor(data, level, subclass));
  const before = $derived(stateBefore(character, level, faces));
  const ctx = $derived(prereqContext(before, level));
  const con = $derived(scoresWithLevels(character)?.con ?? 10);

  // Every feat decision gets an empty pick to fill in.
  $effect(() => {
    for (const d of plan.decisions) if (d.kind === "feat" && !picks.feats[d.id]) picks.feats[d.id] = emptyFeat();
  });

  // ---- Hit points ----

  let rolling = $state(false);
  let rollError = $state<string | null>(null);

  async function rollHp() {
    rolling = true;
    rollError = null;
    try {
      const roll = await rollDice(`1d${faces}`);
      picks.hp = { how: "roll", value: roll.total };
    } catch (e) {
      rollError = t.rollError(errorMessage(e));
    } finally {
      rolling = false;
    }
  }

  // ---- What each decision offers ----

  const known = $derived(new Set((before.spells ?? []).map(refKey)));
  const spellItem = (r: CatalogRow): PickItem => ({
    key: refKey(r),
    name: r.name,
    group: Number(r.data.level) === 0 ? t.cantrips : t.spellLevel(ordinal(Number(r.data.level))),
    preview: { kind: "spell", name: r.name, source: r.source },
  });
  const byLevelThenName = (a: CatalogRow, b: CatalogRow) => Number(a.data.level) - Number(b.data.level) || a.name.localeCompare(b.name);

  function spellItems(filter: SpellFilter): PickItem[] {
    const lists = data.lists ?? new Map();
    return data.spells.filter((r) => allowed(r.source) && !known.has(refKey(r)) && spellMatches(r, filter, lists)).sort(byLevelThenName).map(spellItem);
  }

  function classSpellItems(d: Extract<Decision, { kind: "cantrips" | "spells" }>): PickItem[] {
    const levels = d.kind === "cantrips" ? [0] : Array.from({ length: d.maxLevel }, (_, i) => i + 1);
    return spellItems({ levels, classes: [d.list.name.toLowerCase()], schools: [], ritual: false });
  }

  function featCandidates(d: Extract<Decision, { kind: "feat" }>) {
    const taken = new Set((before.feats ?? []).map((f) => f.name.toLowerCase()));
    const rows = data.feats.filter((r) => d.categories.includes(String(r.data.category ?? "")) && (!taken.has(r.name.toLowerCase()) || r.data.repeatable === true));
    const asi = (r: CatalogRow) => Number(d.asi && r.name === "Ability Score Improvement");
    return versionGroups(rows, allowed, published)
      .map((g) => ({ row: g.main, prereq: prerequisite(g.main.data.prerequisite, ctx) }))
      .filter((x) => x.prereq !== "unmet")
      .sort((a, b) => asi(b.row) - asi(a.row) || a.row.name.localeCompare(b.row.name))
      .map((x) => ({ row: x.row, check: x.prereq === "check" }));
  }

  function optionalItems(d: Extract<Decision, { kind: "optional" }>): PickItem[] {
    const mine = new Set((before.optionalFeatures ?? []).map(refKey));
    const rows = data.optional.filter((r) => (r.data.featureType as string[] | undefined)?.some((ft) => d.types.includes(ft)) && !mine.has(refKey(r)));
    return versionGroups(rows, allowed, published)
      .map((g) => ({ row: g.main, prereq: prerequisite(g.main.data.prerequisite, ctx) }))
      .filter((x) => x.prereq !== "unmet")
      .sort((a, b) => a.row.name.localeCompare(b.row.name))
      .map((x) => ({ key: refKey(x.row), name: x.row.name, note: x.prereq === "check" ? t.checkPrereq : undefined, preview: { kind: "optionalfeature", name: x.row.name, source: x.row.source } }));
  }

  const masteryItems = $derived.by((): PickItem[] => {
    const mine = new Set((before.weaponMasteries ?? []).map(refKey));
    return versionGroups(
      data.items.filter((r) => !mine.has(refKey(r))),
      allowed,
      published,
    )
      .map((g) => g.main)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((r) => ({ key: refKey(r), name: r.name, note: masteryNames(r.data.mastery).join(", "), preview: { kind: "item", name: r.name, source: r.source } }));
  });

  const expertiseItems = $derived(skills.filter((s) => (before.skills ?? []).includes(s.key) && !(before.expertise ?? []).includes(s.key)).map((s) => ({ key: s.key, name: s.name })));

  const optionText = (ref: { name: string; source: string }) =>
    data.classFeatures.find((f) => refKey(f) === refKey(ref) && Number(f.data.level) === level)?.data.entries ??
    data.subclassFeatures.find((f) => refKey(f) === refKey(ref) && Number(f.data.level) === level)?.data.entries;

  // ---- Grouping decisions under their features ----

  const featureOf = (d: Decision, f: Feature) =>
    d.id.startsWith(`${f.subclass ? "s" : "c"}:${f.name}`) || ("feature" in d && d.feature === f.name && (d.id.startsWith("fp:") || d.id.startsWith("op:")));
  const loose = $derived(plan.decisions.filter((d) => !plan.features.some((f) => featureOf(d, f))));

  const subclassGroups = $derived(versionGroups(data.subclasses, allowed, published));
  const subclassArt = (r: CatalogRow) => `classes/${r.source}/${String(r.data.shortName ?? r.name)} ${main.name}.webp`;
  const autoSpells = $derived(alwaysSpellsAt(data, subclass, level));
  const keysOf = (id: string) => picks.keys[id] ?? [];
  const setKeys = (id: string, v: string[]) => (picks.keys = { ...picks.keys, [id]: v });
</script>

{#snippet decision(d: Decision)}
  {#if d.kind === "subclass"}
    <ChoiceList
      id="levelup-subclass-{level}"
      label={String(data.cls.data.subclassTitle ?? t.subclass)}
      groups={subclassGroups}
      selected={subclass}
      onselect={(row) => (picks.subclass = { name: row.name, source: row.source, shortName: String(row.data.shortName ?? row.name) })}
      facts={() => []}
      art={subclassArt}
    />
  {:else if d.kind === "feat" && picks.feats[d.id]}
    <FeatPicker
      id="levelup-{level}-{d.id}"
      candidates={featCandidates(d)}
      bind:pick={picks.feats[d.id]}
      {level}
      {skills}
      proficient={before.skills ?? []}
      expertise={before.expertise ?? []}
      {spellItems}
    />
  {:else if d.kind === "options"}
    <fieldset class="options">
      <legend class="label-text">{t.chooseOne}</legend>
      {#each d.refs as ref (refKey(ref))}
        {@const text = optionText(ref)}
        <label class="option" class:on={keysOf(d.id).includes(refKey(ref))}>
          <input type="radio" name="levelup-{level}-{d.id}" checked={keysOf(d.id).includes(refKey(ref))} onchange={() => setKeys(d.id, [refKey(ref)])} />
          <span><b>{ref.name}</b>{#if text}<span class="option-text"><Entries entry={text} depth={5} /></span>{/if}</span>
        </label>
      {/each}
    </fieldset>
  {:else if d.kind === "optional"}
    <PickList id="levelup-{level}-{d.id}" label={d.feature} items={optionalItems(d)} max={d.count} bind:selected={() => keysOf(d.id), (v) => setKeys(d.id, v)} />
  {:else if d.kind === "cantrips" || d.kind === "spells"}
    {#if data.lists === null}
      <p class="note">{t.reimport}</p>
    {:else}
      <PickList
        id="levelup-{level}-{d.id}"
        label={d.kind === "cantrips" ? t.newCantrips : t.newSpells(ordinal(d.maxLevel))}
        items={classSpellItems(d)}
        max={d.count}
        bind:selected={() => keysOf(d.id), (v) => setKeys(d.id, v)}
      />
    {/if}
  {:else if d.kind === "masteries"}
    <PickList id="levelup-{level}-masteries" label={t.masteries} items={masteryItems} max={d.count} bind:selected={() => keysOf(d.id), (v) => setKeys(d.id, v)} />
  {:else if d.kind === "expertise"}
    <PickList id="levelup-{level}-{d.id}" label={t.expertise} items={expertiseItems} max={d.count} bind:selected={() => keysOf(d.id), (v) => setKeys(d.id, v)} />
  {/if}
{/snippet}

{#snippet card(title: string, sub: string, text: unknown, decisions: Decision[])}
  {@const pending = decisions.filter((d) => !decisionComplete(d, level, picks, find)).length}
  <section class="card">
    <header class="card-head">
      <h3>{title}</h3>
      {#if sub}<span class="muted small">{sub}</span>{/if}
      {#if decisions.length}
        <span class="badge" class:done={pending === 0}>{pending === 0 ? t.chosenAll : t.choiceNeeded}</span>
      {/if}
    </header>
    {#if text}<div class="text"><Entries entry={text} depth={4} /></div>{/if}
    {#each decisions as d (d.id)}<div class="decision">{@render decision(d)}</div>{/each}
  </section>
{/snippet}

<fieldset class="panel" disabled={readOnly}>
  {#if level > 1}
    <section class="card">
      <header class="card-head">
        <h3>{t.hp}</h3>
        <span class="badge" class:done={!!picks.hp}>{picks.hp ? t.chosenAll : t.choiceNeeded}</span>
      </header>
      <div class="hp">
        <button type="button" class="btn" aria-pressed={picks.hp?.how === "average"} onclick={() => (picks.hp = { how: "average", value: faces / 2 + 1 })}>
          {t.average(plain.format(faces / 2 + 1), signed.format(modifier(con)))}
        </button>
        <button type="button" class="btn" aria-pressed={picks.hp?.how === "roll"} disabled={rolling} onclick={rollHp}>
          {rolling ? t.rolling : picks.hp?.how === "roll" ? t.rolled(plain.format(picks.hp.value), plain.format(faces)) : t.roll(plain.format(faces))}
        </button>
        <label class="manual" class:on={picks.hp?.how === "manual"}>
          <span>{t.manual}</span>
          <input
            type="number"
            min="1"
            inputmode="numeric"
            value={picks.hp?.how === "manual" ? picks.hp.value : ""}
            onchange={(e) => {
              const n = Number(e.currentTarget.value);
              if (Number.isInteger(n) && n >= 1) picks.hp = { how: "manual", value: n };
            }}
          />
        </label>
        {#if picks.hp}<span class="hp-result">{t.gain(plain.format(levelHp(picks.hp, faces, con)))}</span>{/if}
        {#if rollError}<span class="error-text" role="alert">{rollError}</span>{/if}
      </div>
    </section>
  {:else}
    <p class="note">{t.levelOneHp(plain.format(hpGain(faces, con, faces)))}</p>
  {/if}

  {#each plan.features as f (`${f.subclass}-${f.name}`)}
    {@render card(f.name, f.subclass ? (subclass?.name ?? "") : t.classLevel(main.name, plain.format(level)), f.data.entries, plan.decisions.filter((d) => featureOf(d, f)))}
  {/each}
  {#each loose as d (d.id)}
    {@render card(d.kind === "cantrips" ? t.cantrips : d.kind === "spells" ? t.spells : d.kind === "masteries" ? t.masteries : "feature" in d ? d.feature : "", "", null, [d])}
  {/each}
  {#if plan.features.length === 0 && loose.length === 0}
    <p class="muted">{t.nothingNew}</p>
  {/if}

  {#if autoSpells.length}
    <p class="note">{t.alwaysPrepared(autoSpells.map((s) => s.name).join(", "))}</p>
  {/if}
</fieldset>

<style>
  .panel {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    min-width: 0;
    margin: 0;
    padding: 0;
    border: none;
  }

  .card {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    padding: var(--space-4) var(--space-5);
    border: var(--border-width) solid var(--color-border);
    border-radius: var(--radius-lg);
    background: var(--color-surface);
    box-shadow: var(--shadow-card);
  }

  .card-head {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: var(--space-2) var(--space-3);
  }

  .card-head h3 {
    font-size: var(--text-md);
    font-weight: var(--weight-semibold);
  }

  .badge {
    margin-left: auto;
    padding: 0 var(--space-2);
    border-radius: var(--radius-pill);
    background: var(--color-danger-soft);
    color: var(--color-danger);
    font-size: var(--text-xs);
    font-weight: var(--weight-semibold);
  }

  .badge.done {
    background: var(--color-surface-sunken);
    color: var(--color-success);
  }

  .text {
    font-size: var(--text-sm);
  }

  .text :global(p),
  .option-text :global(p) {
    margin-bottom: var(--space-2);
  }

  .decision {
    padding-top: var(--space-3);
    border-top: var(--border-width) solid var(--color-border);
  }

  .hp {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2) var(--space-3);
  }

  .hp .btn[aria-pressed="true"],
  .manual.on {
    border-color: var(--color-link);
    background: var(--color-accent-soft);
    color: var(--color-link);
  }

  .manual {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    min-height: var(--control-height);
    padding: 0 var(--space-2) 0 var(--space-3);
    border: var(--border-width) solid var(--color-border-strong);
    border-radius: var(--radius-md);
    font-size: var(--text-sm);
    font-weight: var(--weight-medium);
  }

  .manual input {
    width: calc(3 * var(--space-6));
    min-height: var(--control-height-sm);
    padding: 0 var(--space-2);
    border: var(--border-width) solid var(--color-border-strong);
    border-radius: var(--radius-sm);
    background: var(--color-surface);
    color: var(--color-text);
  }

  .hp-result {
    font-weight: var(--weight-semibold);
  }

  .options {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    margin: 0;
    padding: 0;
    border: none;
  }

  .label-text {
    margin-bottom: var(--space-1);
    font-size: var(--text-sm);
    font-weight: var(--weight-semibold);
  }

  .option {
    display: flex;
    align-items: baseline;
    gap: var(--space-3);
    padding: var(--space-3);
    border: var(--border-width) solid var(--color-border);
    border-radius: var(--radius-md);
    font-size: var(--text-sm);
    cursor: pointer;
  }

  .option.on {
    border-color: var(--color-link);
    background: var(--color-accent-soft);
  }

  .option-text {
    display: block;
    margin-top: var(--space-1);
    color: var(--color-text-muted);
  }

  .note {
    padding: var(--space-3) var(--space-4);
    border-radius: var(--radius-md);
    background: var(--color-surface-sunken);
    font-size: var(--text-sm);
  }

  .error-text {
    color: var(--color-danger);
    font-size: var(--text-sm);
  }

  .muted {
    color: var(--color-text-muted);
  }

  .small {
    font-size: var(--text-xs);
  }
</style>
