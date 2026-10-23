<script lang="ts">
  import type { Snippet } from "svelte";
  import Menu from "$lib/components/Menu.svelte";
  import type { CastSlot } from "$lib/characters/sheet";
  import { ordinal } from "$lib/rules/catalog";
  import { openPreview } from "$lib/rules/preview.svelte";
  import { notify } from "$lib/stores/notifications.svelte";
  import { strings } from "$lib/strings";
  import type { Sheet } from "./sheet.svelte";

  // One spell as a row of a .sheet-table (the Actions tab's design): name (with C), Time, Range, Hit/DC, Damage and Notes.
  // `after` adds to the name (the (!)); `end` adds cells at the end (the ✕).
  let { sheet, spell, after, end }: { sheet: Sheet; spell: { name: string; source: string; ability?: string; origin?: string }; after?: Snippet; end?: Snippet } = $props();

  const t = strings.characters.sheet.spells;
  const plain = new Intl.NumberFormat();
  const line = $derived(sheet.spellLine(spell));
  // A leveled spell needs a slot of its level or higher; a cantrip none.
  const slots = $derived(line && line.level > 0 ? sheet.castSlotsFor(line.level) : []);
  // A feature may cast it without a slot (Paladin's Smite: Divine Smite once per long rest): offered first.
  const free = $derived(line && line.level > 0 ? sheet.features.freeCastsFor(spell) : []);
  type Option = { label: string; title: string; cast: () => void };
  const options = $derived<Option[]>([
    ...free.map((f) => ({
      label: t.cast.freeOption(f.card.name, plain.format(f.max - f.used)),
      title: t.cast.castWith(spell.name, t.cast.free(f.card.name)),
      cast: () => {
        sheet.features.spendFreeCast(f);
        sheet.cast(spell, null, !!line?.concentration);
        notify(t.cast.castWith(spell.name, t.cast.free(f.card.name)));
      },
    })),
    ...slots.map((slot) => ({ label: t.cast.option(slotName(slot), plain.format(slot.left)), title: t.cast.castWith(spell.name, slotName(slot)), cast: () => cast(slot) })),
  ]);
  const noSlot = $derived(!!line && line.level > 0 && options.length === 0);
  const c = $derived(sheet.character);
  const concentratingHere = $derived(!!c?.concentrating && c.concentratingOn?.name === spell.name && c.concentratingOn?.source === spell.source);
  const slotName = (slot: CastSlot) => (slot.pact ? t.cast.pactSlot(ordinal(slot.level)) : t.cast.slot(ordinal(slot.level)));

  function cast(slot: CastSlot | null) {
    sheet.cast(spell, slot, !!line?.concentration);
    notify(slot ? t.cast.castWith(spell.name, slotName(slot)) : t.cast.cast(spell.name));
  }
</script>

<!-- The spell being concentrated on glows like the header card. -->
<tr class:concentrating={concentratingHere}>
  <th scope="row">
    <span class="name-cell">
      {#if line && !sheet.readOnly}
        {#if options.length > 1}
          <!-- Several slot levels could cast it: ask which. -->
          <Menu
            id="cast-{`${spell.name}-${spell.source}`.replace(/\W+/g, "-")}"
            label={t.cast.label(spell.name)}
            align="start"
            triggerClass="cast"
            items={options.map((o) => ({ label: o.label, onselect: o.cast }))}
          >
            {#snippet trigger()}{t.cast.button}{/snippet}
          </Menu>
        {:else}
          <button
            type="button"
            class="cast"
            disabled={noSlot}
            aria-label={t.cast.label(spell.name)}
            title={noSlot ? t.cast.noSlot : (options[0]?.title ?? t.cast.label(spell.name))}
            onclick={() => (options[0] ? options[0].cast() : cast(null))}
          >{t.cast.button}</button>
        {/if}
      {/if}
      <button class="entry-link" onclick={(e) => openPreview({ kind: "spell", name: spell.name, source: spell.source }, e.currentTarget)}>{spell.name}</button>
      {#if line?.concentration}
        <span class="badge" title={t.col.concentration.long}><span aria-hidden="true">{t.col.concentration.short}</span><span class="sr-only">{t.col.concentration.long}</span></span>
      {/if}
      {@render after?.()}
    </span>
  </th>
  {#if line}
    <td class="muted">
      {#if line.time.short === line.time.long}{line.time.long}{:else}<span title={line.time.long}><span aria-hidden="true">{line.time.short}</span><span class="sr-only">{line.time.long}</span></span>{/if}
    </td>
    <td class="muted"><span class="cut" title={line.range}>{line.range}</span></td>
    <td><span class="pill strong">{line.hit}</span></td>
    <td><span class="pill wrap">{line.damage}</span></td>
    <td class="muted"><span class="notes" title={line.notesTitle}>{line.notes}</span></td>
  {:else}
    <!-- Not in the rules data (or not loaded yet): just the name. -->
    <td colspan="5" class="muted">{t.none}</td>
  {/if}
  {@render end?.()}
</tr>
