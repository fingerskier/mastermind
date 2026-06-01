<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import { Button, StatusBadge, Badge, Markdown } from '$lib/components';
  let { data, form } = $props();
  const m = $derived(data.meeting);

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

<!-- Meeting cockpit: status + controls always visible at the top. -->
<header class="cockpit">
  <div class="cockpit-lead">
    <a class="back" href="/meetings">← Meetings</a>
    <div class="title-row">
      <h1>{m.title}</h1>
      <StatusBadge status={m.status} />
    </div>
  </div>
  <div class="controls">
    {#if m.status === 'paused'}
      <form method="POST" action="?/resume"><Button type="submit" variant="primary">Resume</Button></form>
    {/if}
    {#if !['ended','cancelled','failed','synthesizing'].includes(m.status)}
      <form method="POST" action="?/end"><Button type="submit">End meeting</Button></form>
    {/if}
    {#if !['ended','cancelled','failed'].includes(m.status)}
      <form method="POST" action="?/cancel"><Button type="submit" variant="danger">Cancel</Button></form>
    {/if}
  </div>
</header>

<dl class="meta-grid">
  <div><dt>Chair</dt><dd>{m.chair_slug}</dd></div>
  <div><dt>Round</dt><dd>{m.current_round}</dd></div>
  <div><dt>Turns</dt><dd>{m.total_turns}</dd></div>
  <div class="roster">
    <dt>Attendees</dt>
    <dd>
      {#each m.attendees as a}<Badge>{a}</Badge>{/each}
      {#each m.remote_attendees ?? [] as r}
        {@const off = offline.has(`${r.council_slug}:${r.councillor_slug}`)}
        <Badge tone="info" title={off ? 'offline' : 'remote'}>
          {r.council_slug} › {r.councillor_slug}{#if off} ·offline{/if}
        </Badge>
      {/each}
    </dd>
  </div>
</dl>

{#if m.pause_reason}<p class="alert" class:error={false}>Paused: {m.pause_reason}</p>{/if}
{#if form?.error}<p class="alert error">{form.error}</p>{/if}

{#if nextUp}
  <div class="next-up" class:hot={m.status === 'awaiting_director'}>
    <div class="next-up-label">Waiting on</div>
    <div class="next-up-who">{nextUp.label}</div>
    <div class="next-up-sub">{nextUp.sub}</div>
  </div>
{/if}

{#if m.status === 'awaiting_director'}
  <section class="composer">
    <form method="POST" action="?/speak">
      <label class="field">
        <span class="label">Your turn</span>
        <textarea class="input" name="body" rows="4" placeholder="Speak to the council…"></textarea>
      </label>
      <div class="composer-actions">
        <Button type="submit" variant="primary">Speak</Button>
        <span class="or-skip">
          <button class="link-skip" type="submit" form="skip-form">Skip this round</button>
        </span>
      </div>
    </form>
    <form id="skip-form" method="POST" action="?/skip"></form>
  </section>
{/if}

<h2>Topic</h2>
<pre class="block">{data.topic}</pre>

{#if data.synthesis}
  <h2>Synthesis</h2>
  <Markdown source={data.synthesis} />
  {#if m.memory_slugs?.length || m.shared_memory_slugs?.length || m.proposed_jobs?.length}
    <div class="outcomes">
      {#each m.memory_slugs ?? [] as s}<Badge title="memory created">◇ {s}</Badge>{/each}
      {#each m.shared_memory_slugs ?? [] as s}<Badge tone="accent" title="shared memory">◇ {s}</Badge>{/each}
      {#each m.proposed_jobs ?? [] as s}<Badge tone="info" title="proposed job">→ {s}</Badge>{/each}
    </div>
  {/if}
{/if}

{#if data.summary}
  <details>
    <summary>Rolling summary</summary>
    <Markdown source={data.summary} />
  </details>
{/if}

<h2>Transcript</h2>
{#if turns.length === 0}
  <p class="empty">No turns yet.</p>
{:else}
  <ol class="turns">
    {#each turns as t (t.index)}
      <li class="turn">
        <header class="turn-head">
          <span class="turn-index">Turn {t.index}</span>
          <span class="turn-speaker" class:remote={isRemote(t.speaker)}>{prettySpeaker(t.speaker)}</span>
          <span class="turn-at">{t.at}</span>
        </header>
        <div class="turn-body"><Markdown source={t.body} /></div>
      </li>
    {/each}
  </ol>
{/if}

<style>
  .empty { color: var(--muted); }

  .cockpit {
    position: sticky;
    top: 0;
    z-index: 5;
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 1rem;
    padding: 1rem 0;
    margin-bottom: 1rem;
    background: linear-gradient(var(--bg) 75%, transparent);
  }
  .back { color: var(--muted); text-decoration: none; font-size: 0.85em; }
  .back:hover { color: var(--accent); }
  .title-row { display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap; margin-top: 0.3rem; }
  h1 { margin: 0; font-size: 1.5rem; }
  .controls { display: flex; gap: 0.5rem; flex-shrink: 0; }
  .controls form { margin: 0; }

  .meta-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(120px, max-content));
    gap: 0.5rem 2rem;
    margin: 0 0 1.5rem;
  }
  .meta-grid div { min-width: 0; }
  .meta-grid dt { color: var(--faint); font-size: 0.72em; text-transform: uppercase; letter-spacing: 0.05em; }
  .meta-grid dd { margin: 0.2rem 0 0; }
  .roster { grid-column: 1 / -1; }
  .roster dd { display: flex; flex-wrap: wrap; gap: 0.35rem; }

  .next-up {
    margin: 0 0 1.25rem;
    padding: 0.75rem 1rem;
    border: 1px solid var(--border);
    border-left: 4px solid var(--muted);
    border-radius: var(--radius);
    background: var(--surface-1);
  }
  .next-up.hot { border-left-color: var(--warn); background: rgba(224, 181, 98, 0.07); }
  .next-up-label { font-size: 0.72em; text-transform: uppercase; letter-spacing: 0.05em; color: var(--muted); }
  .next-up-who { font-size: 1.15em; font-weight: 600; margin-top: 0.15rem; }
  .next-up-sub { font-size: 0.85em; color: var(--muted); margin-top: 0.1rem; }

  .composer {
    margin: 0 0 1.75rem;
    padding: 1rem;
    border: 1px solid var(--warn);
    border-radius: var(--radius-lg);
    background: rgba(224, 181, 98, 0.05);
  }
  .composer-actions { display: flex; align-items: center; gap: 1rem; margin-top: 0.75rem; }
  .link-skip { background: none; border: 0; color: var(--muted); cursor: pointer; text-decoration: underline; font-size: 0.9em; padding: 0; }
  .link-skip:hover { color: var(--accent); }

  .outcomes { display: flex; flex-wrap: wrap; gap: 0.4rem; margin-top: 0.75rem; }

  .turns { list-style: none; padding: 0; margin: 0; max-width: 100%; }
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
    background: var(--info-soft);
    border: 1px solid var(--info);
    border-radius: 4px;
    padding: 0 0.4em;
  }
  .turn-at { font-family: var(--font-mono); font-size: 0.85em; }
  .turn-body { max-height: 600px; overflow-y: auto; }
</style>
