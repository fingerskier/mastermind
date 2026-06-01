<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import { onDestroy } from 'svelte';
  import { Button, StatusBadge, Badge, Markdown } from '$lib/components';
  import { relTime } from '$lib/time';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
  const c = $derived(data.council);
  const job = $derived(data.job);
  const fromSchedule = $derived(job.spawned_by_schedule_id ?? null);
  const live = $derived(job.status === 'queued' || job.status === 'running');
  const memCount = $derived((job.memory_slugs?.length ?? 0) + (job.shared_memory_slugs?.length ?? 0));

  // Live tail: refresh while the job is queued or running.
  let timer: ReturnType<typeof setInterval> | null = null;
  $effect(() => {
    if (live && !timer) {
      timer = setInterval(() => invalidateAll(), 1000);
    } else if (!live && timer) {
      clearInterval(timer);
      timer = null;
    }
  });
  onDestroy(() => { if (timer) clearInterval(timer); });

  // Tabbed artifacts — only surface tabs that have something to show.
  type Tab = { key: string; label: string; n?: number };
  const tabs = $derived.by<Tab[]>(() => {
    const t: Tab[] = [];
    if (data.output) t.push({ key: 'output', label: 'Output' });
    t.push({ key: 'transcript', label: 'Transcript' });
    t.push({ key: 'prompt', label: 'Prompt' });
    t.push({ key: 'events', label: 'Events', n: data.events.length });
    if (memCount > 0) t.push({ key: 'memory', label: 'Memories', n: memCount });
    if (data.proposals.length > 0) t.push({ key: 'proposals', label: 'Suggested jobs', n: data.proposals.length });
    return t;
  });

  let selected = $state<string | null>(null);
  const active = $derived.by(() => {
    const keys = tabs.map((t) => t.key);
    if (selected && keys.includes(selected)) return selected;
    if (job.status === 'succeeded' && keys.includes('output')) return 'output';
    return 'transcript';
  });
</script>

