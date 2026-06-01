<script lang="ts">
  import type { ActionData, PageData } from './$types';
  import { Button, Badge, Card, PageHeader, EmptyState, Markdown } from '$lib/components';
  import { relTime } from '$lib/time';
  let { data, form }: { data: PageData; form: ActionData } = $props();
  const c = $derived(data.councillor);
  const adapters = $derived(data.adapters);
  const memories = $derived(data.memories);
  const proposals = $derived(data.proposals);
  const currentAdapter = $derived(c.adapter ?? '');
  const isKnown = $derived(currentAdapter === '' || adapters.some((a) => a.id === currentAdapter));
  const currentNote = $derived(adapters.find((a) => a.id === currentAdapter)?.note ?? '');

  let personaOpenedFlash = $state(false);
  $effect(() => {
    if (form?.personaOpened) {
      personaOpenedFlash = true;
      const t = setTimeout(() => { personaOpenedFlash = false; }, 3000);
      return () => clearTimeout(t);
    }
  });
</script>

<PageHeader title={c.name} back="/" backLabel="Back to council">
  {#snippet subtitle()}
    Role: <strong>{c.role}</strong>
    {#if currentAdapter}· <Badge mono>{currentAdapter}</Badge>{/if}
    · Created {new Date(c.created_at).toLocaleString()}
    {#if c.routing_hint}
      <div class="routing">Routes: {c.routing_hint}</div>
    {/if}
  {/snippet}
  {#snippet actions()}
    <Button href="/jobs/new?for={c.slug}" variant="primary">+ New job for this councillor</Button>
    <Button href="/councillors/{c.slug}/edit">Edit</Button>
    <form method="POST" action="?/delete" onsubmit={(e) => { if (!confirm(`Delete councillor "${c.name}"?`)) e.preventDefault(); }}>
      <Button type="submit" variant="danger">Delete</Button>
    </form>
  {/snippet}
</PageHeader>

<section class="adapter-panel">
  <h2>Adapter</h2>
  <form method="POST" action="?/setAdapter" class="adapter-form">
    <label class="field adapter-field">
      <span class="label sr-only">Adapter</span>
      <select name="adapter" class="input">
        <option value="" selected={currentAdapter === ''}>— none (cannot run jobs) —</option>
        {#if !isKnown}
          <option value={currentAdapter} selected>{currentAdapter} (custom)</option>
        {/if}
        {#each adapters as a (a.id)}
          <option value={a.id} selected={a.id === currentAdapter} disabled={!a.available}>
            {a.label}{a.available ? '' : ' — unavailable'}
          </option>
        {/each}
      </select>
    </label>
    <Button type="submit" variant="primary">Save adapter</Button>
  </form>
  {#if currentNote}<p class="note">{currentNote}</p>{/if}
  {#if form?.error}<p class="alert error">{form.error}</p>{/if}
  {#if form?.adapterSaved}<p class="alert ok">Adapter saved.</p>{/if}
</section>

<section>
  <div class="section-head">
    <h2>Persona</h2>
    <form method="POST" action="?/openPersona">
      <Button type="submit" title="Open persona.md in your default editor">Edit</Button>
    </form>
  </div>
  {#if personaOpenedFlash}<p class="alert ok flash">Opening persona.md in your default editor…</p>{/if}
  {#if c.persona.trim()}
    <Markdown source={c.persona} />
  {:else}
    <EmptyState
      icon="✎"
      text="No persona written yet. The persona shapes how this councillor reasons and responds — write one to give it a voice."
    >
      {#snippet action()}
        <Button href="/councillors/{c.slug}/edit" variant="primary">Write persona</Button>
      {/snippet}
    </EmptyState>
  {/if}
</section>

<section>
  <div class="section-head">
    <h2>Suggested jobs</h2>
    <a class="muted-link" href="/proposals">All proposals →</a>
  </div>
  {#if proposals.length === 0}
    <EmptyState
      icon="◷"
      text="No pending suggestions for this councillor. Suggested jobs appear here when other jobs propose follow-up work."
    />
  {:else}
    <ul class="prop-list">
      {#each proposals as p (p.id)}
        <li class="prop-card">
          <div class="prop-head">
            <div>
              <div class="prop-title">{p.title}</div>
              <div class="prop-meta">
                from <code>{p.proposed_by}</code>
                {#if p.target_councillor === 'all'} · <Badge>all councillors</Badge>{/if}
                · priority <code>{p.priority}</code>
                · source <a href="/jobs/{p.source_job_id}">{p.source_job_id}</a>
              </div>
            </div>
          </div>
          <pre class="block brief">{p.brief}</pre>
          <div class="actions">
            <form method="POST" action="?/approveProposal" class="approve-form">
              <input type="hidden" name="id" value={p.id} />
              <label class="inline">
                <input type="checkbox" name="start_now" /> start now
              </label>
              <Button type="submit" variant="primary">Approve</Button>
            </form>
            <form method="POST" action="?/rejectProposal" class="reject-form">
              <input type="hidden" name="id" value={p.id} />
              <input class="input" type="text" name="reason" placeholder="reason (optional)" />
              <Button type="submit" variant="danger">Reject</Button>
            </form>
          </div>
        </li>
      {/each}
    </ul>
  {/if}
</section>

<section>
  <h2>Private memory</h2>
  {#if memories.length === 0}
    <EmptyState
      icon="✦"
      text="No private notes yet. Memory accrues automatically after successful jobs, capturing what this councillor learned."
    />
  {:else}
    <ul class="mem-list">
      {#each memories as m (m.slug)}
        <li>
          <Card href="/councillors/{c.slug}/memory/{m.slug}">
            <div class="mem-title">{m.title}</div>
            <div class="mem-meta">Updated {relTime(m.updated_at)}</div>
          </Card>
        </li>
      {/each}
    </ul>
  {/if}
</section>

<style>
  h2 { margin: 1rem 0 0.5rem; }
  .routing { color: var(--muted); font-size: 0.95em; margin-top: 0.25rem; }
  .adapter-panel { margin-bottom: 2rem; }
  .adapter-form { display: flex; gap: 0.5rem; align-items: center; }
  .adapter-field { flex: 1; max-width: 360px; }
  .note { color: var(--muted); font-size: 0.85em; margin: 0.5rem 0 0; }
  .alert { margin: 0.5rem 0 0; display: inline-block; }
  .flash { animation: flash-fade 3s ease-out forwards; }
  @keyframes flash-fade {
    0%, 70% { opacity: 1; }
    100% { opacity: 0; }
  }
  @media (prefers-reduced-motion: reduce) {
    .flash { animation: none; }
  }
  .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0; }
  .section-head { display: flex; align-items: center; justify-content: space-between; gap: 1rem; }
  .section-head h2 { margin: 1rem 0 0.5rem; }
  .section-head form { margin: 0; }
  .mem-list { list-style: none; padding: 0; display: grid; gap: 0.6rem; }
  .mem-title { font-weight: 500; }
  .mem-meta { color: var(--muted); font-size: 0.8em; margin-top: 0.2rem; }
  .muted-link { color: var(--muted); text-decoration: none; font-size: 0.85em; }
  .muted-link:hover { color: var(--accent); }
  .prop-list { list-style: none; padding: 0; display: grid; gap: 0.75rem; }
  .prop-card { border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 0.85rem 1rem; display: grid; gap: 0.6rem; }
  .prop-head { display: flex; justify-content: space-between; gap: 1rem; align-items: flex-start; }
  .prop-title { font-weight: 600; }
  .prop-meta { color: var(--muted); font-size: 0.85em; margin-top: 0.15rem; }
  .brief { margin: 0; }
  .actions { display: flex; flex-wrap: wrap; gap: 1rem; align-items: center; }
  .approve-form, .reject-form { display: flex; gap: 0.5rem; align-items: center; margin: 0; }
  .inline { display: inline-flex; gap: 0.4rem; align-items: center; color: var(--muted); font-size: 0.9em; }
  .reject-form .input { width: auto; }
</style>
