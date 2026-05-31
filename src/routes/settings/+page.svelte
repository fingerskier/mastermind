<script lang="ts">
  import { untrack } from 'svelte';
  import type { ActionData, PageData } from './$types';

  let { data, form }: { data: PageData; form: ActionData } = $props();

  type Row = { key: string; value: string; revealed: boolean };

  // Seed editable row state once. After a failed save the action echoes the
  // submitted pairs; otherwise we start from the loaded .env.
  const initial = untrack(
    () => (form && 'pairs' in form && form.pairs ? form.pairs : data.pairs) ?? []
  );

  let rows = $state<Row[]>(initial.map((p) => ({ key: p.key, value: p.value, revealed: false })));

  function addRow() {
    rows = [...rows, { key: '', value: '', revealed: false }];
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

<form method="POST" class="form">
  {#if form && 'error' in form && form.error}<div class="error">{form.error}</div>{/if}
  {#if form && 'saved' in form && form.saved}<div class="saved">Saved.</div>{/if}

  <div class="rows">
    {#each rows as row, i (i)}
      <div class="row">
        <input name="key" placeholder="KEY" bind:value={row.key} autocomplete="off" spellcheck="false" />
        <input
          name="value"
          placeholder="value"
          type={row.revealed ? 'text' : 'password'}
          bind:value={row.value}
          autocomplete="off"
          spellcheck="false"
        />
        <button
          type="button"
          class="btn icon"
          title={row.revealed ? 'Hide' : 'Reveal'}
          onclick={() => (row.revealed = !row.revealed)}>{row.revealed ? '🙈' : '👁'}</button
        >
        <button type="button" class="btn icon" title="Remove" onclick={() => removeRow(i)}>✕</button>
      </div>
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
  .row { display: grid; grid-template-columns: 1fr 1.5fr auto auto; gap: 0.5rem; align-items: center; }
  input { background: #1a1d24; color: var(--fg); border: 1px solid var(--border); border-radius: 6px; padding: 0.55rem 0.7rem; }
  input:focus { outline: 2px solid var(--accent); border-color: var(--accent); }
  .empty { color: var(--muted); font-size: 0.9em; }
  .actions { display: flex; gap: 0.5rem; }
  .btn { display: inline-block; padding: 0.5rem 0.9rem; border-radius: 6px; border: 1px solid var(--border); text-decoration: none; color: var(--fg); background: transparent; cursor: pointer; }
  .btn.icon { padding: 0.45rem 0.6rem; line-height: 1; }
  .btn.primary { background: var(--accent); color: #0f1115; border-color: var(--accent); font-weight: 600; }
  .error { background: rgba(210,114,114,0.15); border: 1px solid var(--danger); color: var(--danger); padding: 0.6rem 0.8rem; border-radius: 6px; }
  .saved { background: rgba(120,190,140,0.15); border: 1px solid #5aa06e; color: #8fcea3; padding: 0.6rem 0.8rem; border-radius: 6px; }
</style>
