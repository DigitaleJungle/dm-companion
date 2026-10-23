<script lang="ts">
  import Spinner from "$lib/components/Spinner.svelte";
  import { characterAvatar } from "$lib/api/characters";
  import { imageUrl } from "$lib/rules/images";
  import { strings } from "$lib/strings";

  // The character's picture at its original size: the full picture kept beside the file, else the small copy in the
  // file, else the class art from the imported images.
  let {
    open = $bindable(false),
    campaign,
    id,
    name,
    own,
    candidates,
  }: { open?: boolean; campaign: string | null; id: string; name: string; own: string | null; candidates: string[] } = $props();

  const t = strings.characters.sheet;
  let dialog: HTMLDialogElement | undefined = $state();
  let sources = $state<string[]>([]);
  let index = $state(0);
  let loading = $state(false);

  async function load() {
    loading = true;
    index = 0;
    const original = await characterAvatar(campaign, id).catch(() => null);
    const art = await Promise.all(candidates.map((c) => imageUrl(c)));
    sources = [...(original ? [original] : []), ...(own ? [own] : []), ...art];
    loading = false;
  }

  $effect(() => {
    if (open && dialog && !dialog.open) {
      load();
      dialog.showModal();
    } else if (!open && dialog?.open) {
      dialog.close();
    }
  });
</script>

<dialog
  bind:this={dialog}
  class="viewer"
  aria-label={t.avatarOf(name)}
  oncancel={(e) => {
    e.preventDefault();
    open = false;
  }}
  onclick={(e) => {
    // A click outside the picture (on the backdrop) closes it.
    if (e.target === dialog) open = false;
  }}
>
  {#if open}
    <button class="icon-btn close" aria-label={t.closeAvatar} onclick={() => (open = false)}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" /></svg>
    </button>
    {#if loading}
      <Spinner label={strings.characters.levelUpDialog.loading} />
    {:else if sources[index]}
      <img src={sources[index]} alt={t.avatarOf(name)} onerror={() => index++} />
    {:else}
      <p class="muted">{t.noAvatar}</p>
    {/if}
  {/if}
</dialog>

<style>
  .viewer {
    max-width: min(100% - 2 * var(--space-4), 90vw);
    max-height: 90vh;
    padding: var(--space-3);
    border: var(--border-width) solid var(--color-border);
    border-radius: var(--radius-lg);
    background: var(--color-surface);
    color: var(--color-text);
    overflow: hidden;
  }

  .viewer::backdrop {
    background: var(--color-backdrop);
  }

  img {
    display: block;
    max-width: 100%;
    max-height: calc(90vh - 2 * var(--space-3));
    border-radius: var(--radius-md);
    object-fit: contain;
  }

  .close {
    position: absolute;
    top: var(--space-4);
    right: var(--space-4);
    background: var(--color-surface);
    box-shadow: var(--shadow-card);
  }

  .close svg {
    width: var(--icon-size);
    height: var(--icon-size);
  }

  .muted {
    padding: var(--space-5);
    color: var(--color-text-muted);
  }
</style>
