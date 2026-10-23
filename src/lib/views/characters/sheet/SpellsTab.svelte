<script lang="ts">
  import { modifier, proficiencyBonus, type Ability } from "$lib/characters/rules";
  import { findEntity } from "$lib/api/rules";
  import { progressionAt } from "$lib/characters/levelup";
  import { pactSlots, spellSlots } from "$lib/characters/sheet";
  import { openPreview } from "$lib/rules/preview.svelte";
  import { ordinal } from "$lib/rules/catalog";
  import { strings } from "$lib/strings";
  import type { Sheet } from "./sheet.svelte";

  // Spellcasting numbers, concentration, spell slots, and the spells the character has (picked when leveling up), by level.
  let { sheet }: { sheet: Sheet } = $props();

  const t = strings.characters.sheet.spells;
  const plain = new Intl.NumberFormat();
  const signed = new Intl.NumberFormat(undefined, { signDisplay: "always" });

  const c = $derived(sheet.character!);
  const ability = $derived((typeof sheet.cls?.spellcastingAbility === "string" ? sheet.cls.spellcastingAbility : null) as Ability | null);
  const mod = $derived(ability && sheet.scores ? modifier(sheet.scores[ability]) : null);
  const pb = $derived(proficiencyBonus(sheet.level));
  const slots = $derived(spellSlots(sheet.cls, sheet.level));
  const pact = $derived(pactSlots(sheet.cls, sheet.level));
  const used = $derived(c.slotsUsed ?? []);

  // Spells saved without their level (fixed spells from a feat) get it from the rules data.
  let levels = $state<Record<string, number>>({});
  const spellKey = (s: { name: string; source: string }) => `${s.name}|${s.source}`.toLowerCase();
  $effect(() => {
    for (const s of c.spells ?? []) {
      const k = spellKey(s);
      if (typeof s.level === "number" || k in levels) continue;
      levels[k] = -1;
      findEntity("spell", s.name, s.source).then((e) => (levels[k] = Number(e?.data.level ?? -1))).catch(() => {});
    }
  });
  const levelOf = (s: NonNullable<typeof c.spells>[number]) => (typeof s.level === "number" ? s.level : (levels[spellKey(s)] ?? -1));
  const byLevel = $derived.by(() => {
    const groups = new Map<number, NonNullable<typeof c.spells>>();
    for (const s of [...(c.spells ?? [])].sort((a, b) => a.name.localeCompare(b.name))) {
      const l = levelOf(s);
      groups.set(l, [...(groups.get(l) ?? []), s]);
    }
    return [...groups.entries()].sort((a, b) => (a[0] < 0 ? 99 : a[0]) - (b[0] < 0 ? 99 : b[0]));
  });
  const preparedLimit = $derived(progressionAt(sheet.cls?.preparedSpellsProgression, sheet.level));
  const prepared = $derived((c.spells ?? []).filter((s) => s.prepared && !s.always && levelOf(s) !== 0 && s.origin === c.classes[0]?.name).length);
  const groupName = (l: number) => (l === 0 ? t.cantrips : l < 0 ? t.otherSpells : t.levelGroup(ordinal(l)));

  function setPrepared(name: string, source: string, on: boolean) {
    sheet.change((x) => {
      const spell = x.spells?.find((s) => spellKey(s) === spellKey({ name, source }));
      if (spell) spell.prepared = on;
    });
  }

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
    {#each byLevel as [level, spells] (level)}
      <section class="spell-group" aria-labelledby="spells-{level}">
        <h3 id="spells-{level}" class="group-name">{groupName(level)}</h3>
        <ul class="spell-list">
          {#each spells as s (spellKey(s))}
            <li class="spell">
              {#if level > 0 && !s.always && s.origin === c.classes[0]?.name}
                <input
                  type="checkbox"
                  class="box"
                  aria-label={t.preparedOf(s.name)}
                  checked={!!s.prepared}
                  disabled={sheet.readOnly}
                  onchange={(e) => setPrepared(s.name, s.source, e.currentTarget.checked)}
                />
              {/if}
              <button class="spell-name" onclick={(e) => openPreview({ kind: "spell", name: s.name, source: s.source }, e.currentTarget)}>{s.name}</button>
              <span class="origin">{s.origin}</span>
              {#if s.always}<span class="tag">{t.always}</span>{/if}
              {#if !s.always}
                <button class="remove" aria-label={t.remove(s.name)} title={t.remove(s.name)} disabled={sheet.readOnly} onclick={() => removeSpell(s.name, s.source)}>
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10M17 7L7 17" stroke="currentColor" stroke-width="2" stroke-linecap="round" /></svg>
                </button>
              {/if}
            </li>
          {/each}
        </ul>
      </section>
    {/each}
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

  .group-name {
    margin-bottom: var(--space-1);
    font-size: var(--text-xs);
    font-weight: var(--weight-bold);
    letter-spacing: var(--tracking-label);
    text-transform: uppercase;
  }

  .spell-list {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .spell {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-1) 0;
    border-bottom: var(--border-width) solid var(--color-border);
  }

  .spell-name {
    padding: 0;
    border: none;
    background: none;
    color: var(--color-text);
    font-weight: var(--weight-semibold);
    text-align: left;
    cursor: pointer;
  }

  .spell-name:hover {
    color: var(--color-link);
  }

  .origin {
    color: var(--color-text-muted);
    font-size: var(--text-xs);
  }

  .tag {
    padding: 0 var(--space-2);
    border-radius: var(--radius-pill);
    background: var(--color-accent-soft);
    color: var(--color-link);
    font-size: var(--text-xs);
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
