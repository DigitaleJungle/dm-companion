<script lang="ts">
  import { byExtra, findEntity } from "$lib/api/rules";
  import { ABILITIES, checkBonus, modifier, proficiencyBonus, type Ability } from "$lib/characters/rules";
  import { inUse, proficiencyLists, skillEdges, speciesDefenses, type EdgeSource } from "$lib/characters/sheet";
  import { ABILITY_NAMES } from "$lib/rules/format";
  import { strings } from "$lib/strings";
  import type { Sheet } from "./sheet.svelte";

  // The sheet's left column: abilities, saving throws, senses and proficiencies, and skills.
  let { sheet }: { sheet: Sheet } = $props();

  const t = strings.characters.sheet;
  const signed = new Intl.NumberFormat(undefined, { signDisplay: "always" });
  const plain = new Intl.NumberFormat();
  const list = new Intl.ListFormat(undefined, { type: "conjunction" });

  const scores = $derived(sheet.scores);
  const pb = $derived(proficiencyBonus(sheet.level));
  const proficient = $derived(new Set(sheet.character?.skills ?? []));
  const expert = $derived(new Set(sheet.character?.expertise ?? []));
  const saves = $derived(new Set((sheet.character?.savingThrows ?? []) as Ability[]));
  const skillRows = $derived(
    sheet.skills.map((s) => ({
      ...s,
      proficient: proficient.has(s.key),
      expert: expert.has(s.key),
      // Expertise doubles the proficiency bonus.
      bonus: scores ? checkBonus(scores[s.ability] ?? 10, proficient.has(s.key), pb) + (expert.has(s.key) ? pb : 0) : null,
    })),
  );
  // Advantage and disadvantage on skills come from the species, feats, class and subclass features up to the level and
  // the items in use (their text, or armor's Stealth flag); those are fixed. Others can be set by hand on the sheet.
  // The sources are loaded again when the class, feats or items in use change.
  let loaded = $state<EdgeSource[]>([]);
  const main = $derived(sheet.character?.classes[0]);
  // As text, so the effect below only runs again when the list really changes.
  const featKeys = $derived(JSON.stringify((sheet.character?.feats ?? []).map((f) => [f.name, f.source])));
  // An item that needs attunement only counts once attuned.
  const itemKeys = $derived(
    JSON.stringify(
      (sheet.character?.inventory ?? []).filter((i) => i.source && inUse(i) && (!i.attunement || i.attuned)).map((i) => [i.name, i.source]),
    ),
  );
  $effect(() => {
    const m = main;
    const refs = (keys: string) => JSON.parse(keys) as [string, string][];
    const feats = refs(featKeys);
    const items = refs(itemKeys);
    const lower = (s: string) => s.toLowerCase();
    (async () => {
      const sub = m?.subclass;
      const [classFeatures, subFeatures, featRows, itemRows] = await Promise.all([
        m ? byExtra("classFeature", `${m.name}|${m.source}|`) : [],
        m && sub ? byExtra("subclassFeature", `${m.name}|${sub.shortName || sub.name}|`) : [],
        Promise.all(feats.map(([name, source]) => findEntity("feat", name, source))),
        Promise.all(items.map(([name, source]) => findEntity("item", name, source))),
      ]);
      const upTo = (rows: { name: string; data: Record<string, unknown> }[]) => rows.filter((r) => Number(r.data.level ?? 1) <= (m?.level ?? 0)).map((r) => ({ name: r.name, entries: r.data.entries }));
      loaded = [
        ...upTo(classFeatures),
        ...upTo(subFeatures.filter((r) => lower(String(r.data.subclassSource ?? "")) === lower(sub?.source ?? ""))),
        ...featRows.flatMap((e) => (e ? [{ name: e.name, entries: e.data.entries }] : [])),
        ...itemRows.flatMap((e) => (e ? [{ name: e.name, entries: e.data.entries, stealth: e.data.stealth === true }] : [])),
      ];
    })().catch(() => (loaded = [])); // without them, only the species and the hand-set ones count
  });
  type Edge = "advantage" | "disadvantage";
  const EDGES: Edge[] = ["advantage", "disadvantage"];
  const handSet = { advantage: "skillAdvantage", disadvantage: "skillDisadvantage" } as const;
  const fixed = $derived(skillEdges([...(sheet.species ? [{ name: sheet.character?.species?.name ?? "", entries: sheet.species.entries }] : []), ...loaded], sheet.skills));
  const sourcesOf = (edge: Edge, key: string) => fixed[edge].get(key) ?? [];
  const has = (edge: Edge, key: string) => sourcesOf(edge, key).length > 0 || sheet.character?.[handSet[edge]]?.[key] === true;
  // Both on one skill cancel out: neither applies.
  const cancelled = (key: string) => has("advantage", key) && has("disadvantage", key);
  // Only one without a source can be set by hand.
  function toggle(edge: Edge, key: string) {
    sheet.change((x) => {
      const next = { ...(x[handSet[edge]] ?? {}) };
      if (next[key] === true) delete next[key];
      else next[key] = true;
      x[handSet[edge]] = next;
    });
  }

  const passive = (key: string, ability: Ability) => {
    const bonus = skillRows.find((s) => s.key === key)?.bonus ?? (scores ? modifier(scores[ability]) : null);
    return bonus === null ? t.unknown : plain.format(10 + bonus);
  };
  const lists = $derived(proficiencyLists(sheet.cls, sheet.background, sheet.species, { tools: sheet.character?.tools, languages: sheet.character?.languages }));
  // From the species (or its chosen lineage): save advantages, then resistances and the like, only the ones it has.
  const defenses = $derived(speciesDefenses(sheet.species, sheet.character?.species?.lineage));
  const defenseRows = $derived(
    ([
      [t.defenses.advantage, defenses.advantages],
      [t.defenses.resist, defenses.resist],
      [t.defenses.immune, defenses.immune],
      [t.defenses.conditionImmune, defenses.conditionImmune],
      [t.defenses.vulnerable, defenses.vulnerable],
    ] as const).filter(([, items]) => items.length > 0),
  );
  // Only the categories the character has something in.
  const profRows = $derived(
    ([
      [t.senses.armor, lists.armor],
      [t.senses.weapons, lists.weapons],
      [t.senses.tools, lists.tools],
      [t.senses.languages, lists.languages],
    ] as const).filter(([, items]) => items.length > 0),
  );
