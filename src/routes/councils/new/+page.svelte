<script lang="ts">
  import type { ActionData } from './$types';
  let { form }: { form: ActionData } = $props();
</script>

<h1>New council</h1>
<p><a href="/">&larr; Back to councils</a></p>

<form method="POST" class="form">
  {#if form?.error}
    <div class="error">{form.error}</div>
  {/if}

  <label>
    <span>Name</span>
    <input name="name" required maxlength="80" value={form?.name ?? ''} />
  </label>

  <label>
    <span>Description</span>
    <textarea name="description" rows="3" maxlength="500">{form?.description ?? ''}</textarea>
  </label>

  <label>
    <span>Template <em>(optional)</em></span>
    <input name="template" maxlength="80" value={form?.template ?? ''} placeholder="e.g. c-suite, hedge-fund" />
  </label>

  <div class="actions">
    <button type="submit" class="btn primary">Create council</button>
    <a href="/" class="btn">Cancel</a>
  </div>
</form>

<style>
  h1 { margin-top: 0; }
  .form {
    display: grid;
    gap: 1rem;
    max-width: 560px;
  }
  label { display: grid; gap: 0.35rem; }
  label > span { color: var(--muted); font-size: 0.9em; }
  input, textarea {
    background: #1a1d24;
    color: var(--fg);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 0.55rem 0.7rem;
  }
  input:focus, textarea:focus { outline: 2px solid var(--accent); border-color: var(--accent); }
  .actions { display: flex; gap: 0.5rem; }
  .btn {
    display: inline-block;
    padding: 0.5rem 0.9rem;
    border-radius: 6px;
    border: 1px solid var(--border);
    text-decoration: none;
    color: var(--fg);
    background: transparent;
    cursor: pointer;
  }
  .btn.primary {
    background: var(--accent);
    color: #0f1115;
    border-color: var(--accent);
    font-weight: 600;
  }
  .error {
    background: rgba(210, 114, 114, 0.15);
    border: 1px solid var(--danger);
    color: var(--danger);
    padding: 0.6rem 0.8rem;
    border-radius: 6px;
  }
</style>
