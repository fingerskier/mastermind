<script lang="ts">
  import type { PageData } from './$types';
  let { data }: { data: PageData } = $props();
</script>

<section class="hero">
  <h1>Councils</h1>
  <a class="btn primary" href="/councils/new">+ New council</a>
</section>

{#if data.councils.length === 0}
  <p class="empty">No councils yet. Create one to get started.</p>
{:else}
  <ul class="list">
    {#each data.councils as c (c.slug)}
      <li>
        <a class="card" href="/councils/{c.slug}">
          <div class="card-title">{c.name}</div>
          {#if c.description}
            <div class="card-desc">{c.description}</div>
          {/if}
        </a>
      </li>
    {/each}
  </ul>
{/if}

<style>
  .hero {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 1rem;
  }
  h1 { margin: 0 0 1rem; }
  .empty {
    color: var(--muted);
    padding: 2rem 0;
  }
  .list {
    list-style: none;
    padding: 0;
    display: grid;
    gap: 0.75rem;
  }
  .card {
    display: block;
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 1rem 1.1rem;
    text-decoration: none;
    color: var(--fg);
  }
  .card:hover { border-color: var(--accent); }
  .card-title { font-weight: 600; }
  .card-desc { color: var(--muted); margin-top: 0.25rem; font-size: 0.95em; }
  .btn {
    display: inline-block;
    padding: 0.5rem 0.9rem;
    border-radius: 6px;
    border: 1px solid var(--border);
    text-decoration: none;
    color: var(--fg);
    background: transparent;
    cursor: pointer;
  }
  .btn.primary {
    background: var(--accent);
    color: #0f1115;
    border-color: var(--accent);
    font-weight: 600;
  }
</style>
