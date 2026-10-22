<script lang="ts">
  import { rollDice } from "$lib/api/dice";
  import { errorMessage } from "$lib/api/storage";
  import { ordinal } from "$lib/rules/catalog";
  import {
    DEATH_SAVES,
    deathStatus,
    hitDieFaces,
    hitDieRoll,
    longRest,
    pactSlots,
    setTemp,
    shortRest,
    spellSlots,
    takeDamage,
    takeHealing,
    type Resources,
    type Vitals,
  } from "$lib/characters/sheet";
  import { strings } from "$lib/strings";
  import type { Sheet } from "./sheet.svelte";

  // Everything that changes during a session: hit points, death saves, hit dice, slots, conditions and rests.
  let { sheet }: { sheet: Sheet } = $props();

  const t = strings.characters.sheet.play;
  const plain = new Intl.NumberFormat();
  const SAVE_KINDS = [
    ["successes", t.successes],
    ["failures", t.failures],
  ] as const;

  let amount = $state("");
  let note = $state<string | null>(null);
  let rolling = $state(false);

  const vitals = $derived(sheet.vitals);
  const resources = $derived(sheet.resources);
  const status = $derived(vitals.hp.current === 0 ? deathStatus(vitals.deathSaves) : null);
  const faces = $derived(hitDieFaces(sheet.cls));
  const hitDiceLeft = $derived(Math.max(0, sheet.level - resources.hitDiceSpent));
  const slots = $derived(spellSlots(sheet.cls, sheet.level));
  const pact = $derived(pactSlots(sheet.cls, sheet.level));
  const active = $derived(new Set((sheet.character?.conditions ?? []).map((c) => c.name.toLowerCase())));

  function setVitals(v: Vitals) {
    sheet.change((c) => {
      c.hp = { max: v.hp.max, current: v.hp.current, temp: v.hp.temp };
      c.deathSaves = v.deathSaves;
    });
  }

  function setResources(r: Resources) {
    sheet.change((c) => {
      c.hitDiceSpent = r.hitDiceSpent;
      c.slotsUsed = r.slotsUsed;
      c.pactSlotsUsed = r.pactSlotsUsed;
    });
  }

  /** The typed amount as a whole number, or null when it isn't one. */
  const typed = () => (/^\d+$/.test(amount.trim()) ? Number(amount.trim()) : null);

  function apply(kind: "damage" | "heal" | "temp") {
    const n = typed();
    if (n === null) return;
    note = null;
    if (kind === "damage") setVitals(takeDamage(vitals, n));
    else if (kind === "heal") setVitals(takeHealing(vitals, n));
    else setVitals({ ...vitals, hp: setTemp(vitals.hp, n) });
    amount = "";
  }

  // Ticking box n means n boxes are marked; unticking it leaves the ones before it.
  const boxCount = (current: number, n: number, on: boolean) => (on ? Math.max(current, n) : n - 1);

  function setDeathSave(kind: "successes" | "failures", n: number, on: boolean) {
    setVitals({ ...vitals, deathSaves: { ...vitals.deathSaves, [kind]: boxCount(vitals.deathSaves[kind], n, on) } });
  }

  function setSlot(level: number, n: number, on: boolean) {
    const used = [...resources.slotsUsed];
    while (used.length < level) used.push(0);
    used[level - 1] = boxCount(used[level - 1] ?? 0, n, on);
    setResources({ ...resources, slotsUsed: used });
  }

  async function spendHitDie() {
    const con = sheet.scores?.con ?? 10;
    const notation = hitDieRoll(faces, con);
    rolling = true;
    note = null;
    try {
      const roll = await rollDice(notation);
      const healed = Math.max(0, roll.total);
      setVitals(takeHealing(vitals, healed));
      setResources({ ...resources, hitDiceSpent: resources.hitDiceSpent + 1 });
      note = t.spentHitDie(notation, plain.format(healed));
    } catch (e) {
      note = t.rollError(errorMessage(e));
    } finally {
      rolling = false;
    }
  }

  function rest(kind: "short" | "long") {
    if (kind === "short") setResources(shortRest(resources));
    else {
      const rested = longRest(vitals, resources, sheet.level);
      setVitals(rested.vitals);
      setResources(rested.resources);
    }
    note = t.rested[kind];
  }

  function toggleCondition(name: string, source: string, on: boolean) {
    sheet.change((c) => {
      const rest = (c.conditions ?? []).filter((x) => x.name.toLowerCase() !== name.toLowerCase());
      c.conditions = on ? [...rest, { name, source }] : rest;
    });
  }
