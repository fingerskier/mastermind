<script lang="ts">
  import type { PageData } from './$types';
  import { Button, PageHeader } from '$lib/components';
  let { data }: { data: PageData } = $props();
</script>

<PageHeader title="Export council" back="/" />

<section>
  <p class="meta">
    Templates are sharable JSON. Pick what's safe to include — memory and sample jobs default to off
    so you don't accidentally publish private notes.
  </p>

  <div class="privacy">
    <h2>Privacy checklist</h2>
    <ul class="privacy-list">
      <li><span class="mark ok">✓</span> No run artifacts — transcripts and run history are never exported.</li>
      <li><span class="mark ok">✓</span> No <code>.env</code> or secrets — adapter keys stay on your machine.</li>
      <li><span class="mark ok">✓</span> Queued jobs only — running, finished, and failed jobs are excluded.</li>
      <li><span class="mark optin">○</span> Memory notes are opt-in — none included unless you tick them below.</li>
    </ul>
    <p class="summary">
      The JSON bundle will contain: template metadata, the councillors you select, plus any memory
      notes and queued sample jobs you opt into below.
    </p>
  </div>

  <form method="POST" action="/export/download" class="form">
    <fieldset>
      <legend>Template metadata</legend>
      <label class="field"><span class="label">Name *</span><input class="input" name="name" required maxlength="80" /></label>
      <label class="field"><span class="label">Version *</span><input class="input" name="version" required value="0.1.0" /></label>
      <label class="field"><span class="label">Description</span><textarea class="input" name="description" rows="2"></textarea></label>
      <label class="field"><span class="label">Author</span><input class="input" name="author" /></label>
      <label class="field"><span class="label">License</span><input class="input" name="license" list="license-options" placeholder="e.g. MIT" /></label>
      <datalist id="license-options">
        <option value="MIT"></option>
        <option value="Apache-2.0"></option>
        <option value="BSD-2-Clause"></option>
        <option value="BSD-3-Clause"></option>
        <option value="GPL-3.0-or-later"></option>
        <option value="AGPL-3.0-or-later"></option>
        <option value="LGPL-3.0-or-later"></option>
        <option value="MPL-2.0"></option>
        <option value="ISC"></option>
        <option value="Unlicense"></option>
        <option value="CC0-1.0"></option>
        <option value="CC-BY-4.0"></option>
        <option value="CC-BY-SA-4.0"></option>
        <option value="Proprietary"></option>
      </datalist>
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
      <Button type="submit" variant="primary">Download template JSON</Button>
      <Button href="/council">Cancel</Button>
    </div>
  </form>
</section>

<style>
  .form { display: grid; gap: 1.25rem; max-width: 640px; margin-top: 1rem; }
  fieldset { border: 1px solid var(--border); border-radius: var(--radius); padding: 0.75rem 1rem; }
  legend { padding: 0 0.5rem; color: var(--muted); font-size: 0.9em; }
  label.field { margin-bottom: 0.5rem; }
  label.check { display: flex; gap: 0.5rem; align-items: center; margin-bottom: 0.5rem; }
  .actions { display: flex; gap: 0.5rem; }
  .meta { color: var(--muted); font-size: 0.9em; margin: 0; }
  .privacy {
    max-width: 640px;
    margin-top: 1.25rem;
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    background: var(--surface-1);
    padding: 0.85rem 1.1rem;
  }
  .privacy h2 { margin: 0 0 0.5rem; font-size: 1.05em; }
  .privacy-list { list-style: none; padding: 0; margin: 0; display: grid; gap: 0.35rem; font-size: 0.92em; }
  .privacy-list li { display: flex; gap: 0.5rem; align-items: baseline; }
  .mark { flex-shrink: 0; font-weight: 700; }
  .mark.ok { color: var(--ok); }
  .mark.optin { color: var(--info); }
  .summary { color: var(--muted); font-size: 0.88em; margin: 0.6rem 0 0; }
  code {
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 0.05em 0.3em;
    font-size: 0.9em;
  }
</style>
