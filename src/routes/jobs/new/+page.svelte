<script lang="ts">
  import { PageHeader, Button, Badge, EmptyState } from '$lib/components';
  import type { ActionData, PageData } from './$types';
  let { data, form }: { data: PageData; form: ActionData } = $props();
  const c = $derived(data.council);

  const initialSelected = $derived<string[]>(form?.councillor_slugs ?? data.preselect);
  let selected = $state<Set<string>>(new Set());
  $effect(() => { selected = new Set(initialSelected); });

  // Run now vs schedule for later — a segmented control instead of a disclosure.
  let mode = $state<'now' | 'schedule'>('now');
  $effect(() => { if (form?.save_as === 'schedule') mode = 'schedule'; });
  // Scheduling targets exactly one councillor; flip back to "now" if that breaks.
  $effect(() => { if (mode === 'schedule' && selected.size !== 1) mode = 'now'; });

  function toggle(slug: string, checked: boolean) {
    const next = new Set(selected);
    if (checked) next.add(slug); else next.delete(slug);
    selected = next;
  }
  function selectAll() { selected = new Set(c.councillors.map((cl) => cl.slug)); }
  function clearAll() { selected = new Set(); }
  const allSelected = $derived(c.councillors.length > 0 && selected.size === c.councillors.length);
  const canSchedule = $derived(selected.size === 1);

  const CRON_PRESETS = [
    { label: 'Weekday 9am', expr: '0 9 * * MON-FRI' },
    { label: 'Hourly', expr: '0 * * * *' },
    { label: 'Daily midnight', expr: '0 0 * * *' },
    { label: 'Weekly Mon 9am', expr: '0 9 * * MON' }
  ];
  let cron = $state('');
  $effect(() => { cron = form?.sched_cron ?? ''; });
  let schedKind = $state<'recurring' | 'once'>('recurring');
</script>

