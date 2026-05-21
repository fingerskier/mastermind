<script lang="ts">
  import type { PageData } from './$types';
  let { data }: { data: PageData } = $props();
  const c = $derived(data.council);
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
            <div class="card-title">{cl.name}</div>
            <div class="card-desc">
              {cl.role}{#if cl.adapter} · <code>{cl.adapter}</code>{/if}
            </div>
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
  .empty { color: var(--muted); padding: 1rem 0; }
  .list { list-style: none; padding: 0; display: grid; gap: 0.75rem; }
  .card { display: block; border: 1px solid var(--border); border-radius: 8px; padding: 1rem 1.1rem; text-decoration: none; color: var(--fg); }
  .card:hover { border-color: var(--accent); }
  .card-title { font-weight: 600; }
  .card-desc { color: var(--muted); margin-top: 0.25rem; font-size: 0.95em; }
  .btn { display: inline-block; padding: 0.5rem 0.9rem; border-radius: 6px; border: 1px solid var(--border); text-decoration: none; color: var(--fg); background: transparent; cursor: pointer; }
  .btn.primary { background: var(--accent); color: #0f1115; border-color: var(--accent); font-weight: 600; }
  .btn.danger { border-color: var(--danger); color: var(--danger); }
</style>
