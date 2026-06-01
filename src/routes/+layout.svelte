<script lang="ts">
  import '../app.css';
  import { page } from '$app/state';
  import { afterNavigate } from '$app/navigation';
  import { Badge, Button } from '$lib/components';
  let { children } = $props();

  let title = $derived(page.data?.councilName ? `${page.data.councilName} — Landsraad` : 'Landsraad');
  const hasCouncil = $derived(page.data?.hasCouncil ?? false);
  const nav = $derived(page.data?.nav ?? { proposals: 0, meetings: 0, running: 0, failed: 0 });
  const path = $derived(page.url.pathname);

  // A nav entry is active for its own page and anything nested under it
  // (except Home, which only lights up on the exact root).
  function isActive(href: string): boolean {
    if (href === '/') return path === '/';
    return path === href || path.startsWith(href + '/');
  }

  type Item = { href: string; label: string; count?: number };
  const items = $derived<Item[]>([
    { href: '/', label: 'Home' },
    { href: '/jobs', label: 'Activity', count: nav.running },
    { href: '/meetings', label: 'Meetings', count: nav.meetings },
    { href: '/schedules', label: 'Schedules' },
    { href: '/memory', label: 'Memory' },
    { href: '/proposals', label: 'Proposals', count: nav.proposals },
    { href: '/council', label: 'Council' }
  ]);

  let menuOpen = $state(false);
  afterNavigate(() => { menuOpen = false; });
</script>

<svelte:head>
  <title>{title}</title>
</svelte:head>

<header>
  <a href="/" class="brand">Landsraad</a>

  {#if hasCouncil}
    <nav class="primary" aria-label="Primary">
      {#each items as item (item.href)}
        <a href={item.href} class="nav-link" class:active={isActive(item.href)}
           aria-current={isActive(item.href) ? 'page' : undefined}>
          {item.label}
          {#if item.count}<Badge tone="count">{item.count}</Badge>{/if}
        </a>
      {/each}
    </nav>
  {/if}

  <div class="right">
    {#if hasCouncil}
      <div class="new-job"><Button href="/jobs/new" variant="primary">+ New job</Button></div>
    {/if}
    <div class="menu">
      <button
        type="button"
        class="hamburger"
        aria-label="More"
        aria-expanded={menuOpen}
        onclick={() => (menuOpen = !menuOpen)}
      >
        <span></span><span></span><span></span>
      </button>
      {#if menuOpen}
        <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
        <div class="backdrop" onclick={() => (menuOpen = false)}></div>
        <nav class="links" aria-label="Utilities">
          {#if hasCouncil}
            <span class="links-group">Navigate</span>
            {#each items.slice(1) as item (item.href)}
              <a href={item.href}>{item.label}{#if item.count} ({item.count}){/if}</a>
            {/each}
            <span class="links-group">Council</span>
            <a href="/import">Install template</a>
            <a href="/export">Export…</a>
          {/if}
          <a href="/help">Help</a>
        </nav>
      {/if}
    </div>
  </div>
</header>

<main>
  {@render children?.()}
</main>

<style>
  header {
    border-bottom: 1px solid var(--border);
    padding: 0.75rem 1.5rem;
    display: flex;
    align-items: center;
    gap: 1.25rem;
  }
  .brand {
    color: var(--fg);
    text-decoration: none;
    font-weight: 600;
    letter-spacing: 0.04em;
    flex-shrink: 0;
  }
  .primary {
    display: flex;
    align-items: center;
    gap: 0.15rem;
    flex: 1;
    overflow-x: auto;
    scrollbar-width: thin;
  }
  .nav-link {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.4rem 0.7rem;
    border-radius: var(--radius);
    color: var(--muted);
    text-decoration: none;
    font-size: 0.92em;
    white-space: nowrap;
    border: 1px solid transparent;
  }
  .nav-link:hover { color: var(--fg); background: var(--surface-1); }
  .nav-link.active { color: var(--accent); background: var(--accent-soft); }

  .right { display: flex; align-items: center; gap: 0.6rem; margin-left: auto; flex-shrink: 0; }

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
    min-width: 12rem;
    padding: 0.4rem;
    background: var(--surface-1);
    border: 1px solid var(--border);
    border-radius: 8px;
    box-shadow: var(--shadow-pop);
  }
  .links-group {
    color: var(--faint);
    font-size: 0.72em;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    padding: 0.5rem 0.7rem 0.2rem;
  }
  .links a {
    color: var(--muted);
    text-decoration: none;
    font-size: 0.9em;
    padding: 0.45rem 0.7rem;
    border-radius: 5px;
  }
  .links a:hover { color: var(--accent); background: var(--accent-soft); }

  main {
    max-width: 1100px;
    margin: 0 auto;
    padding: 2rem 1.5rem 4rem;
  }

  /* Collapse the inline nav on narrow viewports; the hamburger covers it. */
  @media (max-width: 820px) {
    .primary { display: none; }
    .new-job { display: none; }
  }
</style>
