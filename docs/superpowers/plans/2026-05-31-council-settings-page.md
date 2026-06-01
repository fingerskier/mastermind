# Consolidated `/council` Settings Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Consolidate all council administration (rename/template, councillor list + CRUD links + inline delete, `.env` editor, export link, delete-council) onto one new `/council` page, reduce home (`/`) to a pure activity view, and delete the `/edit` and `/settings` routes.

**Architecture:** A new SvelteKit route `src/routes/council/` with `+page.server.ts` (load + four named actions) and `+page.svelte` (four sections). It reuses existing `$lib/server` functions only — no new server logic. The `.env` editor component `EnvVarRow.svelte` moves from `/settings` to `/council`. Home and the nav drop their admin affordances and point at `/council`; the old routes are deleted last so nothing dangles mid-plan.

**Tech Stack:** SvelteKit (Svelte 5 runes), TypeScript strict, Vitest. Persistence via `$lib/server/{councils,councillors,env-file}`.

**Design spec:** `docs/superpowers/specs/2026-05-31-council-settings-page-design.md`

## File Structure

- `src/routes/council/+page.server.ts` (new) — load + `identity`/`env`/`deleteCouncillor`/`deleteCouncil` actions.
- `src/routes/council/+page.svelte` (new) — Identity, Councillors, Environment, Tools sections.
- `src/routes/council/EnvVarRow.svelte` (moved from `src/routes/settings/`).
- `src/routes/council/council-route.test.ts` (new) — load + actions.
- `src/routes/+page.svelte` / `+page.server.ts` (modify) — strip admin, add Council link, drop `delete` action.
- `src/routes/+layout.svelte` (modify) — nav Settings→Council.
- `src/routes/councillors/new/+page.svelte`, `src/routes/councillors/[c_slug]/edit/+page.svelte`, `src/routes/export/+page.svelte` (modify) — repoint back/cancel links to `/council`.
- `src/routes/edit/`, `src/routes/settings/` (delete in final task).

## Key facts (verified against the codebase — do not deviate)

- **Env var for the council root is `LANDSRAAD_COUNCIL_ROOT`** (singular `COUNCIL`). Tests set `env.LANDSRAAD_COUNCIL_ROOT = tmpRoot` directly (see `settings-route.test.ts`), import `{ load, actions }` from the route module directly (no `vi.resetModules()`), and drive actions with a real `new Request('http://x/', { method: 'POST', body: <FormData> })`.
- `readCouncil()` returns a `Council` **without** councillors. Use `readCouncilWithCouncillors()` (returns `CouncilWithCouncillors = Council & { councillors }`) for the page load.
- `updateCouncil(input: UpdateCouncilInput)` where `UpdateCouncilInput = { name?, description?, template? }`. `template === undefined` keeps current; `null` clears it.
- `createCouncil({ name, description? , template? })`, `deleteCouncilData()` live in `$lib/server/councils`. `deleteCouncilData` removes `council.json`, `councillors`, `memory`, `jobs`, `.index`, `proposals`, `schedules`.
- `createCouncillor({ name, role, routing_hint, adapter, persona })`, `deleteCouncillor(slug)`, `listCouncillors()` live in `$lib/server/councillors`. Slug is `slugify(name)` → `createCouncillor({ name: 'Alice', ... })` yields slug `alice`.
- `readCouncilEnv()` / `writeCouncilEnv(pairs)` and `type EnvPair = { key, value }` live in `$lib/server/env-file`.
- **`fail(status, data)` result shape:** the returned object exposes `result.status` and `result.data.<field>` (e.g. `result.data.error`, `result.data.pairs`). A **success** return is the plain object you returned (e.g. `result.identitySaved`). Assertions must respect this split.
- `redirect(303, '/')` throws; assert with `isRedirect(err)` and `err.status === 303 && err.location === '/'`. 404 asserts with `isHttpError(err)` and `err.status === 404` (mirror `settings-route.test.ts`).
- Home delete confirm text to preserve verbatim: `Delete council "<name>"? This removes council.json, councillors/, memory/, jobs/, .index/ from this directory.`

---

## Task 1: Failing tests for `/council` route

