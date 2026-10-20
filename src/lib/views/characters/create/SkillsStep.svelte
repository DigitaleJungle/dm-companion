<script lang="ts">
  import { capital } from "$lib/rules/format";
  import { skillGrant } from "$lib/characters/rules";
  import { strings } from "$lib/strings";
  import { draft, grantedSkills, skillGroups, type SkillGroup } from "./draft.svelte";

  /** Every skill in the rules data: `key` is the lowercase name the entries use. */
  let { skills }: { skills: { key: string; name: string }[] } = $props();

  const t = strings.characters.wizard.skills;
  const list = new Intl.ListFormat(undefined, { type: "conjunction" });

  const granted = $derived(grantedSkills());
  const grantedFrom = () =>
    [
      [draft.background?.name, skillGrant(draft.background?.data.skillProficiencies).fixed],
      [draft.species?.name, [...skillGrant(draft.species?.data.skillProficiencies).fixed, ...skillGrant(draft.subspecies?.data.skillProficiencies).fixed]],
    ].flatMap(([name, fixed]) => (name && (fixed as string[]).length ? [name as string] : []));
  const nameOf = (key: string) => skills.find((s) => s.key === key)?.name ?? capital(key);
  const groups = $derived(skillGroups());
  const originName = (group: SkillGroup) =>
    group.origin === "species" ? (draft.species?.name ?? "") : group.origin === "class" ? (draft.cls?.name ?? "") : (draft.background?.name ?? "");

  const pickedElsewhere = (skill: string, group: string) => Object.entries(draft.skillPicks).some(([id, picks]) => id !== group && picks.includes(skill));

  function toggle(group: SkillGroup, skill: string, on: boolean) {
    const picks = draft.skillPicks[group.id] ?? [];
    draft.skillPicks[group.id] = on ? [...picks, skill] : picks.filter((s) => s !== skill);
  }
</script>

<section class="granted" aria-labelledby="skills-granted">
  <h3 id="skills-granted" class="label">{t.granted}</h3>
  {#if granted.length}
    <p>{list.format(granted.map(nameOf))}</p>
    <p class="muted small">{t.grantedFrom(list.format(grantedFrom()))}</p>
  {:else}
    <p class="muted">{strings.characters.wizard.review.none}</p>
  {/if}
</section>

{#if groups.length === 0}
  <p class="muted">{t.none}</p>
{/if}

{#each groups as group (group.id)}
  {@const picks = draft.skillPicks[group.id] ?? []}
  {@const from = group.choice.from ?? skills.map((s) => s.key)}
  <fieldset>
    <legend class="label">
      {group.choice.from ? t.choose(group.choice.count, originName(group)) : t.chooseAny(group.choice.count, originName(group))}
    </legend>
    <p class="muted small" aria-live="polite">{t.remaining(group.choice.count - picks.length)}</p>
    <div class="options">
      {#each from as skill (skill)}
        {@const checked = picks.includes(skill)}
        {@const taken = granted.includes(skill) || pickedElsewhere(skill, group.id)}
        <label class="check" class:taken>
          <input
            type="checkbox"
            {checked}
            disabled={taken || (!checked && picks.length >= group.choice.count)}
            onchange={(e) => toggle(group, skill, e.currentTarget.checked)}
          />
          {nameOf(skill)}
        </label>
      {/each}
    </div>
  </fieldset>
{/each}

<style>
  .granted,
  fieldset {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  fieldset {
    margin: 0;
    padding: 0;
    border: none;
  }

  .options {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(100%, var(--menu-min-width)), 1fr));
    gap: var(--space-2) var(--space-4);
  }

  .check {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    cursor: pointer;
  }

  .check.taken {
    color: var(--color-text-muted);
  }

  .muted {
    color: var(--color-text-muted);
  }

  .small {
    font-size: var(--text-sm);
  }
</style>
