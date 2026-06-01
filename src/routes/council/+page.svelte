<script lang="ts">
  import { untrack } from 'svelte';
  import { Button, Badge, PageHeader } from '$lib/components';
  import { relTime } from '$lib/time';
  import { ENV_KEY_SUGGESTIONS, findEnvSuggestion, startsInCustomMode } from '$lib/env-suggestions';
  import EnvVarRow, { type Row } from './EnvVarRow.svelte';
  import type { AdapterHealth } from './+page.server';
  import type { ActionData, PageData } from './$types';

  let { data, form }: { data: PageData; form: ActionData } = $props();
  const c = $derived(data.council);
  const adapterHealth = $derived(data.adapterHealth);

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

  // Map adapter readiness → a chip tone + label. Tones reuse Badge's vocabulary;
  // 'unknown'/'unavailable' carry a danger/warn cue via a class on the wrapper.
  type HealthMeta = { label: string; tone: 'neutral' | 'accent' | 'info'; bad?: boolean };
  function healthMeta(h: AdapterHealth | undefined): HealthMeta {
    switch (h) {
      case 'ready': return { label: 'ready', tone: 'info' };
      case 'unavailable': return { label: 'unavailable', tone: 'neutral', bad: true };
      case 'unknown': return { label: 'unknown adapter', tone: 'neutral', bad: true };
      default: return { label: 'no adapter', tone: 'neutral' };
    }
  }
</script>

