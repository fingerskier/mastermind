<script lang="ts">
  import type { ActionData, PageData } from './$types';
  let { data, form }: { data: PageData; form: ActionData } = $props();
  const c = $derived(data.council);
</script>

<p><a href="/councils/{c.slug}">&larr; {c.name}</a></p>
<h1>Edit council</h1>

<form method="POST" class="form">
  {#if form?.error}<div class="error">{form.error}</div>{/if}

  <label>
    <span>Name</span>
    <input name="name" required maxlength="80" value={form?.name ?? c.name} />
  </label>

  <label>
    <span>Description</span>
    <textarea name="description" rows="3" maxlength="500">{form?.description ?? c.description}</textarea>
  </label>

  <label>
    <span>Template <em>(optional)</em></span>
    <input name="template" maxlength="80" value={form?.template ?? c.template ?? ''} />
  </label>

  <details class="advanced" open={!!(form?.working_dir ?? c.working_dir)}>
    <summary>Advanced</summary>
    <label>
      <span>Source directory <em>(optional)</em></span>
      <input
        name="working_dir"
        maxlength="500"
        placeholder="e.g. C:\dev\my-project — leave blank to use the council folder"
        value={form?.working_dir ?? c.working_dir ?? ''}
      />
      <small class="hint">
        Absolute path the council's adapters run in. When set, CLI councillors
        (claude, codex, …) execute with their working directory here instead
        of the council's own folder. Useful for linking a council to a
        codebase. Leave blank to revert to the default.
      </small>
    </label>
  </details>

  <div class="actions">
    <button type="submit" class="btn primary">Save</button>
    <a href="/councils/{c.slug}" class="btn">Cancel</a>
  </div>
</form>

<style>
  .form { display: grid; gap: 1rem; max-width: 560px; }
  label { display: grid; gap: 0.35rem; }
  label > span { color: var(--muted); font-size: 0.9em; }
  input, textarea { background: #1a1d24; color: var(--fg); border: 1px solid var(--border); border-radius: 6px; padding: 0.55rem 0.7rem; }
  input:focus, textarea:focus { outline: 2px solid var(--accent); border-color: var(--accent); }
  .actions { display: flex; gap: 0.5rem; }
  .btn { display: inline-block; padding: 0.5rem 0.9rem; border-radius: 6px; border: 1px solid var(--border); text-decoration: none; color: var(--fg); background: transparent; cursor: pointer; }
  .btn.primary { background: var(--accent); color: #0f1115; border-color: var(--accent); font-weight: 600; }
  .error { background: rgba(210,114,114,0.15); border: 1px solid var(--danger); color: var(--danger); padding: 0.6rem 0.8rem; border-radius: 6px; }
  .advanced { border: 1px solid var(--border); border-radius: 6px; padding: 0.5rem 0.8rem; background: rgba(255,255,255,0.02); }
  .advanced > summary { cursor: pointer; color: var(--muted); font-size: 0.9em; padding: 0.25rem 0; }
  .advanced[open] > summary { color: var(--fg); margin-bottom: 0.6rem; }
  .advanced label { margin-top: 0.25rem; }
  .hint { color: var(--muted); font-size: 0.8em; line-height: 1.4; }
</style>
