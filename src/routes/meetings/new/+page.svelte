<script lang="ts">
  import type { ActionData, PageData } from './$types';
  let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

<p><a href="/meetings">&larr; Meetings</a></p>

<h1>New meeting</h1>

{#if form?.error}<p class="error">{form.error}</p>{/if}

<form method="POST" class="stack">
  <label>
    <span>Title</span>
    <input name="title" required />
  </label>
  <label>
    <span>Topic</span>
    <textarea name="topic" rows="6"></textarea>
  </label>
  <label>
    <span>Chair</span>
    <select name="chair" required>
      {#each data.councillors as c (c.slug)}
        <option value={c.slug}>{c.name} ({c.slug})</option>
      {/each}
    </select>
  </label>
  <fieldset class="attendees">
    <legend>Attendees</legend>
    {#each data.councillors as c (c.slug)}
      <label class="check">
        <input type="checkbox" name="attendees" value={c.slug} checked />
        <span>{c.name}</span>
        <span class="role">{c.role || 'no role'}</span>
      </label>
    {/each}
  </fieldset>
  {#if data.peers.length > 0}
    <fieldset class="attendees">
      <legend>Remote councils</legend>
      {#each data.peers as p (p.cwd)}
        <p class="peer-head">{p.name} <span class="role">{p.cwd}</span></p>
        {#each p.councillors as rc (rc.slug)}
          <label class="check">
            <input type="checkbox" name="remote"
              value={JSON.stringify({ council_slug: p.council_slug, councillor_slug: rc.slug, cwd: p.cwd, label: rc.label })}
              disabled={rc.busy} />
            <span>{rc.label}</span>
            <span class="role">{rc.adapter}{rc.busy ? ' · busy' : ''}</span>
          </label>
        {/each}
      {/each}
    </fieldset>
  {:else}
    <p class="role">No other councils are running.</p>
  {/if}
  <label>
    <span>Window K <small>(recent turns kept in context)</small></span>
    <input name="window_k" type="number" min="1" value={data.defaultWindowK} />
  </label>
  <div class="actions">
    <a class="btn" href="/meetings">Cancel</a>
    <button class="btn primary" type="submit">Start meeting</button>
  </div>
</form>

<style>
  h1 { margin: 0 0 1.5rem; }
  .error {
    background: rgba(210, 114, 114, 0.15); border: 1px solid var(--danger, #d27272);
    color: var(--danger, #d27272); padding: 0.6rem 0.8rem; border-radius: 6px;
  }
  .stack { display: grid; gap: 1rem; max-width: 640px; }
  label { display: grid; gap: 0.3rem; }
  label > span:first-child { font-size: 0.9em; color: var(--muted); }
  label.check { grid-auto-flow: column; justify-content: start; align-items: center; gap: 0.5rem; }
  label.check > span { color: var(--fg); }
  .role { color: var(--muted); font-size: 0.85em; }
  input, textarea, select {
    background: #1a1d24; color: var(--fg);
    border: 1px solid var(--border); border-radius: 6px; padding: 0.55rem 0.7rem;
  }
  input:focus, textarea:focus, select:focus {
    outline: 2px solid var(--accent); border-color: var(--accent);
  }
  textarea { resize: vertical; min-height: 6rem; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
  .attendees {
    border: 1px solid var(--border); border-radius: 8px;
    padding: 0.5rem 0.9rem 0.75rem; margin: 0; display: grid; gap: 0.35rem;
  }
  .attendees legend { padding: 0 0.35rem; font-size: 0.9em; color: var(--muted); }
  .peer-head { margin: 0.4rem 0 0.1rem; font-weight: 600; }
  small { color: var(--muted); font-size: 0.85em; }
  .actions { display: flex; gap: 0.5rem; justify-content: flex-end; }
  .btn {
    display: inline-block; padding: 0.5rem 0.9rem; border-radius: 6px;
    border: 1px solid var(--border); text-decoration: none; color: var(--fg);
    background: transparent; cursor: pointer;
  }
  .btn.primary { background: var(--accent); color: #0f1115; border-color: var(--accent); font-weight: 600; }
</style>
