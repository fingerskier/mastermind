<script lang="ts">
  import type { ActionData, PageData } from './$types';
  let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

<header class="head">
  <h1>Suggested jobs</h1>
  <nav class="tabs">
    <a class:active={data.status === 'pending'} href="/proposals?status=pending">Pending</a>
    <a class:active={data.status === 'approved'} href="/proposals?status=approved">Approved</a>
    <a class:active={data.status === 'rejected'} href="/proposals?status=rejected">Rejected</a>
    <a class:active={data.status === 'all'} href="/proposals?status=all">All</a>
  </nav>
</header>

<p class="back"><a href="/">← Back to council</a></p>

{#if form?.error}<div class="error">{form.error}</div>{/if}

{#if data.proposals.length === 0}
  <p class="empty">No {data.status} suggested jobs.</p>
{:else}
  <ul class="list">
    {#each data.proposals as p (p.id)}
      <li class="card">
        <div class="card-head">
          <div>
            <div class="card-title">{p.title}</div>
            <div class="meta">
              from <code>{p.proposed_by}</code> · target:
              {#if p.target_councillor === 'all'}
                <span class="chip">all</span>
              {:else if p.target_councillor}
                <code>{p.target_councillor}</code>
                {#if p.target_unknown}<span class="chip warn">unknown slug</span>{/if}
              {:else}
                <span class="chip">unassigned</span>
              {/if}
              · priority <code>{p.priority}</code>
              · source <a href="/jobs/{p.source_job_id}">{p.source_job_id}</a>
            </div>
          </div>
          <div class="status status-{p.status}">{p.status}</div>
        </div>
        <pre class="brief">{p.brief}</pre>
        {#if p.status === 'pending'}
          <div class="actions">
            <form method="POST" action="?/approve" class="approve-form">
              <input type="hidden" name="id" value={p.id} />
              {#if !p.target_councillor || p.target_unknown}
                <label class="inline">
                  Assign to
                  <select name="reassign_to" required>
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
              <button type="submit" class="btn primary">Approve</button>
            </form>
            <form method="POST" action="?/reject" class="reject-form">
              <input type="hidden" name="id" value={p.id} />
              <input type="text" name="reason" placeholder="reason (optional)" />
              <button type="submit" class="btn danger">Reject</button>
            </form>
          </div>
        {:else if p.status === 'approved' && p.resulting_job_ids}
          <div class="meta">
            Approved → {#each p.resulting_job_ids as jid, i (jid)}
              {#if i > 0}, {/if}
              <a href="/jobs/{jid}">{jid}</a>
            {/each}
          </div>
        {:else if p.status === 'rejected' && p.reason}
          <div class="meta">Rejected: {p.reason}</div>
        {/if}
      </li>
    {/each}
  </ul>
{/if}

<style>
  .head { display: flex; justify-content: space-between; align-items: baseline; gap: 1rem; margin-bottom: 0.5rem; }
  h1 { margin: 0; }
  .back { margin: 0 0 1.5rem; }
  .back a { color: var(--muted); text-decoration: none; font-size: 0.9em; }
  .back a:hover { color: var(--accent); }
  .tabs { display: flex; gap: 0.75rem; }
  .tabs a { color: var(--muted); text-decoration: none; padding: 0.25rem 0.5rem; border-radius: 6px; }
  .tabs a:hover, .tabs a.active { color: var(--fg); background: rgba(255,255,255,0.04); }
  .error { background: rgba(210,114,114,0.15); border: 1px solid var(--danger); color: var(--danger); padding: 0.6rem 0.8rem; border-radius: 6px; margin-bottom: 1rem; }
  .empty { color: var(--muted); padding: 1rem 0; }
  .list { list-style: none; padding: 0; display: grid; gap: 0.75rem; }
  .card { border: 1px solid var(--border); border-radius: 8px; padding: 1rem; display: grid; gap: 0.75rem; }
  .card-head { display: flex; justify-content: space-between; gap: 1rem; align-items: flex-start; }
  .card-title { font-weight: 600; }
  .meta { color: var(--muted); font-size: 0.9em; }
  .brief { white-space: pre-wrap; background: rgba(255,255,255,0.02); border: 1px solid var(--border); border-radius: 6px; padding: 0.6rem 0.7rem; margin: 0; font-size: 0.9em; }
  .actions { display: flex; flex-wrap: wrap; gap: 1rem; align-items: center; }
  .approve-form, .reject-form { display: flex; gap: 0.5rem; align-items: center; }
  .inline { display: inline-flex; gap: 0.4rem; align-items: center; color: var(--muted); font-size: 0.9em; }
  select, input[type="text"] { background: #1a1d24; color: var(--fg); border: 1px solid var(--border); border-radius: 6px; padding: 0.4rem 0.6rem; }
  .btn { display: inline-block; padding: 0.4rem 0.8rem; border-radius: 6px; border: 1px solid var(--border); text-decoration: none; color: var(--fg); background: transparent; cursor: pointer; }
  .btn.primary { background: var(--accent); color: #0f1115; border-color: var(--accent); font-weight: 600; }
  .btn.danger { border-color: var(--danger); color: var(--danger); }
  .chip { font-size: 0.75em; padding: 0.05rem 0.4rem; border-radius: 999px; border: 1px solid var(--border); color: var(--muted); }
  .chip.warn { color: var(--danger); border-color: var(--danger); }
  .status { font-size: 0.75em; padding: 0.05rem 0.5rem; border-radius: 999px; border: 1px solid var(--border); color: var(--muted); }
  .status-pending { color: var(--accent); border-color: var(--accent); }
  .status-approved { color: #8bb98b; border-color: #4f6b4f; }
  .status-rejected { color: var(--danger); border-color: var(--danger); }
</style>
