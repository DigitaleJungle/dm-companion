<script lang="ts">
  import { tick } from "svelte";
  import { SvelteSet } from "svelte/reactivity";
  import { getBook, getChapter, type Book } from "$lib/api/rules";
  import { errorMessage } from "$lib/api/storage";
  import { contentsTree, headingId, type HeaderNode } from "$lib/rules/contents";
  import { rules } from "$lib/stores/rules.svelte";
  import { strings } from "$lib/strings";
  import Entries, { type Entry } from "$lib/components/rules/Entries.svelte";

  let {
    bookId,
    chapter,
    heading,
    onnavigate,
  }: {
    bookId: string | null;
    chapter: number;
    /** Element id of a heading to scroll to, without "#". */
    heading: string;
    onnavigate: (book: string, chapter: number, heading?: string) => void;
  } = $props();

  const t = strings.library;
  const books = $derived(
    (rules.status?.library?.sources ?? []).filter((s) => s.isBook).sort((a, b) => a.name.localeCompare(b.name)),
  );
  const current = $derived(bookId ?? books[0]?.id ?? null);

  let book = $state<Book | null>(null);
  let bookError = $state<string | null>(null);
  let content = $state<Entry | null>(null);
  let contentStatus = $state<"loading" | "ready" | "missing" | "error">("loading");
  let contentError = $state("");
  let pane: HTMLElement | undefined = $state();
  const expanded = new SvelteSet<string>();
  const tree = $derived(contentsTree(book?.contents));

  $effect(() => {
    const id = current;
    book = null;
    bookError = null;
    if (!id) return;
    let live = true;
    getBook(id).then(
      (b) => live && (book = b),
      (e) => live && (bookError = t.loadError(errorMessage(e))),
    );
    return () => (live = false);
  });

  $effect(() => {
    const id = current;
    const index = chapter;
    if (!id) return;
    let live = true;
    contentStatus = "loading";
    expanded.add(`${id}/${index}`);
    getChapter(id, index).then(
      async (c) => {
        if (!live) return;
        content = c;
        contentStatus = c ? "ready" : "missing";
        await tick();
        scrollToHeading();
      },
      (e) => {
        if (!live) return;
        contentError = errorMessage(e);
        contentStatus = "error";
      },
    );
    return () => (live = false);
  });

  // Scrolling to a heading within the chapter that's already open doesn't reload it.
  $effect(() => {
    void heading;
    if (contentStatus === "ready") tick().then(scrollToHeading);
  });

  function scrollToHeading() {
    const target = heading ? document.getElementById(heading) : null;
    if (target) target.scrollIntoView({ block: "start" });
    else if (pane) pane.scrollTop = 0;
  }

  function toggle(key: string) {
    if (expanded.has(key)) expanded.delete(key);
    else expanded.add(key);
  }
</script>

