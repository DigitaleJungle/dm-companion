<script lang="ts">
  import InfoTip from "$lib/components/InfoTip.svelte";
  import { modifier, proficiencyBonus, type Ability } from "$lib/characters/rules";
  import { progressionAt, spellSources } from "$lib/characters/levelup";
  import { pactSlots, spellRow, spellSlots, type SpellRow } from "$lib/characters/sheet";
  import { capital, castingTime, components, spellRange } from "$lib/rules/format";
  import { openPreview } from "$lib/rules/preview.svelte";
  import { ordinal } from "$lib/rules/catalog";
  import { strings } from "$lib/strings";
  import { spellKey, type Sheet } from "./sheet.svelte";

  // Spellcasting numbers, concentration, spell slots, and the spells the character has (picked when leveling up), by level.
  let { sheet }: { sheet: Sheet } = $props();

  const t = strings.characters.sheet.spells;
  const tl = strings.characters.levelUpDialog;
  const plain = new Intl.NumberFormat();
  const signed = new Intl.NumberFormat(undefined, { signDisplay: "always" });

  const c = $derived(sheet.character!);
  const ability = $derived((typeof sheet.cls?.spellcastingAbility === "string" ? sheet.cls.spellcastingAbility : null) as Ability | null);
  const mod = $derived(ability && sheet.scores ? modifier(sheet.scores[ability]) : null);
  const pb = $derived(proficiencyBonus(sheet.level));
  const slots = $derived(spellSlots(sheet.cls, sheet.level));
  const pact = $derived(pactSlots(sheet.cls, sheet.level));
  const used = $derived(c.slotsUsed ?? []);

  // The table's details (and the level of spells saved without it, fixed spells from a feat) come from the rules data, loaded once.
  $effect(() => {
    if ((c.spells ?? []).length) sheet.loadSpellDetails();
  });
  const details = $derived(sheet.spellDetails);
  const detailsError = $derived(sheet.spellDetailsError);
  const rowOf = (s: { name: string; source: string }) => sheet.spellDetail(s);
  const levelOf = (s: NonNullable<typeof c.spells>[number]) => (typeof s.level === "number" ? s.level : Number(rowOf(s)?.data.level ?? -1));
  const sources = $derived(spellSources(c, (cls, level) => tl.classLevel(cls, plain.format(level))));

  const effectOf = (row: SpellRow) => (row.effects.length ? row.effects.map(capital).join(", ") : row.healing ? t.healing : t.none);
  const componentsOf = (row: SpellRow) => [row.v && "V", row.s && "S", row.m && "M"].filter(Boolean).join(", ");
  const byLevel = $derived.by(() => {
    const groups = new Map<number, NonNullable<typeof c.spells>>();
    // Species spells that come at a later character level (Drow: Faerie Fire at 3) show from that level on.
    for (const s of [...(c.spells ?? [])].filter((x) => (x.atLevel ?? 1) <= sheet.level).sort((a, b) => a.name.localeCompare(b.name))) {
      const l = levelOf(s);
      groups.set(l, [...(groups.get(l) ?? []), s]);
    }
    return [...groups.entries()].sort((a, b) => (a[0] < 0 ? 99 : a[0]) - (b[0] < 0 ? 99 : b[0]));
  });
  const preparedLimit = $derived(progressionAt(sheet.cls?.preparedSpellsProgression, sheet.level));
  // Every listed spell is prepared or known; this counts the leveled class spells against the class table.
  const prepared = $derived((c.spells ?? []).filter((s) => !s.always && levelOf(s) > 0 && s.origin === c.classes[0]?.name).length);
  const groupName = (l: number) => (l === 0 ? t.cantrips : l < 0 ? t.otherSpells : t.levelGroup(ordinal(l)));

  function removeSpell(name: string, source: string) {
    sheet.change((x) => (x.spells = (x.spells ?? []).filter((s) => spellKey(s) !== spellKey({ name, source }))));
  }

  // Ticking box n means n boxes are used; unticking it leaves the ones before it.
  const boxCount = (current: number, n: number, on: boolean) => (on ? Math.max(current, n) : n - 1);

  function setSlot(level: number, n: number, on: boolean) {
    sheet.change((x) => {
      const next = [...(x.slotsUsed ?? [])];
      while (next.length < level) next.push(0);
      next[level - 1] = boxCount(next[level - 1] ?? 0, n, on);
      x.slotsUsed = next;
    });
  }
</script>

