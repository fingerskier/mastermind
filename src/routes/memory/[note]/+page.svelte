<script lang="ts">
  import type { ActionData, PageData } from './$types';
  let { data, form }: { data: PageData; form: ActionData } = $props();
  const c = $derived(data.council);
  const note = $derived(data.note);
</script>

<p><a href="/">&larr; {c.name}</a></p>

<header class="head">
  <div>
    <h1>{note.title}</h1>
    <p class="meta">Updated {new Date(note.updated_at).toLocaleString()}</p>
  </div>
  <form method="POST" action="?/delete" onsubmit={(e) => { if (!confirm(`Delete note "${note.title}"?`)) e.preventDefault(); }}>
    <button class="btn danger" type="submit">Delete</button>
  </form>
</header>

{#if form?.error}<p class="error">{form.error}</p>{/if}
{#if form?.saved}<p class="saved">Saved.</p>{/if}

<form method="POST" action="?/save" class="stack">
  <textarea name="body" rows="20">{note.body}</textarea>
  <div class="actions">
    <a class="btn" href="/">Back</a>
    <button class="btn primary" type="submit">Save</button>
  </div>
</form>

<style>
  h1 { margin: 0; }
  .meta { color: var(--muted); margin: 0.5rem 0 0; font-size: 0.9em; }
  .head { display: flex; justify-content: space-between; gap: 1rem; align-items: flex-start; margin-bottom: 1rem; }
  .error { color: var(--danger); }
  .saved { color: #8bb98b; }
  .stack { display: grid; gap: 1rem; }
  textarea {
    background: transparent; color: var(--fg);
    border: 1px solid var(--border); border-radius: 6px; padding: 0.7rem 0.8rem;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.9em;
    resize: vertical; min-height: 16rem;
  }
  .actions { display: flex; gap: 0.5rem; justify-content: flex-end; }
  .btn { display: inline-block; padding: 0.5rem 0.9rem; border-radius: 6px; border: 1px solid var(--border); text-decoration: none; color: var(--fg); background: transparent; cursor: pointer; }
  .btn.primary { background: var(--accent); color: #0f1115; border-color: var(--accent); font-weight: 600; }
  .btn.danger { border-color: var(--danger); color: var(--danger); }
</style>
