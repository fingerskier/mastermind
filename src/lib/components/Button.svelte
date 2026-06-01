<script lang="ts">
  import type { Snippet } from 'svelte';

  type Variant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'icon';
  let {
    href = undefined,
    type = 'button',
    variant = 'secondary',
    disabled = false,
    title = undefined,
    ariaLabel = undefined,
    onclick = undefined,
    children,
    ...rest
  }: {
    href?: string;
    type?: 'button' | 'submit' | 'reset';
    variant?: Variant;
    disabled?: boolean;
    title?: string;
    ariaLabel?: string;
    onclick?: (e: MouseEvent) => void;
    children: Snippet;
    [key: string]: unknown;
  } = $props();
</script>

{#if href}
  <a class="btn {variant}" {href} {title} aria-label={ariaLabel} {...rest}>
    {@render children()}
  </a>
{:else}
  <button class="btn {variant}" {type} {disabled} {title} aria-label={ariaLabel} {onclick} {...rest}>
    {@render children()}
  </button>
{/if}

<style>
  .btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.4rem;
    padding: 0.5rem 0.9rem;
    border-radius: var(--radius);
    border: 1px solid var(--border);
    background: var(--surface-2);
    color: var(--fg);
    font-size: 0.92em;
    text-decoration: none;
    cursor: pointer;
    transition: border-color 0.12s, background 0.12s, color 0.12s;
    white-space: nowrap;
  }
  .btn:hover { border-color: var(--accent); }
  .btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .btn:disabled:hover { border-color: var(--border); }

  .primary {
    background: var(--accent);
    color: var(--accent-ink);
    border-color: var(--accent);
    font-weight: 600;
  }
  .primary:hover { filter: brightness(1.06); border-color: var(--accent); }

  .secondary { background: var(--surface-2); }

  .ghost { background: transparent; border-color: transparent; color: var(--muted); }
  .ghost:hover { color: var(--accent); background: var(--accent-soft); border-color: transparent; }

  .danger { background: transparent; border-color: var(--danger); color: var(--danger); }
  .danger:hover { background: var(--danger-soft); border-color: var(--danger); }

  .icon {
    padding: 0;
    width: 2rem;
    height: 2rem;
    background: transparent;
    color: var(--muted);
  }
  .icon:hover { color: var(--accent); }
</style>
