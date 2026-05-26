<script lang="ts">
  import type { PageData } from './$types';
  let { data }: { data: PageData } = $props();
  const items = $derived(data.schedules);

  function fmt(iso: string | null): string {
    if (!iso) return '—';
    try { return new Date(iso).toLocaleString(); } catch { return iso; }
  }
</script>

<p><a href="/">&larr; Council</a></p>

<header class="head">
  <h1>Schedules</h1>
  <a class="btn primary" href="/schedules/new">+ New schedule</a>
</header>

{#if items.length === 0}
  <p class="empty">No schedules yet.</p>
{:else}
  <table class="t">
    <thead>
      <tr>
        <th>Title</th>
        <th>Councillor</th>
        <th>Kind</th>
        <th>When</th>
        <th>Next fire</th>
        <th>Fires</th>
        <th></th>
      </tr>
    </thead>
    <tbody>
      {#each items as s (s.id)}
        <tr class={s.enabled ? '' : 'off'}>
          <td><a href="/schedules/{s.id}">{s.title}</a></td>
          <td>{s.councillor_slug}</td>
          <td>{s.kind}</td>
          <td>
            {#if s.kind === 'recurring'}
              <code>{s.cron}</code>
            {:else}
              {fmt(s.fire_at)}
            {/if}
          </td>
          <td>{fmt(s.next_fire_at)}</td>
          <td>{s.fire_count}{#if s.last_fire_job_id} · <a href="/jobs/{s.last_fire_job_id}">last</a>{/if}</td>
          <td class="row-actions">
            <form method="POST" action="?/toggle">
              <input type="hidden" name="id" value={s.id} />
              <input type="hidden" name="enabled" value={(!s.enabled).toString()} />
              <button class="link" type="submit">{s.enabled ? 'Disable' : 'Enable'}</button>
            </form>
            <form method="POST" action="?/delete" onsubmit={(e) => { if (!confirm(`Delete schedule "${s.title}"?`)) e.preventDefault(); }}>
              <input type="hidden" name="id" value={s.id} />
              <button class="link danger" type="submit">Delete</button>
            </form>
          </td>
        </tr>
      {/each}
    </tbody>
  </table>
{/if}

<style>
  .head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem; }
  h1 { margin: 0; }
  .empty { color: var(--muted); }
  .t { width: 100%; border-collapse: collapse; }
  .t th, .t td { padding: 0.5rem 0.75rem; border-bottom: 1px solid var(--border); text-align: left; vertical-align: top; font-size: 0.95em; }
  .t th { color: var(--muted); font-weight: 500; font-size: 0.85em; }
  .t tr.off td { opacity: 0.55; }
  .row-actions { display: flex; gap: 0.5rem; }
  .row-actions form { display: inline; }
  .btn { display: inline-block; padding: 0.5rem 0.9rem; border-radius: 6px; border: 1px solid var(--border); text-decoration: none; color: var(--fg); background: transparent; cursor: pointer; }
  .btn.primary { background: var(--accent); color: #0f1115; border-color: var(--accent); font-weight: 600; }
  .link { background: none; border: none; padding: 0; color: var(--accent); cursor: pointer; font: inherit; text-decoration: underline; }
  .link.danger { color: var(--danger); }
  code { background: rgba(255,255,255,0.04); padding: 0.05rem 0.35rem; border-radius: 4px; font-size: 0.9em; }
</style>
