<script lang="ts">
  import InfoTip from "$lib/components/InfoTip.svelte";
  import { catalogRows } from "$lib/api/rules";
  import { errorMessage } from "$lib/api/storage";
  import { modifier, proficiencyBonus } from "$lib/characters/rules";
  import { actionsIn } from "$lib/characters/features";
  import { inUse, passesTime, timeKind, weaponAttack, weaponProficient, type TimeKind } from "$lib/characters/sheet";
  import { DAMAGE_TYPES } from "$lib/rules/format";
  import { openPreview, type Ref } from "$lib/rules/preview.svelte";
  import { plainText } from "$lib/rules/tags";
  import { strings } from "$lib/strings";
  import FeatureRow from "./FeatureRow.svelte";
  import type { Sheet } from "./sheet.svelte";

  // Attacks with the equipped weapons, and the Unarmed Strike.
  // `filter`: the sheet's time filter (Action, Bonus action, Reaction, Other); empty shows everything.
  let { sheet, filter = [] }: { sheet: Sheet; filter?: TimeKind[] } = $props();

  const t = strings.characters.sheet.actions;
  const tf = strings.characters.sheet.features;
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

  // The actions anyone can take (Attack, Dash, Dodge…), from the rules data: the class's book's, else every book's
  // (one per name). Each opens its rules. Loaded once.
  let combat = $state<{ name: string; source: string; unit: string }[] | null>(null);
  let combatError = $state<string | null>(null);
  $effect(() => {
    const book = sheet.character?.classes[0]?.source?.toLowerCase();
    if (combat || combatError) return;
    catalogRows("action", ["time"])
      .then((rows) => {
        const own = rows.filter((r) => r.source.toLowerCase() === book);
        const list = own.length ? own : [...new Map(rows.map((r) => [r.name.toLowerCase(), r])).values()];
        combat = list
          .map((r) => {
            const first = Array.isArray(r.data.time) ? r.data.time[0] : null;
            return { name: r.name, source: r.source, unit: typeof first === "object" && first ? String((first as { unit?: unknown }).unit ?? "") : "" };
          })
          .sort((a, b) => ((t.actionLabels as Record<string, string>)[a.name] ?? a.name).localeCompare((t.actionLabels as Record<string, string>)[b.name] ?? b.name));
      })
      .catch((e) => (combatError = errorMessage(e)));
  });

  // The three lines above the table: the standard actions by when they're taken (Attack…, Two-Weapon Fighting,
  // Opportunity Attack; free or varying ones count as actions), then the character's own features used that way
  // (Lay on Hands, Cunning Action…) with the standard actions their text names: "Cunning Action (Dash, Disengage, Hide)".
  type Item = { name: string; ref: Ref; with: { name: string; ref: Ref }[] };
  const book = $derived(sheet.character?.classes[0]?.source);
  const lines = $derived.by(() => {
    const out: Record<"action" | "bonus" | "reaction", Item[]> = { action: [], bonus: [], reaction: [] };
    // A free one (End Concentration) isn't an action at all. Some get a shorter label ("Improvise").
    for (const a of (combat ?? []).filter((x) => x.unit.toLowerCase() !== "free")) {
      const kind = timeKind(a.unit);
      const label = (t.actionLabels as Record<string, string>)[a.name] ?? a.name;
      out[kind === "bonus" || kind === "reaction" ? kind : "action"].push({ name: label, ref: { kind: "action", name: a.name, source: a.source }, with: [] });
    }
    for (const card of f.cards) {
      const time = f.useOf(card).time;
      if (!time || !card.ref) continue;
      const named = actionsIn(card.text).map((name) => ({ name, ref: { kind: "action", name, source: book } }));
      out[time].push({ name: card.name, ref: { ...card.ref, note: tf.from(card.from) }, with: named });
    }
    return (["action", "bonus", "reaction"] as const).filter((k) => out[k].length && passesTime(filter, k)).map((k) => [k, out[k]] as const);
  });

  // The features ticked on the Features & traits tab, under their own heading.
  const f = $derived(sheet.features);
  $effect(() => f.load());
  // A ticked feature that draws from a pool (Divine Sense, Sacred Weapon: Channel Divinity) is bundled under that pool:
  // the pool's row has the uses, the options under it don't. The pool shows even when only its options are ticked.
  // Weapon attacks and the Unarmed Strike are actions. A pool shows when it or one of its shown options passes.
  const attacksShown = $derived(passesTime(filter, "action"));
  const features = $derived.by(() => {
    const passes = (card: (typeof f.cards)[number]) => passesTime(filter, f.useOf(card).time);
    const all = f.actionRows();
    return all.filter((row, i) => {
      if (row.option) return passes(row.card);
      const options = [];
      for (let j = i + 1; j < all.length && all[j].option; j++) options.push(all[j]);
      return passes(row.card) || options.some((o) => passes(o.card));
    });
  });
