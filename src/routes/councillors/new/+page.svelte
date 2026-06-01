<script lang="ts">
  import type { ActionData, PageData } from './$types';
  import { Button, PageHeader } from '$lib/components';
  let { data, form }: { data: PageData; form: ActionData } = $props();
  const adapters = $derived(data.adapters);
  const initialAdapter = $derived(form?.adapter ?? '');
</script>

<PageHeader title="New councillor" back="/council" backLabel="Back to council" />

<form method="POST" class="form">
  {#if form?.error}<div class="alert error">{form.error}</div>{/if}

  <label class="field">
    <span class="label">Name</span>
    <input class="input" name="name" required maxlength="80" value={form?.name ?? ''} />
  </label>

  <label class="field">
    <span class="label">Role</span>
    <input class="input" name="role" required maxlength="80" value={form?.role ?? ''} placeholder="e.g. CFO, Macro Strategist" />
  </label>

  <label class="field">
    <span class="label">Routing hint <em>(optional)</em></span>
    <input class="input" name="routing_hint" maxlength="160" value={form?.routing_hint ?? ''} placeholder="e.g. SvelteKit code + parser internals" />
    <span class="hint">Helps the director route matching jobs to this councillor.</span>
  </label>

  <label class="field">
    <span class="label">Adapter <em>(optional)</em></span>
    <select class="input" name="adapter">
      <option value="" selected={initialAdapter === ''}>— none (set later) —</option>
      {#each adapters as a (a.id)}
        <option value={a.id} selected={a.id === initialAdapter} disabled={!a.available}>
          {a.label}{a.available ? '' : ' — unavailable'}
        </option>
      {/each}
    </select>
  </label>

  <label class="field">
    <span class="label">Persona <em>(markdown)</em></span>
    <textarea class="input mono" name="persona" rows="10">{form?.persona ?? ''}</textarea>
    <span class="hint">Markdown shaping how this councillor reasons, decides, and speaks. You can write this later.</span>
  </label>

  <div class="actions">
    <Button type="submit" variant="primary">Create councillor</Button>
    <Button href="/council">Cancel</Button>
  </div>
</form>

<style>
  .form { display: grid; gap: 1rem; max-width: 640px; }
  .mono { font-family: var(--font-mono); }
  .actions { display: flex; gap: 0.5rem; }
</style>