**Files:**
- Test: `src/routes/council/council-route.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { env } from 'node:process';
import { isHttpError, isRedirect } from '@sveltejs/kit';
import { load, actions } from './+page.server';
import { createCouncil, readCouncil, hasCouncil } from '$lib/server/councils';
import { createCouncillor, listCouncillors } from '$lib/server/councillors';
import { readCouncilEnv, writeCouncilEnv } from '$lib/server/env-file';

let tmpRoot: string;
let prevEnv: string | undefined;

beforeEach(() => {
  prevEnv = env.LANDSRAAD_COUNCIL_ROOT;
  tmpRoot = mkdtempSync(join(tmpdir(), 'landsraad-council-'));
  env.LANDSRAAD_COUNCIL_ROOT = tmpRoot;
});

afterEach(() => {
  rmSync(tmpRoot, { recursive: true, force: true });
  if (prevEnv === undefined) delete env.LANDSRAAD_COUNCIL_ROOT;
  else env.LANDSRAAD_COUNCIL_ROOT = prevEnv;
});

function post(fields: Record<string, string[]>) {
  const fd = new FormData();
  for (const [k, values] of Object.entries(fields)) for (const v of values) fd.append(k, v);
  return {
    request: new Request('http://x/', { method: 'POST', body: fd })
  } as Parameters<typeof actions.identity>[0];
}

describe('/council route', () => {
  it('loads council and env pairs', async () => {
    await createCouncil({ name: 'C', description: 'd' });
    await writeCouncilEnv([{ key: 'X', value: '1' }]);
    const data = (await (load as () => Promise<{ council: { name: string }; pairs: unknown[] }>)());
    expect(data.council.name).toBe('C');
    expect(data.pairs).toContainEqual({ key: 'X', value: '1' });
  });

  it('404s when no council exists', async () => {
    try {
      await (load as () => Promise<unknown>)();
      throw new Error('expected 404');
    } catch (err) {
      expect(isHttpError(err)).toBe(true);
      expect((err as { status: number }).status).toBe(404);
    }
  });

  it('identity action updates name/description/template', async () => {
    await createCouncil({ name: 'Old', description: '' });
    const result = await actions.identity(post({ name: ['New'], description: ['hi'], template: ['demo'] }));
    expect((result as { identitySaved: boolean }).identitySaved).toBe(true);
    const c = await readCouncil();
    expect(c.name).toBe('New');
    expect(c.description).toBe('hi');
    expect(c.template).toBe('demo');
  });

  it('identity action rejects empty name', async () => {
    await createCouncil({ name: 'Keep', description: '' });
    const result = (await actions.identity(post({ name: [''], description: [''], template: [''] }))) as {
      status: number;
      data: { error: string };
    };
    expect(result.status).toBe(400);
    expect(result.data.error).toMatch(/name/i);
    expect((await readCouncil()).name).toBe('Keep');
  });

  it('env action round-trips pairs', async () => {
    await createCouncil({ name: 'C', description: '' });
    const result = await actions.env(post({ key: ['API_KEY'], value: ['secret'] }));
    expect((result as { envSaved: boolean }).envSaved).toBe(true);
    expect(readCouncilEnv()).toContainEqual({ key: 'API_KEY', value: 'secret' });
  });

  it('deleteCouncillor action removes a councillor', async () => {
    await createCouncil({ name: 'C', description: '' });
    await createCouncillor({ name: 'Alice', role: 'CFO', routing_hint: '', adapter: '', persona: '' });
    await actions.deleteCouncillor(post({ slug: ['alice'] }));
    expect((await listCouncillors()).find((c) => c.slug === 'alice')).toBeUndefined();
  });

  it('deleteCouncil action wipes data and redirects to /', async () => {
    await createCouncil({ name: 'C', description: '' });
    try {
      await actions.deleteCouncil(post({}));
      throw new Error('expected redirect');
    } catch (err) {
      expect(isRedirect(err)).toBe(true);
      expect((err as { status: number; location: string }).status).toBe(303);
      expect((err as { location: string }).location).toBe('/');
    }
    expect(hasCouncil()).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- council-route`
Expected: FAIL — `Failed to resolve import './+page.server'` (route not created yet).

- [ ] **Step 3: Commit**

```bash
git add src/routes/council/council-route.test.ts
git commit -m "test(council): failing tests for consolidated /council route"
```

---

## Task 2: Move `EnvVarRow.svelte` to `/council`

**Files:**
- Move: `src/routes/settings/EnvVarRow.svelte` → `src/routes/council/EnvVarRow.svelte`
- Modify: `src/routes/settings/+page.svelte` (import path)

- [ ] **Step 1: Move the component**

