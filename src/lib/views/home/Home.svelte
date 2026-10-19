<script lang="ts">
  import Card from "$lib/components/Card.svelte";
  import { strings } from "$lib/strings";
  import { modKey } from "$lib/platform";

  const t = strings.home;
</script>

<div class="home">
  <section class="header" aria-label={strings.shell.campaign}>
    <div class="intro">
      <h1>{t.noCampaignTitle}</h1>
      <p class="muted">{t.noCampaignText}</p>
    </div>
    <div class="start">
      <button class="btn-primary btn" disabled>{t.startSession}</button>
      <span class="soon">{strings.comingSoon}</span>
    </div>
  </section>

  <section class="search">
    <label for="home-search" class="sr-only">{t.searchLabel}</label>
    <input id="home-search" type="search" placeholder={t.searchPlaceholder(modKey("K"))} disabled />
    <span class="soon">{strings.comingSoon}</span>
  </section>

  <div class="grid">
    <Card title={t.encounters.title}>
      {#snippet action()}
        <button class="btn small" disabled>{t.encounters.new}</button>
        <span class="soon">{strings.comingSoon}</span>
      {/snippet}
      <p class="empty">{t.encounters.empty}</p>
    </Card>

    <Card title={t.party.title}>
      <p class="empty">{t.party.empty}</p>
    </Card>

    <Card title={t.legendKeeper.title}>
      <p class="empty">{t.legendKeeper.empty}</p>
    </Card>

    <Card title={t.notes.title}>
      <label for="home-notes" class="sr-only">{t.notes.label}</label>
      <textarea id="home-notes" rows="5" disabled></textarea>
      <span class="soon">{strings.comingSoon}</span>
    </Card>

    <Card title={t.continue.title}>
      <p class="empty">{t.continue.empty}</p>
    </Card>

    <Card title={t.tools.title}>
      <div class="tools">
        <button class="btn" disabled>{t.tools.rollDice}</button>
        <button class="btn" disabled>{t.tools.conditions}</button>
        <button class="btn" disabled>{t.tools.randomNpcName}</button>
        <button class="btn" disabled>{t.tools.blankPlayerScreen}</button>
      </div>
      <span class="soon">{strings.comingSoon}</span>
    </Card>
  </div>
</div>

<style>
  .home {
    display: flex;
    flex-direction: column;
    gap: var(--space-6);
    max-width: var(--content-max-width);
    padding: var(--space-7);
  }

  .header {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    justify-content: space-between;
    gap: var(--space-5);
  }

  .intro {
    flex: 1 1 360px;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  h1 {
    font-size: var(--text-2xl);
    font-weight: var(--weight-bold);
    line-height: var(--leading-tight);
    letter-spacing: var(--tracking-tight);
  }

  .muted,
  .empty {
    color: var(--color-text-muted);
  }

  .empty {
    font-size: var(--text-sm);
  }

  .start {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: var(--space-1);
  }

  .search {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  input,
  textarea {
    width: 100%;
    border: var(--border-width) solid var(--color-border-strong);
    border-radius: var(--radius-md);
    background: var(--color-surface);
  }

  input {
    min-height: var(--control-height-xl);
    padding: 0 var(--space-5);
    font-size: var(--text-xl);
    border-radius: var(--radius-lg);
  }

  textarea {
    padding: var(--space-3);
    font-size: var(--text-sm);
    resize: vertical;
  }

  input:disabled,
  textarea:disabled {
    cursor: not-allowed;
    background: var(--color-surface-sunken);
    border-color: var(--color-border);
  }

  input::placeholder {
    color: var(--color-text-muted);
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(300px, 100%), 1fr));
    gap: var(--space-4);
    align-items: start;
  }

  .small {
    min-height: var(--control-height-sm);
    padding: 0 var(--space-3);
  }

  .tools {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--space-2);
  }

  @media (max-width: 720px) {
    .home {
      padding: var(--space-4);
    }

    .start {
      align-items: flex-start;
    }
  }
</style>