<PageHeader title="New job" back="/" backLabel={c.name}>
  {#snippet subtitle()}Put one or more councillors to work — now or on a schedule.{/snippet}
</PageHeader>

{#if form?.error}<p class="alert error">{form.error}</p>{/if}

{#if c.councillors.length === 0}
  <EmptyState icon="◷" text="This council has no councillors yet. Add one before creating jobs.">
    {#snippet action()}<Button href="/councillors/new" variant="primary">+ Add councillor</Button>{/snippet}
  </EmptyState>
{:else}
  <form method="POST" class="stack">
    <label class="field">
      <span class="label">Title</span>
      <input class="input" name="title" required value={form?.title ?? ''} placeholder="Short summary of the work" />
    </label>

    <fieldset class="councillors">
      <legend>
        Assign to <span class="count">{selected.size}/{c.councillors.length}</span>
        <span class="bulk">
          <button type="button" class="link" onclick={selectAll} disabled={allSelected}>All</button>
          <span class="sep">·</span>
          <button type="button" class="link" onclick={clearAll} disabled={selected.size === 0}>Clear</button>
        </span>
      </legend>
      <ul class="cl-list">
        {#each c.councillors as cl (cl.slug)}
          {@const on = selected.has(cl.slug)}
          <li>
            <label class="cl-row" class:on>
              <input
                type="checkbox"
                name="councillor_slugs"
                value={cl.slug}
                checked={on}
                onchange={(e) => toggle(cl.slug, (e.currentTarget as HTMLInputElement).checked)}
              />
              <span class="cl-name">{cl.name}</span>
              <span class="cl-meta">
                {cl.role || 'no role'}
                {#if cl.adapter}<Badge mono>{cl.adapter}</Badge>{:else}<Badge tone="neutral" title="cannot run jobs">no adapter</Badge>{/if}
              </span>
            </label>
          </li>
        {/each}
      </ul>
    </fieldset>

    <label class="field">
      <span class="label">Brief</span>
      <textarea class="input mono" name="brief" rows="10" required placeholder="Describe the task. This is the prompt the councillor receives.">{form?.brief ?? ''}</textarea>
    </label>

    <!-- When — segmented control. Scheduling needs exactly one councillor. -->
    <div class="when">
      <div class="seg" role="group" aria-label="When to run">
        <button type="button" class="seg-btn" class:active={mode === 'now'} aria-pressed={mode === 'now'} onclick={() => (mode = 'now')}>Run now</button>
        <button
          type="button"
          class="seg-btn"
          class:active={mode === 'schedule'}
          aria-pressed={mode === 'schedule'}
          disabled={!canSchedule}
          title={canSchedule ? '' : 'Pick exactly one councillor to schedule'}
          onclick={() => (mode = 'schedule')}
        >Schedule for later</button>
      </div>
      {#if !canSchedule}<span class="when-hint">Scheduling targets a single councillor.</span>{/if}
    </div>

    <input type="hidden" name="save_as" value={mode === 'schedule' ? 'schedule' : 'job'} />
    <input type="hidden" name="start_now" value="on" />

    {#if mode === 'schedule'}
      <fieldset class="schedule">
        <legend>Schedule</legend>
        <div class="sched-kind">
          <label class="radio"><input type="radio" name="sched_kind" value="recurring" checked={schedKind === 'recurring'} onchange={() => (schedKind = 'recurring')} /> Recurring (cron)</label>
          <label class="radio"><input type="radio" name="sched_kind" value="once" checked={schedKind === 'once'} onchange={() => (schedKind = 'once')} /> One-shot</label>
        </div>

        {#if schedKind === 'recurring'}
          <div class="field">
            <span class="label">Cron expression</span>
            <div class="presets">
              {#each CRON_PRESETS as p (p.expr)}
                <button type="button" class="preset" class:active={cron === p.expr} onclick={() => (cron = p.expr)}>{p.label}</button>
              {/each}
            </div>
            <input class="input mono" name="sched_cron" placeholder="0 9 * * MON" bind:value={cron} />
            <span class="hint">Times are server-local. Five fields: minute hour day month weekday.</span>
          </div>
        {:else}
          <label class="field">
            <span class="label">Fire at</span>
            <input class="input" name="sched_fire_at" type="datetime-local" value={form?.sched_fire_at ?? ''} />
            <span class="hint">Local time on the machine running landsraad.</span>
          </label>
        {/if}

        <label class="check">
          <input type="checkbox" name="sched_enabled" checked />
          <span>Enabled</span>
        </label>
      </fieldset>
    {/if}

    <div class="actions">
      <Button href="/">Cancel</Button>
      <Button type="submit" variant="primary" disabled={selected.size === 0}>
        {#if mode === 'schedule'}
          Create schedule
        {:else if selected.size > 1}
          Run {selected.size} jobs now
        {:else}
          Run now
        {/if}
      </Button>
    </div>
  </form>
{/if}

<style>
  .alert { margin-bottom: 1rem; display: inline-block; }
  .stack { display: grid; gap: 1.25rem; max-width: 660px; }
  .mono { font-family: var(--font-mono); }
  textarea.input { resize: vertical; min-height: 7rem; line-height: 1.5; }

  .councillors { border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 0.6rem 0.9rem 0.8rem; margin: 0; }
  .councillors legend {
    padding: 0 0.35rem; font-size: 0.9em; color: var(--muted);
    display: inline-flex; align-items: center; gap: 0.5rem;
  }
  .count { color: var(--faint); font-variant-numeric: tabular-nums; }
  .bulk { display: inline-flex; align-items: center; gap: 0.3rem; }
  .link { background: none; border: 0; padding: 0; color: var(--accent); cursor: pointer; font: inherit; text-decoration: underline; }
  .link[disabled] { color: var(--faint); cursor: default; text-decoration: none; }
  .sep { color: var(--faint); }
  .cl-list { list-style: none; padding: 0; margin: 0.4rem 0 0; display: grid; gap: 0.25rem; }
  .cl-row {
    display: grid; grid-template-columns: auto 1fr auto; gap: 0.6rem; align-items: center;
    padding: 0.4rem 0.55rem; border-radius: var(--radius); border: 1px solid transparent; cursor: pointer;
  }
  .cl-row:hover { background: var(--surface-2); }
  .cl-row.on { border-color: var(--border-strong); background: var(--surface-2); }
  .cl-row input[type='checkbox'] { margin: 0; }
  .cl-name { font-weight: 500; }
  .cl-meta { display: inline-flex; align-items: center; gap: 0.5rem; color: var(--muted); font-size: 0.88em; justify-self: end; }

  .when { display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap; }
  .seg { display: inline-flex; border: 1px solid var(--border); border-radius: var(--radius-pill); padding: 2px; background: var(--surface-1); }
  .seg-btn {
    border: 0; background: none; color: var(--muted); cursor: pointer;
    padding: 0.35rem 0.9rem; border-radius: var(--radius-pill); font-size: 0.9em;
  }
  .seg-btn:hover:not([disabled]) { color: var(--fg); }
  .seg-btn.active { background: var(--accent); color: var(--accent-ink); font-weight: 600; }
  .seg-btn[disabled] { opacity: 0.45; cursor: not-allowed; }
  .when-hint { color: var(--faint); font-size: 0.85em; }

  .schedule { border: 1px dashed var(--border-strong); border-radius: var(--radius-lg); padding: 0.75rem 0.9rem 0.9rem; margin: 0; display: grid; gap: 0.85rem; }
  .schedule legend { padding: 0 0.35rem; font-size: 0.9em; color: var(--muted); }
  .sched-kind { display: flex; gap: 1.25rem; }
  .radio { display: inline-flex; align-items: center; gap: 0.4rem; color: var(--fg); font-size: 0.92em; }
  .presets { display: flex; flex-wrap: wrap; gap: 0.4rem; margin-bottom: 0.5rem; }
  .preset {
    border: 1px solid var(--border); background: var(--surface-1); color: var(--muted);
    border-radius: var(--radius-pill); padding: 0.25rem 0.7rem; font-size: 0.82em; cursor: pointer;
  }
  .preset:hover { border-color: var(--accent); color: var(--fg); }
  .preset.active { border-color: var(--accent); color: var(--accent); background: var(--accent-soft); }
  .hint { color: var(--faint); font-size: 0.82em; }
  .check { display: inline-flex; align-items: center; gap: 0.5rem; color: var(--fg); font-size: 0.92em; }

  .actions { display: flex; gap: 0.5rem; justify-content: flex-end; }
</style>
