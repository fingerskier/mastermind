<script lang="ts">
  import type { ActionData, PageData } from './$types';
  import { Button, PageHeader, Markdown } from '$lib/components';

  let { data, form }: { data: PageData; form: ActionData } = $props();
  // `data.council` is loaded but the header/back link cover navigation.
  void data;

  let mode = $state<'edit' | 'preview'>('edit');
  let body = $state(form?.body ?? '');
</script>

<PageHeader title="New memory note" back="/memory" backLabel="Memory" />

{#if form?.error}<p class="alert error">{form.error}</p>{/if}

<form method="POST" class="stack">
  <div class="field">
    <label class="label" for="note-title">Title</label>
    <input id="note-title" class="input" name="title" required value={form?.title ?? ''} />
  </div>
  <div class="field">
    <div class="row">
      <span class="label">Body (markdown)</span>
      <div class="toggle" role="tablist" aria-label="Editor mode">
        <button
          type="button"
          class:active={mode === 'edit'}
          aria-pressed={mode === 'edit'}
          onclick={() => (mode = 'edit')}
        >Edit</button>
        <button
          type="button"
          class:active={mode === 'preview'}
          aria-pressed={mode === 'preview'}
          onclick={() => (mode = 'preview')}
        >Preview</button>
      </div>
    </div>
    <textarea
      class="input mono"
      name="body"
      rows="14"
      placeholder="Notes shared with every councillor when they run a job."
      bind:value={body}
      style:display={mode === 'preview' ? 'none' : null}
    ></textarea>
    {#if mode === 'preview'}<Markdown source={body} />{/if}
  </div>
  <div class="actions">
    <Button href="/memory">Cancel</Button>
    <Button type="submit" variant="primary">Save note</Button>
  </div>
</form>

<style>
  .stack { display: grid; gap: 1rem; max-width: 640px; }
  .mono { font-family: var(--font-mono); resize: vertical; min-height: 6rem; }
  .row { display: flex; justify-content: space-between; align-items: center; gap: 1rem; }
  .toggle { display: inline-flex; border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden; width: max-content; }
  .toggle button {
    background: transparent; color: var(--muted); border: 0; padding: 0.35rem 0.8rem;
    cursor: pointer; font-size: 0.85em;
  }
  .toggle button + button { border-left: 1px solid var(--border); }
  .toggle button.active { background: var(--accent-soft); color: var(--accent); }
  .actions { display: flex; gap: 0.5rem; justify-content: flex-end; }
</style>
