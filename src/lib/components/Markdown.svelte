<script lang="ts">
  import { marked } from 'marked';

  let {
    source,
    breaks = false
  }: { source: string; breaks?: boolean } = $props();

  const html = $derived(marked.parse(source ?? '', { async: false, gfm: true, breaks }) as string);
</script>

<!-- Styling lives in the global `.markdown` class (app.css). -->
<div class="markdown">{@html html}</div>
