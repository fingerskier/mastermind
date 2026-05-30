<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import { marked } from 'marked';
  let { data, form } = $props();
  const m = $derived(data.meeting);

  const renderMd = (s: string) =>
    marked.parse(s, { async: false, gfm: true, breaks: false }) as string;

  type Turn = { index: number; speaker: string; at: string; body: string };
  function parseTurns(text: string): Turn[] {
    if (!text) return [];
    const parts = text.split(/\n## Turn /);
    const out: Turn[] = [];
    for (const p of parts) {
      if (!p.trim()) continue;
      const match = p.match(/^(\d+) — ([^\n]+?) — ([^\n]+)\n+([\s\S]*)$/);
      if (!match) continue;
      out.push({
        index: Number(match[1]),
        speaker: match[2].trim(),
        at: match[3].trim(),
        body: match[4].trim()
      });
    }
    return out;
  }
  const turns = $derived(parseTurns(data.transcript ?? ''));

  const isRemote = (token: string) => token.includes(':');
  const prettySpeaker = (token: string) => (isRemote(token) ? token.replace(':', ' › ') : token);
  const offline = $derived(new Set<string>(data.offlineRemotes ?? []));

  type NextUp = { label: string; sub: string } | null;
  function computeNext(meeting: typeof m): NextUp {
    switch (meeting.status) {
      case 'awaiting_director':
        return { label: 'You (director)', sub: 'awaiting your turn' };
      case 'running':
        if (meeting.remaining_this_round.length > 0) {
          return { label: prettySpeaker(meeting.remaining_this_round[0]), sub: 'councillor speaking next' };
        }
        return { label: 'You (director)', sub: 'next round begins after director speaks' };
      case 'paused':
        if (meeting.remaining_this_round.length > 0) {
          return { label: prettySpeaker(meeting.remaining_this_round[0]), sub: 'paused — will retry on resume' };
        }
        return { label: '—', sub: 'paused' };
      case 'synthesizing':
        return { label: meeting.chair_slug, sub: 'chair is synthesizing the meeting' };
      default:
        return null;
    }
  }
  const nextUp = $derived(computeNext(m));

  let autoRefresh: ReturnType<typeof setInterval> | undefined;
  $effect(() => {
    const terminal = ['ended', 'cancelled', 'failed'].includes(m.status);
    if (!terminal) {
      autoRefresh = setInterval(() => void invalidateAll(), 2000);
    }
    return () => { if (autoRefresh) clearInterval(autoRefresh); };
  });
</script>

<h1>{m.title}</h1>
<p>
  <span>status: {m.status}</span> ·
  <span>chair: {m.chair_slug}</span> ·
  <span>attendees: {m.attendees.join(', ')}{#if m.remote_attendees?.length}, {m.remote_attendees.map((r) => `${r.council_slug} › ${r.councillor_slug}${offline.has(`${r.council_slug}:${r.councillor_slug}`) ? ' (offline)' : ''}`).join(', ')}{/if}</span> ·
  <span>round: {m.current_round}</span> ·
  <span>turns: {m.total_turns}</span>
</p>

{#if m.pause_reason}<p class="pause">Paused: {m.pause_reason}</p>{/if}

{#if nextUp}
  <div class="next-up">
    <div class="next-up-label">Waiting on</div>
    <div class="next-up-who">{nextUp.label}</div>
    <div class="next-up-sub">{nextUp.sub}</div>
  </div>
{/if}

{#if m.status === 'awaiting_director'}
  <form method="POST" action="?/speak">
    <p><label>Your turn <textarea name="body" rows="4"></textarea></label></p>
    <button type="submit">Speak</button>
  </form>
  <form method="POST" action="?/skip">
    <button type="submit">Skip this round</button>
  </form>
{/if}

<form method="POST" action="?/end" style="display:inline">
  {#if !['ended','cancelled','failed','synthesizing'].includes(m.status)}<button type="submit">End meeting</button>{/if}
</form>
<form method="POST" action="?/cancel" style="display:inline">
  {#if !['ended','cancelled','failed'].includes(m.status)}<button type="submit">Cancel</button>{/if}
</form>
{#if m.status === 'paused'}
  <form method="POST" action="?/resume" style="display:inline">
    <button type="submit">Resume</button>
  </form>
{/if}

<h2>Topic</h2>
<pre class="block">{data.topic}</pre>

{#if data.synthesis}
  <h2>Synthesis</h2>
  <div class="md-block">{@html renderMd(data.synthesis)}</div>
  {#if m.memory_slugs?.length}<p>Memories created: {m.memory_slugs.join(', ')}</p>{/if}
  {#if m.shared_memory_slugs?.length}<p>Shared memories: {m.shared_memory_slugs.join(', ')}</p>{/if}
  {#if m.proposed_jobs?.length}<p>Proposed jobs: {m.proposed_jobs.join(', ')}</p>{/if}
{/if}

{#if data.summary}
  <details>
    <summary>Rolling summary</summary>
    <div class="md-block">{@html renderMd(data.summary)}</div>
  </details>
{/if}

<h2>Transcript</h2>
{#if turns.length === 0}
  <p class="empty">(empty)</p>
{:else}
  <ol class="turns">
    {#each turns as t (t.index)}
      <li class="turn">
        <header class="turn-head">
          <span class="turn-index">Turn {t.index}</span>
          <span class="turn-speaker" class:remote={isRemote(t.speaker)}>{prettySpeaker(t.speaker)}</span>
          <span class="turn-at">{t.at}</span>
        </header>
        <div class="md-block turn-body">{@html renderMd(t.body)}</div>
      </li>
    {/each}
  </ol>
{/if}

{#if form?.error}<p class="error">{form.error}</p>{/if}

<style>
  h1 { margin: 0; }
  .pause { color: var(--muted); }
  .empty { color: var(--muted); }

  .next-up {
    margin: 1rem 0;
    padding: 0.75rem 1rem;
    border: 1px solid var(--accent, #6aa6ff);
    border-left-width: 4px;
    border-radius: 6px;
    background: rgba(106, 166, 255, 0.06);
    max-width: 100%;
  }
  .next-up-label {
    font-size: 0.75em;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--muted);
  }
  .next-up-who { font-size: 1.15em; font-weight: 600; margin-top: 0.15rem; }
  .next-up-sub { font-size: 0.85em; color: var(--muted); margin-top: 0.1rem; }

  .block {
    background: #15181f;
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 0.75rem 1rem;
    white-space: pre-wrap;
    word-break: break-word;
    overflow-wrap: anywhere;
    max-width: 100%;
    overflow-x: auto;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 0.9em;
  }

  .turns {
    list-style: none;
    padding: 0;
    margin: 0;
    max-width: 100%;
  }
  .turn { padding: 0; margin: 0; }
  .turn + .turn { border-top: 1px solid var(--border); margin-top: 1rem; padding-top: 1rem; }
  .turn-head {
    display: flex;
    flex-wrap: wrap;
    gap: 0.6rem;
    align-items: baseline;
    color: var(--muted);
    font-size: 0.85em;
    margin-bottom: 0.4rem;
  }
  .turn-speaker { color: var(--fg); font-weight: 600; }
  .turn-speaker.remote {
    background: rgba(106, 166, 255, 0.12);
    border: 1px solid var(--accent, #6aa6ff);
    border-radius: 4px;
    padding: 0 0.4em;
  }
  .turn-at { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.85em; }

  .md-block {
    background: #1a1d24;
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 0.75rem 1.25rem;
    font-size: 0.95em;
    line-height: 1.55;
    max-width: 100%;
    overflow-x: auto;
    word-break: break-word;
    overflow-wrap: anywhere;
  }
  .turn-body { max-height: 600px; overflow-y: auto; }
  .md-block :global(h1),
  .md-block :global(h2),
  .md-block :global(h3),
  .md-block :global(h4) { margin: 1em 0 0.4em; line-height: 1.25; }
  .md-block :global(h1) { font-size: 1.3em; }
  .md-block :global(h2) { font-size: 1.15em; }
  .md-block :global(h3) { font-size: 1.05em; }
  .md-block :global(p) { margin: 0.5em 0; }
  .md-block :global(ul),
  .md-block :global(ol) { padding-left: 1.4em; margin: 0.5em 0; }
  .md-block :global(li) { margin: 0.15em 0; }
  .md-block :global(code) {
    background: #0f1115;
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 0.05em 0.35em;
    font-family: ui-monospace, "Cascadia Mono", Consolas, monospace;
    font-size: 0.9em;
    word-break: break-word;
  }
  .md-block :global(pre) {
    background: #0f1115;
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 0.8rem 1rem;
    overflow-x: auto;
    max-width: 100%;
  }
  .md-block :global(pre code) { background: transparent; border: 0; padding: 0; white-space: pre; }
  .md-block :global(blockquote) {
    border-left: 3px solid var(--border);
    color: var(--muted);
    margin: 0.5em 0;
    padding: 0.1em 0.9em;
  }
  .md-block :global(a) { color: var(--accent); word-break: break-all; }
  .md-block :global(hr) { border: 0; border-top: 1px solid var(--border); margin: 1em 0; }
  .md-block :global(img) { max-width: 100%; height: auto; }
  .md-block :global(table) { display: block; max-width: 100%; overflow-x: auto; }

  .error { color: var(--danger); }
</style>
