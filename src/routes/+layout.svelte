<script lang="ts">
  let { children } = $props();
</script>

<header>
  <a href="/" class="brand">Landsraad</a>
</header>

<main>
  {@render children?.()}
</main>

<style>
  :global(:root) {
    --bg: #0f1115;
    --fg: #e6e7eb;
    --muted: #9aa3b2;
    --accent: #d6c08c;
    --border: #2a2f3a;
    --danger: #d27272;
  }
  :global(body) {
    margin: 0;
    background: var(--bg);
    color: var(--fg);
    font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    line-height: 1.5;
  }
  :global(a) { color: var(--accent); }
  :global(button), :global(input), :global(textarea), :global(select) {
    font: inherit;
    color: inherit;
  }
  header {
    border-bottom: 1px solid var(--border);
    padding: 0.9rem 1.5rem;
  }
  .brand {
    color: var(--fg);
    text-decoration: none;
    font-weight: 600;
    letter-spacing: 0.04em;
  }
  main {
    max-width: 880px;
    margin: 0 auto;
    padding: 2rem 1.5rem 4rem;
  }
</style>
