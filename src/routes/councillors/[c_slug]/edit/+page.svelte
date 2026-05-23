<script lang="ts">
  import type { ActionData, PageData } from './$types';
  let { data, form }: { data: PageData; form: ActionData } = $props();
  const c = $derived(data.councillor);
  const adapters = $derived(data.adapters);
  const initialAdapter = $derived(form?.adapter ?? c.adapter ?? '');
  const isKnown = $derived(initialAdapter === '' || adapters.some((a) => a.id === initialAdapter));
</script>

<p><a href="/councillors/{c.slug}">&larr; {c.name}</a></p>
<h1>Edit councillor</h1>

<form method="POST" class="form">
  {#if form?.error}<div class="error">{form.error}</div>{/if}

  <label>
    <span>Name</span>
    <input name="name" required maxlength="80" value={form?.name ?? c.name} />
  </label>

  <label>
    <span>Role</span>
    <input name="role" required maxlength="80" value={form?.role ?? c.role} />
  </label>

  <label>
    <span>Routing hint <em>(optional)</em></span>
    <input name="routing_hint" maxlength="160" value={form?.routing_hint ?? c.routing_hint ?? ''} placeholder="e.g. SvelteKit code + parser internals" />
  </label>

  <label>
    <span>Adapter <em>(optional)</em></span>
    <select name="adapter">
      <option value="" selected={initialAdapter === ''}>— none (set later) —</option>
      {#if !isKnown}
        <option value={initialAdapter} selected>{initialAdapter} (custom)</option>
      {/if}
      {#each adapters as a (a.id)}
        <option value={a.id} selected={a.id === initialAdapter} disabled={!a.available}>
          {a.label}{a.available ? '' : ' — unavailable'}
        </option>
      {/each}
    </select>
  </label>

  <label>
    <span>Persona <em>(markdown)</em></span>
    <textarea name="persona" rows="14">{form?.persona ?? c.persona}</textarea>
  </label>

  <div class="actions">
    <button type="submit" class="btn primary">Save</button>
    <a href="/councillors/{c.slug}" class="btn">Cancel</a>
  </div>
</form>

<style>
  .form { display: grid; gap: 1rem; max-width: 640px; }
  label { display: grid; gap: 0.35rem; }
  label > span { color: var(--muted); font-size: 0.9em; }
  input, textarea, select { background: #1a1d24; color: var(--fg); border: 1px solid var(--border); border-radius: 6px; padding: 0.55rem 0.7rem; font-family: inherit; }
  textarea { font-family: ui-monospace, "Cascadia Mono", Consolas, monospace; }
  input:focus, textarea:focus, select:focus { outline: 2px solid var(--accent); border-color: var(--accent); }
  .actions { display: flex; gap: 0.5rem; }
  .btn { display: inline-block; padding: 0.5rem 0.9rem; border-radius: 6px; border: 1px solid var(--border); text-decoration: none; color: var(--fg); background: transparent; cursor: pointer; }
  .btn.primary { background: var(--accent); color: #0f1115; border-color: var(--accent); font-weight: 600; }
  .error { background: rgba(210,114,114,0.15); border: 1px solid var(--danger); color: var(--danger); padding: 0.6rem 0.8rem; border-radius: 6px; }
</style>
