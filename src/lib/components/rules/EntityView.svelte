<script lang="ts">
  import { setContext, type Snippet } from "svelte";
  import type { Entity } from "$lib/api/rules";
  import { strings } from "$lib/strings";
  import {
    abilityScores,
    classFacts,
    creatureFacts,
    itemFacts,
    prerequisite,
    sizeTypeAlignment,
    spellcasting,
    spellFacts,
    spellLevel,
    type Fact,
  } from "$lib/rules/format";
  import Entries, { CHOICES, type Choices, type Entry } from "./Entries.svelte";
  import Inline from "./Inline.svelte";

  let {
    entity,
    compact = false,
    lead,
    choices = {},
  }: {
    entity: Entity;
    compact?: boolean;
    /** Controls shown under the title, before the text. */
    lead?: Snippet;
    /** Controls shown under the entry with that (lowercase) name. */
    choices?: Record<string, Snippet>;
  } = $props();

  setContext<Choices>(CHOICES, {
    get choices() {
      return choices;
    },
  });

  const t = strings.library;
  const data = $derived(entity.data as Entry);
  const kind = $derived(entity.kind);

  const subtitle = $derived(
    kind === "spell" ? spellLevel(data) : kind === "creature" ? sizeTypeAlignment(data) : ["feat", "optionalfeature"].includes(kind) ? prerequisite(data) : "",
  );
  const facts = $derived<Fact[]>(
    kind === "spell" ? spellFacts(data) : kind === "creature" ? creatureFacts(data) : kind === "item" ? itemFacts(data) : kind === "class" ? classFacts(data) : [],
  );
  const scores = $derived(kind === "creature" ? abilityScores(data) : []);
  const casts = $derived(kind === "creature" ? spellcasting(data) : []);
  const blocks = $derived(
    kind === "creature"
      ? ["trait", "action", "bonus", "reaction", "legendary", "mythic"].filter((k) => (Array.isArray(data[k]) && data[k].length) || casts.some((c) => c.block === k))
      : [],
  );

  /** Class and subclass features as "Name|Class|…|Level" strings, grouped by level. */
  const features = $derived.by(() => {
    const raw: Entry[] = data.classFeatures ?? data.subclassFeatures ?? [];
    const byLevel = new Map<number, string[]>();
    for (const f of raw) {
      const ref: string = typeof f === "string" ? f : (f?.classFeature ?? f?.subclassFeature ?? "");
      const parts = ref.split("|");
      const level = Number(parts.at(-1));
      if (!parts[0] || Number.isNaN(level)) continue;
      byLevel.set(level, [...(byLevel.get(level) ?? []), parts[0]]);
    }
    return [...byLevel.entries()].sort((a, b) => a[0] - b[0]);
  });

  const copied = $derived(data._copy?.name ? { kind, name: String(data._copy.name), source: data._copy.source as string | undefined } : null);
</script>

