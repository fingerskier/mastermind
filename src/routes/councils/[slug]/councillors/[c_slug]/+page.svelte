<script lang="ts">
  import { page } from '$app/state';
  import type { ActionData, PageData } from './$types';
  let { data, form }: { data: PageData; form: ActionData } = $props();
  const c = $derived(data.councillor);
  const adapters = $derived(data.adapters);
  const councilSlug = $derived(page.params.slug);
  const currentAdapter = $derived(c.adapter ?? '');
  const isKnown = $derived(currentAdapter === '' || adapters.some((a) => a.id === currentAdapter));
  const currentNote = $derived(adapters.find((a) => a.id === currentAdapter)?.note ?? '');
</script>

<p><a href="/councils/{councilSlug}">&larr; Back to council</a></p>

<header class="head">
  <div>
    <h1>{c.name}</h1>
    <p class="meta">
      Role: <strong>{c.role}</strong>
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

<section class="adapter-panel">
  <h2>Adapter</h2>
  <form method="POST" action="?/setAdapter" class="adapter-form">
    <label>
      <span class="sr-only">Adapter</span>
      <select name="adapter">
        <option value="" selected={currentAdapter === ''}>— none (cannot run jobs) —</option>
        {#if !isKnown}
          <option value={currentAdapter} selected>{currentAdapter} (custom)</option>
        {/if}
        {#each adapters as a (a.id)}
          <option value={a.id} selected={a.id === currentAdapter} disabled={!a.available}>
            {a.label}{a.available ? '' : ' — unavailable'}
          </option>
        {/each}
      </select>
    </label>
    <button class="btn primary" type="submit">Save adapter</button>
  </form>
  {#if currentNote}<p class="note">{currentNote}</p>{/if}
  {#if form?.error}<p class="error">{form.error}</p>{/if}
  {#if form?.adapterSaved}<p class="saved">Adapter saved.</p>{/if}
</section>

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
  .adapter-panel { margin-bottom: 2rem; }
  .adapter-form { display: flex; gap: 0.5rem; align-items: center; }
  .adapter-form select {
    flex: 1; max-width: 360px;
    background: #1a1d24; color: var(--fg);
    border: 1px solid var(--border); border-radius: 6px;
    padding: 0.55rem 0.7rem; font-family: inherit;
  }
  .adapter-form select:focus { outline: 2px solid var(--accent); border-color: var(--accent); }
  .note { color: var(--muted); font-size: 0.85em; margin: 0.5rem 0 0; }
  .error { color: var(--danger); margin: 0.5rem 0 0; }
  .saved { color: #8bb98b; margin: 0.5rem 0 0; }
  .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0; }
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
  .btn.primary { background: var(--accent); color: #0f1115; border-color: var(--accent); font-weight: 600; }
  .btn.danger { border-color: var(--danger); color: var(--danger); }
</style>