{#snippet headers(nodes: HeaderNode[], chapterIndex: number, parentKey: string)}
  <ul class="tree">
    {#each nodes as node, i (`${node.name}-${i}`)}
      {@const key = `${parentKey}/${i}`}
      <li>
        <div class="row">
          {#if node.children.length}
            <button class="chevron" aria-expanded={expanded.has(key)} aria-label={t.toggleSection(node.name)} onclick={() => toggle(key)}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" /></svg>
            </button>
          {:else}<span class="chevron-space"></span>{/if}
          <button
            class="entry"
            aria-current={chapterIndex === chapter && heading === headingId(node.name) ? "location" : undefined}
            onclick={() => current && onnavigate(current, chapterIndex, headingId(node.name))}
          >
            {node.name}
          </button>
        </div>
        {#if node.children.length && expanded.has(key)}{@render headers(node.children, chapterIndex, key)}{/if}
      </li>
    {/each}
  </ul>
{/snippet}

<div class="reading">
  <nav class="column books" aria-labelledby="books-title">
    <h2 id="books-title" class="column-title">{t.books}</h2>
    {#if books.length === 0}
      <p class="muted">{t.noBooks}</p>
    {:else}
      <ul>
        {#each books as b (b.id)}
          <li>
            <button class="book" aria-current={b.id === current ? "page" : undefined} onclick={() => onnavigate(b.id, 0)}>{b.name}</button>
          </li>
        {/each}
      </ul>
    {/if}
  </nav>

  <nav class="column contents" aria-labelledby="contents-title">
    <h2 id="contents-title" class="column-title">{t.contents}</h2>
    {#if bookError}
      <p class="error" role="alert">{bookError}</p>
    {:else if !book}
      <p class="muted" role="status">{t.loading}</p>
    {:else}
      <ul class="tree top">
        {#each tree as node (node.index)}
          {@const key = `${current}/${node.index}`}
          <li>
            <div class="row chapter-row">
              {#if node.children.length}
                <button class="chevron" aria-expanded={expanded.has(key)} aria-label={t.toggleSection(node.name)} onclick={() => toggle(key)}>
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" /></svg>
                </button>
              {:else}<span class="chevron-space"></span>{/if}
              <button
                class="entry chapter"
                aria-current={node.index === chapter && !heading ? "location" : undefined}
                class:open={node.index === chapter}
                onclick={() => current && onnavigate(current, node.index)}
              >
                {node.name}
              </button>
            </div>
            {#if node.children.length && expanded.has(key)}{@render headers(node.children, node.index, key)}{/if}
          </li>
        {/each}
      </ul>
    {/if}
  </nav>

  <article class="pane" bind:this={pane} aria-label={book?.name ?? t.reading}>
    <div class="page">
      {#if contentStatus === "loading"}
        <p class="muted" role="status">{t.loading}</p>
      {:else if contentStatus === "missing"}
        <p class="muted">{t.notFound}</p>
      {:else if contentStatus === "error"}
        <p class="error" role="alert">{t.loadError(contentError)}</p>
      {:else}
        <Entries entry={content} depth={0} />
      {/if}
    </div>
  </article>
</div>

<style>
  .reading {
    display: grid;
    grid-template-columns: var(--library-books-width) var(--library-contents-width) 1fr;
    min-height: 0;
    height: 100%;
  }

  .column {
    min-height: 0;
    overflow-y: auto;
    padding: var(--space-5) var(--space-3);
    border-right: var(--border-width) solid var(--color-border);
    background: var(--color-surface);
  }

  .column-title {
    padding: 0 var(--space-3) var(--space-3);
    font-size: var(--text-lg);
    font-weight: var(--weight-bold);
  }

  ul {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .book {
    display: block;
    width: 100%;
    padding: var(--space-2) var(--space-3);
    border: none;
    border-radius: var(--radius-md);
    background: transparent;
    text-align: left;
    line-height: var(--leading-tight);
    cursor: pointer;
  }

  .book:hover,
  .entry:hover {
    background: var(--color-surface-sunken);
  }

  .book[aria-current="page"] {
    background: var(--color-accent-soft);
    color: var(--color-link);
    font-weight: var(--weight-semibold);
  }

  .tree .tree {
    padding-left: var(--space-4);
  }

  .row {
    display: flex;
    align-items: flex-start;
  }

  .chevron,
  .chevron-space {
    flex: none;
    width: var(--control-height-sm);
    height: var(--control-height-sm);
  }

  .chevron {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    border: none;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--color-text-muted);
    cursor: pointer;
  }

  .chevron svg {
    width: var(--icon-size);
    height: var(--icon-size);
    transition: transform var(--duration-drawer) ease;
  }

  .chevron[aria-expanded="true"] svg {
    transform: rotate(90deg);
  }

  .entry {
    flex: 1;
    min-width: 0;
    padding: var(--space-1) var(--space-2);
    border: none;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--color-text-muted);
    text-align: left;
    font-size: var(--text-sm);
    line-height: var(--leading-tight);
    cursor: pointer;
  }

  .entry.chapter {
    color: var(--color-text);
    font-size: var(--text-md);
    font-weight: var(--weight-medium);
  }

  .entry.chapter.open {
    font-weight: var(--weight-semibold);
  }

  .entry[aria-current="location"] {
    background: var(--color-accent-soft);
    color: var(--color-link);
  }

  .chapter-row {
    margin-top: var(--space-1);
  }

  .pane {
    min-width: 0;
    min-height: 0;
    overflow-y: auto;
    background: var(--color-bg);
  }

  .page {
    max-width: var(--reading-width);
    padding: var(--space-7) var(--space-8);
    line-height: var(--leading-normal);
  }

  .muted {
    padding: 0 var(--space-3);
    color: var(--color-text-muted);
    font-size: var(--text-sm);
  }

  .error {
    padding: var(--space-3);
    color: var(--color-danger);
    font-size: var(--text-sm);
  }

  @media (prefers-reduced-motion: reduce) {
    .chevron svg {
      transition: none;
    }
  }

  /* Narrow windows: books and contents stack above the text, each with a limited height. */
  @media (max-width: 900px) {
    .reading {
      display: flex;
      flex-direction: column;
      height: auto;
    }

    .column {
      max-height: var(--library-stacked-height);
      border-right: none;
      border-bottom: var(--border-width) solid var(--color-border);
    }

    .pane {
      overflow: visible;
    }

    .page {
      padding: var(--space-5) var(--space-4);
    }
  }
</style>
