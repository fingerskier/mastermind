<script lang="ts">
  import { marked } from 'marked';
  import type { ActionData, PageData } from './$types';
  let { data, form }: { data: PageData; form: ActionData } = $props();
  const c = $derived(data.councillor);
  const adapters = $derived(data.adapters);
  const memories = $derived(data.memories);
  const currentAdapter = $derived(c.adapter ?? '');
  const isKnown = $derived(currentAdapter === '' || adapters.some((a) => a.id === currentAdapter));
  const currentNote = $derived(adapters.find((a) => a.id === currentAdapter)?.note ?? '');
  const personaHtml = $derived(
    c.persona.trim() ? (marked.parse(c.persona, { async: false, gfm: true, breaks: false }) as string) : ''
  );

  let personaOpenedFlash = $state(false);
  $effect(() => {
    if (form?.personaOpened) {
      personaOpenedFlash = true;
      const t = setTimeout(() => { personaOpenedFlash = false; }, 3000);
      return () => clearTimeout(t);
    }
  });
</script>

<p><a href="/">&larr; Back to council</a></p>

<header class="head">
  <div>
    <h1>{c.name}</h1>
    <p class="meta">
      Role: <strong>{c.role}</strong>
      · Created {new Date(c.created_at).toLocaleString()}
    </p>
  </div>
  <div class="head-actions">
    <a class="btn" href="/councillors/{c.slug}/edit">Edit</a>
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
  <div class="section-head">
    <h2>Persona</h2>
    <form method="POST" action="?/openPersona">
      <button class="btn" type="submit" title="Open persona.md in your default editor">Edit</button>
    </form>
  </div>
  {#if personaOpenedFlash}<p class="saved flash">Opening persona.md in your default editor…</p>{/if}
  {#if personaHtml}
    <div class="persona-md">{@html personaHtml}</div>
  {:else}
    <p class="empty">No persona written yet.</p>
  {/if}
</section>

<section>
  <h2>Memory</h2>
  {#if memories.length === 0}
    <p class="empty">No memories yet. They accrue automatically after successful jobs.</p>
  {:else}
    <ul class="mem-list">
      {#each memories as m (m.slug)}
        <li>
          <a class="mem-card" href="/councillors/{c.slug}/memory/{m.slug}">
            <div class="mem-title">{m.title}</div>
            <div class="mem-meta">Updated {new Date(m.updated_at).toLocaleString()}</div>
          </a>
        </li>
      {/each}
    </ul>
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
  .flash { animation: flash-fade 3s ease-out forwards; }
  @keyframes flash-fade {
    0%, 70% { opacity: 1; }
    100% { opacity: 0; }
  }
  @media (prefers-reduced-motion: reduce) {
    .flash { animation: none; }
  }
  .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0; }
  .section-head { display: flex; align-items: center; justify-content: space-between; gap: 1rem; }
  .section-head h2 { margin: 1rem 0 0.5rem; }
  .section-head form { margin: 0; }
  .persona-md {
    background: #1a1d24;
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 0.75rem 1.25rem;
    font-size: 0.95em;
    line-height: 1.55;
  }
  .persona-md :global(h1),
  .persona-md :global(h2),
  .persona-md :global(h3),
  .persona-md :global(h4) { margin: 1em 0 0.4em; line-height: 1.25; }
  .persona-md :global(h1) { font-size: 1.4em; }
  .persona-md :global(h2) { font-size: 1.2em; }
  .persona-md :global(h3) { font-size: 1.05em; }
  .persona-md :global(p) { margin: 0.5em 0; }
  .persona-md :global(ul),
  .persona-md :global(ol) { padding-left: 1.4em; margin: 0.5em 0; }
  .persona-md :global(li) { margin: 0.15em 0; }
  .persona-md :global(code) {
    background: #0f1115;
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 0.05em 0.35em;
    font-family: ui-monospace, "Cascadia Mono", Consolas, monospace;
    font-size: 0.9em;
  }
  .persona-md :global(pre) {
    background: #0f1115;
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 0.8rem 1rem;
    overflow-x: auto;
  }
  .persona-md :global(pre code) { background: transparent; border: 0; padding: 0; }
  .persona-md :global(blockquote) {
    border-left: 3px solid var(--border);
    color: var(--muted);
    margin: 0.5em 0;
    padding: 0.1em 0.9em;
  }
  .persona-md :global(a) { color: var(--accent); }
  .persona-md :global(hr) { border: 0; border-top: 1px solid var(--border); margin: 1em 0; }
  .btn { display: inline-block; padding: 0.5rem 0.9rem; border-radius: 6px; border: 1px solid var(--border); text-decoration: none; color: var(--fg); background: transparent; cursor: pointer; }
  .btn.primary { background: var(--accent); color: #0f1115; border-color: var(--accent); font-weight: 600; }
  .btn.danger { border-color: var(--danger); color: var(--danger); }
  .mem-list { list-style: none; padding: 0; display: grid; gap: 0.6rem; }
  .mem-card { display: block; border: 1px solid var(--border); border-radius: 6px; padding: 0.6rem 0.8rem; text-decoration: none; color: var(--fg); }
  .mem-card:hover { border-color: var(--accent); }
  .mem-title { font-weight: 500; }
  .mem-meta { color: var(--muted); font-size: 0.8em; margin-top: 0.2rem; }
</style>
