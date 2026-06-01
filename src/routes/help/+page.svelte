<script lang="ts">
  import type { PageData } from './$types';
  import { Button, PageHeader } from '$lib/components';
  let { data }: { data: PageData } = $props();
</script>

<svelte:head><title>Help — Landsraad</title></svelte:head>

<PageHeader title="Help" back="/">
  {#snippet subtitle()}Landsraad v{data.version}{/snippet}
</PageHeader>

<section>
  <h2>What is this?</h2>
  <p>
    Landsraad is a local-first AI council chamber. You create a <strong>council</strong> of
    <strong>councillors</strong> (named AI agents with a role and a backing model), give them
    <strong>jobs</strong>, and watch the work. Councillors can hold <strong>meetings</strong>,
    keep <strong>memory</strong> notes, and run on a <strong>schedule</strong>.
  </p>
  <p class="meta">
    Everything runs on your own computer. No account, no cloud, no tracking. Council files live
    in the folder you launched from.
  </p>
</section>

<section>
  <h2>Mental model in 60 seconds</h2>
  <dl class="glossary">
    <div class="term">
      <dt>Council</dt>
      <dd>The whole chamber for one directory — its councillors, jobs, memory, and settings.</dd>
    </div>
    <div class="term">
      <dt>Councillor</dt>
      <dd>A named AI agent with a role and a backing model (via an adapter). It does the work.</dd>
    </div>
    <div class="term">
      <dt>Job</dt>
      <dd>A unit of work handed to a councillor. It queues, runs, and finishes (or fails).</dd>
    </div>
    <div class="term">
      <dt>Memory</dt>
      <dd>Durable notes a councillor keeps and can draw on across jobs and meetings.</dd>
    </div>
    <div class="term">
      <dt>Proposal</dt>
      <dd>A suggested change a councillor surfaces for you to review before it&rsquo;s applied.</dd>
    </div>
    <div class="term">
      <dt>Meeting</dt>
      <dd>A session where councillors confer — pooling context to produce a shared result.</dd>
    </div>
  </dl>
</section>

<section>
  <h2>Getting started</h2>
  <ol class="steps">
    <li>From the home page, <strong>Create a council</strong> (or <a href="/import">install a template</a>).</li>
    <li>Add a <strong>councillor</strong> and pick its <strong>adapter</strong> (which AI CLI it runs).</li>
    <li>Install that adapter&rsquo;s CLI tool (see below) so it&rsquo;s on your <code>PATH</code>.</li>
    <li>Create a <strong>job</strong> for the councillor and watch it run.</li>
  </ol>
</section>

<section>
  <h2>Adapters</h2>
  <p>
    An adapter is the AI tool a councillor talks to. The built-in <code>mock:local</code> adapter
    echoes input and needs no setup &mdash; handy for trying things out. The adapters below each
    require installing a command-line tool. After installing, make sure the command runs in a
    fresh terminal, then select the matching adapter on a councillor.
  </p>

  <div class="adapters">
    {#each data.adapters as a (a.id)}
      <div class="adapter">
        <div class="adapter-head">
          <h3>{a.label}</h3>
          <code class="aid">{a.id}</code>
        </div>
        {#if a.blurb}<p class="blurb">{a.blurb}</p>{/if}
        <p class="afield"><span class="k">Install</span> <code>{a.install}</code></p>
        <p class="afield"><span class="k">Command</span> <code>{a.command}</code> must be on your <code>PATH</code></p>
        <p class="afield"><span class="k">Docs</span> <a href={a.docsUrl} target="_blank" rel="noopener noreferrer">{a.docsUrl}</a></p>
      </div>
    {/each}
  </div>

  <p class="meta tip">
    Tip: most of these install with <code>npm</code>, so you need <a href="https://nodejs.org" target="_blank" rel="noopener noreferrer">Node.js</a>
    first. After installing a CLI, run it once on its own to sign in / set an API key before using it here.
  </p>
</section>

<section>
  <h2>Troubleshooting</h2>
  <dl class="glossary">
    <div class="term">
      <dt>Command not found / missing</dt>
      <dd>
        The adapter&rsquo;s CLI isn&rsquo;t on your <code>PATH</code>. Install it (see Adapters above),
        then open a <em>fresh</em> terminal and run the command on its own to confirm it resolves.
      </dd>
    </div>
    <div class="term">
      <dt>Not logged in</dt>
      <dd>
        The CLI is installed but unauthenticated. Run it directly once to complete its sign-in flow,
        then retry the job.
      </dd>
    </div>
    <div class="term">
      <dt>API key missing</dt>
      <dd>
        The tool needs a key in its own environment. Set the key the way that CLI expects (its docs
        link is in the Adapters section), confirm it works standalone, then re-run.
      </dd>
    </div>
    <div class="term">
      <dt>Timeout</dt>
      <dd>
        The adapter took too long to respond. Check your network and that the underlying service is
        reachable, then retry the job; long prompts can also push past the limit.
      </dd>
    </div>
  </dl>
</section>

<p class="back-home"><Button href="/">← Back home</Button></p>

<style>
  .meta { color: var(--muted); font-size: 0.9em; }
  section { margin-top: 2rem; }
  h2 { margin: 0 0 0.75rem; }
  h3 { margin: 0; font-size: 1.05em; }
  p { margin: 0.5rem 0; }
  .steps { display: grid; gap: 0.4rem; padding-left: 1.2rem; }
  code {
    background: var(--surface-2); border: 1px solid var(--border);
    border-radius: 4px; padding: 0.1rem 0.35rem; font-size: 0.9em;
  }
  .glossary { display: grid; gap: 0.6rem; margin: 0; }
  .term {
    display: grid;
    grid-template-columns: 9rem 1fr;
    gap: 0.5rem 1rem;
    align-items: baseline;
    border-bottom: 1px solid var(--border);
    padding-bottom: 0.5rem;
  }
  .term:last-child { border-bottom: 0; padding-bottom: 0; }
  dt { font-weight: 600; color: var(--fg); }
  dd { margin: 0; color: var(--muted); }
  .adapters { display: grid; gap: 1rem; margin-top: 1rem; }
  .adapter { border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 1rem 1.1rem; background: var(--surface-1); }
  .adapter-head { display: flex; justify-content: space-between; align-items: baseline; gap: 0.5rem; }
  .aid { color: var(--muted); }
  .blurb { color: var(--fg); }
  .afield { font-size: 0.95em; }
  .afield .k { display: inline-block; min-width: 4.5rem; color: var(--muted); font-size: 0.85em; }
  .afield a { word-break: break-all; }
  .tip { margin-top: 1rem; }
  .back-home { margin-top: 2rem; }
  @media (max-width: 480px) {
    .term { grid-template-columns: 1fr; gap: 0.15rem; }
  }
</style>
