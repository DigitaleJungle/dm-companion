<script lang="ts">
  import InfoTip from "$lib/components/InfoTip.svelte";
  import { catalogRows } from "$lib/api/rules";
  import { proficiencyBonus } from "$lib/characters/rules";
  import { inUse, spellDice, spellRow, weaponAttack, weaponProficient } from "$lib/characters/sheet";
  import { capital, castingTime, components, DAMAGE_TYPES, spellRange } from "$lib/rules/format";
  import { openPreview } from "$lib/rules/preview.svelte";
  import { plainText } from "$lib/rules/tags";
  import { strings } from "$lib/strings";
  import type { Sheet } from "./sheet.svelte";

  // Attacks with the equipped weapons, then the spells that matter in a fight: an attack, a save, damage or healing.
  let { sheet }: { sheet: Sheet } = $props();

  const t = strings.characters.sheet.actions;
  const tl = strings.characters.levelUpDialog;
  const signed = new Intl.NumberFormat(undefined, { signDisplay: "always" });
  const list = new Intl.ListFormat(undefined, { type: "unit", style: "short" });

  const pb = $derived(proficiencyBonus(sheet.level));
  const masteries = $derived(new Set((sheet.character?.weaponMasteries ?? []).map((m) => m.name.toLowerCase())));
  // What each mastery does (Sap, Vex…), for the star's tooltip; loaded once. Without it the star shows just the name.
  let masteryText = $state<Record<string, string>>({});
  $effect(() => {
    if (!masteries.size || Object.keys(masteryText).length) return;
    catalogRows("itemMastery", ["entries"])
      .then((rows) => (masteryText = Object.fromEntries(rows.map((r) => [r.name.toLowerCase(), list.format(((r.data.entries as unknown[]) ?? []).filter((e): e is string => typeof e === "string").map(plainText))]))))
      .catch(() => {});
  });
  const masteryTip = (names: string[]) => names.map((n) => t.masteryEffect(n, masteryText[n.toLowerCase()] ?? "")).join(" ");
  const rows = $derived(
    (sheet.character?.inventory ?? []).flatMap((item) => {
      const weapon = item.weapon;
      if (!inUse(item) || !weapon || !sheet.scores) return [];
      const proficient = weaponProficient(sheet.cls, item.name, weapon);
      const attack = weaponAttack(weapon, sheet.scores, pb, proficient);
      const props = (weapon.properties ?? []).map((p) => sheet.properties[p] ?? p);
      return [
        {
          name: item.name,
          source: item.source,
          proficient,
          mastery: masteries.has(item.name.toLowerCase()) ? (weapon.mastery ?? []) : null,
          time: tl.cast.action,
          range: weapon.range ? t.feet(weapon.range) : t.reach,
          hit: signed.format(attack.toHit),
          damage: attack.damage ? [attack.damage, DAMAGE_TYPES[weapon.dmgType ?? ""]].filter(Boolean).join(" ") : strings.characters.sheet.unknown,
          notes: list.format([
            ...props,
            ...(masteries.has(item.name.toLowerCase()) ? [t.mastery(weapon.mastery?.join(", ") ?? "")] : []),
          ]),
        },
      ];
    }),
  );

  $effect(() => {
    if ((sheet.character?.spells ?? []).length) sheet.loadSpellDetails();
  });
  const spellRows = $derived(
    (sheet.character?.spells ?? [])
      .filter((s) => (s.atLevel ?? 1) <= sheet.level)
      .flatMap((s) => {
        const data = sheet.spellDetail(s)?.data;
        if (!data) return [];
        const row = spellRow(data);
        if (!row.attack && !row.save && !row.effects.length && !row.healing) return [];
        const dice = spellDice(data, sheet.level);
        const damage = row.healing && !row.effects.length
          ? (dice ? t.healing(dice) : strings.characters.sheet.spells.healing)
          : [dice, row.effects.map(capital).join(", ")].filter(Boolean).join(" ");
        const cast = tl.cast[row.unit as keyof typeof tl.cast];
        return [
          {
            name: s.name,
            source: s.source,
            level: Number(data.level ?? 0),
            concentration: row.concentration,
            // A, BA or R (the full word on hover); a longer casting time ("1 minute") is written out.
            time: cast ?? { short: castingTime(data), long: castingTime(data) },
            range: spellRange(data),
            hit: sheet.spellHitOrDc(s, row),
            damage: damage || strings.characters.sheet.spells.none,
            notes: list.format([[row.v && "V", row.s && "S", row.m && "M"].filter(Boolean).join(", "), ...(row.ritual ? [t.ritual] : [])].filter(Boolean)),
            notesTitle: components(data),
          },
        ];
      })
      .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name)),
  );
</script>