<PageHeader title="Council" back="/" backLabel={c.name}>
  {#snippet subtitle()}
    Settings for <strong>{c.name}</strong> · created {relTime(c.created_at)}
  {/snippet}
</PageHeader>

<nav class="section-nav" aria-label="Council settings sections">
  <a href="#identity">Identity</a>
  <a href="#councillors">Councillors</a>
  <a href="#environment">Environment</a>
  <a href="#import-export">Import / Export</a>
  <a href="#danger">Danger zone</a>
</nav>

<section id="identity" class="section">
  <h2>Identity</h2>
  <form method="POST" action="?/identity" class="form">
    {#if form?.identitySaved}<p class="alert ok">Saved.</p>{/if}
    {#if identityError}<p class="alert error">{identityError}</p>{/if}
    <label class="field">
      <span class="label">Name</span>
      <input class="input" name="name" required maxlength="80" value={(form as any)?.name ?? c.name} />
    </label>
    <label class="field">
      <span class="label">Description</span>
      <textarea class="input" name="description" rows="3" maxlength="500">{(form as any)?.description ?? c.description}</textarea>
    </label>
    <label class="field">
      <span class="label">Template <em>(optional)</em></span>
      <input class="input" name="template" maxlength="80" value={(form as any)?.template ?? c.template ?? ''} />
    </label>
    <div class="actions"><Button type="submit" variant="primary">Save</Button></div>
  </form>
</section>

<section id="councillors" class="section">
  <div class="section-head">
    <h2>Councillors</h2>
    <Button href="/councillors/new" variant="primary">+ New councillor</Button>
  </div>
  {#if c.councillors.length === 0}
    <p class="empty">No councillors yet. Add one before creating jobs.</p>
  {:else}
    <ul class="list">
      {#each c.councillors as cl (cl.slug)}
        {@const meta = healthMeta(adapterHealth[cl.slug])}
        <li class="row">
          <div class="row-main">
            <a class="row-title" href="/councillors/{cl.slug}">{cl.name}</a>
            <div class="row-sub">
              <span>{cl.role || 'no role'}</span>
              {#if cl.adapter}<Badge mono title="Adapter">{cl.adapter}</Badge>{/if}
              <span class="health" class:bad={meta.bad}>
                <Badge tone={meta.tone}>{meta.label}</Badge>
              </span>
            </div>
          </div>
          <div class="row-actions">
            <Button href="/councillors/{cl.slug}/edit">Edit</Button>
            <form
              method="POST"
              action="?/deleteCouncillor"
              onsubmit={(e) => { if (!confirm(`Delete councillor "${cl.name}"?`)) e.preventDefault(); }}
            >
              <input type="hidden" name="slug" value={cl.slug} />
              <Button type="submit" variant="danger">Delete</Button>
            </form>
          </div>
        </li>
      {/each}
    </ul>
  {/if}
</section>

<section id="environment" class="section">
  <h2>Environment</h2>
  <p class="note">
    These variables (API keys, model overrides) are written to a local
    <code>.env</code> file in this council's directory and loaded for adapter CLIs.
    Values may be secret — the file stays on your machine and is not indexed.
    <strong>Changes take effect after restarting Landsraad.</strong>
  </p>
  <datalist id="env-key-suggestions">
    {#each ENV_KEY_SUGGESTIONS as s (s.key)}
      <option value={s.key} label={s.description}></option>
    {/each}
  </datalist>
  <form method="POST" action="?/env" class="form">
    {#if form && 'pairs' in form && 'error' in form && form.error}<p class="alert error">{form.error}</p>{/if}
    {#if form?.envSaved}<p class="alert ok">Saved.</p>{/if}
    <div class="rows">
      {#each rows as row, i (i)}
        <EnvVarRow bind:row={rows[i]} onremove={() => removeRow(i)} />
      {/each}
      {#if rows.length === 0}<p class="empty">No variables yet.</p>{/if}
    </div>
    <div class="actions">
      <Button type="button" onclick={addRow}>+ Add variable</Button>
      <Button type="submit" variant="primary">Save</Button>
    </div>
  </form>
</section>

<section id="import-export" class="section">
  <h2>Import / Export</h2>
  <p class="note">Share this council as a template, or pull councillors and memory in from one.</p>
  <div class="actions">
    <Button href="/export">Export council as template…</Button>
    <Button href="/import">Import from template…</Button>
  </div>
</section>

<section id="danger" class="section danger-zone" aria-label="Danger zone">
  <h2>Danger zone</h2>
  <p class="note">
    Deleting this council removes <code>council.json</code>, <code>councillors/</code>,
    <code>memory/</code>, <code>jobs/</code>, and <code>.index/</code> from this directory.
    This cannot be undone.
  </p>
  <form
    method="POST"
    action="?/deleteCouncil"
    onsubmit={(e) => { if (!confirm(`Delete council "${c.name}"? This removes council.json, councillors/, memory/, jobs/, .index/ from this directory.`)) e.preventDefault(); }}
  >
    <Button type="submit" variant="danger">Delete council</Button>
  </form>
</section>

<style>
  .section-nav {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem 1rem;
    margin-bottom: 2rem;
    padding-bottom: 0.75rem;
    border-bottom: 1px solid var(--border);
    font-size: 0.85em;
  }
  .section-nav a { color: var(--muted); text-decoration: none; }
  .section-nav a:hover { color: var(--accent); }

  .section { margin-bottom: 2.5rem; scroll-margin-top: 1rem; }
  h2 { margin: 0 0 1rem; font-size: 1.15rem; }
  .section-head { display: flex; justify-content: space-between; align-items: baseline; gap: 1rem; }
  .section-head h2 { margin-bottom: 1rem; }

  .form { display: grid; gap: 1rem; max-width: 640px; }
  .form textarea { resize: vertical; font-family: inherit; }
  .note { color: var(--muted); font-size: 0.9em; max-width: 640px; }
  .note code {
    font-family: var(--font-mono);
    background: var(--surface-2);
    padding: 0.1em 0.35em;
    border-radius: var(--radius-sm);
  }
  .rows { display: grid; gap: 0.5rem; }
  .actions { display: flex; gap: 0.5rem; flex-wrap: wrap; }

  .empty { color: var(--muted); padding: 0.5rem 0; }
  .list { list-style: none; padding: 0; margin: 0; display: grid; gap: 0.6rem; max-width: 640px; }
  .row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 1rem;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 0.7rem 0.9rem;
  }
  .row-title { font-weight: 600; color: var(--fg); text-decoration: none; }
  .row-title:hover { color: var(--accent); }
  .row-sub {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.4rem;
    color: var(--muted);
    font-size: 0.85em;
    margin-top: 0.35rem;
  }
  /* Push a danger cue onto the otherwise-neutral health badge. */
  .health.bad :global(.badge) {
    border-color: var(--danger);
    color: var(--danger);
    background: var(--danger-soft);
  }
  .row-actions { display: flex; gap: 0.5rem; align-items: center; }
  .row-actions form { margin: 0; }

  .danger-zone {
    border: 1px solid var(--danger);
    border-left-width: 4px;
    border-radius: var(--radius-lg);
    background: var(--danger-soft);
    padding: 1.1rem 1.2rem;
  }
  .danger-zone h2 { color: var(--danger); }
  .danger-zone form { margin-top: 0.25rem; }

  @media (max-width: 560px) {
    .row { flex-direction: column; align-items: stretch; }
    .row-actions { justify-content: flex-end; }
  }
</style>
