<script lang="ts">
  import type { Snippet } from 'svelte';

  // Generic chip: source, adapter, remote, count, or neutral tag.
  type Tone = 'neutral' | 'accent' | 'info' | 'count';
  let {
    tone = 'neutral',
    mono = false,
    title = undefined,
    children
  }: { tone?: Tone; mono?: boolean; title?: string; children: Snippet } = $props();
</script>

<span class="badge {tone}" class:mono {title}>{@render children()}</span>

<style>
  .badge {
    display: inline-flex;
    align-items: center;
    gap: 0.3em;
    padding: 0.1rem 0.5rem;
    border-radius: var(--radius-pill);
    border: 1px solid var(--border);
    background: var(--surface-2);
    color: var(--muted);
    font-size: 0.78em;
    line-height: 1.4;
    white-space: nowrap;
  }
  .mono { font-family: var(--font-mono); }
  .accent { border-color: var(--accent); color: var(--accent); background: var(--accent-soft); }
  .info { border-color: var(--info); color: var(--info); background: var(--info-soft); }
  .count {
    min-width: 1.4em;
    justify-content: center;
    border-color: var(--accent);
    color: var(--accent-ink);
    background: var(--accent);
    font-weight: 600;
  }
</style>
