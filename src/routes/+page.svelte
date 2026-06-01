<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import { onDestroy, onMount } from 'svelte';
  import { Button, Card, StatusBadge, Badge, EmptyState } from '$lib/components';
  import { relTime } from '$lib/time';
  import type { ActionData, PageData } from './$types';
  let { data, form }: { data: PageData; form: ActionData } = $props();

  let timer: ReturnType<typeof setInterval> | null = null;
  onMount(() => { timer = setInterval(() => invalidateAll(), 2000); });
  onDestroy(() => { if (timer) clearInterval(timer); });
</script>

{#if !data.hasCouncil}
  <section class="setup">
    <h1>Create a council</h1>
    <p class="meta">A council will be created in <code>{data.cwd}</code>.</p>

    <form method="POST" action="?/create" class="form">
      {#if form?.error}<div class="alert error">{form.error}</div>{/if}
      <label class="field">
        <span class="label">Name</span>
        <input class="input" name="name" required maxlength="80" value={form?.name ?? ''} />
      </label>
      <label class="field">
        <span class="label">Description</span>
        <textarea class="input" name="description" rows="3" maxlength="500">{form?.description ?? ''}</textarea>
      </label>
      <div class="actions">
        <Button type="submit" variant="primary">Create council</Button>
      </div>
    </form>
    <p class="or">— or —</p>
    <Button href="/import">Install from template (URL or file)</Button>
  </section>
{:else}
  {@const c = data.council}
  {@const notes = data.notes}
  {@const running = new Set(data.running)}
  {@const recent = data.recentByCouncillor}
  {@const pc = data.perCouncillor}
  {@const sched = data.schedules}
  {@const st = data.stats}

  <header class="head">
    <div>
      <h1>{c.name}</h1>
      {#if c.description}<p class="desc">{c.description}</p>{/if}
      <p class="meta">
        {#if c.template}Template: <code>{c.template}</code> ·{/if}
        Created {new Date(c.created_at).toLocaleDateString()}
      </p>
    </div>
    <div class="head-actions">
      <Button href="/jobs/new" variant="primary">+ New job</Button>
      <Button href="/council">Council settings</Button>
    </div>
  </header>

  <!-- Command-center: answer "what needs my attention?" first. -->
  <section class="strip" aria-label="System status">
    <a class="stat" class:hot={st.running > 0} href="/jobs">
      <span class="stat-n">{st.running}</span>
      <span class="stat-l">Running</span>
    </a>
    <a class="stat" href="/jobs">
      <span class="stat-n">{st.queued}</span>
      <span class="stat-l">Queued</span>
    </a>
    <a class="stat" class:bad={st.failed > 0} href="/jobs">
      <span class="stat-n">{st.failed}</span>
      <span class="stat-l">Failed</span>
    </a>
    <a class="stat" class:accent={data.pendingProposalCount > 0} href="/proposals">
      <span class="stat-n">{data.pendingProposalCount}</span>
      <span class="stat-l">Suggested</span>
    </a>
    <a class="stat" href="/schedules">
      <span class="stat-n">{sched.active}</span>
      <span class="stat-l">{#if sched.next_fire_at}Next {relTime(sched.next_fire_at)}{:else}Schedules{/if}</span>
    </a>
    {#if data.activeMeeting}
      <a class="stat accent" href="/meetings/{data.activeMeeting.id}">
        <span class="stat-n"><StatusBadge status={data.activeMeeting.status} glyphOnly /></span>
        <span class="stat-l">Meeting live</span>
      </a>
    {:else}
      <a class="stat" href="/meetings">
        <span class="stat-n">{data.meetingsTotal}</span>
        <span class="stat-l">Meetings</span>
      </a>
    {/if}
  </section>

  <section>
    <div class="section-head">
      <h2>Councillors</h2>
      <Button href="/jobs/new?for=__all__">+ Job for all</Button>
    </div>

    {#if c.councillors.length === 0}
      <EmptyState icon="◷" text="Councillors are the AI workers in this council. Add one before creating jobs.">
        {#snippet action()}<Button href="/councillors/new" variant="primary">+ Add councillor</Button>{/snippet}
      </EmptyState>
    {:else}
      <div class="columns" style="--col-count: {c.councillors.length}">
        {#each c.councillors as cl (cl.slug)}
          {@const jobs = recent[cl.slug] ?? []}
          {@const counts = pc[cl.slug] ?? { running: 0, queued: 0, failed: 0 }}
          {@const busy = running.has(cl.slug) || counts.running > 0}
          <div class="lane">
            <div class="lane-head">
              <div class="lane-title-row">
                <a class="lane-title" href="/councillors/{cl.slug}">{cl.name}</a>
                <Button href="/jobs/new?for={cl.slug}" variant="icon" ariaLabel="New job for {cl.name}" title="New job for {cl.name}">+</Button>
              </div>
              <div class="lane-sub">
                <span class="ready" class:busy>{busy ? 'busy' : 'ready'}</span>
                <span>{cl.role || 'no role'}</span>
                {#if cl.adapter}<Badge mono>{cl.adapter}</Badge>{/if}
              </div>
              {#if counts.queued > 0 || counts.failed > 0}
                <div class="lane-counts">
                  {#if counts.queued > 0}<span>{counts.queued} queued</span>{/if}
                  {#if counts.failed > 0}<span class="fail">{counts.failed} failed</span>{/if}
                </div>
              {/if}
            </div>

            {#if jobs.length === 0}
              <p class="lane-empty">No jobs yet.</p>
            {:else}
              <ul class="job-list">
                {#each jobs as j (j.id)}
                  <li>
                    <a class="job-card" class:failed={j.status === 'failed'} href="/jobs/{j.id}">
                      <StatusBadge status={j.status} glyphOnly />
                      <span class="job-name">{j.title}</span>
                      <span class="job-when">{relTime(j.created_at)}</span>
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
      <h2>Recent shared memory</h2>
      <div class="head-actions">
        <Button href="/memory">View all</Button>
        <Button href="/memory/new" variant="primary">+ New note</Button>
      </div>
    </div>
    {#if notes.length === 0}
      <EmptyState icon="◇" text="Shared memory is included in future jobs and meetings when relevant.">
        {#snippet action()}<Button href="/memory/new" variant="primary">+ New note</Button>{/snippet}
      </EmptyState>
    {:else}
      <ul class="list">
        {#each notes.slice(0, 6) as n (n.slug)}
          <li>
            <Card href="/memory/{n.slug}">
              <div class="card-title">{n.title}</div>
              <div class="card-desc">Updated {relTime(n.updated_at)}</div>
            </Card>
          </li>
        {/each}
      </ul>
    {/if}
  </section>
{/if}

<style>
  h1 { margin: 0; font-size: 1.6rem; }
  .desc { color: var(--fg); margin: 0.25rem 0 0; }
  .meta { color: var(--muted); margin: 0.5rem 0 0; font-size: 0.9em; }
  .head { display: flex; justify-content: space-between; gap: 1rem; align-items: flex-start; margin-bottom: 1.5rem; }
  .head-actions { display: flex; gap: 0.5rem; align-items: center; }
  .section-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; }
  h2 { margin: 0; font-size: 1.15rem; }
  .panel { margin-top: 2.5rem; }

  /* Setup */
  .setup { max-width: 560px; }
  .form { display: grid; gap: 1rem; margin-top: 1rem; }
  .or { color: var(--muted); margin: 1.25rem 0 0.75rem; text-align: center; }
  .actions { display: flex; gap: 0.5rem; }

  /* Status strip */
  .strip {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
    gap: 0.6rem;
    margin-bottom: 2rem;
  }
  .stat {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    padding: 0.75rem 0.9rem;
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    background: var(--surface-1);
    text-decoration: none;
    color: var(--fg);
    transition: border-color 0.12s, background 0.12s;
  }
  .stat:hover { border-color: var(--border-strong); background: var(--surface-2); }
  .stat-n { font-size: 1.5rem; font-weight: 600; line-height: 1; font-variant-numeric: tabular-nums; }
  .stat-l { color: var(--muted); font-size: 0.8em; }
  .stat.hot { border-color: var(--info); }
  .stat.hot .stat-n { color: var(--info); }
  .stat.bad { border-color: var(--danger); }
  .stat.bad .stat-n { color: var(--danger); }
  .stat.accent { border-color: var(--accent); }
  .stat.accent .stat-n { color: var(--accent); }

  /* Councillor lanes */
  .columns {
    display: grid;
    grid-template-columns: repeat(var(--col-count, 1), minmax(200px, 1fr));
    gap: 1rem;
    align-items: start;
    overflow-x: auto;
    padding-bottom: 0.5rem;
    scrollbar-width: thin;
  }
  .lane {
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    padding: 1rem;
    background: var(--surface-1);
    min-width: 0;
  }
  .lane-head { margin-bottom: 0.85rem; }
  .lane-title-row { display: flex; justify-content: space-between; align-items: center; gap: 0.5rem; }
  .lane-title {
    font-weight: 600; font-size: 1.05em; color: var(--fg); text-decoration: none;
    min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .lane-title:hover { color: var(--accent); }
  .lane-sub {
    display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem;
    color: var(--muted); font-size: 0.85em; margin-top: 0.4rem;
  }
  .ready {
    display: inline-flex; align-items: center; gap: 0.3em;
    color: var(--st-queued); font-size: 0.9em;
  }
  .ready::before { content: '●'; color: var(--muted); }
  .ready.busy { color: var(--info); }
  .ready.busy::before { color: var(--info); animation: ls-pulse 1.4s ease-in-out infinite; }
  .lane-counts { display: flex; gap: 0.75rem; margin-top: 0.4rem; font-size: 0.8em; color: var(--muted); }
  .lane-counts .fail { color: var(--danger); }
  .lane-empty { color: var(--muted); font-size: 0.9em; margin: 0; padding-top: 0.25rem; }

  .job-list { list-style: none; padding: 0; margin: 0; display: grid; gap: 0.4rem; }
  .job-card {
    display: flex; align-items: center; gap: 0.5rem;
    border: 1px solid var(--border); border-radius: var(--radius);
    padding: 0.5rem 0.6rem; text-decoration: none; color: var(--fg);
    background: var(--surface-2); overflow: hidden; font-size: 0.9em;
  }
  .job-card:hover { border-color: var(--accent); }
  .job-card.failed { border-color: rgba(210, 114, 114, 0.4); }
  .job-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .job-when { color: var(--faint); font-size: 0.8em; flex-shrink: 0; }

  .list { list-style: none; padding: 0; margin: 0; display: grid; gap: 0.6rem; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); }
  .card-title { font-weight: 600; }
  .card-desc { color: var(--muted); margin-top: 0.25rem; font-size: 0.9em; }
</style>