</script>

<div class="column">
  <div class="split">
    <div class="stack">
      <ul class="abilities" aria-label={t.abilitiesLabel}>
        {#each ABILITIES as ability (ability)}
          {@const score = scores?.[ability] ?? null}
          <li class="ability">
            <span class="ability-name">
              <span class="full">{ABILITY_NAMES[ability]}</span>
              <span class="score">{score === null ? t.unknown : signed.format(modifier(score))}</span>
            </span>
            <span class="mod">{score === null ? t.unknown : plain.format(score)}</span>
          </li>
        {/each}
      </ul>

      <section class="box" aria-labelledby="sheet-saves">
        <h2 id="sheet-saves" class="label">{t.saves}</h2>
        <ul class="saves">
          {#each ABILITIES as ability (ability)}
            <li class="line">
              <span class="dot" class:on={saves.has(ability)} aria-hidden="true"></span>
              <span class="grow">{ability.toUpperCase()}{#if saves.has(ability)}<span class="sr-only"> ({t.proficient})</span>{/if}</span>
              <b>{scores ? signed.format(checkBonus(scores[ability], saves.has(ability), pb)) : t.unknown}</b>
            </li>
          {/each}
        </ul>
        {#if defenseRows.length || defenses.advantageNotes.length}
          <div class="defenses">
            {#each defenses.advantageNotes as text, i (i)}
              <p class="prof">{text}</p>
            {/each}
            {#each defenseRows as [label, items] (label)}
              <p class="prof"><b class="prof-label">{t.senses.label(label)}</b> {list.format(items)}</p>
            {/each}
          </div>
        {/if}
      </section>

      <section class="box" aria-labelledby="sheet-senses">
        <h2 id="sheet-senses" class="label">{t.senses.title}</h2>
        <p class="between"><span>{t.senses.perception}</span><b>{passive("perception", "wis")}</b></p>
        <p class="between"><span>{t.senses.insight}</span><b>{passive("insight", "wis")}</b></p>
        <p class="between"><span>{t.senses.investigation}</span><b>{passive("investigation", "int")}</b></p>
        {#each profRows as [label, items], i (label)}
          <p class="prof" class:first={i === 0}><b class="prof-label">{t.senses.label(label)}</b> {list.format(items)}</p>
        {/each}
      </section>
    </div>

    <section class="box skills" aria-labelledby="sheet-skills">
      <h2 id="sheet-skills" class="label">{t.skills}</h2>
      {#if skillRows.length === 0}
        <p class="muted">{t.unknown}</p>
      {:else}
        <ul>
          {#each skillRows as skill (skill.key)}
            <li class="line skill">
              <span class="dot" class:on={skill.proficient} class:expert={skill.expert} aria-hidden="true"></span>
              <span class="grow skill-name">
                {skill.name}{#if skill.expert}<span class="sr-only"> ({t.expertise})</span>{:else if skill.proficient}<span class="sr-only"> ({t.proficient})</span>{/if}
                {#each EDGES as edge (edge)}
                  {@const e = t.edges[edge]}
                  {@const on = has(edge, skill.key)}
                  {@const off = cancelled(skill.key)}
                  {@const from = sourcesOf(edge, skill.key)}
                  {@const what = from.length ? e.from(skill.name, list.format(from)) : on ? e.byHand(skill.name) : e.toggle(skill.name)}
                  {@const title = off ? `${t.edges.cancel(skill.name)} ${what}` : what}
                  <!-- One that comes from a source is fixed: shown, not a toggle. -->
                  {#if sheet.readOnly || from.length}
                    {#if on}<span class="edge {edge}" class:on={!off} class:cancelled={off} {title}><span aria-hidden="true">{e.short}</span><span class="sr-only">({title})</span></span>{/if}
                  {:else}
                    <button
                      type="button"
                      class="edge {edge}"
                      class:on={on && !off}
                      class:cancelled={off}
                      aria-pressed={on}
                      aria-label={e.toggle(skill.name)}
                      {title}
                      onclick={() => toggle(edge, skill.key)}
                    ><span aria-hidden="true">{e.short}</span></button>
                  {/if}
                {/each}
              </span>
              <span class="muted small">{skill.ability.toUpperCase()}</span>
              <b class="bonus">{skill.bonus === null ? t.unknown : signed.format(skill.bonus)}</b>
            </li>
          {/each}
        </ul>
      {/if}
    </section>
  </div>
</div>

<style>
  .column {
    display: flex;
    flex-direction: column;
    gap: var(--space-5);
  }

  ul {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .abilities {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--space-2);
  }

  .ability {
    min-width: 0;
    min-height: var(--ability-card-height);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
    padding: var(--space-1) var(--space-3);
    border: var(--border-width) solid var(--color-border-strong);
    border-radius: var(--radius-md);
    background: var(--color-surface);
  }

  .ability-name {
    min-width: 0;
    display: flex;
    flex-direction: column;
    font-size: var(--text-xs);
    line-height: var(--leading-tight);
    white-space: nowrap;
  }

  .full {
    overflow: hidden;
    text-overflow: ellipsis;
    font-weight: var(--weight-bold);
  }

  .score {
    color: var(--color-text-muted);
    font-size: var(--text-md);
    font-variant-numeric: tabular-nums;
  }

  .mod {
    font-size: var(--text-xl);
    font-weight: var(--weight-bold);
    font-variant-numeric: tabular-nums;
  }

  /* Abilities, saves and senses take the room; the skills box is a fixed width beside them (below them when narrow). */
  .split {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-5);
    align-items: flex-start;
  }

  .split > .skills {
    flex: none;
    width: min(100%, var(--sheet-skills-width));
  }

  .stack {
    flex: 1 1 calc(10 * var(--space-6));
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-5);
  }

  .box {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    padding: var(--space-3) var(--space-4);
    border: var(--border-width) solid var(--color-border-strong);
    border-radius: var(--radius-lg);
    background: var(--color-surface);
    font-size: var(--text-sm);
  }

  .label {
    margin-bottom: var(--space-1);
    color: var(--color-text-muted);
    font-size: var(--text-xs);
    font-weight: var(--weight-bold);
    letter-spacing: var(--tracking-label);
    text-transform: uppercase;
  }

  .saves {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0 var(--space-4);
  }

  .line {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    min-width: 0;
    padding: var(--space-1) 0;
  }

  .skill {
    padding: var(--space-1);
    border-bottom: var(--border-width) solid var(--color-border);
  }

  .skill:last-child {
    border-bottom: none;
  }

  .grow {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .dot {
    flex: none;
    width: var(--space-2);
    height: var(--space-2);
    border: calc(1.5 * var(--border-width)) solid var(--color-text-muted);
    border-radius: 50%;
  }

  .dot.on {
    border-color: var(--color-text);
    background: var(--color-text);
  }

  .skill-name {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
  }

  /* Advantage: a green dot with a white A; disadvantage a red one with a D. Off, the toggles only show on hover or focus. */
  .edge {
    display: inline-grid;
    place-items: center;
    width: var(--space-4);
    height: var(--space-4);
    padding: 0;
    border: var(--border-width) dashed var(--color-text-muted);
    border-radius: 50%;
    background: transparent;
    color: var(--color-text-muted);
    font-size: var(--text-xs);
    font-weight: var(--weight-bold);
    line-height: 1;
    cursor: pointer;
    opacity: 0;
  }

  .skill:hover .edge,
  .edge:focus-visible,
  .edge.on,
  .edge.cancelled {
    opacity: 1;
  }

  .edge.on {
    border: none;
    color: var(--color-accent-text);
  }

  .advantage.on {
    background: var(--color-success-fill);
  }

  .disadvantage.on {
    background: var(--color-danger-fill);
  }

  /* Both: they cancel out, so each shows only as its colored outline. */
  .advantage.cancelled {
    border: var(--border-width) solid var(--color-success);
    color: var(--color-success);
  }

  .disadvantage.cancelled {
    border: var(--border-width) solid var(--color-danger);
    color: var(--color-danger);
  }

  .edge:focus-visible {
    outline: var(--focus-ring) solid var(--color-focus);
    outline-offset: var(--border-width);
  }

  /* Expertise: the filled dot with a ring around it. */
  .dot.expert {
    box-shadow: 0 0 0 var(--border-width) var(--color-surface), 0 0 0 calc(2.5 * var(--border-width)) var(--color-text);
  }

  b,
  .bonus {
    font-variant-numeric: tabular-nums;
  }

  .bonus {
    min-width: calc(1.5 * var(--space-6));
    text-align: right;
  }

  .between {
    display: flex;
    justify-content: space-between;
    gap: var(--space-2);
  }

  .prof {
    color: var(--color-text-muted);
    font-size: var(--text-sm);
  }

  .prof-label {
    color: var(--color-text);
  }

  /* Below the six saves: save advantages, then resistances, immunities and vulnerabilities. */
  .defenses {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    margin-top: var(--space-2);
    padding-top: var(--space-2);
    border-top: var(--border-width) solid var(--color-border);
  }

  .prof.first {
    padding-top: var(--space-2);
  }

  .muted {
    color: var(--color-text-muted);
  }

  .small {
    font-size: var(--text-xs);
  }

</style>