<!-- Status cockpit: identity + controls pinned at the top. -->
<header class="cockpit">
  <div class="cockpit-lead">
    <a class="back" href="/">← {c.name}</a>
    <div class="title-row">
      <h1>{job.title}</h1>
      <StatusBadge status={job.status} />
      {#if live}<span class="live" aria-label="auto-refreshing">live</span>{/if}
    </div>
    <div class="sub">
      <a class="who" href="/councillors/{job.councillor_slug}">{data.councillorName}</a>
      {#if data.adapter}· <Badge mono>{data.adapter}</Badge>{/if}
      · created {relTime(job.created_at)}
      {#if job.started_at}· started {relTime(job.started_at)}{/if}
      {#if job.finished_at}· finished {relTime(job.finished_at)}{/if}
      {#if job.exit_code !== null}· exit <code class:bad={job.exit_code !== 0}>{job.exit_code}</code>{/if}
      {#if fromSchedule}· from schedule <a href="/schedules/{fromSchedule}">{fromSchedule}</a>{/if}
    </div>
  </div>
  <div class="controls">
    {#if job.status === 'queued'}
      <form method="POST" action="?/start"><Button type="submit" variant="primary">Start</Button></form>
    {/if}
    {#if job.status === 'running'}
      <form method="POST" action="?/cancel"><Button type="submit" variant="danger">Cancel</Button></form>
    {/if}
    {#if job.status === 'succeeded' || job.status === 'failed' || job.status === 'cancelled'}
      <form method="POST" action="?/rerun"><Button type="submit" variant="primary">Re-run</Button></form>
    {/if}
  </div>
</header>

{#if job.status === 'failed'}
  <!-- Recovery panel: surface the failure cause and the fastest path forward. -->
  <section class="recover">
    <div class="recover-head">
      <span class="recover-icon" aria-hidden="true">✕</span>
      <div>
        <h2>Job failed{#if job.exit_code !== null} · exit {job.exit_code}{/if}</h2>
        <p class="recover-hint">
          Re-running clones this brief into a fresh job. If the adapter is the problem,
          check <a href="/councillors/{job.councillor_slug}">{data.councillorName}</a>'s settings.
        </p>
      </div>
    </div>
    {#if job.error}<pre class="block error">{job.error}</pre>{/if}
    {#if job.reflection_error}<p class="hint">Reflection also failed: {job.reflection_error}</p>{/if}
    <div class="recover-actions">
      <form method="POST" action="?/rerun"><Button type="submit" variant="primary">Re-run job</Button></form>
      <Button href="/councillors/{job.councillor_slug}">Check adapter</Button>
      <Button href="/jobs/new?for={job.councillor_slug}">Edit &amp; create new</Button>
    </div>
  </section>
{/if}

<section class="brief">
  <h2>Brief</h2>
  <pre class="block">{job.brief}</pre>
</section>

<div class="tabs" role="tablist" aria-label="Job artifacts">
  {#each tabs as t (t.key)}
    <button
      type="button"
      role="tab"
      aria-selected={active === t.key}
      class="tab"
      class:active={active === t.key}
      onclick={() => (selected = t.key)}
    >
      {t.label}{#if t.n !== undefined}<span class="n">{t.n}</span>{/if}
    </button>
  {/each}
</div>

<div class="panel" role="tabpanel">
  {#if active === 'output'}
    {#if data.output}
      <Markdown source={data.output} />
    {:else}
      <p class="empty">No output produced.</p>
    {/if}
  {:else if active === 'transcript'}
    {#if data.transcript}
      <Markdown source={data.transcript} />
    {:else if live}
      <p class="empty">Waiting for the adapter to produce output…</p>
    {:else}
      <p class="empty">No transcript recorded.</p>
    {/if}
  {:else if active === 'prompt'}
    <pre class="block">{data.input}</pre>
  {:else if active === 'events'}
    {#if data.events.length === 0}
      <p class="empty">No events.</p>
    {:else}
      <ul class="events">
        {#each data.events as e}
          <li><code class="at">{e.at}</code> <strong>{e.type}</strong>{#if e.message} — {e.message}{/if}</li>
        {/each}
      </ul>
    {/if}
  {:else if active === 'memory'}
    {#if job.memory_slugs?.length}
      <h3>Private memory</h3>
      <ul class="mem-list">
        {#each job.memory_slugs as slug}
          <li><a href="/councillors/{job.councillor_slug}/memory/{slug}">{slug}</a></li>
        {/each}
      </ul>
    {/if}
    {#if job.shared_memory_slugs?.length}
      <h3>Shared memory</h3>
      <ul class="mem-list">
        {#each job.shared_memory_slugs as slug}
          <li><a href="/memory/{slug}">{slug}</a></li>
        {/each}
      </ul>
    {/if}
  {:else if active === 'proposals'}
    <ul class="prop-list">
      {#each data.proposals as p (p.id)}
        <li class="prop">
          <div class="prop-head">
            <a class="prop-title" href="/proposals?status={p.status}">{p.title}</a>
            <Badge tone={p.status === 'approved' ? 'accent' : 'neutral'}>{p.status}</Badge>
          </div>
          <div class="prop-meta">
            target: {p.target_councillor === 'all' ? 'all' : p.target_councillor ?? 'unassigned'}
            · priority {p.priority}
            {#if p.status === 'approved' && p.resulting_job_ids}
              · → {#each p.resulting_job_ids as jid, i (jid)}{#if i > 0}, {/if}<a href="/jobs/{jid}">{jid}</a>{/each}
            {:else if p.status === 'rejected' && p.reason}
              · {p.reason}
            {/if}
          </div>
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .cockpit {
    position: sticky;
    top: 0;
    z-index: 5;
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 1rem;
    padding: 1rem 0;
    margin-bottom: 1.25rem;
    background: linear-gradient(var(--bg) 78%, transparent);
  }
  .back { color: var(--muted); text-decoration: none; font-size: 0.85em; }
  .back:hover { color: var(--accent); }
  .title-row { display: flex; align-items: center; gap: 0.6rem; flex-wrap: wrap; margin-top: 0.3rem; }
  h1 { margin: 0; font-size: 1.5rem; }
  .live {
    font-size: 0.7em; text-transform: uppercase; letter-spacing: 0.05em;
    color: var(--info); border: 1px solid var(--info); border-radius: var(--radius-pill);
    padding: 0.05em 0.5em;
  }
  .sub { color: var(--muted); font-size: 0.88em; margin-top: 0.45rem; display: flex; flex-wrap: wrap; gap: 0.35rem; align-items: center; }
  .sub a { color: var(--muted); text-decoration: none; }
  .sub a:hover { color: var(--accent); }
  .sub .who { color: var(--fg); }
  .sub code { font-family: var(--font-mono); }
  .sub code.bad { color: var(--danger); }
  .controls { display: flex; gap: 0.5rem; flex-shrink: 0; }
  .controls form { margin: 0; }

  h2 { margin: 0 0 0.5rem; font-size: 1.1em; }
  h3 { margin: 1.1rem 0 0.4rem; font-size: 0.95em; color: var(--muted); }
  .empty { color: var(--muted); }

  .recover {
    margin: 0 0 1.5rem;
    padding: 1rem 1.1rem;
    border: 1px solid var(--danger);
    border-left-width: 4px;
    border-radius: var(--radius-lg);
    background: var(--danger-soft);
  }
  .recover-head { display: flex; gap: 0.75rem; align-items: flex-start; }
  .recover-icon {
    flex-shrink: 0; width: 1.5rem; height: 1.5rem; border-radius: 50%;
    display: inline-flex; align-items: center; justify-content: center;
    background: var(--danger); color: var(--bg); font-size: 0.8em; font-weight: 700;
  }
  .recover h2 { margin: 0; color: var(--danger); }
  .recover-hint { color: var(--muted); font-size: 0.88em; margin: 0.3rem 0 0; }
  .recover-hint a { color: var(--accent); }
  .recover-actions { display: flex; flex-wrap: wrap; gap: 0.5rem; margin-top: 0.9rem; }
  .recover-actions form { margin: 0; }
  .hint { color: var(--muted); font-size: 0.85em; margin: 0.5rem 0 0; }

  .brief { margin-bottom: 1.5rem; }

  .tabs {
    display: flex; flex-wrap: wrap; gap: 0.3rem;
    border-bottom: 1px solid var(--border);
    margin-bottom: 1.25rem;
  }
  .tab {
    display: inline-flex; align-items: center; gap: 0.4rem;
    padding: 0.5rem 0.85rem;
    border: 0; border-bottom: 2px solid transparent;
    background: none; color: var(--muted); cursor: pointer;
    font-size: 0.9em; margin-bottom: -1px;
  }
  .tab:hover { color: var(--fg); }
  .tab.active { color: var(--accent); border-bottom-color: var(--accent); }
  .tab .n {
    font-variant-numeric: tabular-nums; font-size: 0.8em;
    color: var(--faint); background: var(--surface-2);
    border-radius: var(--radius-pill); padding: 0 0.4em;
  }
  .tab.active .n { color: var(--accent); }

  .panel { min-height: 4rem; }
  .events { list-style: none; padding: 0; margin: 0; font-size: 0.85em; display: grid; gap: 0.2rem; }
  .events .at { color: var(--faint); margin-right: 0.5rem; }
  .mem-list { list-style: none; padding: 0; display: grid; gap: 0.3rem; margin: 0; }
  .mem-list a { color: var(--fg); }
  .mem-list a:hover { color: var(--accent); }
  .prop-list { list-style: none; padding: 0; display: grid; gap: 0.5rem; margin: 0; }
  .prop { border: 1px solid var(--border); border-radius: var(--radius); padding: 0.6rem 0.75rem; }
  .prop-head { display: flex; justify-content: space-between; gap: 0.5rem; align-items: center; }
  .prop-title { font-weight: 500; color: var(--fg); text-decoration: none; }
  .prop-title:hover { color: var(--accent); }
  .prop-meta { color: var(--muted); font-size: 0.85em; margin-top: 0.25rem; }
  .prop-meta a { color: var(--fg); }
  .prop-meta a:hover { color: var(--accent); }

  @media (max-width: 640px) {
    .cockpit { flex-direction: column; }
  }
</style>
