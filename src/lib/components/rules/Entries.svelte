<script lang="ts" module>
  /** A raw 5etools entry: loosely typed on purpose, since shapes vary between books. */
  export type Entry = any;

  const SECTION_TYPES = ["section", "entries", "variant", "variantSub", "variantInner"];

  /** Context key: controls (keyed by lowercase entry name) shown right under that entry's heading. */
  export const CHOICES = Symbol("entry-choices");
  export type Choices = { readonly choices: Record<string, import("svelte").Snippet> };

  /** Book sections nest deeply; headings stop shrinking after h5. */
  export function headingTag(depth: number): string {
    return `h${Math.min(depth + 2, 5)}`;
  }

  function rollText(roll: Entry): string {
    if (roll?.exact !== undefined) return `${roll.exact}`;
    if (roll?.min !== undefined) return roll.max !== undefined && roll.max !== roll.min ? `${roll.min}–${roll.max}` : `${roll.min}+`;
    return "";
  }
</script>

<script lang="ts">
  import { getContext } from "svelte";
  import { strings } from "$lib/strings";
  import { headingId } from "$lib/rules/contents";
  import { ABILITY_NAMES } from "$lib/rules/format";
  import Entries from "./Entries.svelte";
  import Inline from "./Inline.svelte";
  import RuleImage from "./RuleImage.svelte";
  import StatblockEmbed from "./StatblockEmbed.svelte";

  let { entry, depth = 0 }: { entry: Entry; depth?: number } = $props();

  const t = strings.library;
  const inline = getContext<Choices | undefined>(CHOICES);
  const abilities = (attrs: string[] = []) => attrs.map((a) => (a === "spellcasting" ? "spellcasting ability" : (ABILITY_NAMES[a] ?? a))).join(" or ");
  const rows = (table: Entry): Entry[][] => (table.rows ?? []).map((r: Entry) => (Array.isArray(r) ? r : (r?.row ?? [])));
  const label = (l: Entry): Entry => (typeof l === "string" ? l : (l?.entry ?? ""));
  // A run-in name like "Dungeon Master" gets a period, unless it already ends in punctuation.
  const endsSentence = (name: string) => /[.!?:]$/.test(name);
</script>

