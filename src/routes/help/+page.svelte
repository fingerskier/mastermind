<script lang="ts">
  import type { PageData } from './$types';
  let { data }: { data: PageData } = $props();
</script>

<svelte:head><title>Help — Landsraad</title></svelte:head>

<h1>Help</h1>
<p class="meta">Landsraad v{data.version}</p>

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
        <p class="field"><span class="k">Install</span> <code>{a.install}</code></p>
        <p class="field"><span class="k">Command</span> <code>{a.command}</code> must be on your <code>PATH</code></p>
        <p class="field"><span class="k">Docs</span> <a href={a.docsUrl} target="_blank" rel="noopener noreferrer">{a.docsUrl}</a></p>
      </div>
    {/each}
  </div>

  <p class="meta tip">
    Tip: most of these install with <code>npm</code>, so you need <a href="https://nodejs.org" target="_blank" rel="noopener noreferrer">Node.js</a>
    first. After installing a CLI, run it once on its own to sign in / set an API key before using it here.
  </p>
</section>

<p><a class="btn" href="/">&larr; Back home</a></p>

<style>
  h1 { margin: 0; }
  .meta { color: var(--muted); font-size: 0.9em; }
  section { margin-top: 2rem; }
  h2 { margin: 0 0 0.75rem; }
  h3 { margin: 0; font-size: 1.05em; }
  p { margin: 0.5rem 0; }
  .steps { display: grid; gap: 0.4rem; padding-left: 1.2rem; }
  code {
    background: #1a1d24; border: 1px solid var(--border);
    border-radius: 4px; padding: 0.1rem 0.35rem; font-size: 0.9em;
  }
  .adapters { display: grid; gap: 1rem; margin-top: 1rem; }
  .adapter { border: 1px solid var(--border); border-radius: 8px; padding: 1rem 1.1rem; }
  .adapter-head { display: flex; justify-content: space-between; align-items: baseline; gap: 0.5rem; }
  .aid { color: var(--muted); }
  .blurb { color: var(--fg); }
  .field { font-size: 0.95em; }
  .field .k { display: inline-block; min-width: 4.5rem; color: var(--muted); font-size: 0.85em; }
  .field a { word-break: break-all; }
  .tip { margin-top: 1rem; }
  .btn {
    display: inline-block; padding: 0.5rem 0.9rem; border-radius: 6px;
    border: 1px solid var(--border); text-decoration: none; color: var(--fg);
  }
  .btn:hover { border-color: var(--accent); }
</style>
