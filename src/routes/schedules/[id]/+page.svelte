<script lang="ts">
  import type { PageData } from './$types';
  let { data }: { data: PageData } = $props();
  const s = $derived(data.schedule);
  const events = $derived(data.events);
  const upcoming = $derived(data.upcoming);

  function fmt(iso: string | null | undefined): string {
    if (!iso) return '—';
    try { return new Date(iso).toLocaleString(); } catch { return String(iso); }
  }
</script>

<p><a href="/schedules">&larr; Schedules</a></p>

<header class="head">
  <div>
    <h1>{s.title}{#if !s.enabled} <span class="badge off">disabled</span>{/if}</h1>
    <p class="meta">
      {s.kind} · councillor <a href="/councillors/{s.councillor_slug}">{s.councillor_slug}</a> · fired {s.fire_count} times
    </p>
  </div>
  <div class="head-actions">
    <a class="btn" href="/schedules/{s.id}/edit">Edit</a>
    <form method="POST" action="?/toggle">
      <input type="hidden" name="enabled" value={(!s.enabled).toString()} />
      <button class="btn" type="submit">{s.enabled ? 'Disable' : 'Enable'}</button>
    </form>
    <form method="POST" action="?/delete" onsubmit={(e) => { if (!confirm(`Delete schedule "${s.title}"?`)) e.preventDefault(); }}>
      <button class="btn danger" type="submit">Delete</button>
    </form>
  </div>
</header>

<section class="card">
  <h2>Definition</h2>
  <dl>
    <dt>Kind</dt><dd>{s.kind}</dd>
    {#if s.kind === 'recurring'}
      <dt>Cron</dt><dd><code>{s.cron}</code></dd>
    {:else}
      <dt>Fire at</dt><dd>{fmt(s.fire_at)}</dd>
    {/if}
    <dt>Next fire</dt><dd>{fmt(s.next_fire_at)}</dd>
    <dt>Last spawned job</dt>
    <dd>{#if s.last_fire_job_id}<a href="/jobs/{s.last_fire_job_id}">{s.last_fire_job_id}</a>{:else}—{/if}</dd>
    {#if s.fired_at}<dt>Fired at</dt><dd>{fmt(s.fired_at)}</dd>{/if}
  </dl>
  <h3>Brief</h3>
  <pre class="brief">{s.brief}</pre>
</section>

{#if upcoming.length > 0}
  <section class="card">
    <h2>Next {upcoming.length} fire{upcoming.length === 1 ? '' : 's'}</h2>
    <ul>
      {#each upcoming as iso, i}
        <li>{i + 1}. {fmt(iso)}</li>
      {/each}
    </ul>
  </section>
{/if}

<section class="card">
  <h2>Recent events</h2>
  {#if events.length === 0}
    <p class="empty">No events yet.</p>
  {:else}
    <ul class="events">
      {#each events as e}
        <li>
          <code>{e.type}</code>
          <span class="ts">{fmt(e.at)}</span>
          {#if e.job_id}· <a href="/jobs/{e.job_id}">job {e.job_id}</a>{/if}
          {#if e.prior_job_id}· prior <a href="/jobs/{e.prior_job_id}">{e.prior_job_id}</a>{/if}
          {#if e.message}<div class="msg">{e.message}</div>{/if}
          {#if e.count !== undefined}<div class="msg">missed {e.count} fire{e.count === 1 ? '' : 's'} between {fmt(e.from)} and {fmt(e.to)}</div>{/if}
        </li>
      {/each}
    </ul>
  {/if}
</section>

<style>
  h1 { margin: 0; }
  .head { display: flex; justify-content: space-between; gap: 1rem; align-items: flex-start; margin-bottom: 1.5rem; }
  .head-actions { display: flex; gap: 0.5rem; align-items: center; }
  .head-actions form { display: inline; }
  .meta { color: var(--muted); margin: 0.25rem 0 0; font-size: 0.9em; }
  .card { border: 1px solid var(--border); border-radius: 8px; padding: 1rem 1.25rem; margin-bottom: 1.25rem; }
  .card h2 { margin: 0 0 0.75rem; }
  .card h3 { margin: 0.75rem 0 0.35rem; font-size: 0.95em; color: var(--muted); }
  .brief { white-space: pre-wrap; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; background: rgba(255,255,255,0.02); padding: 0.65rem 0.85rem; border-radius: 6px; margin: 0; }
  dl { display: grid; grid-template-columns: 11rem 1fr; gap: 0.35rem 1rem; margin: 0; }
  dt { color: var(--muted); }
  dd { margin: 0; }
  .events { list-style: none; padding: 0; margin: 0; display: grid; gap: 0.5rem; }
  .events code { background: rgba(255,255,255,0.04); padding: 0.05rem 0.35rem; border-radius: 4px; font-size: 0.85em; }
  .events .ts { color: var(--muted); font-size: 0.85em; }
  .events .msg { color: var(--muted); margin-top: 0.15rem; font-size: 0.9em; }
  .empty { color: var(--muted); }
  .badge.off { font-size: 0.55em; padding: 0.15rem 0.5rem; border-radius: 999px; border: 1px solid var(--muted); color: var(--muted); vertical-align: middle; margin-left: 0.5rem; }
  .btn { display: inline-block; padding: 0.5rem 0.9rem; border-radius: 6px; border: 1px solid var(--border); text-decoration: none; color: var(--fg); background: transparent; cursor: pointer; }
  .btn.danger { border-color: var(--danger); color: var(--danger); }
  code { background: rgba(255,255,255,0.04); padding: 0.05rem 0.35rem; border-radius: 4px; font-size: 0.9em; }
</style>