</script>

{#if combatError}
  <p class="error" role="alert">{t.combatError(combatError)}</p>
{/if}
{#if lines.length}
  <div class="combat">
    {#each lines as [kind, items] (kind)}
      <p>
        <b>{t.lines[kind]}</b>
        <!-- A feat can share a standard action's name (Two-Weapon Fighting), so the key has the kind too. -->
        {#each items as item, i (`${item.ref.kind}:${item.name}`)}
          {@const ref = item.ref}
          <button class="entry-link" onclick={(e) => openPreview(ref, e.currentTarget)}>{item.name}</button>{#if item.with.length}
            <span class="with"
              >(<!--
              -->{#each item.with as w, j (w.name)}{@const wref = w.ref}<button class="entry-link" onclick={(e) => openPreview(wref, e.currentTarget)}>{w.name}</button>{#if j < item.with.length - 1}<span aria-hidden="true">{", "}</span>{/if}{/each}<!--
              -->)</span
            >{/if}{#if i < items.length - 1}<span aria-hidden="true">{", "}</span>{/if}
        {/each}
      </p>
    {/each}
  </div>
{/if}

{#snippet time(cast: { short: string; long: string })}
  {#if cast.short === cast.long}{cast.long}{:else}<span title={cast.long}><span aria-hidden="true">{cast.short}</span><span class="sr-only">{cast.long}</span></span>{/if}
{/snippet}

{#snippet group(title: string)}
  <tr><th scope="colgroup" colspan="6" class="group-name">{title}</th></tr>
{/snippet}

{#if rows.length === 0 && f.actionRows().length === 0}
  <p class="muted">{t.empty}</p>
{:else if !(rows.length && attacksShown) && features.length === 0}
  <p class="muted">{strings.characters.sheet.timeFilter.none}</p>
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
      {#if rows.length && attacksShown}
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
            <td class="muted"><span class="col-time">{@render time(row.time)}</span></td>
            <td class="muted"><span class="col-range" title={row.range}>{row.range}</span></td>
            <td><span class="pill strong">{row.hit}</span></td>
            <td><span class="pill wrap">{row.damage}</span></td>
            <td class="muted"><span class="notes">{row.notes}</span></td>
          </tr>
        {/each}
      </tbody>
      {/if}
      {#if features.length}
        <tbody>
          {@render group(t.features)}
          {#each features as { card, option } (card.key)}
            <FeatureRow {sheet} {card} mode="actions" {option} />
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

  .combat {
    margin-bottom: var(--space-4);
    font-size: var(--text-sm);
    line-height: var(--leading-normal);
  }

  .combat p + p {
    margin-top: var(--space-1);
  }

  .combat b {
    margin-right: var(--space-1);
  }

  .with {
    color: var(--color-text-muted);
  }

  .combat .entry-link {
    font-weight: var(--weight-regular);
    text-decoration: underline;
    text-decoration-color: var(--color-border-strong);
  }

  .error {
    color: var(--color-danger);
  }

  .mastery-line {
    display: block;
  }

  .muted {
    color: var(--color-text-muted);
  }
</style>
