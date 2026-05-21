<script lang="ts">
  import { page } from '$app/state';
  import type { PageData } from './$types';
  let { data }: { data: PageData } = $props();
  const c = $derived(data.councillor);
  const councilSlug = $derived(page.params.slug);
</script>

<p><a href="/councils/{councilSlug}">&larr; Back to council</a></p>

<header class="head">
  <div>
    <h1>{c.name}</h1>
    <p class="meta">
      Role: <strong>{c.role}</strong>
      {#if c.adapter} · Adapter: <code>{c.adapter}</code>{/if}
      · Created {new Date(c.created_at).toLocaleString()}
    </p>
  </div>
  <div class="head-actions">
    <a class="btn" href="/councils/{councilSlug}/councillors/{c.slug}/edit">Edit</a>
    <form method="POST" action="?/delete" onsubmit={(e) => { if (!confirm(`Delete councillor "${c.name}"?`)) e.preventDefault(); }}>
      <button class="btn danger" type="submit">Delete</button>
    </form>
  </div>
</header>

<section>
  <h2>Persona</h2>
  {#if c.persona.trim()}
    <pre class="persona">{c.persona}</pre>
  {:else}
    <p class="empty">No persona written yet.</p>
  {/if}
</section>

<style>
  h1 { margin: 0; }
  .meta { color: var(--muted); margin: 0.5rem 0 0; font-size: 0.9em; }
  .head { display: flex; justify-content: space-between; gap: 1rem; align-items: flex-start; margin-bottom: 2rem; }
  .head-actions { display: flex; gap: 0.5rem; align-items: center; }
  h2 { margin: 1rem 0 0.5rem; }
  .empty { color: var(--muted); }
  .persona {
    white-space: pre-wrap;
    background: #1a1d24;
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 1rem;
    font-family: ui-monospace, "Cascadia Mono", Consolas, monospace;
    font-size: 0.95em;
  }
  .btn { display: inline-block; padding: 0.5rem 0.9rem; border-radius: 6px; border: 1px solid var(--border); text-decoration: none; color: var(--fg); background: transparent; cursor: pointer; }
  .btn.danger { border-color: var(--danger); color: var(--danger); }
</style>
