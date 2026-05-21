<script lang="ts">
  import { page } from '$app/state';
  import type { ActionData } from './$types';
  let { form }: { form: ActionData } = $props();
  const councilSlug = $derived(page.params.slug);
</script>

<p><a href="/councils/{councilSlug}">&larr; Back to council</a></p>
<h1>New councillor</h1>

<form method="POST" class="form">
  {#if form?.error}<div class="error">{form.error}</div>{/if}

  <label>
    <span>Name</span>
    <input name="name" required maxlength="80" value={form?.name ?? ''} />
  </label>

  <label>
    <span>Role</span>
    <input name="role" required maxlength="80" value={form?.role ?? ''} placeholder="e.g. CFO, Macro Strategist" />
  </label>

  <label>
    <span>Adapter <em>(optional)</em></span>
    <input name="adapter" maxlength="80" value={form?.adapter ?? ''} placeholder="cli:claude · sdk:anthropic · ..." />
  </label>

  <label>
    <span>Persona <em>(markdown)</em></span>
    <textarea name="persona" rows="10">{form?.persona ?? ''}</textarea>
  </label>

  <div class="actions">
    <button type="submit" class="btn primary">Create councillor</button>
    <a href="/councils/{councilSlug}" class="btn">Cancel</a>
  </div>
</form>

<style>
  .form { display: grid; gap: 1rem; max-width: 640px; }
  label { display: grid; gap: 0.35rem; }
  label > span { color: var(--muted); font-size: 0.9em; }
  input, textarea { background: #1a1d24; color: var(--fg); border: 1px solid var(--border); border-radius: 6px; padding: 0.55rem 0.7rem; font-family: inherit; }
  textarea { font-family: ui-monospace, "Cascadia Mono", Consolas, monospace; }
  input:focus, textarea:focus { outline: 2px solid var(--accent); border-color: var(--accent); }
  .actions { display: flex; gap: 0.5rem; }
  .btn { display: inline-block; padding: 0.5rem 0.9rem; border-radius: 6px; border: 1px solid var(--border); text-decoration: none; color: var(--fg); background: transparent; cursor: pointer; }
  .btn.primary { background: var(--accent); color: #0f1115; border-color: var(--accent); font-weight: 600; }
  .error { background: rgba(210,114,114,0.15); border: 1px solid var(--danger); color: var(--danger); padding: 0.6rem 0.8rem; border-radius: 6px; }
</style>