```bash
git mv src/routes/settings/EnvVarRow.svelte src/routes/council/EnvVarRow.svelte
```

- [ ] **Step 2: Repoint the old `/settings` import**

In `src/routes/settings/+page.svelte`, change:

```ts
import EnvVarRow, { type Row } from './EnvVarRow.svelte';
```
to:
```ts
import EnvVarRow, { type Row } from '../council/EnvVarRow.svelte';
```

- [ ] **Step 3: Verify nothing else broke**

Run: `npm run check`
Expected: no new errors (existing `/settings` still compiles against the moved component).

- [ ] **Step 4: Commit**

```bash
git add -A src/routes/settings/+page.svelte src/routes/council/EnvVarRow.svelte
git commit -m "refactor(env): move EnvVarRow to /council ahead of consolidation"
```

---

## Task 3: Create `/council/+page.server.ts` (make Task 1 green)

**Files:**
- Create: `src/routes/council/+page.server.ts`

- [ ] **Step 1: Write the server module**

```ts
import { error, fail, redirect } from '@sveltejs/kit';
import {
  hasCouncil,
  readCouncilWithCouncillors,
  updateCouncil,
  deleteCouncilData
} from '$lib/server/councils';
import { deleteCouncillor } from '$lib/server/councillors';
import { readCouncilEnv, writeCouncilEnv, type EnvPair } from '$lib/server/env-file';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
  if (!hasCouncil()) error(404, 'No council in this directory');
  return { council: await readCouncilWithCouncillors(), pairs: readCouncilEnv() };
};

export const actions: Actions = {
  identity: async ({ request }) => {
    const form = await request.formData();
    const name = String(form.get('name') ?? '').trim();
    const description = String(form.get('description') ?? '').trim();
    const template = String(form.get('template') ?? '').trim() || null;

    if (!name) return fail(400, { name, description, template, error: 'Name is required.' });
    try {
      await updateCouncil({ name, description, template });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update council.';
      return fail(400, { name, description, template, error: message });
    }
    return { identitySaved: true };
  },

  env: async ({ request }) => {
    const form = await request.formData();
    const keys = form.getAll('key').map(String);
    const values = form.getAll('value').map(String);
    const pairs: EnvPair[] = keys.map((key, i) => ({ key, value: values[i] ?? '' }));
    try {
      await writeCouncilEnv(pairs);
    } catch (err) {
      return fail(400, { pairs, error: err instanceof Error ? err.message : 'Failed to save.' });
    }
    return { envSaved: true, pairs: readCouncilEnv() };
  },

  deleteCouncillor: async ({ request }) => {
    const form = await request.formData();
    const slug = String(form.get('slug') ?? '').trim();
    try {
      await deleteCouncillor(slug);
    } catch (err) {
      return fail(400, { error: err instanceof Error ? err.message : 'Failed to delete councillor.' });
    }
    return { councillorDeleted: slug };
  },

  deleteCouncil: async () => {
    try {
      await deleteCouncilData();
    } catch (err) {
      return fail(500, { error: err instanceof Error ? err.message : 'Failed to delete council data.' });
    }
    redirect(303, '/');
  }
};
```

- [ ] **Step 2: Run the tests**

Run: `npm test -- council-route`
Expected: all 7 cases PASS.

- [ ] **Step 3: Commit**

```bash
git add src/routes/council/+page.server.ts
git commit -m "feat(council): /council load + identity/env/delete actions"
```

---

## Task 4: Create `/council/+page.svelte`

**Files:**
- Create: `src/routes/council/+page.svelte`

- [ ] **Step 1: Write the page**

