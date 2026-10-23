<script lang="ts">
  import { proficiencyBonus } from "$lib/characters/rules";
  import { weaponAttack, weaponProficient } from "$lib/characters/sheet";
  import { DAMAGE_TYPES } from "$lib/rules/format";
  import { strings } from "$lib/strings";
  import type { Sheet } from "./sheet.svelte";

  // Attacks with the equipped weapons.
  let { sheet }: { sheet: Sheet } = $props();

  const t = strings.characters.sheet.actions;
  const signed = new Intl.NumberFormat(undefined, { signDisplay: "always" });
  const list = new Intl.ListFormat(undefined, { type: "unit", style: "narrow" });

  const pb = $derived(proficiencyBonus(sheet.level));
  const masteries = $derived(new Set((sheet.character?.weaponMasteries ?? []).map((m) => m.name.toLowerCase())));
  const rows = $derived(
    (sheet.character?.inventory ?? []).flatMap((item) => {
      const weapon = item.weapon;
      if (!item.equipped || !weapon || !sheet.scores) return [];
      const proficient = weaponProficient(sheet.cls, item.name, weapon);
      const attack = weaponAttack(weapon, sheet.scores, pb, proficient);
      const props = (weapon.properties ?? []).map((p) => sheet.properties[p] ?? p);
      return [
        {
          name: item.name,
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
</script>

{#if rows.length === 0}
  <p class="muted">{t.empty}</p>
{:else}
  <div class="table-wrap">
    <table>
      <thead>
        <tr>
          <th scope="col">{t.name}</th>
          <th scope="col">{t.range}</th>
          <th scope="col">{t.hit}</th>
          <th scope="col">{t.damage}</th>
          <th scope="col">{t.notes}</th>
        </tr>
      </thead>
      <tbody>
        {#each rows as row, i (i)}
          <tr>
            <th scope="row">{row.name}</th>
            <td class="muted">{row.range}</td>
            <td><span class="pill strong">{row.hit}</span></td>
            <td><span class="pill">{row.damage}</span></td>
            <td class="muted">{row.notes}</td>
          </tr>
        {/each}
      </tbody>
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
</style>
