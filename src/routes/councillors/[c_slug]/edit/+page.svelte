<script lang="ts">
  import type { ActionData, PageData } from './$types';
  import { Button, PageHeader } from '$lib/components';
  let { data, form }: { data: PageData; form: ActionData } = $props();
  const c = $derived(data.councillor);
  const adapters = $derived(data.adapters);
  const initialAdapter = $derived(form?.adapter ?? c.adapter ?? '');
  const isKnown = $derived(initialAdapter === '' || adapters.some((a) => a.id === initialAdapter));
</script>

<PageHeader title="Edit councillor" back="/councillors/{c.slug}" backLabel={c.name} />

<form method="POST" class="form">
  {#if form?.error}<div class="alert error">{form.error}</div>{/if}

  <label class="field">
    <span class="label">Name</span>
    <input class="input" name="name" required maxlength="80" value={form?.name ?? c.name} />
  </label>

  <label class="field">
    <span class="label">Role</span>
    <input class="input" name="role" required maxlength="80" value={form?.role ?? c.role} />
  </label>

  <label class="field">
    <span class="label">Routing hint <em>(optional)</em></span>
    <input class="input" name="routing_hint" maxlength="160" value={form?.routing_hint ?? c.routing_hint ?? ''} placeholder="e.g. SvelteKit code + parser internals" />
    <span class="hint">Helps the director route matching jobs to this councillor.</span>
  </label>

  <label class="field">
    <span class="label">Adapter <em>(optional)</em></span>
    <select class="input" name="adapter">
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

  <label class="field">
    <span class="label">Persona <em>(markdown)</em></span>
    <textarea class="input mono" name="persona" rows="14">{form?.persona ?? c.persona}</textarea>
    <span class="hint">Markdown shaping how this councillor reasons, decides, and speaks.</span>
  </label>

  <div class="actions">
    <Button type="submit" variant="primary">Save</Button>
    <Button href="/councillors/{c.slug}">Cancel</Button>
  </div>
</form>

<style>
  .form { display: grid; gap: 1rem; max-width: 640px; }
  .mono { font-family: var(--font-mono); }
  .actions { display: flex; gap: 0.5rem; }
</style>
