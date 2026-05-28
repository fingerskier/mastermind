<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  let { data, form } = $props();
  const m = $derived(data.meeting);

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
  <span>attendees: {m.attendees.join(', ')}</span> ·
  <span>round: {m.current_round}</span> ·
  <span>turns: {m.total_turns}</span>
</p>

{#if m.pause_reason}<p class="pause">Paused: {m.pause_reason}</p>{/if}

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
<pre>{data.topic}</pre>

{#if data.synthesis}
  <h2>Synthesis</h2>
  <pre>{data.synthesis}</pre>
  {#if m.memory_slugs?.length}<p>Memories created: {m.memory_slugs.join(', ')}</p>{/if}
  {#if m.shared_memory_slugs?.length}<p>Shared memories: {m.shared_memory_slugs.join(', ')}</p>{/if}
  {#if m.proposed_jobs?.length}<p>Proposed jobs: {m.proposed_jobs.join(', ')}</p>{/if}
{/if}

{#if data.summary}
  <details>
    <summary>Rolling summary</summary>
    <pre>{data.summary}</pre>
  </details>
{/if}

<h2>Transcript</h2>
<pre>{data.transcript || '(empty)'}</pre>

{#if form?.error}<p class="error">{form.error}</p>{/if}
