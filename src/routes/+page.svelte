<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import { onDestroy, onMount } from 'svelte';
  import type { PageData } from './$types';
  let { data }: { data: PageData } = $props();

  let timer: ReturnType<typeof setInterval> | null = null;
  onMount(() => { timer = setInterval(() => invalidateAll(), 2000); });
  onDestroy(() => { if (timer) clearInterval(timer); });
</script>

<section class="hero">
  <h1>Councils</h1>
  <a class="btn primary" href="/councils/new">+ New council</a>
</section>

{#if data.activity.length > 0}
  <section class="activity">
    <h2>Live activity</h2>
    <ul class="list compact">
      {#each data.activity as a}
        <li>
          <a class="card" href="/councils/{a.council}/jobs/{a.jobId}">
            <div class="card-title">
              <span class="dot running">●</span>
              {a.title}
            </div>
            <div class="card-desc">
              {a.council} / {a.councillor} · <span class="status status-{a.status}">{a.status}</span>
            </div>
          </a>
        </li>
      {/each}
    </ul>
  </section>
{/if}

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
  .hero { display: flex; justify-content: space-between; align-items: baseline; gap: 1rem; }
  h1 { margin: 0 0 1rem; }
  h2 { margin: 0 0 0.8rem; font-size: 1.05em; color: var(--muted); }
  .activity { margin: 0.5rem 0 2rem; }
  .empty { color: var(--muted); padding: 2rem 0; }
  .list { list-style: none; padding: 0; display: grid; gap: 0.75rem; }
  .list.compact { gap: 0.5rem; }
  .card { display: block; border: 1px solid var(--border); border-radius: 8px; padding: 1rem 1.1rem; text-decoration: none; color: var(--fg); }
  .card:hover { border-color: var(--accent); }
  .card-title { font-weight: 600; display: flex; gap: 0.5rem; align-items: center; }
  .card-desc { color: var(--muted); margin-top: 0.25rem; font-size: 0.95em; }
  .btn { display: inline-block; padding: 0.5rem 0.9rem; border-radius: 6px; border: 1px solid var(--border); text-decoration: none; color: var(--fg); background: transparent; cursor: pointer; }
  .btn.primary { background: var(--accent); color: #0f1115; border-color: var(--accent); font-weight: 600; }
  .status { font-size: 0.75em; padding: 0.1rem 0.45rem; border-radius: 999px; border: 1px solid var(--border); }
  .status-running { color: var(--accent); border-color: var(--accent); }
  .dot.running { color: var(--accent); animation: pulse 1.4s ease-in-out infinite; }
  @keyframes pulse { 50% { opacity: 0.3; } }
</style>
