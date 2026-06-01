<script lang="ts">
  import { PageHeader, Button, Badge, EmptyState } from '$lib/components';
  import { relTime } from '$lib/time';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
  const s = $derived(data.schedule);
  const events = $derived(data.events);
  const upcoming = $derived(data.upcoming);

  function fmt(iso: string | null | undefined): string {
    if (!iso) return '—';
    try { return new Date(iso).toLocaleString(); } catch { return String(iso); }
  }

  function eventLabel(type: string): string {
    switch (type) {
      case 'created': return 'created';
      case 'edited': return 'edited';
      case 'enabled': return 'enabled';
      case 'disabled': return 'disabled';
      case 'fired': return 'fired';
      case 'skipped': return 'skipped';
      case 'missed': return 'missed fires';
      case 'error': return 'error';
      default: return type;
    }
  }
</script>

<PageHeader title={s.title} back="/schedules" backLabel="Schedules">
  {#snippet subtitle()}
    {#if s.enabled}<Badge tone="accent">enabled</Badge>{:else}<Badge>disabled</Badge>{/if}
    · <span class="kind">{s.kind}</span>
    · councillor <a href="/councillors/{s.councillor_slug}">{s.councillor_slug}</a>
    · fired {s.fire_count} time{s.fire_count === 1 ? '' : 's'}
  {/snippet}
  {#snippet actions()}
    <Button href="/schedules/{s.id}/edit">Edit</Button>
    <form method="POST" action="?/toggle">
      <input type="hidden" name="enabled" value={(!s.enabled).toString()} />
      <Button type="submit">{s.enabled ? 'Disable' : 'Enable'}</Button>
    </form>
    <form method="POST" action="?/delete" onsubmit={(e) => { if (!confirm(`Delete schedule "${s.title}"?`)) e.preventDefault(); }}>
      <Button type="submit" variant="danger">Delete</Button>
    </form>
  {/snippet}
</PageHeader>

<section>
  <h2>Definition</h2>
  <dl class="def">
    <dt>Kind</dt><dd>{s.kind}</dd>
    {#if s.kind === 'recurring'}
      <dt>Cron</dt><dd><code class="cron">{s.cron}</code></dd>
    {:else}
      <dt>Fire at</dt><dd>{fmt(s.fire_at)}</dd>
    {/if}
    <dt>Next fire</dt>
    <dd>
      {#if s.enabled && s.next_fire_at}
        {fmt(s.next_fire_at)} <span class="rel">({relTime(s.next_fire_at)})</span>
      {:else if !s.enabled}
        <span class="muted">— disabled</span>
      {:else}
        —
      {/if}
    </dd>
    <dt>Last spawned job</dt>
    <dd>{#if s.last_fire_job_id}<a href="/jobs/{s.last_fire_job_id}">{s.last_fire_job_id}</a>{:else}—{/if}</dd>
    {#if s.fired_at}<dt>Last fired</dt><dd>{fmt(s.fired_at)}</dd>{/if}
  </dl>
  <p class="tz-note">Times shown in this computer's local timezone.</p>

  <h3>Brief</h3>
  <pre class="block brief">{s.brief}</pre>
</section>

{#if upcoming.length > 0}
  <section>
    <h2>Next {upcoming.length} fire{upcoming.length === 1 ? '' : 's'}</h2>
    <ol class="upcoming">
      {#each upcoming as iso (iso)}
        <li>
          <span class="abs">{fmt(iso)}</span>
          <span class="rel">{relTime(iso)}</span>
        </li>
      {/each}
    </ol>
  </section>
{/if}

<section>
  <h2>Recent events</h2>
  {#if events.length === 0}
    <EmptyState
      icon="◷"
      text="No events yet. Activity appears here when the schedule fires, is edited, or is toggled."
    />
  {:else}
    <ul class="events">
      {#each events as e, i (i)}
        <li>
          <div class="ev-head">
            <Badge mono>{eventLabel(e.type)}</Badge>
            <span class="ts">{fmt(e.at)}</span>
            {#if e.job_id}<a href="/jobs/{e.job_id}">job {e.job_id}</a>{/if}
            {#if e.prior_job_id}<span class="prior">prior <a href="/jobs/{e.prior_job_id}">{e.prior_job_id}</a></span>{/if}
          </div>
          {#if e.message}<div class="msg">{e.message}</div>{/if}
          {#if e.count !== undefined}
            <div class="msg">Missed {e.count} fire{e.count === 1 ? '' : 's'} between {fmt(e.from)} and {fmt(e.to)}.</div>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
</section>

<style>
  h2 { margin: 1.5rem 0 0.6rem; }
  h3 { margin: 1rem 0 0.4rem; font-size: 0.95em; color: var(--muted); }
  .kind { text-transform: capitalize; }

  .def {
    display: grid;
    grid-template-columns: 11rem 1fr;
    gap: 0.4rem 1rem;
    margin: 0;
  }
  .def dt { color: var(--muted); }
  .def dd { margin: 0; }
  .rel { color: var(--faint); font-size: 0.9em; }
  .muted { color: var(--muted); }
  .cron {
    font-family: var(--font-mono);
    font-size: 0.9em;
    background: var(--surface-2);
    padding: 0.1rem 0.4rem;
    border-radius: var(--radius-sm);
  }
  .tz-note { color: var(--faint); font-size: 0.82em; margin: 0.75rem 0 0; }
  .brief { white-space: pre-wrap; font-family: var(--font-mono); margin: 0; }

  .upcoming {
    list-style: decimal;
    padding-left: 1.5rem;
    margin: 0;
    display: grid;
    gap: 0.3rem;
  }
  .upcoming li { display: flex; gap: 0.6rem; align-items: baseline; }
  .upcoming .abs { font-variant-numeric: tabular-nums; }

  .events { list-style: none; padding: 0; margin: 0; display: grid; gap: 0.6rem; }
  .ev-head { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem; font-size: 0.9em; }
  .ev-head .ts { color: var(--muted); font-size: 0.92em; font-variant-numeric: tabular-nums; }
  .prior { color: var(--muted); }
  .msg { color: var(--muted); margin-top: 0.2rem; font-size: 0.9em; }

  form { display: inline; margin: 0; }
</style>
