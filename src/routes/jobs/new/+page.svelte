<script lang="ts">
  import type { ActionData, PageData } from './$types';
  let { data, form }: { data: PageData; form: ActionData } = $props();
  const c = $derived(data.council);
  const initialSelected = $derived<string[]>(form?.councillor_slugs ?? data.preselect);
  let selected = $state<Set<string>>(new Set());
  $effect(() => { selected = new Set(initialSelected); });

  function toggle(slug: string, checked: boolean) {
    const next = new Set(selected);
    if (checked) next.add(slug);
    else next.delete(slug);
    selected = next;
  }
  function selectAll() { selected = new Set(c.councillors.map(cl => cl.slug)); }
  function clearAll() { selected = new Set(); }
  const allSelected = $derived(c.councillors.length > 0 && selected.size === c.councillors.length);
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
    <fieldset class="councillors">
      <legend>
        Assigned councillors
        <span class="count">({selected.size}/{c.councillors.length})</span>
      </legend>
      <div class="bulk">
        <button type="button" class="link" onclick={selectAll} disabled={allSelected}>Select all</button>
        <span class="sep">·</span>
        <button type="button" class="link" onclick={clearAll} disabled={selected.size === 0}>Clear</button>
      </div>
      <ul class="cl-list">
        {#each c.councillors as cl (cl.slug)}
          <li>
            <label class="cl-row">
              <input
                type="checkbox"
                name="councillor_slugs"
                value={cl.slug}
                checked={selected.has(cl.slug)}
                onchange={(e) => toggle(cl.slug, (e.currentTarget as HTMLInputElement).checked)}
              />
              <span class="cl-name">{cl.name}</span>
              <span class="cl-meta">{cl.role || 'no role'}{#if cl.adapter} · <code>{cl.adapter}</code>{/if}</span>
            </label>
          </li>
        {/each}
      </ul>
    </fieldset>
    <label>
      <span>Brief</span>
      <textarea name="brief" rows="10" required>{form?.brief ?? ''}</textarea>
    </label>
    <label class="check">
      <input type="checkbox" name="start_now" checked />
      <span>Start immediately</span>
    </label>
    <fieldset class="schedule">
      <legend>
        <label class="radio inline">
          <input type="radio" name="save_as" value="job" checked={form?.save_as !== 'schedule'} />
          Run now (default)
        </label>
        <label class="radio inline">
          <input type="radio" name="save_as" value="schedule" checked={form?.save_as === 'schedule'} disabled={selected.size !== 1} />
          Save as schedule {#if selected.size !== 1}<small>(pick exactly 1 councillor)</small>{/if}
        </label>
      </legend>
      <div class="sched-fields">
        <label class="radio inline"><input type="radio" name="sched_kind" value="recurring" checked /> Recurring (cron)</label>
        <label class="radio inline"><input type="radio" name="sched_kind" value="once" /> One-shot</label>
        <label>
          <span>Cron expression</span>
          <input name="sched_cron" placeholder="0 9 * * MON" value={form?.sched_cron ?? ''} />
        </label>
        <label>
          <span>Or fire at (local time)</span>
          <input name="sched_fire_at" type="datetime-local" value={form?.sched_fire_at ?? ''} />
        </label>
        <label class="check">
          <input type="checkbox" name="sched_enabled" checked />
          <span>Enabled</span>
        </label>
      </div>
    </fieldset>
    <div class="actions">
      <a class="btn" href="/">Cancel</a>
      <button class="btn primary" type="submit" disabled={selected.size === 0}>
        {selected.size > 1 ? `Create ${selected.size} jobs` : 'Create job'}
      </button>
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
  input, textarea {
    background: #1a1d24; color: var(--fg);
    border: 1px solid var(--border); border-radius: 6px; padding: 0.55rem 0.7rem;
  }
  input:focus, textarea:focus { outline: 2px solid var(--accent); border-color: var(--accent); }
  textarea { resize: vertical; min-height: 6rem; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
  .actions { display: flex; gap: 0.5rem; justify-content: flex-end; }
  .btn { display: inline-block; padding: 0.5rem 0.9rem; border-radius: 6px; border: 1px solid var(--border); text-decoration: none; color: var(--fg); background: transparent; cursor: pointer; }
  .btn.primary { background: var(--accent); color: #0f1115; border-color: var(--accent); font-weight: 600; }
  .btn[disabled] { opacity: 0.5; cursor: not-allowed; }

  .councillors {
    border: 1px solid var(--border); border-radius: 8px;
    padding: 0.5rem 0.9rem 0.75rem; margin: 0; display: grid; gap: 0.35rem;
  }
  .councillors legend {
    padding: 0 0.35rem; font-size: 0.9em; color: var(--muted);
    display: inline-flex; align-items: center; gap: 0.35rem;
  }
  .count { color: var(--muted); }
  .bulk { display: flex; align-items: center; gap: 0.25rem; font-size: 0.85em; }
  .bulk .link {
    background: none; border: none; padding: 0; color: var(--accent);
    cursor: pointer; font: inherit; text-decoration: underline;
  }
  .bulk .link[disabled] { color: var(--muted); cursor: default; text-decoration: none; }
  .sep { color: var(--muted); }
  .cl-list { list-style: none; padding: 0; margin: 0.25rem 0 0; display: grid; gap: 0.25rem; }
  .cl-row {
    display: grid; grid-template-columns: auto auto 1fr;
    gap: 0.5rem; align-items: center;
    padding: 0.35rem 0.5rem; border-radius: 6px; cursor: pointer;
  }
  .cl-row:hover { background: rgba(255,255,255,0.03); }
  .cl-row input[type="checkbox"] { margin: 0; }
  .cl-name { font-weight: 500; }
  .cl-meta { color: var(--muted); font-size: 0.9em; }
  .cl-meta code { background: rgba(255,255,255,0.04); padding: 0 0.3rem; border-radius: 4px; }
  fieldset.schedule { border: 1px dashed var(--border); border-radius: 8px; padding: 0.5rem 0.9rem 0.75rem; margin: 0; display: grid; gap: 0.5rem; }
  fieldset.schedule legend { padding: 0 0.35rem; font-size: 0.9em; color: var(--muted); display: flex; gap: 1rem; }
  fieldset.schedule .sched-fields { display: grid; gap: 0.5rem; }
  label.radio.inline { display: inline-flex; align-items: center; gap: 0.35rem; }
  small { color: var(--muted); }
</style>
