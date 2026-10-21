<script lang="ts">
  import { tick } from "svelte";
  import { SvelteSet } from "svelte/reactivity";
  import { getBook, getChapter, type Book } from "$lib/api/rules";
  import { errorMessage } from "$lib/api/storage";
  import { bookMatches, compareNames } from "$lib/rules/catalog";
  import { contentsTree, headingId, type HeaderNode } from "$lib/rules/contents";
  import { rules } from "$lib/stores/rules.svelte";
  import { reduceMotion } from "$lib/stores/theme.svelte";
  import { strings } from "$lib/strings";
  import Entries, { type Entry } from "$lib/components/rules/Entries.svelte";

  let {
    bookId,
    chapter,
    heading,
    allowedSources = null,
    onnavigate,
  }: {
    bookId: string | null;
    chapter: number;
    /** Element id of a heading to scroll to, without "#". */
    heading: string;
    /** Lower-case source ids to show; null shows every book. */
    allowedSources?: Set<string> | null;
    onnavigate: (book: string, chapter: number, heading?: string) => void;
  } = $props();

  const t = strings.library;
  const books = $derived(
    (rules.status?.library?.sources ?? [])
      .filter((s) => s.isBook && (!allowedSources || allowedSources.has(s.id.toLowerCase())))
      .sort((a, b) => compareNames(a.name, b.name)),
  );
  const current = $derived(bookId ?? books[0]?.id ?? null);
  let bookFilter = $state("");
  const listedBooks = $derived(books.filter((b) => bookMatches(b, bookFilter)));

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
        scrollToHeading(true);
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
    if (contentStatus === "ready") tick().then(() => scrollToHeading());
  });

  /**
   * Glides to the chosen heading (or the top). A freshly opened chapter starts at the top first,
   * so the animation runs from the start of the new text rather than from the old scroll position.
   */
  function scrollToHeading(fresh = false) {
    if (!pane) return;
    if (fresh) {
      stopScrolling();
      pane.scrollTop = 0;
    }
    const target = heading ? document.getElementById(heading) : null;
    // Measured every frame: stat blocks that load mid-scroll can push the heading further down.
    glide(() => {
      if (!pane || !target) return 0;
      const gap = parseFloat(getComputedStyle(target).scrollMarginTop) || 0;
      return target.getBoundingClientRect().top - pane.getBoundingClientRect().top + pane.scrollTop - gap;
    });
  }

  // Our own animation rather than native smooth scrolling: its speed doesn't depend on how long the
  // chapter is, and it lands correctly when the page grows while scrolling.
  let frame = 0;

  function stopScrolling() {
    cancelAnimationFrame(frame);
    frame = 0;
  }

  /** Scrolling yourself (wheel, touch, keys) takes over from an animation in progress. */
  function yourScrollingWins(node: HTMLElement) {
    const events = ["wheel", "touchstart", "keydown"] as const;
    events.forEach((e) => node.addEventListener(e, stopScrolling, { passive: true }));
    return () => events.forEach((e) => node.removeEventListener(e, stopScrolling));
  }

  function glide(targetTop: () => number) {
    stopScrolling();
    if (!pane) return;
    const from = pane.scrollTop;
    if (reduceMotion()) {
      pane.scrollTop = targetTop();
      return;
    }
    const duration = Math.min(700, 300 + Math.abs(targetTop() - from) / 50);
    const start = performance.now();
    const step = (now: number) => {
      if (!pane) return;
      const t = Math.min(1, (now - start) / duration);
      const eased = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      pane.scrollTop = from + (targetTop() - from) * eased;
      frame = t < 1 ? requestAnimationFrame(step) : 0;
    };
    frame = requestAnimationFrame(step);
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
      <label for="reading-books-filter" class="sr-only">{strings.settings.rules.filterLabel}</label>
      <input id="reading-books-filter" class="filter" type="search" bind:value={bookFilter} placeholder={strings.settings.rules.filterPlaceholder} autocomplete="off" />
      {#if !listedBooks.length}<p class="muted">{strings.settings.rules.noMatches}</p>{/if}
      <ul class="book-list">
        {#each listedBooks as b (b.id)}
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

  <article class="pane" bind:this={pane} aria-label={book?.name ?? t.reading} {@attach yourScrollingWins}>
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

  /* Same look as the sourcebook filter in Campaign settings. */
  .filter {
    width: 100%;
    min-height: var(--control-height-sm);
    margin-bottom: var(--space-3);
    padding: 0 var(--space-3);
    border: var(--border-width) solid var(--color-border-strong);
    border-radius: var(--radius-sm);
    background: var(--color-surface);
    font-size: var(--text-sm);
  }

  .filter::placeholder {
    color: var(--color-text-placeholder);
  }

  .column {
    min-height: 0;
    overflow-y: auto;
    padding: var(--space-5) var(--space-3);
    border-right: var(--border-width) solid var(--color-border);
    background: var(--color-surface);
  }

  /* Only the book list scrolls; it ends above the strip where the corner Settings gear sits. */
  .books {
    display: flex;
    flex-direction: column;
    overflow: hidden;
    padding-bottom: var(--corner-clearance);
  }

  .book-list {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
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

  :global([data-motion="reduce"]) .chevron svg {
    transition: none;
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

    /* Stacked at the top, the books are nowhere near the corner gear. */
    .books {
      padding-bottom: var(--space-5);
    }

    .pane {
      overflow: visible;
    }

    .page {
      padding: var(--space-5) var(--space-4);
    }
  }
</style>
