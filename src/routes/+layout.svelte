<script lang="ts">
  import { page } from '$app/state';
  import { afterNavigate } from '$app/navigation';
  let { children } = $props();
  let title = $derived(page.data?.councilName ? `${page.data.councilName} — Landsraad` : 'Landsraad');

  let menuOpen = $state(false);
  // Close the menu after a real navigation (not on data invalidation/polling).
  afterNavigate(() => {
    menuOpen = false;
  });
</script>

<svelte:head>
  <title>{title}</title>
</svelte:head>

<header>
  <a href="/" class="brand">Landsraad</a>
  <div class="menu">
    <button
      type="button"
      class="hamburger"
      aria-label="Menu"
      aria-expanded={menuOpen}
      onclick={() => (menuOpen = !menuOpen)}
    >
      <span></span><span></span><span></span>
    </button>
    {#if menuOpen}
      <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
      <div class="backdrop" onclick={() => (menuOpen = false)}></div>
      <nav class="links">
        {#if page.data?.hasCouncil}
          <a href="/meetings">Meetings</a>
          <a href="/schedules">Schedules</a>
          <a href="/import">Install template</a>
          <a href="/export">Export…</a>
          <a href="/settings">Settings</a>
        {/if}
        <a href="/help">Help</a>
      </nav>
    {/if}
  </div>
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
  .menu { position: relative; }
  .hamburger {
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 4px;
    width: 2.1rem;
    height: 2.1rem;
    padding: 0;
    background: transparent;
    border: 1px solid var(--border);
    border-radius: 6px;
    cursor: pointer;
  }
  .hamburger span {
    display: block;
    width: 1.05rem;
    height: 2px;
    margin: 0 auto;
    background: var(--muted);
    border-radius: 1px;
  }
  .hamburger:hover { border-color: var(--accent); }
  .hamburger:hover span { background: var(--accent); }
  .backdrop { position: fixed; inset: 0; z-index: 10; }
  .links {
    position: absolute;
    right: 0;
    top: calc(100% + 0.5rem);
    z-index: 11;
    display: flex;
    flex-direction: column;
    min-width: 11rem;
    padding: 0.4rem;
    background: #161922;
    border: 1px solid var(--border);
    border-radius: 8px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
  }
  .links a {
    color: var(--muted);
    text-decoration: none;
    font-size: 0.9em;
    padding: 0.5rem 0.7rem;
    border-radius: 5px;
  }
  .links a:hover { color: var(--accent); background: rgba(214, 192, 140, 0.08); }
  main {
    max-width: 880px;
    margin: 0 auto;
    padding: 2rem 1.5rem 4rem;
  }
</style>
