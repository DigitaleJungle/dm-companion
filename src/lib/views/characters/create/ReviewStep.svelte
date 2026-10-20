<script lang="ts">
  import { ABILITY_NAMES, SIZES } from "$lib/rules/format";
  import { strings } from "$lib/strings";
  import { ABILITIES, level1Hp, modifier, proficiencyBonus } from "$lib/characters/rules";
  import { allSkills, backgroundFeats, draft, hitDie, savingThrows, scores } from "./draft.svelte";

  let { skills, campaignName }: { skills: { key: string; name: string; ability: string }[]; campaignName: string } = $props();

  const t = strings.characters.wizard.review;
  const signed = new Intl.NumberFormat(undefined, { signDisplay: "always" });
  const plain = new Intl.NumberFormat();
  const list = new Intl.ListFormat(undefined, { type: "conjunction" });

  const level = 1;
  const pb = proficiencyBonus(level);
  const final = $derived(scores());
  const proficient = $derived(new Set(allSkills()));
  const saves = $derived(new Set(savingThrows()));
  const skillRows = $derived(
    skills.map((s) => ({ ...s, proficient: proficient.has(s.key), bonus: final ? modifier(final[s.ability as keyof typeof final] ?? 10) + (proficient.has(s.key) ? pb : 0) : 0 })),
  );
  const perception = $derived(skillRows.find((s) => s.key === "perception")?.bonus ?? (final ? modifier(final.wis) : 0));
  const species = $derived(
    [draft.species?.name, draft.lineage, draft.subspecies?.name, draft.size ? SIZES[draft.size] : null].filter(Boolean).join(", "),
  );
  const feats = $derived(backgroundFeats());
</script>

<dl class="facts">
  <div><dt>{strings.characters.wizard.basics.name}</dt><dd>{draft.name.trim()}</dd></div>
  <div><dt>{t.player}</dt><dd>{draft.player.trim() || t.none}</dd></div>
  <div><dt>{t.campaign}</dt><dd>{campaignName}</dd></div>
  <div><dt>{t.species}</dt><dd>{species} <span class="source">{draft.species?.source}</span></dd></div>
  <div><dt>{t.class}</dt><dd>{draft.cls?.name} <span class="source">{draft.cls?.source}</span></dd></div>
  <div><dt>{t.background}</dt><dd>{draft.background?.name} <span class="source">{draft.background?.source}</span></dd></div>
  <div><dt>{t.level}</dt><dd>{plain.format(level)}</dd></div>
  <div><dt>{t.hp}</dt><dd>{final ? plain.format(level1Hp(hitDie(), final.con)) : ""}</dd></div>
  <div><dt>{t.proficiency}</dt><dd>{signed.format(pb)}</dd></div>
  <div><dt>{t.passivePerception}</dt><dd>{plain.format(10 + perception)}</dd></div>
  <div><dt>{t.feats}</dt><dd>{feats.length ? list.format(feats.map((f) => f.name)) : t.none}</dd></div>
</dl>

<section aria-labelledby="review-abilities">
  <h3 id="review-abilities" class="label">{t.abilities}</h3>
  <ul class="abilities">
    {#each ABILITIES as ability (ability)}
      <li>
        <span class="ability">{ABILITY_NAMES[ability]}</span>
        <strong class="score">{final ? plain.format(final[ability]) : ""}</strong>
        <span class="mod">{final ? signed.format(modifier(final[ability])) : ""}</span>
        <span class="save" class:on={saves.has(ability)}>
          {t.saves}: {final ? signed.format(modifier(final[ability]) + (saves.has(ability) ? pb : 0)) : ""}
        </span>
      </li>
    {/each}
  </ul>
</section>

<section aria-labelledby="review-skills">
  <h3 id="review-skills" class="label">{t.skills}</h3>
  <ul class="skills">
    {#each skillRows as skill (skill.key)}
      <li class:on={skill.proficient}>
        <span class="dot" aria-hidden="true"></span>
        <span>{skill.name}</span>
        <span class="bonus">{signed.format(skill.bonus)}</span>
        {#if skill.proficient}<span class="sr-only">({strings.characters.wizard.skills.granted})</span>{/if}
      </li>
    {/each}
  </ul>
</section>

<p class="muted small">{t.later}</p>

<style>
  .facts {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(100%, var(--select-width)), 1fr));
    gap: var(--space-3) var(--space-5);
    margin: 0;
  }

  .facts dt {
    color: var(--color-text-muted);
    font-size: var(--text-xs);
    font-weight: var(--weight-semibold);
  }

  .facts dd {
    margin: 0;
  }

  .source {
    color: var(--color-text-muted);
    font-size: var(--text-xs);
  }

  section {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  ul {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .abilities {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(100%, var(--menu-min-width)), 1fr));
    gap: var(--space-3);
  }

  .abilities li {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-1);
    padding: var(--space-3);
    border: var(--border-width) solid var(--color-border);
    border-radius: var(--radius-md);
    background: var(--color-surface);
    font-variant-numeric: tabular-nums;
  }

  .ability {
    font-size: var(--text-sm);
    font-weight: var(--weight-semibold);
  }

  .score {
    font-size: var(--text-xl);
  }

  .mod {
    color: var(--color-text-muted);
  }

  .save {
    color: var(--color-text-muted);
    font-size: var(--text-xs);
  }

  .save.on {
    color: var(--color-link);
    font-weight: var(--weight-semibold);
  }

  .skills {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(100%, var(--select-width)), 1fr));
    gap: var(--space-1) var(--space-5);
    font-size: var(--text-sm);
  }

  .skills li {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    color: var(--color-text-muted);
  }

  .skills li.on {
    color: var(--color-text);
    font-weight: var(--weight-semibold);
  }

  .dot {
    width: var(--space-2);
    height: var(--space-2);
    border: var(--border-width) solid currentColor;
    border-radius: 50%;
  }

  .on .dot {
    background: currentColor;
  }

  .bonus {
    margin-left: auto;
    font-variant-numeric: tabular-nums;
  }

  .muted {
    color: var(--color-text-muted);
  }

  .small {
    font-size: var(--text-sm);
  }
</style>
