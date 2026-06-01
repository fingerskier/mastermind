<script lang="ts">
  import type { ActionData, PageData } from './$types';
  import { Button, PageHeader, Markdown } from '$lib/components';
  import { relTime } from '$lib/time';

  let { data, form }: { data: PageData; form: ActionData } = $props();
  const note = $derived(data.note);

  let mode = $state<'edit' | 'preview'>('edit');
  let body = $state(data.note.body);
</script>

<PageHeader title={note.title} back="/memory" backLabel="Memory">
  {#snippet subtitle()}
    Updated {relTime(note.updated_at)}
  {/snippet}
  {#snippet actions()}
    <form
      method="POST"
      action="?/delete"
      onsubmit={(e) => {
        if (!confirm(`Delete note "${note.title}"?`)) e.preventDefault();
      }}
    >
      <Button type="submit" variant="danger">Delete</Button>
    </form>
  {/snippet}
</PageHeader>

{#if form?.error}<p class="alert error">{form.error}</p>{/if}
{#if form?.saved}<p class="alert ok">Saved.</p>{/if}

<form method="POST" action="?/save" class="stack">
  <div class="field">
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
    <textarea
      class="input mono"
      name="body"
      rows="20"
      bind:value={body}
      style:display={mode === 'preview' ? 'none' : null}
    ></textarea>
    {#if mode === 'preview'}<Markdown source={body} />{/if}
  </div>
  <div class="actions">
    <Button href="/memory">Back</Button>
    <Button type="submit" variant="primary">Save</Button>
  </div>
</form>

<style>
  .stack { display: grid; gap: 1rem; }
  .mono { font-family: var(--font-mono); font-size: 0.9em; resize: vertical; min-height: 16rem; }
  .toggle { display: inline-flex; border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden; width: max-content; }
  .toggle button {
    background: transparent; color: var(--muted); border: 0; padding: 0.35rem 0.8rem;
    cursor: pointer; font-size: 0.85em;
  }
  .toggle button + button { border-left: 1px solid var(--border); }
  .toggle button.active { background: var(--accent-soft); color: var(--accent); }
  .actions { display: flex; gap: 0.5rem; justify-content: flex-end; }
</style>
