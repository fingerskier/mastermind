<script lang="ts">
  import { PageHeader, Button, EmptyState } from '$lib/components';
  import type { ActionData, PageData } from './$types';

  let { data, form }: { data: PageData; form: ActionData } = $props();
  const c = $derived(data.council);

  let kind = $state<'recurring' | 'once'>(form?.kind ?? 'recurring');
  let cron = $state<string>(form?.cron ?? '0 9 * * MON');
  let fireAt = $state<string>(form?.fire_at ?? '');

  const PRESETS: Array<{ label: string; expr: string }> = [
    { label: 'Every weekday 9am', expr: '0 9 * * MON-FRI' },
    { label: 'Hourly', expr: '0 * * * *' },
    { label: 'Daily midnight', expr: '0 0 * * *' },
    { label: 'Weekly Mon 9am', expr: '0 9 * * MON' }
  ];
</script>

<PageHeader title="New schedule" back="/schedules" backLabel="Schedules" />

{#if form?.error}<p class="alert error">{form.error}</p>{/if}

{#if c.councillors.length === 0}
  <EmptyState
    icon="✦"
    text="You need a councillor before you can schedule work. Add one, then come back to build a schedule."
  >
    {#snippet action()}<Button href="/councillors/new" variant="primary">+ New councillor</Button>{/snippet}
  </EmptyState>
{:else}
  <form method="POST" class="stack">
    <label class="field">
      <span class="label">Title</span>
      <input class="input" name="title" required value={form?.title ?? ''} />
    </label>

    <label class="field">
      <span class="label">Councillor</span>
      <select class="input" name="councillor_slug" required>
        <option value="">— pick one —</option>
        {#each c.councillors as cl (cl.slug)}
          <option value={cl.slug} selected={form?.councillor_slug === cl.slug}>{cl.name}</option>
        {/each}
      </select>
    </label>

    <fieldset class="kind">
      <legend>Kind</legend>
      <label class="radio"><input type="radio" name="kind" value="recurring" bind:group={kind} /> Recurring (cron)</label>
      <label class="radio"><input type="radio" name="kind" value="once" bind:group={kind} /> One-shot (fire at)</label>
    </fieldset>

    {#if kind === 'recurring'}
      <div class="field">
        <span class="label">Cron expression</span>
        <div class="presets">
          {#each PRESETS as p (p.expr)}
            <Button
              variant={cron === p.expr ? 'primary' : 'secondary'}
              onclick={() => (cron = p.expr)}
              title={p.expr}
            >{p.label}</Button>
          {/each}
        </div>
        <input class="input mono" name="cron" bind:value={cron} placeholder="0 9 * * MON" />
        <span class="hint">5-field cron. Times are server-local (this computer's timezone).</span>
      </div>
    {:else}
      <label class="field">
        <span class="label">Fire at</span>
        <input class="input" name="fire_at" type="datetime-local" bind:value={fireAt} />
        <span class="hint">One-shot. Time is interpreted in this computer's local timezone.</span>
      </label>
    {/if}

    <label class="field">
      <span class="label">Brief</span>
      <textarea class="input mono" name="brief" rows="8" required>{form?.brief ?? ''}</textarea>
    </label>

    <label class="check">
      <input type="checkbox" name="enabled" checked={form?.enabled ?? true} />
      <span>Enabled</span>
    </label>

    <div class="actions">
      <Button href="/schedules">Cancel</Button>
      <Button type="submit" variant="primary">Create schedule</Button>
    </div>
  </form>
{/if}

<style>
  .stack { display: grid; gap: 1.1rem; max-width: 640px; }
  .alert { margin: 0 0 1rem; }
  .check { display: inline-flex; align-items: center; gap: 0.5rem; color: var(--fg); }
  .mono { font-family: var(--font-mono); }
  textarea.input { resize: vertical; min-height: 6rem; }

  .kind {
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 0.5rem 0.9rem 0.75rem;
    margin: 0;
    display: grid;
    gap: 0.35rem;
  }
  .kind legend { padding: 0 0.35rem; font-size: 0.9em; color: var(--muted); }
  .radio { display: inline-flex; align-items: center; gap: 0.4rem; }

  .presets { display: flex; flex-wrap: wrap; gap: 0.4rem; margin-bottom: 0.5rem; }

  .actions { display: flex; gap: 0.5rem; justify-content: flex-end; }
</style>
