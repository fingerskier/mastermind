<script lang="ts">
  import type { ActionData, PageData } from './$types';
  let { data, form }: { data: PageData; form: ActionData } = $props();
  const n = $derived(data.note);
</script>

<p><a href="/councillors/{data.c_slug}">&larr; Back to councillor</a></p>

<header class="head">
  <h1>{n.title}</h1>
  <form method="POST" action="?/delete" onsubmit={(e) => { if (!confirm('Delete this memory?')) e.preventDefault(); }}>
    <button class="btn danger" type="submit">Delete</button>
  </form>
</header>

<p class="meta">Updated {new Date(n.updated_at).toLocaleString()}</p>

{#if form?.error}<p class="error">{form.error}</p>{/if}
{#if form?.saved}<p class="saved">Saved.</p>{/if}

<form method="POST" action="?/save">
  <textarea name="body" rows="20">{n.body}</textarea>
  <div class="actions">
    <button class="btn primary" type="submit">Save</button>
  </div>
</form>

<style>
  h1 { margin: 0; }
  .head { display: flex; justify-content: space-between; align-items: center; gap: 1rem; }
  .meta { color: var(--muted); margin: 0.25rem 0 1rem; font-size: 0.9em; }
  textarea {
    width: 100%; background: #1a1d24; color: var(--fg);
    border: 1px solid var(--border); border-radius: 6px;
    padding: 0.7rem; font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 0.9em; min-height: 20rem;
  }
  textarea:focus { outline: 2px solid var(--accent); border-color: var(--accent); }
  .actions { margin-top: 1rem; display: flex; gap: 0.5rem; justify-content: flex-end; }
  .btn { display: inline-block; padding: 0.5rem 0.9rem; border-radius: 6px; border: 1px solid var(--border); text-decoration: none; color: var(--fg); background: transparent; cursor: pointer; }
  .btn.primary { background: var(--accent); color: #0f1115; border-color: var(--accent); font-weight: 600; }
  .btn.danger { border-color: var(--danger); color: var(--danger); }
  .error { color: var(--danger); }
  .saved { color: #8bb98b; }
</style>
