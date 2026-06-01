<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import { onDestroy, onMount } from 'svelte';
  import type { ActionData, PageData } from './$types';
  let { data, form }: { data: PageData; form: ActionData } = $props();

  let timer: ReturnType<typeof setInterval> | null = null;
  onMount(() => { timer = setInterval(() => invalidateAll(), 2000); });
  onDestroy(() => { if (timer) clearInterval(timer); });

  function ageBg(created: string, jobs: Array<{ created_at: string }>): string {
    // Newest = warm beige tone matching --accent (#d6c08c, hsl ~38 45% 70%).
    // Oldest = deep brown fading toward --bg (#0f1115).
    if (jobs.length < 2) return 'hsl(38 40% 32% / 0.28)';
    const ts = jobs.map(j => new Date(j.created_at).getTime());
    const max = Math.max(...ts);
    const min = Math.min(...ts);
    const span = max - min;
    const t = span === 0 ? 0 : (max - new Date(created).getTime()) / span; // 0 newest, 1 oldest
    const hue = 38 - 8 * t;
    const sat = 40 - 25 * t;
    const light = 32 - 24 * t;
    const alpha = 0.28 + 0.22 * t;
    return `hsl(${hue.toFixed(0)} ${sat.toFixed(0)}% ${light.toFixed(0)}% / ${alpha.toFixed(2)})`;
  }

  function relTime(iso: string): string {
    const diffMs = new Date(iso).getTime() - Date.now();
    const abs = Math.abs(diffMs);
    const min = Math.round(abs / 60000);
    if (min < 60) return `${diffMs >= 0 ? 'in' : ''} ${min}m${diffMs < 0 ? ' ago' : ''}`.trim();
    const hr = Math.round(abs / 3_600_000);
    if (hr < 48) return `${diffMs >= 0 ? 'in' : ''} ${hr}h${diffMs < 0 ? ' ago' : ''}`.trim();
    const days = Math.round(abs / 86_400_000);
    return `${diffMs >= 0 ? 'in' : ''} ${days}d${diffMs < 0 ? ' ago' : ''}`.trim();
  }
</script>

