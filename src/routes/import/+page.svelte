<script lang="ts">
  import type { ActionData } from './$types';
  let { form }: { form: ActionData } = $props();
</script>

<section>
  <h1>Install a council template</h1>

  {#if form?.error}<div class="error">{form.error}</div>{/if}

  {#if !form?.preview}
    <form method="POST" action="?/preview" enctype="multipart/form-data" class="form">
      <label>
        <span>URL or local path</span>
        <input name="source" placeholder="https://example.com/foo.template.json or ./local.json" value={form?.source ?? ''} />
      </label>
      <p class="meta">or</p>
      <label>
        <span>Upload a JSON template</span>
        <input type="file" name="file" accept="application/json" />
      </label>
      <div class="actions">
        <button type="submit" class="btn primary">Preview</button>
        <a href="/" class="btn">Cancel</a>
      </div>
    </form>
  {:else}
    {@const plan = form.plan}
    <h2>Plan for {form.summary}</h2>
    <ul class="plan">
      {#if plan.council.exists && plan.council.willOverwrite}<li>~ council meta will be replaced</li>{/if}
      {#if !plan.council.exists}<li>+ create council</li>{/if}
      {#each plan.councillors.add as s}<li>+ councillor: {s}</li>{/each}
      {#each plan.councillors.overwrite as s}<li>~ councillor (overwrite): {s}</li>{/each}
      {#each plan.memory.add as s}<li>+ memory note: {s}</li>{/each}
      {#each plan.memory.overwrite as s}<li>~ memory note (overwrite): {s}</li>{/each}
      {#if plan.sample_jobs.skipped_because_jobs_exist}
        <li>• sample_jobs: skipped (jobs/ already non-empty)</li>
      {:else if plan.sample_jobs.add > 0}
        <li>+ sample jobs: {plan.sample_jobs.add}</li>
      {/if}
    </ul>
    <form method="POST" action="?/apply">
      <input type="hidden" name="templateJson" value={form.templateJson} />
      <div class="actions">
        <button type="submit" class="btn primary">Confirm install</button>
        <a href="/import" class="btn">Cancel</a>
      </div>
    </form>
  {/if}
</section>

<style>
  .form { display: grid; gap: 1rem; max-width: 560px; margin-top: 1rem; }
  label { display: grid; gap: 0.35rem; }
  label > span { color: var(--muted); font-size: 0.9em; }
  input[type="text"], input:not([type]) {
    background: #1a1d24; color: var(--fg);
    border: 1px solid var(--border); border-radius: 6px; padding: 0.55rem 0.7rem;
  }
  .actions { display: flex; gap: 0.5rem; }
  .meta { color: var(--muted); font-size: 0.9em; margin: 0; }
  .error { background: rgba(210,114,114,0.15); border: 1px solid var(--danger); color: var(--danger); padding: 0.6rem 0.8rem; border-radius: 6px; }
  .plan { list-style: none; padding: 0.5rem 1rem; border: 1px solid var(--border); border-radius: 6px; background: rgba(255,255,255,0.01); }
  .btn { display: inline-block; padding: 0.5rem 0.9rem; border-radius: 6px; border: 1px solid var(--border); text-decoration: none; color: var(--fg); background: transparent; cursor: pointer; }
  .btn.primary { background: var(--accent); color: #0f1115; border-color: var(--accent); font-weight: 600; }
</style>
