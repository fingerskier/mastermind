<script lang="ts" module>
  // One status vocabulary for jobs AND meetings. Glyph + text + color —
  // never color or glyph alone (a11y), and the text is the accessible name.
  type Key =
    | 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled'
    | 'awaiting_director' | 'paused' | 'synthesizing' | 'ended';

  const MAP: Record<Key, { glyph: string; label: string; cls: string; spin?: boolean }> = {
    queued:            { glyph: '…', label: 'Queued',    cls: 'queued' },
    running:           { glyph: '●', label: 'Running',   cls: 'running', spin: true },
    succeeded:         { glyph: '✓', label: 'Succeeded', cls: 'succeeded' },
    failed:            { glyph: '✕', label: 'Failed',    cls: 'failed' },
    cancelled:         { glyph: '⊘', label: 'Cancelled', cls: 'cancelled' },
    awaiting_director: { glyph: '◆', label: 'Awaiting you', cls: 'paused' },
    paused:            { glyph: '⏸', label: 'Paused',    cls: 'paused' },
    synthesizing:      { glyph: '●', label: 'Synthesizing', cls: 'running', spin: true },
    ended:             { glyph: '✓', label: 'Ended',     cls: 'succeeded' }
  };
</script>

<script lang="ts">
  let {
    status,
    glyphOnly = false,
    label = undefined
  }: { status: string; glyphOnly?: boolean; label?: string } = $props();

  const info = $derived(MAP[status as Key] ?? { glyph: '…', label: status, cls: 'queued' });
  const text = $derived(label ?? info.label);
</script>

<span class="status {info.cls}" title={text} aria-label={text}>
  <span class="glyph" class:spin={info.spin} aria-hidden="true">{info.glyph}</span>
  {#if !glyphOnly}<span class="text">{text}</span>{/if}
</span>

<style>
  .status {
    display: inline-flex;
    align-items: center;
    gap: 0.4em;
    font-size: 0.85em;
    line-height: 1;
  }
  .glyph {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.1em;
    font-weight: 700;
  }
  .spin { animation: ls-pulse 1.4s ease-in-out infinite; }
  .text { color: var(--fg); }

  .queued .glyph { color: var(--st-queued); }
  .running .glyph { color: var(--st-running); }
  .succeeded .glyph { color: var(--st-succeeded); }
  .failed .glyph { color: var(--st-failed); }
  .failed .text { color: var(--danger); }
  .cancelled .glyph { color: var(--st-cancelled); }
  .paused .glyph { color: var(--st-paused); }
</style>
