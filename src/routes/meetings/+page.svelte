<script lang="ts">
  import type { PageData } from './$types';
  let { data }: { data: PageData } = $props();
</script>

<p><a href="/">&larr; Home</a></p>

<div class="head">
  <h1>Meetings</h1>
  <a class="btn primary" href="/meetings/new">+ New meeting</a>
</div>

{#if data.meetings.length === 0}
  <p class="empty">No meetings yet.</p>
{:else}
  <ul class="list">
    {#each data.meetings as m (m.id)}
      <li>
        <a class="card" href={`/meetings/${m.id}`}>
          <div class="card-title">{m.title}</div>
          <div class="card-meta">
            <span class="status status-{m.status}">{m.status}</span>
            <span class="sep">·</span>
            <span>round {m.current_round}</span>
            <span class="sep">·</span>
            <span>{m.total_turns} turn{m.total_turns === 1 ? '' : 's'}</span>
            <span class="sep">·</span>
            <span>{new Date(m.started_at).toLocaleString()}</span>
          </div>
        </a>
      </li>
    {/each}
  </ul>
{/if}

<style>
  .head { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 1.5rem; }
  h1 { margin: 0; }
  .empty { color: var(--muted); }
  .list { list-style: none; padding: 0; margin: 0; display: grid; gap: 0.75rem; }
  .card {
    display: block; border: 1px solid var(--border); border-radius: 8px;
    padding: 0.8rem 1rem; text-decoration: none; color: var(--fg);
    background: rgba(255, 255, 255, 0.01);
  }
  .card:hover { border-color: var(--accent); }
  .card-title { font-weight: 600; margin-bottom: 0.3rem; }
  .card-meta { color: var(--muted); font-size: 0.85em; display: flex; gap: 0.35rem; flex-wrap: wrap; align-items: center; }
  .sep { opacity: 0.4; }
  .status { font-weight: 500; }
  .status-running { color: #e0c060; }
  .status-ended { color: #8bb98b; }
  .status-failed { color: var(--danger, #d27272); }
  .status-cancelled { color: var(--muted); }
  .status-awaiting_director { color: var(--accent); }
  .btn {
    display: inline-block; padding: 0.5rem 0.9rem; border-radius: 6px;
    border: 1px solid var(--border); text-decoration: none; color: var(--fg);
    background: transparent; cursor: pointer; white-space: nowrap;
  }
  .btn.primary { background: var(--accent); color: #0f1115; border-color: var(--accent); font-weight: 600; }
</style>
