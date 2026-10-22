<script lang="ts">
  import { modifier, proficiencyBonus, type Ability } from "$lib/characters/rules";
  import { pactSlots, spellSlots } from "$lib/characters/sheet";
  import { ordinal } from "$lib/rules/catalog";
  import { strings } from "$lib/strings";
  import type { Sheet } from "./sheet.svelte";

  // Spellcasting numbers, concentration and spell slots. Choosing spells comes later.
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

  <p class="muted">{t.listLater}</p>
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

  :global([data-motion="reduce"]) .concentrating {
    transition: none;
  }
</style>
