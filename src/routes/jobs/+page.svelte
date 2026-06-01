<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import { onDestroy, onMount } from 'svelte';
  import { PageHeader, Button, StatusBadge, Badge, EmptyState } from '$lib/components';
  import { relTime } from '$lib/time';
  import type { JobStatus } from '$lib/types';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();

  let timer: ReturnType<typeof setInterval> | null = null;
  onMount(() => { timer = setInterval(() => invalidateAll(), 2000); });
  onDestroy(() => { if (timer) clearInterval(timer); });

  let filter = $state<'all' | JobStatus>('all');
  const FILTERS: Array<{ key: 'all' | JobStatus; label: string }> = [
    { key: 'all', label: 'All' },
    { key: 'running', label: 'Running' },
    { key: 'queued', label: 'Queued' },
    { key: 'failed', label: 'Failed' },
    { key: 'succeeded', label: 'Succeeded' },
    { key: 'cancelled', label: 'Cancelled' }
  ];
  const shown = $derived(
    filter === 'all' ? data.jobs : data.jobs.filter((j) => j.status === filter)
  );
</script>

<PageHeader title="Activity">
  {#snippet subtitle()}{data.total} job{data.total === 1 ? '' : 's'} total{/snippet}
  {#snippet actions()}<Button href="/jobs/new" variant="primary">+ New job</Button>{/snippet}
</PageHeader>

<div class="filters" role="tablist" aria-label="Filter jobs by status">
  {#each FILTERS as f (f.key)}
    {@const n = f.key === 'all' ? data.total : data.counts[f.key]}
    <button
      type="button"
      role="tab"
      aria-selected={filter === f.key}
      class="filter"
      class:active={filter === f.key}
      onclick={() => (filter = f.key)}
    >
      {f.label}<span class="n">{n}</span>
    </button>
  {/each}
</div>

{#if shown.length === 0}
  <EmptyState icon="○" text={filter === 'all'
    ? 'No jobs yet. Create one to put a councillor to work.'
    : `No ${filter} jobs.`}>
    {#snippet action()}<Button href="/jobs/new" variant="primary">+ New job</Button>{/snippet}
  </EmptyState>
{:else}
  <ul class="feed">
    {#each shown as j (j.id)}
      <li>
        <a class="row" href="/jobs/{j.id}">
          <StatusBadge status={j.status} glyphOnly />
          <span class="title">{j.title}</span>
          <span class="who">{j.councillor_name}</span>
          {#if j.from_schedule}<Badge>scheduled</Badge>{/if}
          <span class="when">{relTime(j.created_at)}</span>
        </a>
      </li>
    {/each}
  </ul>
  {#if data.truncated > 0 && filter === 'all'}
    <p class="truncated">Showing the 200 most recent jobs · {data.truncated} older hidden.</p>
  {/if}
{/if}

<style>
  .truncated { color: var(--faint); font-size: 0.85em; margin-top: 1rem; text-align: center; }
  .filters { display: flex; flex-wrap: wrap; gap: 0.4rem; margin-bottom: 1.25rem; }
  .filter {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.35rem 0.7rem;
    border: 1px solid var(--border);
    border-radius: var(--radius-pill);
    background: var(--surface-1);
    color: var(--muted);
    cursor: pointer;
    font-size: 0.88em;
  }
  .filter:hover { border-color: var(--accent); }
  .filter.active { color: var(--accent); border-color: var(--accent); background: var(--accent-soft); }
  .filter .n {
    font-variant-numeric: tabular-nums;
    color: var(--faint);
    font-size: 0.85em;
  }
  .filter.active .n { color: var(--accent); }

  .feed { list-style: none; padding: 0; margin: 0; display: grid; gap: 0.4rem; }
  .row {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.6rem 0.85rem;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--surface-1);
    text-decoration: none;
    color: var(--fg);
  }
  .row:hover { border-color: var(--accent); background: var(--surface-2); }
  .title {
    font-weight: 500;
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .who { color: var(--muted); font-size: 0.88em; flex-shrink: 0; }
  .when { color: var(--faint); font-size: 0.82em; flex-shrink: 0; font-variant-numeric: tabular-nums; }

  @media (max-width: 560px) {
    .row { flex-wrap: wrap; gap: 0.4rem 0.6rem; }
    .title { flex-basis: 100%; }
  }
</style>
