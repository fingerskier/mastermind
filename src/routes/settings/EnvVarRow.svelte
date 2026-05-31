<script lang="ts">
  import { findEnvSuggestion, startsInCustomMode } from '$lib/env-suggestions';

  export type Row = { key: string; value: string; revealed: boolean; custom: boolean };

  let { row = $bindable(), onremove }: { row: Row; onremove: () => void } = $props();

  // Sentinel option that flips an enum row into free-text mode.
  const CUSTOM = '__custom__';

  const suggestion = $derived(findEnvSuggestion(row.key));
  const values = $derived(suggestion?.values);
  const useSelect = $derived(!!values?.length && !row.custom);

  // Keep the editor mode coherent as the key/value change:
  //  - a non-empty literal outside the enum → open in custom mode
  //  - a blank enum value → default to the first preset (so the visible
  //    selection and the submitted value agree)
  $effect(() => {
    if (!values?.length) return;
    if (startsInCustomMode(row.value, values)) {
      row.custom = true;
      return;
    }
    if (!row.custom && !row.value) row.value = values[0];
  });

  function onSelectChange(e: Event) {
    if ((e.currentTarget as HTMLSelectElement).value === CUSTOM) {
      row.custom = true;
      row.value = '';
    }
  }

  function backToPresets() {
    row.custom = false;
    row.value = values?.[0] ?? '';
  }
</script>

<div class="row-wrap">
  <div class="row">
    <input
      name="key"
      placeholder="KEY"
      list="env-key-suggestions"
      bind:value={row.key}
      autocomplete="off"
      autocapitalize="off"
      spellcheck="false"
    />

    {#if useSelect}
      <select name="value" bind:value={row.value} onchange={onSelectChange}>
        {#each values! as v (v)}
          <option value={v}>{v}</option>
        {/each}
        <option value={CUSTOM}>Custom…</option>
      </select>
    {:else}
      <input
        name="value"
        placeholder="value"
        type={values?.length ? 'text' : row.revealed ? 'text' : 'password'}
        bind:value={row.value}
        autocomplete="off"
        spellcheck="false"
      />
    {/if}

    {#if values?.length && row.custom}
      <button type="button" class="btn icon" title="Use presets" onclick={backToPresets}>↩</button>
    {:else if !values?.length}
      <button
        type="button"
        class="btn icon"
        title={row.revealed ? 'Hide' : 'Reveal'}
        onclick={() => (row.revealed = !row.revealed)}>{row.revealed ? '🙈' : '👁'}</button
      >
    {:else}
      <span class="spacer"></span>
    {/if}

    <button type="button" class="btn icon" title="Remove" onclick={onremove}>✕</button>
  </div>
  {#if suggestion}
    <p class="help">{suggestion.description}</p>
  {/if}
</div>

<style>
  .row-wrap { display: grid; gap: 0.25rem; }
  .row { display: grid; grid-template-columns: 1fr 1.5fr auto auto; gap: 0.5rem; align-items: center; }
  input,
  select {
    background: #1a1d24;
    color: var(--fg);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 0.55rem 0.7rem;
  }
  input:focus,
  select:focus { outline: 2px solid var(--accent); border-color: var(--accent); }
  .spacer { width: 0; }
  .help { margin: 0 0 0.15rem; color: var(--muted); font-size: 0.8em; }
  .btn { display: inline-block; padding: 0.5rem 0.9rem; border-radius: 6px; border: 1px solid var(--border); color: var(--fg); background: transparent; cursor: pointer; }
  .btn.icon { padding: 0.45rem 0.6rem; line-height: 1; }
</style>
