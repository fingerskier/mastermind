<script lang="ts">
  import type { ActionData, PageData } from './$types';
  let { data, form }: { data: PageData; form: ActionData } = $props();
  const c = $derived(data.council);

  let kind = $state<'recurring' | 'once'>(form?.kind ?? 'recurring');
  let cron = $state<string>(form?.cron ?? '0 9 * * MON');
  let fireAt = $state<string>(form?.fire_at ?? '');
</script>

<p><a href="/schedules">&larr; Schedules</a></p>

<h1>New schedule</h1>

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
    <label>
      <span>Councillor</span>
      <select name="councillor_slug" required>
        <option value="">— pick one —</option>
        {#each c.councillors as cl (cl.slug)}
          <option value={cl.slug} selected={form?.councillor_slug === cl.slug}>{cl.name}</option>
        {/each}
      </select>
    </label>
    <fieldset>
      <legend>Kind</legend>
      <label class="radio"><input type="radio" name="kind" value="recurring" bind:group={kind} /> Recurring (cron)</label>
      <label class="radio"><input type="radio" name="kind" value="once" bind:group={kind} /> One-shot (fire at)</label>
    </fieldset>
    {#if kind === 'recurring'}
      <label>
        <span>Cron expression (5-field, system TZ)</span>
        <input name="cron" bind:value={cron} placeholder="0 9 * * MON" />
      </label>
    {:else}
      <label>
        <span>Fire at (local time)</span>
        <input name="fire_at" type="datetime-local" bind:value={fireAt} />
      </label>
    {/if}
    <label>
      <span>Brief</span>
      <textarea name="brief" rows="8" required>{form?.brief ?? ''}</textarea>
    </label>
    <label class="check">
      <input type="checkbox" name="enabled" checked={form?.enabled ?? true} />
      <span>Enabled</span>
    </label>
    <div class="actions">
      <a class="btn" href="/schedules">Cancel</a>
      <button class="btn primary" type="submit">Create schedule</button>
    </div>
  </form>
{/if}

<style>
  h1 { margin: 0 0 1.5rem; }
  .error { color: var(--danger); }
  .empty { color: var(--muted); }
  .stack { display: grid; gap: 1rem; max-width: 640px; }
  label { display: grid; gap: 0.3rem; }
  label > span { font-size: 0.9em; color: var(--muted); }
  label.check, label.radio { grid-auto-flow: column; justify-content: start; align-items: center; gap: 0.5rem; }
  label.check > span, label.radio > span { color: var(--fg); }
  fieldset { border: 1px solid var(--border); border-radius: 8px; padding: 0.5rem 0.9rem 0.75rem; margin: 0; display: grid; gap: 0.35rem; }
  fieldset legend { padding: 0 0.35rem; font-size: 0.9em; color: var(--muted); }
  input, textarea, select {
    background: #1a1d24; color: var(--fg);
    border: 1px solid var(--border); border-radius: 6px; padding: 0.55rem 0.7rem;
  }
  input:focus, textarea:focus, select:focus { outline: 2px solid var(--accent); border-color: var(--accent); }
  textarea { resize: vertical; min-height: 6rem; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
  .actions { display: flex; gap: 0.5rem; justify-content: flex-end; }
  .btn { display: inline-block; padding: 0.5rem 0.9rem; border-radius: 6px; border: 1px solid var(--border); text-decoration: none; color: var(--fg); background: transparent; cursor: pointer; }
  .btn.primary { background: var(--accent); color: #0f1115; border-color: var(--accent); font-weight: 600; }
</style>
