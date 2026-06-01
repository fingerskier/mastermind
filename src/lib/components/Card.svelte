<script lang="ts">
  import type { Snippet } from 'svelte';

  // Linkable list-row / card. Renders an <a> when href is given.
  let {
    href = undefined,
    style = undefined,
    children
  }: { href?: string; style?: string; children: Snippet } = $props();
</script>

{#if href}
  <a class="card" {href} {style}>{@render children()}</a>
{:else}
  <div class="card" {style}>{@render children()}</div>
{/if}

<style>
  .card {
    display: block;
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    padding: 1rem 1.1rem;
    background: var(--surface-1);
    color: var(--fg);
    text-decoration: none;
    transition: border-color 0.12s, background 0.12s;
  }
  a.card:hover { border-color: var(--accent); background: var(--surface-2); }
</style>
