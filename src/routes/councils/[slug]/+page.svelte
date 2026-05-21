<script lang="ts">
  import type { PageData } from './$types';
  let { data }: { data: PageData } = $props();
  const c = $derived(data.council);
  const jobs = $derived(data.jobs);
  const notes = $derived(data.notes);
  const running = $derived(new Set(data.running.map((r) => r.councillor)));

  function statusClass(status: string): string {
    return `status status-${status}`;
  }
</script>

<p><a href="/">&larr; Councils</a></p>

<header class="head">
  <div>
    <h1>{c.name}</h1>
    {#if c.description}<p class="desc">{c.description}</p>{/if}
    <p class="meta">
      {#if c.template}Template: <code>{c.template}</code> ·{/if}
      Created {new Date(c.created_at).toLocaleString()}
    </p>
  </div>
  <div class="head-actions">
    <a class="btn" href="/councils/{c.slug}/edit">Edit</a>
    <form method="POST" action="?/delete" onsubmit={(e) => { if (!confirm(`Delete council "${c.name}"? This cannot be undone.`)) e.preventDefault(); }}>
      <button class="btn danger" type="submit">Delete</button>
    </form>
  </div>
</header>

<section class="councillors">
  <div class="section-head">
    <h2>Councillors</h2>
    <a class="btn primary" href="/councils/{c.slug}/councillors/new">+ New councillor</a>
  </div>

  {#if c.councillors.length === 0}
    <p class="empty">No councillors yet.</p>
  {:else}
    <ul class="list">
      {#each c.councillors as cl (cl.slug)}
        <li>
          <a class="card" href="/councils/{c.slug}/councillors/{cl.slug}">
            <div class="card-title">
              {cl.name}
              {#if running.has(cl.slug)}<span class="dot running" title="Running a job">●</span>{/if}
            </div>
            <div class="card-desc">
              {cl.role}{#if cl.adapter} · <code>{cl.adapter}</code>{/if}
            </div>
          </a>
        </li>
      {/each}
    </ul>
  {/if}
</section>

<section class="panel">
  <div class="section-head">
    <h2>Activity</h2>
    <a class="btn primary" href="/councils/{c.slug}/jobs/new">+ New job</a>
  </div>
  {#if jobs.length === 0}
    <p class="empty">No jobs yet.</p>
  {:else}
    <ul class="list">
      {#each jobs.slice(0, 10) as j (j.id)}
        <li>
          <a class="card" href="/councils/{c.slug}/jobs/{j.id}">
            <div class="card-title">
              {j.title}
              <span class={statusClass(j.status)}>{j.status}</span>
            </div>
            <div class="card-desc">
              {j.councillor_slug} · {new Date(j.created_at).toLocaleString()}
            </div>
          </a>
        </li>
      {/each}
    </ul>
  {/if}
</section>

<section class="panel">
  <div class="section-head">
    <h2>Memory</h2>
    <a class="btn primary" href="/councils/{c.slug}/memory/new">+ New note</a>
  </div>
  {#if notes.length === 0}
    <p class="empty">No shared notes yet.</p>
  {:else}
    <ul class="list">
      {#each notes as n (n.slug)}
        <li>
          <a class="card" href="/councils/{c.slug}/memory/{n.slug}">
            <div class="card-title">{n.title}</div>
            <div class="card-desc">Updated {new Date(n.updated_at).toLocaleString()}</div>
          </a>
        </li>
      {/each}
    </ul>
  {/if}
</section>

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
  .list { list-style: none; padding: 0; display: grid; gap: 0.75rem; }
  .card { display: block; border: 1px solid var(--border); border-radius: 8px; padding: 1rem 1.1rem; text-decoration: none; color: var(--fg); }
  .card:hover { border-color: var(--accent); }
  .card-title { font-weight: 600; display: flex; gap: 0.5rem; align-items: center; }
  .card-desc { color: var(--muted); margin-top: 0.25rem; font-size: 0.95em; }
  .btn { display: inline-block; padding: 0.5rem 0.9rem; border-radius: 6px; border: 1px solid var(--border); text-decoration: none; color: var(--fg); background: transparent; cursor: pointer; }
  .btn.primary { background: var(--accent); color: #0f1115; border-color: var(--accent); font-weight: 600; }
  .btn.danger { border-color: var(--danger); color: var(--danger); }
  .status { font-size: 0.75em; padding: 0.15rem 0.5rem; border-radius: 999px; border: 1px solid var(--border); color: var(--muted); font-weight: 500; }
  .status-running { color: var(--accent); border-color: var(--accent); }
  .status-succeeded { color: #8bb98b; border-color: #4f6b4f; }
  .status-failed { color: var(--danger); border-color: var(--danger); }
  .status-cancelled { color: var(--muted); border-color: var(--border); }
  .dot.running { color: var(--accent); animation: pulse 1.4s ease-in-out infinite; }
  @keyframes pulse { 50% { opacity: 0.3; } }
</style>