{#snippet cell(value: Entry)}
  {#if typeof value === "string" || typeof value === "number"}<Inline text={String(value)} />{:else if value?.type === "cell"}{#if value.roll}{rollText(value.roll)}{:else if value.entry !== undefined}<Entries entry={value.entry} depth={depth + 1} />{/if}{:else}<Entries entry={value} depth={depth + 1} />{/if}
{/snippet}

{#snippet named(item: Entry)}
  {#if item.name}<strong><Inline text={item.name} />{endsSentence(item.name) ? "" : "."}</strong>{" "}{/if}{#if item.entry !== undefined}{#if typeof item.entry === "string"}<Inline text={item.entry} />{:else}<Entries entry={item.entry} depth={depth + 1} />{/if}{/if}{#if item.entries}<Entries entry={item.entries} depth={depth + 1} />{/if}
{/snippet}

{#if typeof entry === "string"}
  <p><Inline text={entry} /></p>
{:else if Array.isArray(entry)}
  {#each entry as child, i (i)}<Entries entry={child} {depth} />{/each}
{:else if entry && typeof entry === "object"}
  {#if SECTION_TYPES.includes(entry.type) || (!entry.type && entry.entries)}
    <div class="section">
      {#if entry.name}
        <svelte:element this={headingTag(depth)} id={headingId(entry.name)} class="heading level-{Math.min(depth, 3)}"><Inline text={entry.name} /></svelte:element>
        {@const choice = inline?.choices[String(entry.name).toLowerCase()]}
        {#if choice}<div class="entry-choice">{@render choice()}</div>{/if}
      {/if}
      <Entries entry={entry.entries ?? []} depth={depth + (entry.name ? 1 : 0)} />
    </div>
  {:else if entry.type === "inset" || entry.type === "insetReadaloud"}
    <aside class="inset" class:readaloud={entry.type === "insetReadaloud"}>
      {#if entry.name}<p class="inset-title" id={headingId(entry.name)}><Inline text={entry.name} /></p>{/if}
      <Entries entry={entry.entries ?? []} depth={depth + 1} />
    </aside>
  {:else if entry.type === "quote"}
    <blockquote>
      <Entries entry={entry.entries ?? []} {depth} />
      {#if entry.by}<footer>— <Inline text={entry.by} />{#if entry.from}, <cite><Inline text={entry.from} /></cite>{/if}</footer>{/if}
    </blockquote>
  {:else if entry.type === "list"}
    <ul class:plain={typeof entry.style === "string" && entry.style.includes("hang")}>
      {#each entry.items ?? [] as item, i (i)}
        <li>{#if typeof item === "string"}<Inline text={item} />{:else if item?.type === "item" || item?.type === "itemSpell" || item?.type === "itemSub"}{@render named(item)}{:else}<Entries entry={item} depth={depth + 1} />{/if}</li>
      {/each}
    </ul>
  {:else if entry.type === "item" || entry.type === "itemSub"}
    <p>{@render named(entry)}</p>
  {:else if entry.type === "table"}
    <div class="table-wrap">
      <table>
        {#if entry.caption}<caption><Inline text={entry.caption} /></caption>{/if}
        {#if entry.colLabels?.length}
          <thead><tr>{#each entry.colLabels as col, i (i)}<th scope="col"><Inline text={String(label(col))} /></th>{/each}</tr></thead>
        {/if}
        <tbody>
          {#each rows(entry) as row, r (r)}
            <tr>{#each row as value, c (c)}<td>{@render cell(value)}</td>{/each}</tr>
          {/each}
        </tbody>
      </table>
    </div>
    {#if entry.footnotes?.length}<div class="footnotes"><Entries entry={entry.footnotes} depth={depth + 1} /></div>{/if}
  {:else if entry.type === "image"}
    <RuleImage image={entry} />
  {:else if entry.type === "gallery"}
    <div class="gallery">{#each entry.images ?? [] as image, i (i)}<RuleImage {image} />{/each}</div>
  {:else if entry.type === "statblock"}
    <StatblockEmbed tag={entry.tag} name={entry.name} source={entry.source} />
  {:else if entry.type === "abilityDc"}
    <p class="formula">{t.abilityDc(entry.name ?? "", abilities(entry.attributes))}</p>
  {:else if entry.type === "abilityAttackMod"}
    <p class="formula">{t.abilityAttack(entry.name ?? "", abilities(entry.attributes))}</p>
  {:else if entry.type === "abilityGeneric"}
    <p class="formula">{#if entry.name}<strong>{entry.name}</strong> = {/if}<Inline text={entry.text ?? entry.entry ?? ""} /></p>
  {:else if entry.type === "hr"}
    <hr />
  {:else if entry.entries || entry.items || entry.entry !== undefined}
    <Entries entry={entry.entries ?? entry.items ?? entry.entry} {depth} />
  {/if}
{/if}

<style>
  .entry-choice {
    margin: 0 0 var(--space-3);
  }

  p {
    margin: 0 0 var(--space-3);
  }

  .heading {
    margin: var(--space-6) 0 var(--space-3);
    line-height: var(--leading-tight);
    font-weight: var(--weight-bold);
    scroll-margin-top: var(--space-4);
  }

  .level-0 {
    margin-top: 0;
    font-size: var(--text-2xl);
    letter-spacing: var(--tracking-tight);
  }

  .level-1 {
    font-size: var(--text-xl);
  }

  .level-2 {
    font-size: var(--text-lg);
  }

  .level-3 {
    font-size: var(--text-md);
  }

  .inset {
    margin: var(--space-4) 0;
    padding: var(--space-4) var(--space-5);
    border-radius: var(--radius-md);
    background: var(--color-surface-sunken);
  }

  .inset.readaloud {
    border-left: var(--focus-ring) solid var(--color-accent);
  }

  .inset-title {
    font-weight: var(--weight-bold);
    scroll-margin-top: var(--space-4);
  }

  .inset :global(p:last-child) {
    margin-bottom: 0;
  }

  blockquote {
    margin: var(--space-4) 0;
    padding-left: var(--space-4);
    border-left: var(--focus-ring) solid var(--color-border-strong);
    color: var(--color-text-muted);
    font-style: italic;
  }

  blockquote footer {
    font-style: normal;
  }

  ul {
    margin: 0 0 var(--space-3);
    padding-left: var(--space-6);
  }

  ul.plain {
    padding-left: 0;
    list-style: none;
  }

  li {
    margin-bottom: var(--space-2);
  }

  li :global(p:last-child) {
    margin-bottom: 0;
  }

  .table-wrap {
    overflow-x: auto;
    margin: var(--space-4) 0;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    font-size: var(--text-sm);
  }

  caption {
    padding-bottom: var(--space-2);
    text-align: left;
    font-weight: var(--weight-bold);
  }

  th,
  td {
    padding: var(--space-2) var(--space-3);
    border-bottom: var(--border-width) solid var(--color-border);
    text-align: left;
    vertical-align: top;
  }

  th {
    font-weight: var(--weight-semibold);
  }

  tbody tr:nth-child(odd) {
    background: var(--color-surface-sunken);
  }

  td :global(p) {
    margin: 0;
  }

  .footnotes {
    color: var(--color-text-muted);
    font-size: var(--text-sm);
  }

  .gallery {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(240px, 100%), 1fr));
    gap: var(--space-3);
  }

  .formula {
    padding: var(--space-3) var(--space-4);
    border-radius: var(--radius-md);
    background: var(--color-surface-sunken);
    text-align: center;
    font-weight: var(--weight-medium);
  }

  hr {
    border: none;
    border-top: var(--border-width) solid var(--color-border);
    margin: var(--space-5) 0;
  }
</style>
