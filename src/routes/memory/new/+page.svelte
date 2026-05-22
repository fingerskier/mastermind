<script lang="ts">
  import type { ActionData, PageData } from './$types';
  let { data, form }: { data: PageData; form: ActionData } = $props();
  const c = $derived(data.council);
</script>

<p><a href="/">&larr; {c.name}</a></p>

<h1>New memory note</h1>

{#if form?.error}<p class="error">{form.error}</p>{/if}

<form method="POST" class="stack">
  <label>
    <span>Title</span>
    <input name="title" required value={form?.title ?? ''} />
  </label>
  <label>
    <span>Body (markdown)</span>
    <textarea name="body" rows="14" placeholder="Notes shared with every councillor when they run a job.">{form?.body ?? ''}</textarea>
  </label>
  <div class="actions">
    <a class="btn" href="/">Cancel</a>
    <button class="btn primary" type="submit">Save note</button>
  </div>
</form>

<style>
  h1 { margin: 0 0 1.5rem; }
  .error { color: var(--danger); }
  .stack { display: grid; gap: 1rem; max-width: 640px; }
  label { display: grid; gap: 0.3rem; }
  label span { font-size: 0.9em; color: var(--muted); }
  input, textarea {
    background: transparent; color: var(--fg);
    border: 1px solid var(--border); border-radius: 6px; padding: 0.55rem 0.7rem;
  }
  textarea { resize: vertical; min-height: 6rem; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
  .actions { display: flex; gap: 0.5rem; justify-content: flex-end; }
  .btn { display: inline-block; padding: 0.5rem 0.9rem; border-radius: 6px; border: 1px solid var(--border); text-decoration: none; color: var(--fg); background: transparent; cursor: pointer; }
  .btn.primary { background: var(--accent); color: #0f1115; border-color: var(--accent); font-weight: 600; }
</style>
