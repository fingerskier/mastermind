<script lang="ts">
  import type { ActionData, PageData } from './$types';
  let { data, form }: { data: PageData; form: ActionData } = $props();
  const c = $derived(data.council);
</script>

<p><a href="/">&larr; {c.name}</a></p>

<h1>New job</h1>

{#if form?.error}<p class="error">{form.error}</p>{/if}

{#if c.councillors.length === 0}
  <p class="empty">Add a councillor first.</p>
  <p><a class="btn primary" href="/councillors/new">+ New councillor</a></p>
{:else}
  <form method="POST" class="stack">
    <label>
      <span>Title</span>
      <input name="title" required value={form?.title ?? ''} />
    </label>
    <label>
      <span>Assigned councillor</span>
      <select name="councillor_slug" required>
        <option value="">— select —</option>
        <option value="__all__" selected={form?.councillor_slug === '__all__'}>All councillors ({c.councillors.length})</option>
        {#each c.councillors as cl (cl.slug)}
          <option value={cl.slug} selected={form?.councillor_slug === cl.slug}>{cl.name} — {cl.role || 'no role'} ({cl.adapter || 'no adapter'})</option>
        {/each}
      </select>
    </label>
    <label>
      <span>Brief</span>
      <textarea name="brief" rows="10" required>{form?.brief ?? ''}</textarea>
    </label>
    <label class="check">
      <input type="checkbox" name="start_now" checked />
      <span>Start immediately</span>
    </label>
    <div class="actions">
      <a class="btn" href="/">Cancel</a>
      <button class="btn primary" type="submit">Create job</button>
    </div>
  </form>
{/if}

<style>
  h1 { margin: 0 0 1.5rem; }
  .error { color: var(--danger); }
  .empty { color: var(--muted); }
  .stack { display: grid; gap: 1rem; max-width: 640px; }
  label { display: grid; gap: 0.3rem; }
  label span { font-size: 0.9em; color: var(--muted); }
  label.check { grid-auto-flow: column; justify-content: start; align-items: center; gap: 0.5rem; }
  label.check span { color: var(--fg); }
  input, textarea, select {
    background: #1a1d24; color: var(--fg);
    border: 1px solid var(--border); border-radius: 6px; padding: 0.55rem 0.7rem;
  }
  input:focus, textarea:focus, select:focus { outline: 2px solid var(--accent); border-color: var(--accent); }
  select option { background: #1a1d24; color: var(--fg); }
  textarea { resize: vertical; min-height: 6rem; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
  .actions { display: flex; gap: 0.5rem; justify-content: flex-end; }
  .btn { display: inline-block; padding: 0.5rem 0.9rem; border-radius: 6px; border: 1px solid var(--border); text-decoration: none; color: var(--fg); background: transparent; cursor: pointer; }
  .btn.primary { background: var(--accent); color: #0f1115; border-color: var(--accent); font-weight: 600; }
</style>