{#if !data.hasCouncil}
  <section>
    <h1>Create a council</h1>
    <p class="meta">A council will be created in <code>{data.cwd}</code>.</p>

    <form method="POST" action="?/create" class="form">
      {#if form?.error}<div class="error">{form.error}</div>{/if}
      <label>
        <span>Name</span>
        <input name="name" required maxlength="80" value={form?.name ?? ''} />
      </label>
      <label>
        <span>Description</span>
        <textarea name="description" rows="3" maxlength="500">{form?.description ?? ''}</textarea>
      </label>
      <div class="actions">
        <button type="submit" class="btn primary">Create council</button>
      </div>
    </form>
    <p class="or">— or —</p>
    <p>
      <a class="btn" href="/import">Install from template (URL or file)</a>
    </p>
  </section>
{:else}
  {@const c = data.council}
  {@const notes = data.notes}
  {@const running = new Set(data.running)}
  {@const recent = data.recentByCouncillor}
  {@const sched = data.schedules}

  <header class="head">
    <div>
      <h1>
        {c.name}
        {#if data.pendingProposalCount > 0}
          <a class="badge" href="/proposals" title="{data.pendingProposalCount} pending suggested job{data.pendingProposalCount === 1 ? '' : 's'}">
            {data.pendingProposalCount} suggested job{data.pendingProposalCount === 1 ? '' : 's'}
          </a>
        {/if}
      </h1>
      {#if c.description}<p class="desc">{c.description}</p>{/if}
      <p class="meta">
        {#if c.template}Template: <code>{c.template}</code> ·{/if}
        Created {new Date(c.created_at).toLocaleString()}
      </p>
    </div>
    <div class="head-actions">
      <a class="btn" href="/council">Council settings</a>
    </div>
  </header>

  <section class="schedules-line">
    {#if sched.active === 0}
      <a class="dim" href="/schedules">Schedules: none active</a>
    {:else}
      <a href="/schedules">
        Schedules: {sched.active} active{#if sched.next_fire_at} · next fires {relTime(sched.next_fire_at)}{/if}
      </a>
    {/if}
  </section>

  <section class="meetings-line">
    {#if data.activeMeetings === 0 && data.meetingsTotal === 0}
      <a class="dim" href="/meetings">Meetings: none yet</a>
    {:else}
      <a href="/meetings">
        Meetings: {data.activeMeetings} active · {data.meetingsTotal} total
      </a>
    {/if}
  </section>

  <section>
    <div class="section-head">
      <h2>Councillors</h2>
      <div class="head-actions">
        <a class="btn" href="/jobs/new?for=__all__">+ Create job for all</a>
      </div>
    </div>

    {#if c.councillors.length === 0}
      <p class="empty">No councillors yet.</p>
    {:else}
      <div class="columns" style="--col-count: {c.councillors.length}">
        {#each c.councillors as cl (cl.slug)}
          {@const jobs = recent[cl.slug] ?? []}
          <div class="column">
            <div class="col-head">
              <div class="col-head-row">
                <a class="col-title" href="/councillors/{cl.slug}">
                  {cl.name}
                  {#if running.has(cl.slug)}<span class="dot running" title="Running a job">●</span>{/if}
                </a>
                <a class="col-add" href="/jobs/new?for={cl.slug}" title="New job for {cl.name}" aria-label="New job for {cl.name}">+</a>
              </div>
              <div class="col-sub">
                {cl.role || 'no role'}{#if cl.adapter} · <code>{cl.adapter}</code>{/if}
              </div>
            </div>
            {#if jobs.length === 0}
              <p class="col-empty">No jobs yet.</p>
            {:else}
              <ul class="job-list">
                {#each jobs as j (j.id)}
                  <li>
                    <a class="job-card" href="/jobs/{j.id}" style="background: {ageBg(j.created_at, jobs)};">
                      <div class="job-title">
                        <span class="job-name">{j.title}</span>
                        <span class="status status-{j.status}" title={j.status} aria-label={j.status}>
                          {#if j.status === 'succeeded'}✓
                          {:else if j.status === 'failed'}✕
                          {:else if j.status === 'running'}●
                          {:else if j.status === 'cancelled'}⊘
                          {:else}…{/if}
                        </span>
                      </div>
                      <div class="job-meta">{new Date(j.created_at).toLocaleString()}</div>
                    </a>
                  </li>
                {/each}
              </ul>
            {/if}
          </div>
        {/each}
      </div>
    {/if}
  </section>

  <section class="panel">
    <div class="section-head">
      <h2>Memory</h2>
      <a class="btn primary" href="/memory/new">+ New note</a>
    </div>
    {#if notes.length === 0}
      <p class="empty">No shared notes yet.</p>
    {:else}
      <ul class="list">
        {#each notes as n (n.slug)}
          <li>
            <a class="card" href="/memory/{n.slug}">
              <div class="card-title">{n.title}</div>
              <div class="card-desc">Updated {new Date(n.updated_at).toLocaleString()}</div>
            </a>
          </li>
        {/each}
      </ul>
    {/if}
  </section>
{/if}

<style>
  h1 { margin: 0; }
  .desc { color: var(--fg); margin: 0.25rem 0 0; }
  .meta { color: var(--muted); margin: 0.5rem 0 0; font-size: 0.9em; }
  .head { display: flex; justify-content: space-between; gap: 1rem; align-items: flex-start; margin-bottom: 2rem; }
  .head-actions { display: flex; gap: 0.5rem; align-items: center; }
  .section-head { display: flex; justify-content: space-between; align-items: baseline; }
  h2 { margin: 0 0 1rem; }
  .panel { margin-top: 2.5rem; }
  .empty { color: var(--muted); padding: 1rem 0; }

  .form { display: grid; gap: 1rem; max-width: 560px; margin-top: 1rem; }
  .or { color: var(--muted); margin: 1.25rem 0 0.5rem; text-align: center; max-width: 560px; }
  label { display: grid; gap: 0.35rem; }
  label > span { color: var(--muted); font-size: 0.9em; }
  input, textarea {
    background: #1a1d24; color: var(--fg);
    border: 1px solid var(--border); border-radius: 6px; padding: 0.55rem 0.7rem;
  }
  input:focus, textarea:focus { outline: 2px solid var(--accent); border-color: var(--accent); }
  .actions { display: flex; gap: 0.5rem; }
  .error { background: rgba(210,114,114,0.15); border: 1px solid var(--danger); color: var(--danger); padding: 0.6rem 0.8rem; border-radius: 6px; }

  .columns {
    display: grid;
    grid-template-columns: repeat(var(--col-count, 1), minmax(180px, 1fr));
    gap: 1rem;
    align-items: start;
    overflow-x: auto;
    padding: 0 1.5rem 0.25rem;
    width: 100vw;
    margin-left: calc(-50vw + 50%);
    box-sizing: border-box;
  }
  .column {
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 1rem;
    background: rgba(255, 255, 255, 0.01);
    min-width: 0;
  }
  .col-head { margin-bottom: 0.85rem; }
  .col-head-row { display: flex; justify-content: space-between; align-items: center; gap: 0.5rem; }
  .col-title {
    display: inline-flex; align-items: center; gap: 0.5rem;
    font-weight: 600; font-size: 1.05em;
    color: var(--fg); text-decoration: none;
    min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .col-title:hover { color: var(--accent); }
  .col-add {
    flex-shrink: 0; display: inline-flex; align-items: center; justify-content: center;
    width: 1.6rem; height: 1.6rem; border: 1px solid var(--border); border-radius: 6px;
    color: var(--muted); text-decoration: none; font-size: 1.1em; line-height: 1;
  }
  .col-add:hover { color: var(--accent); border-color: var(--accent); }
  .col-sub { color: var(--muted); font-size: 0.85em; margin-top: 0.25rem; }
  .col-empty { color: var(--muted); font-size: 0.9em; margin: 0; padding: 0.5rem 0 0; }

  .job-list { list-style: none; padding: 0; margin: 0; display: grid; grid-template-columns: minmax(0, 1fr); gap: 0.5rem; }
  .job-card {
    display: block; border: 1px solid var(--border); border-radius: 6px;
    padding: 0.55rem 0.7rem; text-decoration: none; color: var(--fg);
    background: rgba(255, 255, 255, 0.015);
    overflow: hidden;
  }
  .job-card:hover { border-color: var(--accent); }
  .job-title { display: flex; justify-content: space-between; gap: 0.5rem; align-items: center; font-size: 0.9em; min-width: 0; }
  .job-name { font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
  .job-meta { color: var(--muted); font-size: 0.75em; margin-top: 0.2rem; }

  .list { list-style: none; padding: 0; display: grid; gap: 0.75rem; }
  .card { display: block; border: 1px solid var(--border); border-radius: 8px; padding: 1rem 1.1rem; text-decoration: none; color: var(--fg); }
  .card:hover { border-color: var(--accent); }
  .card-title { font-weight: 600; }
  .card-desc { color: var(--muted); margin-top: 0.25rem; font-size: 0.95em; }

  .btn { display: inline-block; padding: 0.5rem 0.9rem; border-radius: 6px; border: 1px solid var(--border); text-decoration: none; color: var(--fg); background: transparent; cursor: pointer; }
  .btn.primary { background: var(--accent); color: #0f1115; border-color: var(--accent); font-weight: 600; }
  .status {
    flex-shrink: 0; display: inline-flex; align-items: center; justify-content: center;
    width: 1.1em; height: 1.1em; font-size: 1em; line-height: 1; font-weight: 700;
    color: var(--muted);
  }
  .status-running { color: #e0c060; animation: pulse 1.4s ease-in-out infinite; }
  .status-succeeded { color: #8bb98b; }
  .status-failed { color: var(--danger); }
  .status-cancelled { color: var(--muted); }
  .dot.running { color: var(--accent); animation: pulse 1.4s ease-in-out infinite; }
  @keyframes pulse { 50% { opacity: 0.3; } }
  .badge {
    display: inline-block; vertical-align: middle; margin-left: 0.5rem;
    font-size: 0.45em; padding: 0.2rem 0.55rem; border-radius: 999px;
    border: 1px solid var(--accent); color: var(--accent);
    background: rgba(255,255,255,0.02); text-decoration: none; font-weight: 600;
  }
  .badge:hover { background: var(--accent); color: #0f1115; }
  .schedules-line, .meetings-line { margin: -0.75rem 0 1.25rem; font-size: 0.9em; }
  .schedules-line a, .meetings-line a { color: var(--accent); text-decoration: none; }
  .schedules-line a:hover, .meetings-line a:hover { text-decoration: underline; }
  .schedules-line .dim, .meetings-line .dim { color: var(--muted); }
</style>
