<script lang="ts">
  import type { PageData } from './$types';
  let { data }: { data: PageData } = $props();
</script>

<section>
  <h1>Export council as template</h1>
  <p class="meta">
    Templates are sharable JSON. Pick what's safe to include — memory and sample jobs default to off
    so you don't accidentally publish private notes.
  </p>

  <form method="POST" action="/export/download" class="form">
    <fieldset>
      <legend>Template metadata</legend>
      <label><span>Name *</span><input name="name" required maxlength="80" /></label>
      <label><span>Version *</span><input name="version" required value="0.1.0" /></label>
      <label><span>Description</span><textarea name="description" rows="2"></textarea></label>
      <label><span>Author</span><input name="author" /></label>
      <label><span>License</span><input name="license" placeholder="e.g. MIT" /></label>
    </fieldset>

    <fieldset>
      <legend>Councillors (default: all)</legend>
      {#each data.councillors as c (c.slug)}
        <label class="check">
          <input type="checkbox" name="councillors" value={c.slug} checked />
          <span>{c.name} <code>({c.slug})</code></span>
        </label>
      {/each}
      {#if data.councillors.length === 0}<p class="meta">No councillors.</p>{/if}
    </fieldset>

    <fieldset>
      <legend>Memory notes (default: none)</legend>
      {#each data.notes as n (n.slug)}
        <label class="check">
          <input type="checkbox" name="memory" value={n.slug} />
          <span>{n.title} <code>({n.slug})</code></span>
        </label>
      {/each}
      {#if data.notes.length === 0}<p class="meta">No memory notes.</p>{/if}
    </fieldset>

    <fieldset>
      <legend>Sample jobs — queued only (default: none)</legend>
      {#each data.queuedJobs as j (j.id)}
        <label class="check">
          <input type="checkbox" name="jobs" value={j.id} />
          <span>{j.title} <code>({j.councillor_slug})</code></span>
        </label>
      {/each}
      {#if data.queuedJobs.length === 0}<p class="meta">No queued jobs.</p>{/if}
    </fieldset>

    <div class="actions">
      <button type="submit" class="btn primary">Download template JSON</button>
      <a href="/" class="btn">Cancel</a>
    </div>
  </form>
</section>

<style>
  .form { display: grid; gap: 1.25rem; max-width: 640px; margin-top: 1rem; }
  fieldset { border: 1px solid var(--border); border-radius: 6px; padding: 0.75rem 1rem; }
  legend { padding: 0 0.5rem; color: var(--muted); font-size: 0.9em; }
  label { display: grid; gap: 0.35rem; margin-bottom: 0.5rem; }
  label > span { color: var(--muted); font-size: 0.9em; }
  label.check { display: flex; gap: 0.5rem; align-items: center; }
  input[type="text"], input:not([type]), textarea {
    background: #1a1d24; color: var(--fg);
    border: 1px solid var(--border); border-radius: 6px; padding: 0.45rem 0.6rem;
  }
  .actions { display: flex; gap: 0.5rem; }
  .meta { color: var(--muted); font-size: 0.9em; margin: 0; }
  .btn { display: inline-block; padding: 0.5rem 0.9rem; border-radius: 6px; border: 1px solid var(--border); text-decoration: none; color: var(--fg); background: transparent; cursor: pointer; }
  .btn.primary { background: var(--accent); color: #0f1115; border-color: var(--accent); font-weight: 600; }
</style>