```svelte
<script lang="ts">
  import { untrack } from 'svelte';
  import { ENV_KEY_SUGGESTIONS, findEnvSuggestion, startsInCustomMode } from '$lib/env-suggestions';
  import EnvVarRow, { type Row } from './EnvVarRow.svelte';
  import type { ActionData, PageData } from './$types';

  let { data, form }: { data: PageData; form: ActionData } = $props();
  const c = $derived(data.council);

  const initial = untrack(
    () => (form && 'pairs' in form && form.pairs ? form.pairs : data.pairs) ?? []
  );
  let rows = $state<Row[]>(
    initial.map((p) => ({
      key: p.key,
      value: p.value,
      revealed: false,
      custom: startsInCustomMode(p.value, findEnvSuggestion(p.key)?.values)
    }))
  );
  function addRow() { rows = [...rows, { key: '', value: '', revealed: false, custom: false }]; }
  function removeRow(i: number) { rows = rows.filter((_, idx) => idx !== i); }

  // Identity errors carry `name` (the echoed field) and no `pairs`/`envSaved`.
  const identityError = $derived(
    form && 'name' in form && 'error' in form ? (form as { error?: string }).error : null
  );
</script>

<p><a href="/">&larr; {c.name}</a></p>
<h1>Council</h1>

<section class="block">
  <h2>Identity</h2>
  <form method="POST" action="?/identity" class="form">
    {#if form?.identitySaved}<div class="saved">Saved.</div>{/if}
    {#if identityError}<div class="error">{identityError}</div>{/if}
    <label>
      <span>Name</span>
      <input name="name" required maxlength="80" value={(form as any)?.name ?? c.name} />
    </label>
    <label>
      <span>Description</span>
      <textarea name="description" rows="3" maxlength="500">{(form as any)?.description ?? c.description}</textarea>
    </label>
    <label>
      <span>Template <em>(optional)</em></span>
      <input name="template" maxlength="80" value={(form as any)?.template ?? c.template ?? ''} />
    </label>
    <div class="actions"><button type="submit" class="btn primary">Save</button></div>
  </form>
</section>

<section class="block">
  <div class="section-head">
    <h2>Councillors</h2>
    <a class="btn primary" href="/councillors/new">+ New councillor</a>
  </div>
  {#if c.councillors.length === 0}
    <p class="empty">No councillors yet.</p>
  {:else}
    <ul class="list">
      {#each c.councillors as cl (cl.slug)}
        <li class="row">
          <div class="row-main">
            <a class="row-title" href="/councillors/{cl.slug}">{cl.name}</a>
            <div class="row-sub">{cl.role || 'no role'}{#if cl.adapter} · <code>{cl.adapter}</code>{/if}</div>
          </div>
          <div class="row-actions">
            <a class="btn" href="/councillors/{cl.slug}/edit">Edit</a>
            <form
              method="POST"
              action="?/deleteCouncillor"
              onsubmit={(e) => { if (!confirm(`Delete councillor "${cl.name}"?`)) e.preventDefault(); }}
            >
              <input type="hidden" name="slug" value={cl.slug} />
              <button type="submit" class="btn danger">Delete</button>
            </form>
          </div>
        </li>
      {/each}
    </ul>
  {/if}
</section>

<section class="block">
  <h2>Environment</h2>
  <p class="note">
    Council environment variables (API keys, model overrides) are written to a
    <code>.env</code> file in this council's directory and loaded for adapter CLIs.
    <strong>Changes take effect after restarting Landsraad.</strong>
  </p>
  <datalist id="env-key-suggestions">
    {#each ENV_KEY_SUGGESTIONS as s (s.key)}
      <option value={s.key} label={s.description}></option>
    {/each}
  </datalist>
  <form method="POST" action="?/env" class="form">
    {#if form && 'pairs' in form && 'error' in form && form.error}<div class="error">{form.error}</div>{/if}
    {#if form?.envSaved}<div class="saved">Saved.</div>{/if}
    <div class="rows">
      {#each rows as row, i (i)}
        <EnvVarRow bind:row={rows[i]} onremove={() => removeRow(i)} />
      {/each}
      {#if rows.length === 0}<p class="empty">No variables yet.</p>{/if}
    </div>
    <div class="actions">
      <button type="button" class="btn" onclick={addRow}>+ Add variable</button>
      <button type="submit" class="btn primary">Save</button>
    </div>
  </form>
</section>

<section class="block">
  <h2>Tools</h2>
  <p><a class="btn" href="/export">Export council as template…</a></p>
  <div class="danger-zone">
    <form
      method="POST"
      action="?/deleteCouncil"
      onsubmit={(e) => { if (!confirm(`Delete council "${c.name}"? This removes council.json, councillors/, memory/, jobs/, .index/ from this directory.`)) e.preventDefault(); }}
    >
      <button type="submit" class="btn danger">Delete council</button>
    </form>
  </div>
</section>

<style>
  h1 { margin: 0 0 1.5rem; }
  h2 { margin: 0 0 1rem; }
  .block { margin-bottom: 2.5rem; }
  .section-head { display: flex; justify-content: space-between; align-items: baseline; }
  .form { display: grid; gap: 1rem; max-width: 640px; }
  .note { color: var(--muted); font-size: 0.9em; max-width: 640px; }
  .note code { background: #1a1d24; padding: 0.1em 0.35em; border-radius: 4px; }
  .rows { display: grid; gap: 0.5rem; }
  label { display: grid; gap: 0.35rem; }
  label > span { color: var(--muted); font-size: 0.9em; }
  input, textarea { background: #1a1d24; color: var(--fg); border: 1px solid var(--border); border-radius: 6px; padding: 0.55rem 0.7rem; }
  input:focus, textarea:focus { outline: 2px solid var(--accent); border-color: var(--accent); }
  .actions { display: flex; gap: 0.5rem; }
  .empty { color: var(--muted); padding: 0.5rem 0; }
  .list { list-style: none; padding: 0; margin: 0; display: grid; gap: 0.6rem; max-width: 640px; }
  .row { display: flex; justify-content: space-between; align-items: center; gap: 1rem; border: 1px solid var(--border); border-radius: 8px; padding: 0.7rem 0.9rem; }
  .row-title { font-weight: 600; color: var(--fg); text-decoration: none; }
  .row-title:hover { color: var(--accent); }
  .row-sub { color: var(--muted); font-size: 0.85em; margin-top: 0.2rem; }
  .row-actions { display: flex; gap: 0.5rem; align-items: center; }
  .danger-zone { margin-top: 1.25rem; }
  .btn { display: inline-block; padding: 0.5rem 0.9rem; border-radius: 6px; border: 1px solid var(--border); text-decoration: none; color: var(--fg); background: transparent; cursor: pointer; }
  .btn.primary { background: var(--accent); color: #0f1115; border-color: var(--accent); font-weight: 600; }
  .btn.danger { border-color: var(--danger); color: var(--danger); }
  .error { background: rgba(210,114,114,0.15); border: 1px solid var(--danger); color: var(--danger); padding: 0.6rem 0.8rem; border-radius: 6px; }
  .saved { background: rgba(120,190,140,0.15); border: 1px solid #5aa06e; color: #8fcea3; padding: 0.6rem 0.8rem; border-radius: 6px; }
</style>
```

