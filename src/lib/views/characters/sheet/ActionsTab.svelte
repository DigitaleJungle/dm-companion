<script lang="ts">
  import InfoTip from "$lib/components/InfoTip.svelte";
  import { catalogRows } from "$lib/api/rules";
  import { modifier, proficiencyBonus } from "$lib/characters/rules";
  import { inUse, weaponAttack, weaponProficient } from "$lib/characters/sheet";
  import { DAMAGE_TYPES } from "$lib/rules/format";
  import { openPreview } from "$lib/rules/preview.svelte";
  import { plainText } from "$lib/rules/tags";
  import { strings } from "$lib/strings";
  import type { Sheet } from "./sheet.svelte";

  // Attacks with the equipped weapons, and the Unarmed Strike.
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
  const weaponRows = $derived(
    (sheet.character?.inventory ?? []).flatMap((item) => {
      const weapon = item.weapon;
      if (!inUse(item) || !weapon || !sheet.scores) return [];
      const proficient = weaponProficient(sheet.cls, item.name, weapon);
      const attack = weaponAttack(weapon, sheet.scores, pb, proficient);
      const props = (weapon.properties ?? []).map((p) => sheet.properties[p] ?? p);
      return [
        {
          name: item.name,
          ref: item.source ? { kind: "item", name: item.name, source: item.source } : null,
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

  // Everyone can make an Unarmed Strike: STR + proficiency to hit, 1 + STR bludgeoning damage, or grapple or shove
  // instead. Its name opens the Unarmed Strike rule (from the class's book, else the newest).
  const unarmed = $derived.by(() => {
    if (!sheet.scores) return null;
    const str = modifier(sheet.scores.str);
    return {
      name: t.unarmed.name,
      ref: { kind: "variantrule", name: "Unarmed Strike", source: sheet.character?.classes[0]?.source },
      proficient: true,
      mastery: null,
      time: tl.cast.action,
      range: t.reach,
      hit: signed.format(str + pb),
      damage: t.unarmed.damage(Math.max(0, 1 + str)),
      notes: list.format(t.unarmed.options),
    };
  });
  const rows = $derived([...weaponRows, ...(unarmed ? [unarmed] : [])]);
</script>

{#snippet time(cast: { short: string; long: string })}
  {#if cast.short === cast.long}{cast.long}{:else}<span title={cast.long}><span aria-hidden="true">{cast.short}</span><span class="sr-only">{cast.long}</span></span>{/if}
{/snippet}

{#snippet group(title: string)}
  <tr><th scope="colgroup" colspan="6" class="group-name">{title}</th></tr>
{/snippet}

{#if rows.length === 0}
  <p class="muted">{t.empty}</p>
{:else}
  <div class="table-wrap">
    <table class="sheet-table">
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
                {#if row.ref}
                  {@const ref = row.ref}
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
    </table>
  </div>
{/if}

<style>
  .table-wrap {
    overflow-x: auto;
  }

  .mastery-line {
    display: block;
  }

  .muted {
    color: var(--color-text-muted);
  }
</style>
