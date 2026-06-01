<script lang="ts">
  import type { ActionData, PageData } from './$types';
  import { PageHeader, Button, Badge, EmptyState, Markdown } from '$lib/components';

  let { data, form }: { data: PageData; form: ActionData } = $props();

  type Filter = 'pending' | 'approved' | 'rejected' | 'all';
  const TABS: Array<{ key: Filter; label: string }> = [
    { key: 'pending', label: 'Pending' },
    { key: 'approved', label: 'Approved' },
    { key: 'rejected', label: 'Rejected' },
    { key: 'all', label: 'All' }
  ];

  const pendingCount = $derived(data.counts.pending);
</script>

<PageHeader title="Proposed jobs" back="/" backLabel="Back to council">
  {#snippet subtitle()}
    {pendingCount} pending · review and triage suggested follow-up work
  {/snippet}
</PageHeader>

<nav class="filters" aria-label="Filter proposals by status">
  {#each TABS as t (t.key)}
    <a
      class="filter"
      class:active={data.status === t.key}
      aria-current={data.status === t.key ? 'page' : undefined}
      href="/proposals?status={t.key}"
    >
      {t.label}<span class="n">{data.counts[t.key]}</span>
    </a>
  {/each}
</nav>

{#if form?.error}<p class="alert error">{form.error}</p>{/if}

{#if data.proposals.length === 0}
  <EmptyState
    icon="◷"
    text={data.status === 'pending'
      ? 'No pending proposals. Successful jobs can suggest follow-up work here.'
      : `No ${data.status} proposals.`}
  />
{:else}
  <ul class="list">
    {#each data.proposals as p (p.id)}
      <li class="card" class:pending={p.status === 'pending'}>
        <div class="card-head">
          <div class="card-title">{p.title}</div>
          {#if p.status === 'approved'}
            <Badge tone="accent">approved</Badge>
          {:else if p.status === 'pending'}
            <Badge tone="info">pending</Badge>
          {:else}
            <Badge>{p.status}</Badge>
          {/if}
        </div>

        <div class="meta">
          from <code>{p.proposed_by}</code>
          · target:
          {#if p.target_councillor === 'all'}
            <Badge>all councillors</Badge>
          {:else if p.target_councillor}
            <code>{p.target_councillor}</code>
            {#if p.target_unknown}<Badge tone="accent" title="No councillor with this slug">unknown slug</Badge>{/if}
          {:else}
            <Badge>unassigned</Badge>
          {/if}
          · priority <code>{p.priority}</code>
          · source <a href="/jobs/{p.source_job_id}">{p.source_job_id}</a>
        </div>

        {#if p.status === 'pending'}
          <Markdown source={p.brief} />
        {:else}
          <pre class="block brief">{p.brief}</pre>
        {/if}

        {#if p.status === 'pending'}
          <div class="actions">
            <form method="POST" action="?/approve" class="approve-form">
              <input type="hidden" name="id" value={p.id} />
              {#if !p.target_councillor || p.target_unknown}
                <label class="field reassign">
                  <span class="label">Reassign to</span>
                  <select name="reassign_to" class="input" required>
                    <option value="">— pick councillor —</option>
                    {#each data.councillors as c (c.slug)}
                      <option value={c.slug}>{c.name} ({c.slug})</option>
                    {/each}
                  </select>
                </label>
              {/if}
              <label class="inline">
                <input type="checkbox" name="start_now" /> start now
              </label>
              <Button type="submit" variant="primary">Approve</Button>
            </form>
            <form method="POST" action="?/reject" class="reject-form">
              <input type="hidden" name="id" value={p.id} />
              <input class="input" type="text" name="reason" placeholder="reason (optional)" />
              <Button type="submit" variant="danger">Reject</Button>
            </form>
          </div>
        {:else if p.status === 'approved' && p.resulting_job_ids}
          <div class="meta resolved">
            Approved →
            {#each p.resulting_job_ids as jid, i (jid)}
              {#if i > 0}, {/if}
              <a href="/jobs/{jid}">{jid}</a>
            {/each}
          </div>
        {:else if p.status === 'rejected' && p.reason}
          <div class="meta resolved">Rejected: {p.reason}</div>
        {/if}
      </li>
    {/each}
  </ul>
{/if}

<style>
  .filters { display: flex; flex-wrap: wrap; gap: 0.4rem; margin-bottom: 1.25rem; }
  .filter {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.35rem 0.7rem;
    border: 1px solid var(--border);
    border-radius: var(--radius-pill);
    background: var(--surface-1);
    color: var(--muted);
    text-decoration: none;
    font-size: 0.88em;
  }
  .filter:hover { border-color: var(--accent); }
  .filter.active { color: var(--accent); border-color: var(--accent); background: var(--accent-soft); }
  .filter .n { font-variant-numeric: tabular-nums; color: var(--faint); font-size: 0.85em; }
  .filter.active .n { color: var(--accent); }

  .alert { margin: 0 0 1rem; }

  .list { list-style: none; padding: 0; margin: 0; display: grid; gap: 0.75rem; }
  .card {
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    background: var(--surface-1);
    padding: 1rem;
    display: grid;
    gap: 0.6rem;
  }
  .card.pending { border-color: var(--border-strong); }
  .card-head { display: flex; justify-content: space-between; gap: 1rem; align-items: flex-start; }
  .card-title { font-weight: 600; }
  .meta { color: var(--muted); font-size: 0.88em; }
  .meta code { font-family: var(--font-mono); }
  .meta a { color: var(--accent); text-decoration: none; }
  .meta a:hover { text-decoration: underline; }
  .resolved { margin-top: 0.15rem; }
  .brief { margin: 0; }

  .actions { display: flex; flex-wrap: wrap; gap: 1rem; align-items: flex-end; }
  .approve-form, .reject-form { display: flex; gap: 0.5rem; align-items: flex-end; margin: 0; flex-wrap: wrap; }
  .reassign { max-width: 260px; }
  .reassign .label { font-size: 0.8em; }
  .inline { display: inline-flex; gap: 0.4rem; align-items: center; color: var(--muted); font-size: 0.9em; padding-bottom: 0.55rem; }
  .reject-form .input { width: auto; }

  @media (max-width: 560px) {
    .approve-form, .reject-form { width: 100%; }
    .reassign { max-width: none; flex: 1; }
    .reject-form .input { flex: 1; }
  }
</style>