<article class="entity" class:compact>
  <header>
    <svelte:element this={compact ? "h3" : "h2"} class="name">{entity.name}</svelte:element>
    <p class="meta">{t.kinds[kind] ?? kind}, {t.page(entity.source, entity.page)}</p>
    {#if subtitle}<p class="subtitle"><Inline text={subtitle} /></p>{/if}
  </header>

  {#if lead}<div class="lead">{@render lead()}</div>{/if}

  {#if copied}
    <p class="based"><Inline segments={[{ type: "link", kind: copied.kind, name: copied.name, source: copied.source, text: t.basedOn(copied.name, copied.source ?? "") }]} /></p>
  {/if}

  {#if facts.length}
    <dl class="facts">
      {#each facts as fact (fact.label)}
        <div><dt>{fact.label}</dt><dd><Inline text={fact.value} /></dd></div>
      {/each}
    </dl>
  {/if}

  {#if scores.length}
    <table class="scores">
      <thead><tr>{#each scores as s (s.ability)}<th scope="col">{s.ability}</th>{/each}</tr></thead>
      <tbody><tr>{#each scores as s (s.ability)}<td>{s.score} <span class="mod">({s.modifier})</span></td>{/each}</tr></tbody>
    </table>
  {/if}

  {#if data.entries}
    <div class="entries"><Entries entry={data.entries} depth={3} /></div>
  {/if}

  {#if kind === "spell" && data.entriesHigherLevel}
    <div class="entries"><Entries entry={data.entriesHigherLevel} depth={3} /></div>
  {/if}

  {#each blocks as block (block)}
    <section class="block">
      <h4>{t.blocks[block] ?? block}</h4>
      {#each data[block] ?? [] as item, i (i)}
        {@const [first, ...rest] = item.entries ?? []}
        <div class="named">
          {#if typeof first === "string"}
            <p>{#if item.name}<strong><Inline text={item.name} />.</strong>{" "}{/if}<Inline text={first} /></p>
            <Entries entry={rest} depth={4} />
          {:else}
            {#if item.name}<p><strong><Inline text={item.name} />.</strong></p>{/if}
            <Entries entry={item.entries ?? []} depth={4} />
          {/if}
        </div>
      {/each}
      {#each casts.filter((c) => c.block === block) as cast (cast.name)}
        {@const [first, ...rest] = cast.header}
        <div class="named">
          <p><strong><Inline text={cast.name} />.</strong>{" "}{#if typeof first === "string"}<Inline text={first} />{/if}</p>
          <Entries entry={typeof first === "string" ? rest : cast.header} depth={4} />
          {#if cast.lines.length}
            <ul class="spell-lines">{#each cast.lines as line, i (i)}<li><Inline text={line} /></li>{/each}</ul>
          {/if}
          <Entries entry={cast.footer} depth={4} />
        </div>
      {/each}
    </section>
  {/each}

  {#if features.length}
    <section class="block">
      <h4>{t.features}</h4>
      <dl class="facts">
        {#each features as [level, names] (level)}
          <div><dt>{t.featureLevel(level)}</dt><dd>{names.join(", ")}</dd></div>
        {/each}
      </dl>
    </section>
  {/if}
</article>

<style>
  .entity {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  header {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .name {
    font-size: var(--text-2xl);
    font-weight: var(--weight-bold);
    line-height: var(--leading-tight);
  }

  .compact .name {
    font-size: var(--text-lg);
  }

  .meta {
    color: var(--color-text-muted);
    font-size: var(--text-sm);
  }

  .subtitle {
    font-style: italic;
  }

  .lead {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-3) var(--space-5);
  }

  .based {
    font-size: var(--text-sm);
  }

  .facts {
    display: grid;
    gap: var(--space-1);
    margin: 0;
    padding: var(--space-3) 0;
    border-top: var(--border-width) solid var(--color-border);
    border-bottom: var(--border-width) solid var(--color-border);
  }

  .facts div {
    display: flex;
    gap: var(--space-2);
  }

  dt {
    flex: none;
    font-weight: var(--weight-semibold);
  }

  dd {
    margin: 0;
  }

  .scores {
    width: 100%;
    border-collapse: collapse;
    text-align: center;
    font-size: var(--text-sm);
  }

  .scores th {
    color: var(--color-text-muted);
    font-weight: var(--weight-semibold);
  }

  .scores td,
  .scores th {
    padding: var(--space-1);
  }

  .mod {
    color: var(--color-text-muted);
  }

  .block h4 {
    margin: var(--space-2) 0;
    padding-bottom: var(--space-1);
    border-bottom: var(--border-width) solid var(--color-border);
    font-size: var(--text-md);
    font-weight: var(--weight-bold);
  }

  .spell-lines {
    margin: 0 0 var(--space-2);
    padding-left: var(--space-5);
  }

  .named :global(p) {
    margin: 0 0 var(--space-2);
  }
</style>
