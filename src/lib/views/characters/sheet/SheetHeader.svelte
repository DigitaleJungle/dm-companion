<script lang="ts">
  import { tick } from "svelte";
  import Menu from "$lib/components/Menu.svelte";
  import { modifier, proficiencyBonus, speciesLabel } from "$lib/characters/rules";
  import { DEATH_SAVES, armorClass, deathStatus, setTemp, takeDamage, takeHealing, type Vitals } from "$lib/characters/sheet";
  import { strings } from "$lib/strings";
  import CharacterAvatar from "../CharacterAvatar.svelte";
  import AvatarViewer from "./AvatarViewer.svelte";
  import { avatarCandidates, classLine } from "../format";
  import type { Sheet } from "./sheet.svelte";

  // The card at the top of the sheet: who the character is, conditions, and the numbers needed every turn.
  let { sheet }: { sheet: Sheet } = $props();

  const t = strings.characters.sheet;
  const h = t.header;
  const plain = new Intl.NumberFormat();
  const signed = new Intl.NumberFormat(undefined, { signDisplay: "always" });

  const c = $derived(sheet.character!);
  let viewing = $state(false);
  const scores = $derived(sheet.scores);
  const vitals = $derived(sheet.vitals);
  const status = $derived(vitals.hp.current === 0 ? deathStatus(vitals.deathSaves) : null);
  const species = $derived(c.species ? speciesLabel(c.species.name, c.species.lineage ?? c.species.subspecies?.name) : null);
  const classText = $derived(c.classes.length ? `${classLine(c.classes)} ${plain.format(sheet.level)}` : strings.characters.noClass);
  const subtitle = $derived([species, classText, c.background?.name, c.player ? t.playedBy(c.player) : null].filter(Boolean).join(" · "));

  const speed = $derived.by(() => {
    const raw = sheet.species?.speed;
    const walk = typeof raw === "number" ? raw : (raw as { walk?: number } | undefined)?.walk;
    return typeof walk === "number" ? walk : null;
  });

  // ---- Conditions ----
  const active = $derived(c.conditions ?? []);
  const addable = $derived(sheet.conditions.filter((x) => !active.some((a) => a.name.toLowerCase() === x.name.toLowerCase())));

  function setConditions(next: { name: string; source: string }[]) {
    sheet.change((x) => (x.conditions = next));
  }

  // ---- Armor class: computed from armor and DEX unless set by hand ----
  const override = $derived(c.acOverride ?? null);
  const computedAc = $derived(scores ? armorClass(scores.dex, c.inventory ?? []) : null);
  const ac = $derived(override ?? computedAc);
  let editingAc = $state(false);
  let acInput: HTMLInputElement | undefined = $state();

  async function editAc() {
    editingAc = true;
    await tick();
    acInput?.select();
  }

  function saveAc(value: string) {
    editingAc = false;
    const n = value.trim() === "" ? null : Number(value);
    if (n !== null && (!Number.isInteger(n) || n < 0)) return;
    sheet.change((x) => (x.acOverride = n));
  }

  // ---- Hit points ----
  let amount = $state("");
  const typed = () => (/^\d+$/.test(amount.trim()) ? Number(amount.trim()) : null);
  const hpShare = $derived(vitals.hp.max > 0 ? Math.round((vitals.hp.current / vitals.hp.max) * 100) : 0);

  function setVitals(v: Vitals) {
    sheet.change((x) => {
      x.hp = { max: v.hp.max, current: v.hp.current, temp: v.hp.temp };
      x.deathSaves = v.deathSaves;
    });
  }

  function apply(kind: "damage" | "heal" | "temp") {
    const n = typed();
    if (n === null) return;
    if (kind === "damage") setVitals(takeDamage(vitals, n));
    else if (kind === "heal") setVitals(takeHealing(vitals, n));
    else setVitals({ ...vitals, hp: setTemp(vitals.hp, n) });
    amount = "";
  }

  // Ticking circle n means n are marked; unticking it leaves the ones before it.
  function setDeathSave(kind: "successes" | "failures", n: number, on: boolean) {
    const count = on ? Math.max(vitals.deathSaves[kind], n) : n - 1;
    setVitals({ ...vitals, deathSaves: { ...vitals.deathSaves, [kind]: count } });
  }
