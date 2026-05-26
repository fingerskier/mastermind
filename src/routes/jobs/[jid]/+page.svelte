<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import { onDestroy } from 'svelte';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
  const c = $derived(data.council);
  const job = $derived(data.job);
  const fromSchedule = $derived(data.job.spawned_by_schedule_id ?? null);

  let timer: ReturnType<typeof setInterval> | null = null;

  $effect(() => {
    const live = job.status === 'queued' || job.status === 'running';
    if (live && !timer) {
      timer = setInterval(() => invalidateAll(), 1000);
    } else if (!live && timer) {
      clearInterval(timer);
      timer = null;
    }
  });

  onDestroy(() => { if (timer) clearInterval(timer); });
</script>

<p><a href="/">&larr; {c.name}</a></p>

<header class="head">
  <div>
    <h1>{job.title}</h1>
    <p class="meta">
      <span class="status status-{job.status}">{job.status}</span>
      · {job.councillor_slug}
      · created {new Date(job.created_at).toLocaleString()}
      {#if job.exit_code !== null} · exit {job.exit_code}{/if}
    </p>
    {#if fromSchedule}
      <p class="meta">From schedule: <a href="/schedules/{fromSchedule}">{fromSchedule}</a></p>
    {/if}
  </div>
  <div class="head-actions">
    {#if job.status === 'queued'}
      <form method="POST" action="?/start"><button class="btn primary" type="submit">Start</button></form>
    {/if}
    {#if job.status === 'running'}
      <form method="POST" action="?/cancel"><button class="btn danger" type="submit">Cancel</button></form>
    {/if}
    {#if job.status === 'succeeded' || job.status === 'failed' || job.status === 'cancelled'}
      <form method="POST" action="?/rerun"><button class="btn primary" type="submit">Re-run</button></form>
    {/if}
  </div>
</header>

<section>
  <h2>Brief</h2>
  <pre class="block">{job.brief}</pre>
</section>

<section>
  <h2>Transcript</h2>
  {#if data.transcript}
    <pre class="block">{data.transcript}</pre>
  {:else}
    <p class="empty">No output yet.</p>
  {/if}
</section>

{#if job.status === 'succeeded' && data.output}
  <section>
    <h2>Output</h2>
    <pre class="block">{data.output}</pre>
  </section>
{/if}

{#if job.error}
  <section>
    <h2>Error</h2>
    <pre class="block error">{job.error}</pre>
  </section>
{/if}

{#if job.memory_slugs && job.memory_slugs.length > 0}
  <section>
    <h2>Memories created</h2>
    <ul class="mem-list">
      {#each job.memory_slugs as slug}
        <li><a href="/councillors/{job.councillor_slug}/memory/{slug}">{slug}</a></li>
      {/each}
    </ul>
  </section>
{/if}

{#if data.proposals && data.proposals.length > 0}
  <section>
    <h2>Suggested jobs</h2>
    <ul class="prop-list">
      {#each data.proposals as p (p.id)}
        <li class="prop">
          <div class="prop-head">
            <a class="prop-title" href="/proposals?status={p.status}">{p.title}</a>
            <span class="status status-{p.status}">{p.status}</span>
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
  </section>
{/if}

<details>
  <summary>Prompt sent to adapter</summary>
  <pre class="block">{data.input}</pre>
</details>

<details>
  <summary>Event log ({data.events.length})</summary>
  <ul class="events">
    {#each data.events as e}
      <li><code>{e.at}</code> <strong>{e.type}</strong>{#if e.message} — {e.message}{/if}</li>
    {/each}
  </ul>
</details>

<style>
  h1 { margin: 0; }
  h2 { margin: 2rem 0 0.6rem; font-size: 1.1em; }
  .meta { color: var(--muted); margin: 0.5rem 0 0; font-size: 0.9em; }
  .head { display: flex; justify-content: space-between; gap: 1rem; align-items: flex-start; margin-bottom: 1rem; }
  .head-actions { display: flex; gap: 0.5rem; }
  .block {
    background: #15181f; border: 1px solid var(--border); border-radius: 8px;
    padding: 0.9rem 1rem; white-space: pre-wrap; word-break: break-word;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.9em;
    max-height: 400px; overflow-y: auto;
  }
  .block.error { border-color: var(--danger); color: var(--danger); }
  .empty { color: var(--muted); }
  .status { font-size: 0.75em; padding: 0.15rem 0.5rem; border-radius: 999px; border: 1px solid var(--border); color: var(--muted); font-weight: 500; }
  .status-running { color: var(--accent); border-color: var(--accent); }
  .status-succeeded { color: #8bb98b; border-color: #4f6b4f; }
  .status-failed { color: var(--danger); border-color: var(--danger); }
  .status-cancelled { color: var(--muted); border-color: var(--border); }
  .btn { display: inline-block; padding: 0.5rem 0.9rem; border-radius: 6px; border: 1px solid var(--border); text-decoration: none; color: var(--fg); background: transparent; cursor: pointer; }
  .btn.primary { background: var(--accent); color: #0f1115; border-color: var(--accent); font-weight: 600; }
  .btn.danger { border-color: var(--danger); color: var(--danger); }
  details { margin-top: 1.5rem; }
  summary { cursor: pointer; color: var(--muted); }
  .events { list-style: none; padding: 0.5rem 0; font-size: 0.85em; }
  .events code { color: var(--muted); font-size: 0.85em; margin-right: 0.5rem; }
  .mem-list { list-style: none; padding: 0; display: grid; gap: 0.3rem; }
  .mem-list a { color: var(--fg); }
  .mem-list a:hover { color: var(--accent); }
  .prop-list { list-style: none; padding: 0; display: grid; gap: 0.5rem; }
  .prop { border: 1px solid var(--border); border-radius: 6px; padding: 0.55rem 0.7rem; }
  .prop-head { display: flex; justify-content: space-between; gap: 0.5rem; align-items: center; }
  .prop-title { font-weight: 500; color: var(--fg); text-decoration: none; }
  .prop-title:hover { color: var(--accent); }
  .prop-meta { color: var(--muted); font-size: 0.85em; margin-top: 0.25rem; }
  .prop-meta a { color: var(--fg); }
  .prop-meta a:hover { color: var(--accent); }
</style>