</script>

<section class="panel" aria-labelledby="play-title">
  <h2 id="play-title" class="title">{t.title}</h2>

  <div class="block">
    <h3 class="label">{t.hp}</h3>
    <p class="hp" aria-label={t.hpLabel(plain.format(vitals.hp.current), plain.format(vitals.hp.max))}>
      <span class="current">{plain.format(vitals.hp.current)}</span>
      <span class="max">/ {plain.format(vitals.hp.max)}</span>
      {#if vitals.hp.temp > 0}<span class="temp">{t.temp(plain.format(vitals.hp.temp))}</span>{/if}
    </p>
    <form class="amount" onsubmit={(e) => (e.preventDefault(), apply("damage"))}>
      <label for="hp-amount" class="sr-only">{t.amountLabel}</label>
      <input id="hp-amount" type="text" inputmode="numeric" pattern="[0-9]*" bind:value={amount} disabled={sheet.readOnly} autocomplete="off" />
      <button type="submit" class="btn small" disabled={sheet.readOnly || typed() === null}>{t.damage}</button>
      <button type="button" class="btn small" disabled={sheet.readOnly || typed() === null} onclick={() => apply("heal")}>{t.heal}</button>
      <button type="button" class="btn small" disabled={sheet.readOnly || typed() === null} onclick={() => apply("temp")}>{t.setTemp}</button>
    </form>
  </div>

  {#if status}
    <fieldset class="block">
      <legend class="label">{t.deathSaves} <span class="status {status}">{t.statuses[status]}</span></legend>
      {#each SAVE_KINDS as [kind, label] (kind)}
        <div class="boxes">
          <span class="box-label">{label}</span>
          {#each Array.from({ length: DEATH_SAVES }, (_, i) => i + 1) as n (n)}
            <input
              type="checkbox"
              class="box {kind}"
              aria-label={t.saveBox(label, n)}
              checked={vitals.deathSaves[kind] >= n}
              disabled={sheet.readOnly}
              onchange={(e) => setDeathSave(kind, n, e.currentTarget.checked)}
            />
          {/each}
        </div>
      {/each}
    </fieldset>
  {/if}

  {#if faces > 0}
    <div class="block">
      <h3 class="label">{t.hitDice}</h3>
      <div class="row">
        <span>{t.hitDiceLeft(plain.format(hitDiceLeft), plain.format(sheet.level), plain.format(faces))}</span>
        <button class="btn small" disabled={sheet.readOnly || rolling || hitDiceLeft === 0 || vitals.hp.current >= vitals.hp.max} onclick={spendHitDie}>{t.spendHitDie}</button>
      </div>
    </div>
  {/if}

  {#if slots.length || pact}
    <div class="block">
      <h3 class="label">{t.spellSlots}</h3>
      {#each slots as count, i (i)}
        {#if count > 0}
          {@const level = ordinal(i + 1)}
          <div class="boxes">
            <span class="box-label">{t.slotRow(level)}</span>
            {#each Array.from({ length: count }, (_, j) => j + 1) as n (n)}
              <input
                type="checkbox"
                class="box"
                aria-label={t.slotBox(level, n)}
                checked={(resources.slotsUsed[i] ?? 0) >= n}
                disabled={sheet.readOnly}
                onchange={(e) => setSlot(i + 1, n, e.currentTarget.checked)}
              />
            {/each}
          </div>
        {/if}
      {/each}
      {#if pact}
        <div class="boxes">
          <span class="box-label">{t.pactSlots(ordinal(pact.level))}</span>
          {#each Array.from({ length: pact.count }, (_, j) => j + 1) as n (n)}
            <input
              type="checkbox"
              class="box"
              aria-label={t.pactBox(n)}
              checked={resources.pactSlotsUsed >= n}
              disabled={sheet.readOnly}
              onchange={(e) => setResources({ ...resources, pactSlotsUsed: boxCount(resources.pactSlotsUsed, n, e.currentTarget.checked) })}
            />
          {/each}
        </div>
      {/if}
    </div>
  {/if}

  <fieldset class="block">
    <legend class="label">{t.conditions}</legend>
    {#if sheet.conditions.length === 0}
      <p class="muted small">{t.noConditions}</p>
    {:else}
      <div class="chips">
        {#each sheet.conditions as condition (condition.id)}
          <label class="chip">
            <input
              type="checkbox"
              checked={active.has(condition.name.toLowerCase())}
              disabled={sheet.readOnly}
              onchange={(e) => toggleCondition(condition.name, condition.source, e.currentTarget.checked)}
            />
            {condition.name}
          </label>
        {/each}
      </div>
    {/if}
  </fieldset>

  <div class="block">
    <h3 class="label">{t.rest}</h3>
    <div class="row">
      <button class="btn small" disabled={sheet.readOnly} onclick={() => rest("short")}>{t.shortRest}</button>
      <button class="btn small" disabled={sheet.readOnly} onclick={() => rest("long")}>{t.longRest}</button>
    </div>
  </div>

  <p class="note" role="status">{note ?? ""}</p>
</section>

<style>
  .panel {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    padding: var(--space-4);
    border: var(--border-width) solid var(--color-border);
    border-radius: var(--radius-lg);
    background: var(--color-surface);
  }

  .title {
    font-size: var(--text-lg);
    font-weight: var(--weight-bold);
  }

  .block {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    margin: 0;
    padding: 0;
    border: none;
  }

  .label {
    color: var(--color-text-muted);
    font-size: var(--text-xs);
    font-weight: var(--weight-semibold);
    letter-spacing: var(--tracking-label);
    text-transform: uppercase;
  }

  legend.label {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    margin-bottom: var(--space-2);
    padding: 0;
  }

  .hp {
    display: flex;
    align-items: baseline;
    gap: var(--space-2);
    font-variant-numeric: tabular-nums;
  }

  .current {
    font-size: var(--text-2xl);
    font-weight: var(--weight-bold);
    line-height: var(--leading-tight);
  }

  .max {
    color: var(--color-text-muted);
  }

  .temp {
    padding: 0 var(--space-2);
    border-radius: var(--radius-sm);
    background: var(--color-accent-soft);
    color: var(--color-link);
    font-size: var(--text-sm);
    font-weight: var(--weight-semibold);
  }

  .amount {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }

  .amount input {
    width: calc(4 * var(--space-6));
    min-height: var(--control-height-sm);
    padding: 0 var(--space-2);
    border: var(--border-width) solid var(--color-border-strong);
    border-radius: var(--radius-sm);
    background: var(--color-surface);
    font-variant-numeric: tabular-nums;
  }

  .row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2) var(--space-3);
    font-size: var(--text-sm);
  }

  .boxes {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2);
    font-size: var(--text-sm);
  }

  .box-label {
    min-width: calc(4 * var(--space-6));
  }

  .box {
    width: var(--space-5);
    height: var(--space-5);
    margin: 0;
    accent-color: var(--color-accent);
    cursor: pointer;
  }

  .box.failures {
    accent-color: var(--color-danger);
  }

  .box:disabled {
    cursor: default;
  }

  .status {
    padding: 0 var(--space-2);
    border-radius: var(--radius-sm);
    background: var(--color-surface-sunken);
    color: var(--color-text);
    letter-spacing: normal;
    text-transform: none;
  }

  .status.dead {
    background: var(--color-danger-soft);
    color: var(--color-danger);
  }

  .status.stable {
    color: var(--color-success);
  }

  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }

  .chip {
    position: relative;
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    min-height: var(--control-height-sm);
    padding: 0 var(--space-3);
    border: var(--border-width) solid var(--color-border-strong);
    border-radius: var(--radius-pill);
    font-size: var(--text-sm);
    cursor: pointer;
    user-select: none;
  }

  .chip:has(input:checked) {
    border-color: var(--color-link);
    background: var(--color-accent-soft);
    color: var(--color-link);
    font-weight: var(--weight-semibold);
  }

  .chip:has(input:focus-visible) {
    outline: var(--focus-ring) solid var(--color-focus);
    outline-offset: var(--border-width);
  }

  /* The chip itself shows the state; the checkbox stays for keyboard and screen readers. */
  .chip input {
    position: absolute;
    opacity: 0;
    pointer-events: none;
  }

  .chip:has(input:disabled) {
    cursor: default;
  }

  .muted {
    color: var(--color-text-muted);
  }

  .small {
    font-size: var(--text-sm);
  }

  .note {
    color: var(--color-text-muted);
    font-size: var(--text-sm);
  }

  .note:empty {
    display: none;
  }
</style>
