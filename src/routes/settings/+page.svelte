<script lang="ts">
  import { untrack } from 'svelte';
  import { ENV_KEY_SUGGESTIONS, findEnvSuggestion, startsInCustomMode } from '$lib/env-suggestions';
  import EnvVarRow, { type Row } from './EnvVarRow.svelte';
  import type { ActionData, PageData } from './$types';

  let { data, form }: { data: PageData; form: ActionData } = $props();

  // Seed editable row state once. After a failed save the action echoes the
  // submitted pairs; otherwise we start from the loaded .env. A value that is a
  // literal outside a known key's enum opens in custom mode.
  const initial = untrack(
    () => (form && 'pairs' in form && form.pairs ? form.pairs : data.pairs) ?? []
  );

  let rows = $state<Row[]>(
    initial.map((p) => ({
      key: p.key,
      value: p.value,
      revealed: false,
      custom: startsInCustomMode(p.value, findEnvSuggestion(p.key)?.values)
    }))
  );

  function addRow() {
    rows = [...rows, { key: '', value: '', revealed: false, custom: false }];
  }
  function removeRow(i: number) {
    rows = rows.filter((_, idx) => idx !== i);
  }
</script>

<p><a href="/">&larr; Home</a></p>
<h1>Settings</h1>
<p class="note">
  Council environment variables (API keys, model overrides) are written to a
  <code>.env</code> file in this council's directory and loaded for adapter CLIs.
  <strong>Changes take effect after restarting Landsraad.</strong>
</p>

<datalist id="env-key-suggestions">
  {#each ENV_KEY_SUGGESTIONS as s (s.key)}
    <option value={s.key} label={s.description}></option>
  {/each}
</datalist>

<form method="POST" class="form">
  {#if form && 'error' in form && form.error}<div class="error">{form.error}</div>{/if}
  {#if form && 'saved' in form && form.saved}<div class="saved">Saved.</div>{/if}

  <div class="rows">
    {#each rows as row, i (i)}
      <EnvVarRow bind:row={rows[i]} onremove={() => removeRow(i)} />
    {/each}
    {#if rows.length === 0}
      <p class="empty">No variables yet.</p>
    {/if}
  </div>

  <div class="actions">
    <button type="button" class="btn" onclick={addRow}>+ Add variable</button>
    <button type="submit" class="btn primary">Save</button>
    <a href="/" class="btn">Cancel</a>
  </div>
</form>

<style>
  .form { display: grid; gap: 1rem; max-width: 640px; }
  .note { color: var(--muted); font-size: 0.9em; max-width: 640px; }
  .note code { background: #1a1d24; padding: 0.1em 0.35em; border-radius: 4px; }
  .rows { display: grid; gap: 0.5rem; }
  .empty { color: var(--muted); font-size: 0.9em; }
  .actions { display: flex; gap: 0.5rem; }
  .btn { display: inline-block; padding: 0.5rem 0.9rem; border-radius: 6px; border: 1px solid var(--border); text-decoration: none; color: var(--fg); background: transparent; cursor: pointer; }
  .btn.primary { background: var(--accent); color: #0f1115; border-color: var(--accent); font-weight: 600; }
  .error { background: rgba(210,114,114,0.15); border: 1px solid var(--danger); color: var(--danger); padding: 0.6rem 0.8rem; border-radius: 6px; }
  .saved { background: rgba(120,190,140,0.15); border: 1px solid #5aa06e; color: #8fcea3; padding: 0.6rem 0.8rem; border-radius: 6px; }
</style>
