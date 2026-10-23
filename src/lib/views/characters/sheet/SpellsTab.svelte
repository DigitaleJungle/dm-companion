<script lang="ts">
  import InfoTip from "$lib/components/InfoTip.svelte";
  import { modifier, proficiencyBonus, type Ability } from "$lib/characters/rules";
  import { progressionAt, spellSources } from "$lib/characters/levelup";
  import { pactSlots, spellSlots } from "$lib/characters/sheet";
  import { ordinal } from "$lib/rules/catalog";
  import { strings } from "$lib/strings";
  import SpellRow from "./SpellRow.svelte";
  import { spellKey, type Sheet } from "./sheet.svelte";

  // Spellcasting numbers, concentration, spell slots, and the spells the character has (picked when leveling up), by level.
  let { sheet }: { sheet: Sheet } = $props();

  const t = strings.characters.sheet.spells;
  const tl = strings.characters.levelUpDialog;
  const ta = strings.characters.sheet.actions;
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
  // The features' texts too: one may cast a spell without a slot (Paladin's Smite), which Cast then offers.
  $effect(() => sheet.features.load());
  const details = $derived(sheet.spellDetails);
  const detailsError = $derived(sheet.spellDetailsError);
  const rowOf = (s: { name: string; source: string }) => sheet.spellDetail(s);
  const levelOf = (s: NonNullable<typeof c.spells>[number]) => (typeof s.level === "number" ? s.level : Number(rowOf(s)?.data.level ?? -1));
  const sources = $derived(spellSources(c, (cls, level) => tl.classLevel(cls, plain.format(level))));

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
      onclick={() =>
        sheet.change((x) => {
          x.concentrating = !x.concentrating;
          // Ending concentration ends it on the spell too (its row stops glowing).
          if (!x.concentrating) delete x.concentratingOn;
        })}
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
    <!-- The same table as the Actions tab's spells (SpellRow), one row group per spell level; here with every spell,
         the (!) for one had from two places, and ✕ for one added outside Level up. -->
    <!-- No sideways scrolling here: it would clip a Cast button's slot menu. -->
    <table class="sheet-table compact">
        <thead>
          <tr>
            <th scope="col">{ta.name}</th>
            <th scope="col">{ta.time}</th>
            <th scope="col">{ta.range}</th>
            <th scope="col">{ta.hit}</th>
            <th scope="col">{ta.damage}</th>
            <th scope="col">{ta.notes}</th>
            <th scope="col"><span class="sr-only">{t.col.remove}</span></th>
          </tr>
        </thead>
        {#each byLevel as [level, spells] (level)}
          <tbody>
            <tr><th scope="colgroup" colspan="7" class="group-name">{groupName(level)}</th></tr>
            {#each spells as s, i (spellKey(s))}
              {@const from = sources.get(spellKey(s)) ?? []}
              <SpellRow {sheet} spell={s}>
                {#snippet after()}
                  {#if from.length > 1}
                    <InfoTip id="spell-twice-{level}-{i}" label={tl.preparedTwiceOf(s.name)} text={tl.preparedTwice(from.join(", "))} icon="alert" />
                  {/if}
                {/snippet}
                {#snippet end()}
                  <td>
                    <!-- Spells from levels are changed under Edit → Levels; a removal here would come back with the next level. -->
                    {#if !s.always && s.gained === undefined}
                      <button class="remove" aria-label={t.remove(s.name)} title={t.remove(s.name)} disabled={sheet.readOnly} onclick={() => removeSpell(s.name, s.source)}>
                        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10M17 7L7 17" stroke="currentColor" stroke-width="2" stroke-linecap="round" /></svg>
                      </button>
                    {/if}
                  </td>
                {/snippet}
              </SpellRow>
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
