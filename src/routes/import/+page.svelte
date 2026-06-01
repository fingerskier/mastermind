<script lang="ts">
  import type { ActionData, PageData } from './$types';
  import { Button, Card, PageHeader, Badge } from '$lib/components';
  let { data, form }: { data: PageData; form: ActionData } = $props();
  let bundledSlug = $state('');
</script>

<PageHeader title="Install template" back="/" />

<section>
  {#if form?.error}<div class="alert error">{form.error}</div>{/if}

  {#if !form?.preview}
    {#if data.bundled.length > 0}
      <form method="POST" action="?/preview" class="form">
        <h2>Bundled templates</h2>
        <div class="bundled-grid">
          {#each data.bundled as t (t.slug)}
            <label class="pick">
              <input type="radio" name="source" value={t.source} bind:group={bundledSlug} />
              <Card>
                <div class="pick-name">{t.name}</div>
                {#if t.description}<div class="pick-desc">{t.description}</div>{/if}
              </Card>
            </label>
          {/each}
        </div>
        <div class="actions">
          <Button type="submit" variant="primary" disabled={!bundledSlug}>Preview bundled</Button>
          <Button href="/">Cancel</Button>
        </div>
      </form>
      <p class="or-line">— or use a custom source —</p>
    {/if}

    <form method="POST" action="?/preview" enctype="multipart/form-data" class="form">
      <label class="field">
        <span class="label">URL or local path</span>
        <input
          class="input"
          name="source"
          placeholder="https://example.com/foo.template.json or ./local.json"
          value={form?.source ?? ''}
        />
      </label>
      <p class="hint">or</p>
      <label class="field">
        <span class="label">Upload a JSON template</span>
        <input class="input" type="file" name="file" accept="application/json" />
      </label>
      <div class="actions">
        <Button type="submit" variant="primary">Preview</Button>
        {#if data.bundled.length === 0}
          <Button href="/">Cancel</Button>
        {/if}
      </div>
    </form>
  {:else}
    {@const plan = form.plan}
    <h2>Plan for {form.summary}</h2>

    {@const safeCouncil = !plan.council.exists}
    {@const safeCount =
      (safeCouncil ? 1 : 0) +
      plan.councillors.add.length +
      plan.memory.add.length +
      (!plan.sample_jobs.skipped_because_jobs_exist && plan.sample_jobs.add > 0 ? 1 : 0)}
    {@const overwriteCount =
      (plan.council.exists && plan.council.willOverwrite ? 1 : 0) +
      plan.councillors.overwrite.length +
      plan.memory.overwrite.length}
    {@const skippedCount = plan.sample_jobs.skipped_because_jobs_exist ? 1 : 0}

    <div class="risk-groups">
      <div class="risk-group">
        <div class="risk-head">
          <h3>Safe additions</h3>
          <Badge tone="count">{safeCount}</Badge>
        </div>
        {#if safeCount > 0}
          <ul class="plan add">
            {#if safeCouncil}<li>create council</li>{/if}
            {#each plan.councillors.add as s}<li>councillor: {s}</li>{/each}
            {#each plan.memory.add as s}<li>memory note: {s}</li>{/each}
            {#if !plan.sample_jobs.skipped_because_jobs_exist && plan.sample_jobs.add > 0}
              <li>sample jobs: {plan.sample_jobs.add}</li>
            {/if}
          </ul>
        {:else}
          <p class="hint">Nothing new to add.</p>
        {/if}
      </div>

      <div class="risk-group">
        <div class="risk-head">
          <h3>Overwrites</h3>
          <Badge tone="count">{overwriteCount}</Badge>
        </div>
        {#if overwriteCount > 0}
          <ul class="plan over">
            {#if plan.council.exists && plan.council.willOverwrite}<li>council meta will be replaced</li>{/if}
            {#each plan.councillors.overwrite as s}<li>councillor (overwrite): {s}</li>{/each}
            {#each plan.memory.overwrite as s}<li>memory note (overwrite): {s}</li>{/each}
          </ul>
        {:else}
          <p class="hint">No existing data will be replaced.</p>
        {/if}
      </div>

      <div class="risk-group">
        <div class="risk-head">
          <h3>Skipped</h3>
          <Badge tone="count">{skippedCount}</Badge>
        </div>
        {#if plan.sample_jobs.skipped_because_jobs_exist}
          <ul class="plan skip">
            <li>sample_jobs: skipped (jobs/ already non-empty)</li>
          </ul>
        {:else}
          <p class="hint">Nothing skipped.</p>
        {/if}
      </div>
    </div>

    <form method="POST" action="?/apply">
      <input type="hidden" name="templateJson" value={form.templateJson} />
      <div class="actions">
        <Button type="submit" variant="primary">Confirm install</Button>
        <Button href="/import">Cancel</Button>
      </div>
    </form>
  {/if}
</section>

<style>
  .form { display: grid; gap: 1rem; max-width: 560px; margin-top: 1rem; }
  h2 { margin: 0; }
  h3 { margin: 0; font-size: 1em; }
  .bundled-grid { display: grid; gap: 0.6rem; }
  .pick { display: block; cursor: pointer; }
  .pick input { position: absolute; opacity: 0; pointer-events: none; }
  .pick :global(.card) { border-width: 1px; }
  .pick input:checked + :global(.card) { border-color: var(--accent); background: var(--surface-2); }
  .pick input:focus-visible + :global(.card) { outline: 2px solid var(--accent); outline-offset: 1px; }
  .pick-name { font-weight: 600; }
  .pick-desc { color: var(--muted); font-size: 0.9em; margin-top: 0.2rem; }
  .or-line { text-align: center; max-width: 560px; margin: 1.25rem 0; color: var(--muted); font-size: 0.9em; }
  .actions { display: flex; gap: 0.5rem; }
  .hint { color: var(--faint); font-size: 0.85em; margin: 0; }
  .risk-groups { display: grid; gap: 1rem; max-width: 560px; margin: 1rem 0; }
  .risk-group {
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    background: var(--surface-1);
    padding: 0.75rem 1rem;
  }
  .risk-head { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.4rem; }
  .plan { list-style: none; padding: 0; margin: 0; display: grid; gap: 0.2rem; font-size: 0.92em; }
  .plan li { position: relative; padding-left: 1.1rem; }
  .plan li::before { position: absolute; left: 0; }
  .plan.add li::before { content: '+'; color: var(--ok); }
  .plan.over li::before { content: '~'; color: var(--warn); }
  .plan.skip li::before { content: '•'; color: var(--muted); }
</style>