{#snippet time(cast: { short: string; long: string })}
  {#if cast.short === cast.long}{cast.long}{:else}<span title={cast.long}><span aria-hidden="true">{cast.short}</span><span class="sr-only">{cast.long}</span></span>{/if}
{/snippet}

{#snippet group(title: string)}
  <tr><th scope="colgroup" colspan="6" class="group-name">{title}</th></tr>
{/snippet}

{#if sheet.spellDetailsError}<p class="error" role="alert">{strings.characters.sheet.spells.detailsError(sheet.spellDetailsError)}</p>{/if}
{#if rows.length === 0 && spellRows.length === 0}
  <p class="muted">{t.empty}</p>
{:else}
  <div class="table-wrap">
    <table>
      <thead>
        <tr>
          <th scope="col">{t.name}</th>
          <th scope="col">{t.time}</th>
          <th scope="col">{t.range}</th>
          <th scope="col">{t.hit}</th>
          <th scope="col">{t.damage}</th>
          <th scope="col">{t.notes}</th>
        </tr>
      </thead>
      {#if rows.length}
      <tbody>
        {@render group(t.weapons)}
        {#each rows as row, i (i)}
          <tr>
            <th scope="row">
              <span class="name-cell">
                {#if row.source}
                  {@const ref = { kind: "item", name: row.name, source: row.source }}
                  <button class="entry-link" onclick={(e) => openPreview(ref, e.currentTarget)}>{row.name}</button>
                {:else}{row.name}{/if}
                <!-- Proficient: a round P (like the spells' C); nothing when not proficient. -->
                {#if row.proficient}
                  <span class="badge round" title={t.proficient.long}><span aria-hidden="true">{t.proficient.short}</span><span class="sr-only">{t.proficient.long}</span></span>
                {/if}
                <!-- A weapon the character has mastered: a star; hovering it tells what the mastery does. -->
                {#if row.mastery}
                  <InfoTip id="mastery-{i}" label={t.masteryOf(row.name, row.mastery.join(", "))} text={masteryTip(row.mastery)} icon="star">
                    {#each row.mastery as name, m (m)}
                      <span class="mastery-line"><b>{name}</b>{#if masteryText[name.toLowerCase()]}: {masteryText[name.toLowerCase()]}{/if}</span>
                    {/each}
                  </InfoTip>
                {/if}
              </span>
            </th>
            <td class="muted">{@render time(row.time)}</td>
            <td class="muted">{row.range}</td>
            <td><span class="pill strong">{row.hit}</span></td>
            <td><span class="pill wrap">{row.damage}</span></td>
            <td class="muted"><span class="notes">{row.notes}</span></td>
          </tr>
        {/each}
      </tbody>
      {/if}
      {#if spellRows.length}
        <tbody>
          {@render group(t.spells)}
          {#each spellRows as row (`${row.name}|${row.source}`)}
            <tr>
              <th scope="row">
                <span class="name-cell">
                  <button class="entry-link" onclick={(e) => openPreview({ kind: "spell", name: row.name, source: row.source }, e.currentTarget)}>{row.name}</button>
                  {#if row.concentration}
                    {@const c = strings.characters.sheet.spells.col.concentration}
                    <span class="badge" title={c.long}><span aria-hidden="true">{c.short}</span><span class="sr-only">{c.long}</span></span>
                  {/if}
                </span>
              </th>
              <td class="muted">{@render time(row.time)}</td>
              <td class="muted">{row.range}</td>
              <td><span class="pill strong">{row.hit}</span></td>
              <td><span class="pill wrap">{row.damage}</span></td>
              <td class="muted"><span class="notes" title={row.notesTitle}>{row.notes}</span></td>
            </tr>
          {/each}
        </tbody>
      {/if}
    </table>
  </div>
{/if}

<style>
  .table-wrap {
    overflow-x: auto;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    font-size: var(--text-sm);
  }

  th,
  td {
    padding: var(--space-2);
    border-bottom: var(--border-width) solid var(--color-border);
    text-align: left;
  }

  thead th {
    color: var(--color-text-muted);
    font-size: var(--text-xs);
    font-weight: var(--weight-semibold);
    letter-spacing: var(--tracking-label);
    text-transform: uppercase;
  }

  tbody th {
    font-weight: var(--weight-semibold);
  }

  /* The name takes the room; Damage and Notes stay narrow and continue on a new line. */
  thead th:first-child {
    width: 100%;
  }

  /* Damage: always room for two lines ("1d8+2" / "slashing"). */
  .pill.wrap {
    min-height: calc(2lh + 2 * var(--space-1));
    padding-block: var(--space-1);
  }

  /* The column is --action-notes-width, padding included; longer notes continue on the next line. */
  .notes {
    display: block;
    width: calc(var(--action-notes-width) - 2 * var(--space-2));
  }

  .mastery-line {
    display: block;
  }

  .name-cell {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
  }

  .badge.round {
    border-radius: 50%;
  }

  /* Concentration: the same solid square as on the Spells tab. */
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

  tbody th.group-name {
    padding-top: var(--space-4);
    color: var(--color-text-muted);
    font-size: var(--text-xs);
    font-weight: var(--weight-bold);
    letter-spacing: var(--tracking-label);
    text-transform: uppercase;
  }

  /* Hit/DC and Damage: every box the same size (its column, padding included, is --action-data-width), its value centered. */
  .pill {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: calc(var(--action-data-width) - 2 * var(--space-2));
    min-height: var(--control-height);
    text-align: center;
    overflow-wrap: anywhere;
    padding: 0 var(--space-1);
    border: var(--border-width) solid var(--color-border-strong);
    border-radius: var(--radius-md);
    font-variant-numeric: tabular-nums;
  }

  .pill.strong {
    border-color: var(--color-text);
    font-weight: var(--weight-bold);
  }

  .muted {
    color: var(--color-text-muted);
  }

  .error {
    color: var(--color-danger);
  }
</style>