<div class="spells">
  <div class="numbers">
    {#if ability}
      <span>{t.ability}: <b>{ability.toUpperCase()}</b></span>
      <span>{t.saveDc}: <b>{mod === null ? strings.characters.sheet.unknown : plain.format(8 + mod + pb)}</b></span>
      <span>{t.attack}: <b>{mod === null ? strings.characters.sheet.unknown : signed.format(mod + pb)}</b></span>
    {/if}
    <button
      class="concentrating"
      aria-pressed={!!c.concentrating}
      disabled={sheet.readOnly}
      onclick={() => sheet.change((x) => (x.concentrating = !x.concentrating))}
    >
      {t.concentrating}
    </button>
  </div>

  {#if slots.some((n) => n > 0) || pact}
    <div class="slots" role="group" aria-label={t.slots}>
      {#each slots as count, i (i)}
        {#if count > 0}
          {@const level = ordinal(i + 1)}
          <div class="slot-level">
            <span class="slot-name">{t.slotRow(level)}</span>
            {#each Array.from({ length: count }, (_, j) => j + 1) as n (n)}
              <input
                type="checkbox"
                class="box"
                aria-label={t.slotBox(level, n)}
                checked={(used[i] ?? 0) >= n}
                disabled={sheet.readOnly}
                onchange={(e) => setSlot(i + 1, n, e.currentTarget.checked)}
              />
            {/each}
          </div>
        {/if}
      {/each}
      {#if pact}
        <div class="slot-level">
          <span class="slot-name">{t.pactSlots(ordinal(pact.level))}</span>
          {#each Array.from({ length: pact.count }, (_, j) => j + 1) as n (n)}
            <input
              type="checkbox"
              class="box"
              aria-label={t.pactBox(n)}
              checked={(c.pactSlotsUsed ?? 0) >= n}
              disabled={sheet.readOnly}
              onchange={(e) => {
                const on = e.currentTarget.checked;
                sheet.change((x) => (x.pactSlotsUsed = boxCount(x.pactSlotsUsed ?? 0, n, on)));
              }}
            />
          {/each}
        </div>
      {/if}
    </div>
  {:else}
    <p class="muted">{t.noSlots}</p>
  {/if}

  {#if (c.spells ?? []).length === 0}
    <p class="muted">{t.noSpells}</p>
  {:else}
    {#if preparedLimit > 0}<p class="muted">{t.preparedCount(plain.format(prepared), plain.format(preparedLimit))}</p>{/if}
    {#if detailsError}<p class="error" role="alert">{t.detailsError(detailsError)}</p>{:else if !details}<p class="muted" role="status">{t.loadingDetails}</p>{/if}
    {#snippet abbr(short: string, long: string)}<span title={long}><span aria-hidden="true">{short}</span><span class="sr-only">{long}</span></span>{/snippet}
    <!-- One table, a row group per spell level, so the columns line up across levels. The data columns are a fixed width ("…" beyond), the name takes the rest. -->
    <table class="spell-table">
        <thead>
          <tr>
            <th scope="col">{t.col.name}</th>
            <th scope="col">{t.col.time}</th>
            <th scope="col">{t.col.range}</th>
            <th scope="col">{t.col.hit}</th>
            <th scope="col">{t.col.effect}</th>
            <th scope="col"><span title={t.col.componentsLong}>{t.col.components}</span></th>
            <th scope="col"><span class="sr-only">{t.col.remove}</span></th>
          </tr>
        </thead>
        {#each byLevel as [level, spells] (level)}
            <tbody>
              <tr class="group-row">
                <th scope="colgroup" colspan="7" class="group-name">{groupName(level)}</th>
              </tr>
              {#each spells as s, i (spellKey(s))}
                {@const data = rowOf(s)?.data ?? null}
                {@const row = data ? spellRow(data) : null}
                {@const from = sources.get(spellKey(s)) ?? []}
                <tr>
                  <th scope="row">
                    <span class="name-cell">
                      <button class="entry-link" onclick={(e) => openPreview({ kind: "spell", name: s.name, source: s.source }, e.currentTarget)}>{s.name}</button>
                      {#if row?.concentration}<span class="badge">{@render abbr(t.col.concentration.short, t.col.concentration.long)}</span>{/if}
                      {#if row?.ritual}<span class="badge">{@render abbr(t.col.ritual.short, t.col.ritual.long)}</span>{/if}
                      {#if from.length > 1}
                        <InfoTip id="spell-twice-{level}-{i}" label={tl.preparedTwiceOf(s.name)} text={tl.preparedTwice(from.join(", "))} alert />
                      {/if}
                    </span>
                  </th>
                  {#if data && row}
                    <td>
                      {#if tl.cast[row.unit as keyof typeof tl.cast]}
                        {@const cast = tl.cast[row.unit as keyof typeof tl.cast]}
                        <span class="cut">{@render abbr(cast.short, cast.long)}</span>
                      {:else}<span class="cut" title={castingTime(data)}>{castingTime(data)}</span>{/if}
                    </td>
                    <td><span class="cut" title={spellRange(data)}>{spellRange(data)}</span></td>
                    <td><span class="cut" title={sheet.spellHitOrDc(s, row)}>{sheet.spellHitOrDc(s, row)}</span></td>
                    <td><span class="cut" title={effectOf(row)}>{effectOf(row)}</span></td>
                    <td><span class="cut" title={components(data)}>{componentsOf(row)}</span></td>
                  {:else}
                    <td colspan="5" class="muted">{t.none}</td>
                  {/if}
                  <td>
                    <!-- Spells from levels are changed under Edit → Levels; a removal here would come back with the next level. -->
                    {#if !s.always && s.gained === undefined}
                      <button class="remove" aria-label={t.remove(s.name)} title={t.remove(s.name)} disabled={sheet.readOnly} onclick={() => removeSpell(s.name, s.source)}>
                        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10M17 7L7 17" stroke="currentColor" stroke-width="2" stroke-linecap="round" /></svg>
                      </button>
                    {/if}
                  </td>
                </tr>
              {/each}
            </tbody>
        {/each}
    </table>
  {/if}
</div>

<style>
  .spells {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    color: var(--color-text-muted);
    font-size: var(--text-sm);
  }

  .numbers {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-3) var(--space-5);
  }

  b {
    color: var(--color-text);
  }

  .concentrating {
    margin-left: auto;
    min-height: var(--control-height);
    padding: 0 var(--space-4);
    border: var(--border-width) solid var(--color-border-strong);
    border-radius: var(--radius-pill);
    background: var(--color-surface);
    color: var(--color-text);
    font-weight: var(--weight-semibold);
    cursor: pointer;
    transition:
      background 0.3s ease,
      color 0.3s ease;
  }

  .concentrating[aria-pressed="true"] {
    border-color: var(--color-concentration);
    background: var(--color-concentration);
    color: var(--color-concentration-text);
  }

  .concentrating:disabled {
    cursor: default;
  }

  .slots {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-4);
  }

  .slot-level {
    display: flex;
    align-items: center;
    gap: var(--space-1);
  }

  .slot-name {
    margin-right: var(--space-1);
  }

  .box {
    appearance: none;
    width: var(--space-4);
    height: var(--space-4);
    margin: 0;
    border: calc(1.5 * var(--border-width)) solid var(--color-text-muted);
    border-radius: var(--radius-sm);
    background: var(--color-surface);
    cursor: pointer;
  }

  .box:checked {
    background: var(--color-text-muted);
  }

  .box:focus-visible {
    outline: var(--focus-ring) solid var(--color-focus);
    outline-offset: var(--border-width);
  }

  .box:disabled {
    cursor: default;
  }

  .muted {
    color: var(--color-text-muted);
  }

  .spell-table .group-name {
    padding-top: var(--space-4);
    color: var(--color-text-muted);
    font-size: var(--text-xs);
    font-weight: var(--weight-bold);
    letter-spacing: var(--tracking-label);
    text-transform: uppercase;
  }

  .spell-table {
    width: 100%;
    border-collapse: collapse;
    color: var(--color-text);
  }

  .spell-table th,
  .spell-table td {
    padding: var(--space-1) var(--space-2);
    border-bottom: var(--border-width) solid var(--color-border);
    text-align: left;
    vertical-align: middle;
    white-space: nowrap;
  }

  /* The name column takes all the room the data columns leave. */
  .spell-table th:first-child {
    width: 100%;
  }

  /* Only when the block is too narrow does a name wrap; it's never cut off. */
  .spell-table tbody th:first-child {
    white-space: normal;
  }

  /* Every data column is the same fixed width; longer text ends in "…" (the full text is its tooltip). */
  .cut {
    display: block;
    /* The column is the token's width with the cell's padding included. */
    width: calc(var(--spell-data-width) - 2 * var(--space-2));
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .spell-table thead th {
    color: var(--color-text-muted);
    font-size: var(--text-xs);
    font-weight: var(--weight-semibold);
  }

  .spell-table tbody th {
    font-weight: var(--weight-regular);
  }

  .spell-table th:first-child,
  .spell-table td:first-child {
    padding-left: 0;
  }

  .name-cell {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
  }

  /* C and R: a solid square after the name. */
  .badge {
    display: inline-grid;
    place-items: center;
    min-width: var(--space-4);
    height: var(--space-4);
    padding: 0 var(--space-1);
    border-radius: var(--radius-sm);
    background: var(--color-text);
    color: var(--color-surface);
    font-size: var(--text-xs);
    font-weight: var(--weight-bold);
    line-height: 1;
  }

  .error {
    color: var(--color-danger);
  }

  .remove {
    display: inline-grid;
    place-items: center;
    width: var(--control-height-sm);
    height: var(--control-height-sm);
    margin-left: auto;
    padding: 0;
    border: none;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--color-text-muted);
    cursor: pointer;
  }

  .remove:hover:not(:disabled) {
    background: var(--color-surface-sunken);
    color: var(--color-danger);
  }

  .remove svg {
    width: var(--space-4);
    height: var(--space-4);
  }

  :global([data-motion="reduce"]) .concentrating {
    transition: none;
  }
</style>
