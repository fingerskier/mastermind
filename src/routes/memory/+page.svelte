<script lang="ts">
  import { PageHeader, Button, Card, EmptyState } from '$lib/components';
  import { relTime } from '$lib/time';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
</script>

<PageHeader title="Shared memory" back="/">
  {#snippet subtitle()}Notes here are retrieved into jobs and meetings automatically when relevant.{/snippet}
  {#snippet actions()}<Button href="/memory/new" variant="primary">+ New note</Button>{/snippet}
</PageHeader>

{#if data.notes.length === 0}
  <EmptyState icon="◇" text="No shared notes yet. Shared memory is included in future jobs and meetings when relevant.">
    {#snippet action()}<Button href="/memory/new" variant="primary">+ New note</Button>{/snippet}
  </EmptyState>
{:else}
  <ul class="list">
    {#each data.notes as n (n.slug)}
      <li>
        <Card href="/memory/{n.slug}">
          <div class="title">{n.title}</div>
          <div class="meta">Updated {relTime(n.updated_at)}</div>
        </Card>
      </li>
    {/each}
  </ul>
{/if}

<style>
  .list { list-style: none; padding: 0; margin: 0; display: grid; gap: 0.6rem; }
  .title { font-weight: 600; }
  .meta { color: var(--muted); margin-top: 0.25rem; font-size: 0.9em; }
</style>
