<script lang="ts">
  import { PageHeader, Button, Badge, Card, EmptyState } from '$lib/components';
  import { relTime } from '$lib/time';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
  const items = $derived(data.schedules);

  function fmt(iso: string | null | undefined): string {
    if (!iso) return '—';
    try { return new Date(iso).toLocaleString(); } catch { return String(iso); }
  }
</script>

<PageHeader title="Schedules" back="/" backLabel="Council">
  {#snippet subtitle()}{items.length} schedule{items.length === 1 ? '' : 's'}{/snippet}
  {#snippet actions()}<Button href="/schedules/new" variant="primary">+ New schedule</Button>{/snippet}
</PageHeader>

{#if items.length === 0}
  <EmptyState
    icon="◷"
    text="No schedules yet. Schedule a councillor to run a brief on a cron cadence or at a one-shot time."
  >
    {#snippet action()}<Button href="/schedules/new" variant="primary">+ New schedule</Button>{/snippet}
  </EmptyState>
{:else}
  <ul class="feed">
    {#each items as s (s.id)}
      <li class:off={!s.enabled}>
        <Card href="/schedules/{s.id}">
          <div class="row">
            <div class="main">
              <span class="title">{s.title}</span>
              <span class="who">{s.councillor_slug}</span>
            </div>
            <div class="when">
              {#if s.kind === 'recurring'}
                <code class="cron">{s.cron}</code>
              {:else}
                <span class="once">{fmt(s.fire_at)}</span>
              {/if}
            </div>
            <div class="meta">
              {#if s.enabled}
                <Badge tone="accent">enabled</Badge>
              {:else}
                <Badge>disabled</Badge>
              {/if}
              {#if s.enabled && s.next_fire_at}
                <span class="next" title={fmt(s.next_fire_at)}>next {relTime(s.next_fire_at)}</span>
              {/if}
              {#if s.fire_count > 0}
                <span class="fires">{s.fire_count} fire{s.fire_count === 1 ? '' : 's'}</span>
              {/if}
            </div>
          </div>
        </Card>
      </li>
    {/each}
  </ul>
{/if}

<style>
  .feed { list-style: none; padding: 0; margin: 0; display: grid; gap: 0.5rem; }
  .feed li.off { opacity: 0.6; }

  .row {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 0.4rem 1rem;
    align-items: center;
  }
  .main { min-width: 0; display: flex; align-items: baseline; gap: 0.6rem; flex-wrap: wrap; }
  .title {
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .who { color: var(--muted); font-size: 0.88em; }
  .when { justify-self: end; }
  .cron {
    font-family: var(--font-mono);
    font-size: 0.85em;
    background: var(--surface-2);
    padding: 0.1rem 0.4rem;
    border-radius: var(--radius-sm);
    color: var(--fg);
  }
  .once { color: var(--muted); font-size: 0.88em; font-variant-numeric: tabular-nums; }
  .meta {
    grid-column: 1 / -1;
    display: flex;
    align-items: center;
    gap: 0.6rem;
    flex-wrap: wrap;
    font-size: 0.82em;
    color: var(--faint);
  }
  .next { color: var(--muted); font-variant-numeric: tabular-nums; }
  .fires { font-variant-numeric: tabular-nums; }

  @media (max-width: 560px) {
    .row { grid-template-columns: 1fr; }
    .when { justify-self: start; }
  }
</style>