- [ ] **Step 2: Type-check**

Run: `npm run check`
Expected: no errors in `src/routes/council/`. If `EnvVarRow`'s `Row` export name differs, align the import with the component's actual export.

- [ ] **Step 3: Smoke test**

Run: `npm run dev`, open `/council`. Verify all four sections render, Save buttons work (Saved indicator appears), councillor Edit links go to `/councillors/<slug>/edit`, inline Delete prompts confirm, Delete-council prompts confirm and returns to `/`.

- [ ] **Step 4: Commit**

```bash
git add src/routes/council/+page.svelte
git commit -m "feat(council): /council page UI (identity, councillors, env, tools)"
```

---

## Task 5: Strip council admin from home (`/`)

**Files:**
- Modify: `src/routes/+page.svelte`
- Modify: `src/routes/+page.server.ts`

- [ ] **Step 1: Replace the header admin block in `+page.svelte`**

Replace the `<div class="head-actions">…</div>` that contains the `Edit` link and the `?/delete` form (the block following `{#if c.description}…` in the `<header class="head">`) with:

```svelte
    <div class="head-actions">
      <a class="btn" href="/council">Council settings</a>
    </div>
```

- [ ] **Step 2: Remove the `+ New councillor` button**

In the Councillors `.section-head` `.head-actions`, delete the line:

```svelte
        <a class="btn primary" href="/councillors/new">+ New councillor</a>
```

Leave `<a class="btn" href="/jobs/new?for=__all__">+ Create job for all</a>` in place.

- [ ] **Step 3: Remove the `delete` action in `+page.server.ts`**

Delete the entire `delete: async () => { … }` action. Update the import on line 2 from:

```ts
import { createCouncil, deleteCouncilData, hasCouncil, readCouncilWithCouncillors } from '$lib/server/councils';
```
to:
```ts
import { createCouncil, hasCouncil, readCouncilWithCouncillors } from '$lib/server/councils';
```

Keep the `create` action and `load` unchanged.

- [ ] **Step 4: Verify**

Run: `npm test` then `npm run check`
Expected: PASS / clean. (No existing home route test references the `delete` action — confirm with `git grep -n "?/delete" src/routes/*.test.ts src/routes/**/*.test.ts`; if one exists, drop that case.)

- [ ] **Step 5: Commit**

