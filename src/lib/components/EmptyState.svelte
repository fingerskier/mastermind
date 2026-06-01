<script lang="ts">
  import type { Snippet } from 'svelte';

  // Empty states earn one sentence of context plus the next action —
  // never a bare "No X yet."
  let {
    icon = undefined,
    text,
    action
  }: { icon?: string; text: string; action?: Snippet } = $props();
</script>

<div class="empty">
  {#if icon}<div class="icon" aria-hidden="true">{icon}</div>{/if}
  <p>{text}</p>
  {#if action}<div class="action">{@render action()}</div>{/if}
</div>

<style>
  .empty {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.75rem;
    padding: 1.5rem;
    border: 1px dashed var(--border);
    border-radius: var(--radius-lg);
    background: var(--surface-1);
  }
  .icon { font-size: 1.5rem; opacity: 0.7; }
  p { margin: 0; color: var(--muted); max-width: 52ch; }
</style>
