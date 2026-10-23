<script lang="ts">
  import { proficiencyBonus } from "$lib/characters/rules";
  import { inUse, spellDice, spellRow, weaponAttack, weaponProficient } from "$lib/characters/sheet";
  import { capital, castingTime, components, DAMAGE_TYPES, spellRange } from "$lib/rules/format";
  import { openPreview } from "$lib/rules/preview.svelte";
  import { strings } from "$lib/strings";
  import type { Sheet } from "./sheet.svelte";

  // Attacks with the equipped weapons, then the spells that matter in a fight: an attack, a save, damage or healing.
  let { sheet }: { sheet: Sheet } = $props();

  const t = strings.characters.sheet.actions;
  const tl = strings.characters.levelUpDialog;
  const signed = new Intl.NumberFormat(undefined, { signDisplay: "always" });
  const list = new Intl.ListFormat(undefined, { type: "unit", style: "narrow" });

  const pb = $derived(proficiencyBonus(sheet.level));
  const masteries = $derived(new Set((sheet.character?.weaponMasteries ?? []).map((m) => m.name.toLowerCase())));
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
          time: tl.cast.action,
          range: weapon.range ? t.feet(weapon.range) : t.reach,
          hit: signed.format(attack.toHit),
          damage: attack.damage ? [attack.damage, DAMAGE_TYPES[weapon.dmgType ?? ""]].filter(Boolean).join(" ") : strings.characters.sheet.unknown,
          notes: list.format([
            ...props,
            ...(masteries.has(item.name.toLowerCase()) ? [t.mastery(weapon.mastery?.join(", ") ?? "")] : []),
            ...(proficient ? [] : [t.notProficient]),
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
              {#if row.source}
                {@const ref = { kind: "item", name: row.name, source: row.source }}
                <button class="entry-link" onclick={(e) => openPreview(ref, e.currentTarget)}>{row.name}</button>
              {:else}{row.name}{/if}
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

  .pill.wrap {
    max-width: calc(5 * var(--space-6));
    padding-block: var(--space-1);
    white-space: normal;
  }

  .notes {
    display: block;
    max-width: calc(10 * var(--space-6));
  }

  .name-cell {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
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

  .pill {
    display: inline-flex;
    align-items: center;
    min-height: var(--control-height);
    padding: 0 var(--space-3);
    border: var(--border-width) solid var(--color-border-strong);
    border-radius: var(--radius-md);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
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
