<script lang="ts">
  import { page } from '$app/state';
  let { children } = $props();
  let title = $derived(page.data?.councilName ? `${page.data.councilName} — Landsraad` : 'Landsraad');
</script>

<svelte:head>
  <title>{title}</title>
</svelte:head>

<header>
  <a href="/" class="brand">Landsraad</a>
  <nav class="links">
    {#if page.data?.hasCouncil}
      <a href="/meetings">Meetings</a>
      <a href="/schedules">Schedules</a>
      <a href="/import">Install template</a>
      <a href="/export">Export…</a>
    {/if}
    <a href="/help">Help</a>
  </nav>
</header>

<main>
  {@render children?.()}
</main>

<style>
  :global(:root) {
    --bg: #0f1115;
    --fg: #e6e7eb;
    --muted: #9aa3b2;
    --accent: #d6c08c;
    --border: #2a2f3a;
    --danger: #d27272;
  }
  :global(body) {
    margin: 0;
    background: var(--bg);
    color: var(--fg);
    font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    line-height: 1.5;
  }
  :global(a) { color: var(--accent); }
  :global(button), :global(input), :global(textarea), :global(select) {
    font: inherit;
    color: inherit;
  }
  header {
    border-bottom: 1px solid var(--border);
    padding: 0.9rem 1.5rem;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .brand {
    color: var(--fg);
    text-decoration: none;
    font-weight: 600;
    letter-spacing: 0.04em;
  }
  .links { display: flex; gap: 1rem; }
  .links a { color: var(--muted); text-decoration: none; font-size: 0.9em; }
  .links a:hover { color: var(--accent); }
  main {
    max-width: 880px;
    margin: 0 auto;
    padding: 2rem 1.5rem 4rem;
  }
</style>