```bash
git add src/routes/+page.svelte src/routes/+page.server.ts
git commit -m "refactor(home): drop council admin, link to /council"
```

---

## Task 6: Nav entry + back-link repoints

**Files:**
- Modify: `src/routes/+layout.svelte`
- Modify: `src/routes/councillors/new/+page.svelte`
- Modify: `src/routes/councillors/[c_slug]/edit/+page.svelte`
- Modify: `src/routes/export/+page.svelte`

- [ ] **Step 1: Layout nav**

In `src/routes/+layout.svelte`, inside the `{#if page.data?.hasCouncil}` block, replace:

```svelte
          <a href="/settings">Settings</a>
```
with:
```svelte
          <a href="/council">Council</a>
```

- [ ] **Step 2: Repoint councillor back/cancel links**

In `src/routes/councillors/new/+page.svelte`: change `<a href="/">&larr; Back to council</a>` and the `Cancel` link `<a href="/" class="btn">Cancel</a>` to `href="/council"`.

In `src/routes/councillors/[c_slug]/edit/+page.svelte`: change any `← Back`/`Cancel` link with `href="/"` to `href="/council"`. Leave the server-side `redirect(303, '/councillors/${params.c_slug}')` after a successful edit unchanged.

- [ ] **Step 3: Repoint export cancel**

In `src/routes/export/+page.svelte`: change every `<a href="/" class="btn">Cancel</a>` to `href="/council"`.

- [ ] **Step 4: Verify**

Run: `npm run check` then `npm test`
Expected: clean / PASS.

- [ ] **Step 5: Commit**

```bash
git add src/routes/+layout.svelte src/routes/councillors/new/+page.svelte "src/routes/councillors/[c_slug]/edit/+page.svelte" src/routes/export/+page.svelte
git commit -m "refactor(nav): Council nav entry; repoint back-links to /council"
```

---

## Task 7: Delete `/edit` and `/settings`

**Files:**
- Delete: `src/routes/edit/` (`+page.svelte`, `+page.server.ts`)
- Delete: `src/routes/settings/` (`+page.svelte`, `+page.server.ts`, `settings-route.test.ts`)
- Modify (if needed): `README.md`, `docs/`, `SPECIFICATION.md`

- [ ] **Step 1: Confirm no remaining references**

Run: `git grep -nE "routes/(edit|settings)|href=\"/(edit|settings)\"" -- src`
Expected: no matches. Fix any stragglers before deleting. (`EnvVarRow.svelte` already moved in Task 2, so `src/routes/settings` now holds only `+page.svelte`, `+page.server.ts`, `settings-route.test.ts`.)

- [ ] **Step 2: Delete the routes**

```bash
git rm -r src/routes/edit src/routes/settings
```

- [ ] **Step 3: Update docs**

Run: `git grep -n "/settings\|/edit" -- README.md docs SPECIFICATION.md`
Repoint any user-facing mention of these routes to `/council`. If none, skip. (Spec record #2725 documented the per-council `.env` editor at `/settings`; reflect the move in any docs that name the route.)

- [ ] **Step 4: Full verification**

Run: `npm test` then `npm run check`
Expected: full suite PASS (including `/council` tests), no type errors.

- [ ] **Step 5: Smoke test**

Run: `npm run dev` — `/settings` and `/edit` now 404; `/council` is the single admin surface; nav shows `Council`.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor: remove /edit and /settings, folded into /council"
```

---

## Self-review notes

- **Spec coverage:** new `/council` page (Tasks 3–4) ✓; env editor absorbed + `/settings` deleted (Tasks 2,7) ✓; councillor mgmt off home (Task 5) + on `/council` (Task 4) ✓; inline rename, export linked (Task 4) ✓; delete-council only on `/council` (Tasks 4,5) ✓; `/edit` deleted (Task 7) ✓; nav + back-links (Task 6) ✓; tests (Task 1) ✓.
- **Type/name consistency:** `LANDSRAAD_COUNCIL_ROOT` (singular) used in tests; `fail` results read via `.data.*`, successes read directly; load uses `readCouncilWithCouncillors`; action names `identity`/`env`/`deleteCouncillor`/`deleteCouncil` consistent between server, page, and tests.
- **Open verification items flagged inline:** `EnvVarRow` `Row` export name (Task 4 step 2); any home route test referencing `?/delete` (Task 5 step 4); docs naming `/settings` or `/edit` (Task 7 step 3).
```