</script>

<section class="card" class:concentrating={!!c.concentrating} aria-label={c.name}>
  <button class="avatar" class:inspired={!!c.inspiration} aria-label={t.viewAvatar(c.name)} title={t.viewAvatar(c.name)} onclick={() => (viewing = true)}>
    <CharacterAvatar own={c.avatar} candidates={avatarCandidates(c.classes)} alt={c.name} />
  </button>
  <AvatarViewer bind:open={viewing} campaign={sheet.campaign} id={sheet.id} name={c.name} own={c.avatar ?? null} candidates={avatarCandidates(c.classes)} />

  <div class="who">
    <h1>{c.name}</h1>
    <p class="muted">{subtitle}</p>
    <ul class="conditions" aria-label={h.conditionsLabel}>
      {#each active as condition (condition.name)}
        <li class="chip">
          {condition.name}
          <button
            class="chip-x"
            aria-label={h.removeCondition(condition.name)}
            title={h.removeCondition(condition.name)}
            disabled={sheet.readOnly}
            onclick={() => setConditions(active.filter((a) => a !== condition))}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10M17 7L7 17" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" /></svg>
          </button>
        </li>
      {/each}
      {#if !sheet.readOnly && addable.length}
        <li>
          <Menu
            id="add-condition"
            label={h.addConditionLabel}
            align="start"
            triggerClass="chip add"
            items={addable.map((x) => ({ label: x.name, onselect: () => setConditions([...active, { name: x.name, source: x.source }]) }))}
          >
            {#snippet trigger()}{h.addCondition}{/snippet}
          </Menu>
        </li>
      {/if}
    </ul>
  </div>

  <div class="numbers">
    <div class="side">
      <div class="speed">
        <span class="mini">{h.speed}</span>
        <b>{speed === null ? t.unknown : h.feet(plain.format(speed))}</b>
      </div>
      <button
        class="inspiration"
        aria-pressed={!!c.inspiration}
        disabled={sheet.readOnly}
        onclick={() => sheet.change((x) => (x.inspiration = !x.inspiration))}
      >
        {h.inspiration}
      </button>
    </div>

    <div class="stat shield">
      <span class="stat-label" id="ac-label">
        <svg class="stat-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l7 3v5c0 4.5-3 8.3-7 10-4-1.7-7-5.5-7-10V6z" /></svg>
        <abbr title={h.armorClass} aria-hidden="true">{h.armorClassShort}</abbr><span class="sr-only">{h.armorClass}</span>
      </span>
      {#if editingAc}
        <label for="ac-input" class="sr-only">{h.acOverrideLabel}</label>
        <input
          id="ac-input"
          bind:this={acInput}
          class="ac-input"
          type="text"
          inputmode="numeric"
          value={override ?? ""}
          placeholder={computedAc === null ? "" : String(computedAc)}
          onblur={(e) => saveAc(e.currentTarget.value)}
          onkeydown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            if (e.key === "Escape") editingAc = false;
          }}
        />
      {:else}
        <button class="stat-value as-button" aria-describedby="ac-label" title={h.acEditLabel} disabled={sheet.readOnly} onclick={editAc}>
          {ac === null ? t.unknown : plain.format(ac)}<span class="sr-only">, {h.acEditLabel}</span>
        </button>
      {/if}
    </div>

    <div class="stat">
      <span class="stat-label">
        <svg class="stat-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M13 2L4 14h7l-1 8 9-12h-7z" /></svg>
        <abbr title={h.initiative} aria-hidden="true">{h.initiativeShort}</abbr><span class="sr-only">{h.initiative}</span>
      </span>
      <span class="stat-value">{scores ? signed.format(modifier(scores.dex)) : t.unknown}</span>
    </div>

    <div class="stat">
      <span class="stat-label">
        <svg class="stat-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3 6.4 20.2l1.1-6.2L3 9.6l6.2-.9z" /></svg>
        <abbr title={h.proficiency} aria-hidden="true">{h.proficiencyShort}</abbr><span class="sr-only">{h.proficiency}</span>
      </span>
      <span class="stat-value">{signed.format(proficiencyBonus(sheet.level))}</span>
    </div>

    <div class="hp-box">
      <div class="hp-row">
        {#if status}
          <fieldset class="saves">
            <legend class="stat-label danger">{t.hp.deathSaves} · {t.hp.statuses[status]}</legend>
            {#each [["successes", t.hp.pass], ["failures", t.hp.fail]] as const as [kind, label] (kind)}
              <div class="save-row">
                <span class="save-label">{label}</span>
                {#each Array.from({ length: DEATH_SAVES }, (_, i) => i + 1) as n (n)}
                  <input
                    type="checkbox"
                    class="circle {kind}"
                    aria-label={t.hp.saveBox(label, n)}
                    checked={vitals.deathSaves[kind] >= n}
                    disabled={sheet.readOnly}
                    onchange={(e) => setDeathSave(kind, n, e.currentTarget.checked)}
                  />
                {/each}
              </div>
            {/each}
          </fieldset>
        {:else}
          <div class="hp-numbers">
            <div class="hp-head">
              <span class="stat-label">{t.hp.title}</span>
              <button
                class="temp"
                aria-label="{t.hp.temp(plain.format(vitals.hp.temp))}. {t.hp.setTemp}"
                title={t.hp.setTemp}
                disabled={sheet.readOnly || typed() === null}
                onclick={() => apply("temp")}
              >
                {t.hp.temp(plain.format(vitals.hp.temp))}
              </button>
            </div>
            <p class="stat-value" aria-label={t.hp.hpLabel(plain.format(vitals.hp.current), plain.format(vitals.hp.max))}>
              {plain.format(vitals.hp.current)}<span class="hp-max"> / {plain.format(vitals.hp.max)}</span>
            </p>
          </div>
        {/if}
        <form class="amount" onsubmit={(e) => (e.preventDefault(), apply("damage"))}>
          <label for="hp-amount" class="sr-only">{t.hp.amountLabel}</label>
          <input id="hp-amount" type="text" inputmode="numeric" placeholder={t.hp.amountLabel} bind:value={amount} disabled={sheet.readOnly} autocomplete="off" />
          <div class="hp-buttons">
            <button type="submit" class="hp-btn damage" aria-label={t.hp.damage} title={t.hp.damage} disabled={sheet.readOnly || typed() === null}>−</button>
            <button type="button" class="hp-btn heal" aria-label={t.hp.heal} title={t.hp.heal} disabled={sheet.readOnly || typed() === null} onclick={() => apply("heal")}>+</button>
          </div>
        </form>
      </div>
      <div class="bar" aria-hidden="true"><div class="fill" style:width="{hpShare}%" style:--hp-share="{hpShare}%"></div></div>
    </div>
  </div>
</section>

<style>
  .card {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-4);
    padding: var(--space-4);
    border: var(--border-width) solid var(--color-border-strong);
    border-radius: var(--radius-lg);
    background: var(--color-surface);
    transition:
      box-shadow 0.4s ease,
      border-color 0.4s ease;
  }

  .card.concentrating {
    border-color: var(--color-concentration);
    box-shadow: inset 0 0 calc(2 * var(--sheet-glow-blur)) var(--space-1) var(--color-concentration-glow);
  }

  .avatar {
    flex: none;
    padding: 0;
    background: none;
    cursor: zoom-in;
    --avatar-size: var(--sheet-avatar-size);
    border: var(--border-width) solid var(--color-border-strong);
    border-radius: var(--radius-lg);
    overflow: hidden;
    transition:
      box-shadow 0.4s ease,
      border-color 0.4s ease;
  }

  .avatar.inspired {
    border-color: var(--color-inspiration-strong);
    box-shadow:
      0 0 var(--sheet-glow-blur) var(--space-1) var(--color-inspiration-glow),
      inset 0 0 var(--sheet-glow-blur) var(--space-1) var(--color-inspiration-glow);
  }

  .who {
    flex: 1 1 calc(10 * var(--space-6));
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  h1 {
    font-size: var(--text-xl);
    font-weight: var(--weight-bold);
    line-height: var(--leading-tight);
    letter-spacing: var(--tracking-tight);
  }

  .muted {
    color: var(--color-text-muted);
    font-size: var(--text-sm);
  }

  .conditions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2);
    margin: 0;
    padding: 0;
    list-style: none;
    font-size: var(--text-sm);
  }

  .chip,
  .conditions :global(.chip) {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    min-height: var(--control-height-sm);
    padding: 0 var(--space-1) 0 var(--space-3);
    border: var(--border-width) solid var(--color-text);
    border-radius: var(--radius-pill);
    background: var(--color-surface-sunken);
  }

  .conditions :global(.chip.add) {
    padding: 0 var(--space-3);
    border: var(--border-width) dashed var(--color-border-strong);
    background: var(--color-surface);
    color: var(--color-text-muted);
    font-size: var(--text-sm);
    cursor: pointer;
  }

  .conditions :global(.chip.add:hover) {
    color: var(--color-text);
  }

  .chip-x {
    display: grid;
    place-items: center;
    width: var(--space-5);
    height: var(--space-5);
    padding: 0;
    border: none;
    border-radius: 50%;
    background: transparent;
    color: var(--color-text-muted);
    cursor: pointer;
  }

  .chip-x:hover:not(:disabled) {
    background: var(--color-surface);
    color: var(--color-text);
  }

  .chip-x svg {
    width: var(--space-3);
    height: var(--space-3);
  }

  .numbers {
    flex: 0 1 auto;
    margin-left: auto;
    display: flex;
    flex-wrap: wrap;
    align-items: stretch;
    gap: var(--space-3);
  }

  .side {
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: flex-end;
    gap: var(--space-3);
  }

  .speed {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
  }

  .mini {
    color: var(--color-text-muted);
    font-size: var(--text-xs);
    letter-spacing: var(--tracking-label);
    text-transform: uppercase;
  }

  .inspiration {
    min-height: var(--control-height-sm);
    padding: 0 var(--space-3);
    border: var(--border-width) solid var(--color-border-strong);
    border-radius: var(--radius-pill);
    background: var(--color-surface);
    color: var(--color-text-muted);
    font-size: var(--text-xs);
    font-weight: var(--weight-semibold);
    letter-spacing: var(--tracking-label);
    text-transform: uppercase;
    white-space: nowrap;
    cursor: pointer;
    transition:
      background 0.3s ease,
      color 0.3s ease;
  }

  .inspiration[aria-pressed="true"] {
    border-color: var(--color-inspiration-strong);
    background: var(--color-inspiration);
    color: var(--color-inspiration-text);
  }

  .stat {
    width: var(--sheet-stat-width);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0;
    padding: var(--space-2) var(--space-1);
    border: var(--border-width) solid var(--color-text);
    border-radius: var(--radius-lg);
    background: var(--color-surface);
    text-align: center;
  }

  /* Armor class sits in a shield shape. */
  .stat.shield {
    border-radius: var(--radius-lg) var(--radius-lg) calc(4 * var(--radius-lg)) calc(4 * var(--radius-lg));
  }

  .stat-label {
    color: var(--color-text-muted);
    font-size: var(--text-xs);
    font-weight: var(--weight-bold);
    letter-spacing: var(--tracking-label);
    text-transform: uppercase;
  }

  .stat-label.danger {
    color: var(--color-danger);
  }

  .stat .stat-label {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
  }

  .stat-label abbr {
    text-decoration: none;
  }

  .stat-icon {
    flex: none;
    width: var(--space-4);
    height: var(--space-4);
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linejoin: round;
  }

  .stat-value {
    font-size: var(--stat-value-size);
    font-weight: var(--weight-bold);
    line-height: var(--leading-tight);
    font-variant-numeric: tabular-nums;
  }

  .as-button {
    padding: 0 var(--space-2);
    border: none;
    border-radius: var(--radius-sm);
    background: transparent;
    color: inherit;
    cursor: pointer;
  }

  .as-button:hover:not(:disabled) {
    background: var(--color-surface-sunken);
  }

  .as-button:disabled {
    cursor: default;
  }

  .ac-input {
    width: 100%;
    min-height: var(--control-height);
    border: var(--border-width) solid var(--color-border-strong);
    border-radius: var(--radius-sm);
    background: var(--color-surface);
    font-size: var(--text-xl);
    font-weight: var(--weight-bold);
    text-align: center;
  }

  .hp-box {
    flex: 0 1 var(--sheet-hp-width);
    min-width: 0;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-3);
    border: var(--border-width) solid var(--color-text);
    border-radius: var(--radius-lg);
    background: var(--color-surface);
  }

  .hp-row {
    display: flex;
    align-items: center;
    gap: var(--space-4);
  }

  .hp-numbers {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .hp-head {
    display: flex;
    align-items: baseline;
    gap: var(--space-3);
  }

  .temp {
    padding: 0 var(--space-1);
    border: none;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--color-text-muted);
    font-size: var(--text-sm);
    cursor: pointer;
  }

  .temp:hover:not(:disabled) {
    background: var(--color-surface-sunken);
    color: var(--color-text);
  }

  .temp:disabled {
    cursor: default;
  }

  .hp-max {
    color: var(--color-text-muted);
    font-size: var(--text-lg);
  }

  .amount {
    width: var(--sheet-hp-amount-width);
    margin-left: auto;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .amount input {
    width: 100%;
    min-height: var(--control-height);
    padding: 0 var(--space-2);
    border: var(--border-width) solid var(--color-border-strong);
    border-radius: var(--radius-md);
    background: var(--color-surface);
    font-variant-numeric: tabular-nums;
  }

  .amount input::placeholder {
    color: var(--color-text-placeholder);
  }

  .hp-buttons {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--space-2);
  }

  .hp-btn {
    min-height: var(--control-height);
    border: none;
    border-radius: var(--radius-md);
    color: var(--color-accent-text);
    font-size: var(--text-xl);
    font-weight: var(--weight-bold);
    line-height: 1;
    cursor: pointer;
  }

  .hp-btn.damage {
    background: var(--color-danger-fill);
  }

  .hp-btn.heal {
    background: var(--color-success-fill);
  }

  .hp-btn:disabled {
    opacity: 0.5;
    cursor: default;
  }

  .bar {
    height: var(--sheet-bar-height);
    overflow: hidden;
    border: var(--border-width) solid var(--color-border-strong);
    border-radius: var(--radius-pill);
  }

  /* Green at full hit points, shading to red as they run out. */
  .fill {
    height: 100%;
    background: color-mix(in oklab, var(--color-success) var(--hp-share), var(--color-danger));
    transition:
      width 0.3s ease,
      background 0.3s ease;
  }

  .saves {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    margin: 0;
    padding: 0;
    border: none;
  }

  .saves legend {
    margin-bottom: var(--space-1);
    padding: 0;
    white-space: nowrap;
  }

  .save-row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    color: var(--color-text-muted);
    font-size: var(--text-xs);
  }

  .save-label {
    width: calc(2 * var(--space-5));
  }

  .circle {
    appearance: none;
    width: var(--space-4);
    height: var(--space-4);
    margin: 0;
    border: calc(1.5 * var(--border-width)) solid var(--color-success);
    border-radius: 50%;
    background: var(--color-surface);
    cursor: pointer;
  }

  .circle.failures {
    border-color: var(--color-danger);
  }

  .circle:checked {
    background: var(--color-success);
  }

  .circle.failures:checked {
    background: var(--color-danger);
  }

  .circle:focus-visible {
    outline: var(--focus-ring) solid var(--color-focus);
    outline-offset: var(--border-width);
  }

  .circle:disabled {
    cursor: default;
  }

  :global([data-motion="reduce"]) .card,
  :global([data-motion="reduce"]) .avatar,
  :global([data-motion="reduce"]) .inspiration,
  :global([data-motion="reduce"]) .fill {
    transition: none;
  }
</style>
