<script lang="ts">
  import { untrack } from 'svelte';
  import { ENV_KEY_SUGGESTIONS, findEnvSuggestion, startsInCustomMode } from '$lib/env-suggestions';
  import EnvVarRow, { type Row } from './EnvVarRow.svelte';
  import type { ActionData, PageData } from './$types';

  let { data, form }: { data: PageData; form: ActionData } = $props();
  const c = $derived(data.council);

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
  function addRow() { rows = [...rows, { key: '', value: '', revealed: false, custom: false }]; }
  function removeRow(i: number) { rows = rows.filter((_, idx) => idx !== i); }

  // Identity errors carry `name` (the echoed field) and no `pairs`/`envSaved`.
  const identityError = $derived(
    form && 'name' in form && 'error' in form ? (form as { error?: string }).error : null
  );
</script>

<p><a href="/">&larr; {c.name}</a></p>
<h1>Council</h1>

<section class="block">
  <h2>Identity</h2>
  <form method="POST" action="?/identity" class="form">
    {#if form?.identitySaved}<div class="saved">Saved.</div>{/if}
    {#if identityError}<div class="error">{identityError}</div>{/if}
    <label>
      <span>Name</span>
      <input name="name" required maxlength="80" value={(form as any)?.name ?? c.name} />
    </label>
    <label>
      <span>Description</span>
      <textarea name="description" rows="3" maxlength="500">{(form as any)?.description ?? c.description}</textarea>
    </label>
    <label>
      <span>Template <em>(optional)</em></span>
      <input name="template" maxlength="80" value={(form as any)?.template ?? c.template ?? ''} />
    </label>
    <div class="actions"><button type="submit" class="btn primary">Save</button></div>
  </form>
</section>

<section class="block">
  <div class="section-head">
    <h2>Councillors</h2>
    <a class="btn primary" href="/councillors/new">+ New councillor</a>
  </div>
  {#if c.councillors.length === 0}
    <p class="empty">No councillors yet.</p>
  {:else}
    <ul class="list">
      {#each c.councillors as cl (cl.slug)}
        <li class="row">
          <div class="row-main">
            <a class="row-title" href="/councillors/{cl.slug}">{cl.name}</a>
            <div class="row-sub">{cl.role || 'no role'}{#if cl.adapter} · <code>{cl.adapter}</code>{/if}</div>
          </div>
          <div class="row-actions">
            <a class="btn" href="/councillors/{cl.slug}/edit">Edit</a>
            <form
              method="POST"
              action="?/deleteCouncillor"
              onsubmit={(e) => { if (!confirm(`Delete councillor "${cl.name}"?`)) e.preventDefault(); }}
            >
              <input type="hidden" name="slug" value={cl.slug} />
              <button type="submit" class="btn danger">Delete</button>
            </form>
          </div>
        </li>
      {/each}
    </ul>
  {/if}
</section>

<section class="block">
  <h2>Environment</h2>
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
  <form method="POST" action="?/env" class="form">
    {#if form && 'pairs' in form && 'error' in form && form.error}<div class="error">{form.error}</div>{/if}
    {#if form?.envSaved}<div class="saved">Saved.</div>{/if}
    <div class="rows">
      {#each rows as row, i (i)}
        <EnvVarRow bind:row={rows[i]} onremove={() => removeRow(i)} />
      {/each}
      {#if rows.length === 0}<p class="empty">No variables yet.</p>{/if}
    </div>
    <div class="actions">
      <button type="button" class="btn" onclick={addRow}>+ Add variable</button>
      <button type="submit" class="btn primary">Save</button>
    </div>
  </form>
</section>

<section class="block">
  <h2>Tools</h2>
  <p><a class="btn" href="/export">Export council as template…</a></p>
  <div class="danger-zone">
    <form
      method="POST"
      action="?/deleteCouncil"
      onsubmit={(e) => { if (!confirm(`Delete council "${c.name}"? This removes council.json, councillors/, memory/, jobs/, .index/ from this directory.`)) e.preventDefault(); }}
    >
      <button type="submit" class="btn danger">Delete council</button>
    </form>
  </div>
</section>

<style>
  h1 { margin: 0 0 1.5rem; }
  h2 { margin: 0 0 1rem; }
  .block { margin-bottom: 2.5rem; }
  .section-head { display: flex; justify-content: space-between; align-items: baseline; }
  .form { display: grid; gap: 1rem; max-width: 640px; }
  .note { color: var(--muted); font-size: 0.9em; max-width: 640px; }
  .note code { background: #1a1d24; padding: 0.1em 0.35em; border-radius: 4px; }
  .rows { display: grid; gap: 0.5rem; }
  label { display: grid; gap: 0.35rem; }
  label > span { color: var(--muted); font-size: 0.9em; }
  input, textarea { background: #1a1d24; color: var(--fg); border: 1px solid var(--border); border-radius: 6px; padding: 0.55rem 0.7rem; }
  input:focus, textarea:focus { outline: 2px solid var(--accent); border-color: var(--accent); }
  .actions { display: flex; gap: 0.5rem; }
  .empty { color: var(--muted); padding: 0.5rem 0; }
  .list { list-style: none; padding: 0; margin: 0; display: grid; gap: 0.6rem; max-width: 640px; }
  .row { display: flex; justify-content: space-between; align-items: center; gap: 1rem; border: 1px solid var(--border); border-radius: 8px; padding: 0.7rem 0.9rem; }
  .row-title { font-weight: 600; color: var(--fg); text-decoration: none; }
  .row-title:hover { color: var(--accent); }
  .row-sub { color: var(--muted); font-size: 0.85em; margin-top: 0.2rem; }
  .row-actions { display: flex; gap: 0.5rem; align-items: center; }
  .danger-zone { margin-top: 1.25rem; }
  .btn { display: inline-block; padding: 0.5rem 0.9rem; border-radius: 6px; border: 1px solid var(--border); text-decoration: none; color: var(--fg); background: transparent; cursor: pointer; }
  .btn.primary { background: var(--accent); color: #0f1115; border-color: var(--accent); font-weight: 600; }
  .btn.danger { border-color: var(--danger); color: var(--danger); }
  .error { background: rgba(210,114,114,0.15); border: 1px solid var(--danger); color: var(--danger); padding: 0.6rem 0.8rem; border-radius: 6px; }
  .saved { background: rgba(120,190,140,0.15); border: 1px solid #5aa06e; color: #8fcea3; padding: 0.6rem 0.8rem; border-radius: 6px; }
</style>
