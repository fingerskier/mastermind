# Memory promotion (scope attr) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Honor `scope="shared"` on `<<MEMORY>>` blocks so a councillor's reflection writes the entry directly to the council-wide shared `memory/` directory instead of its private `councillors/<slug>/memory/` dir.

**Architecture:** Parser extracts the `scope` attr; runner branches on it after reflection. `scope="shared"` calls a new `createSharedNoteAutoSuffix` helper in `memory.ts` (mirrors `createPrivateNote`'s collision-suffix semantics). Job records gain `shared_memory_slugs?: string[]` alongside the existing `memory_slugs`. No proposal/review/sweep layer — councillors are trusted; an introspective cleanup is a deferred future slice.

**Tech Stack:** TypeScript strict, SvelteKit, Vitest, Node 20+, ES modules.

**Spec:** `docs/superpowers/specs/2026-05-28-memory-promotion-design.md`

---

## File Structure

**Modify:**
- `src/lib/server/reflection.ts` — add `scope` to `ParsedMemoryBlock` and parse it.
- `src/lib/server/reflection.test.ts` — extend `parseMemoryBlocks` tests with scope matrix.
- `src/lib/server/memory.ts` — add `createSharedNoteAutoSuffix` helper.
- `src/lib/server/memory.test.ts` — add tests for the new helper.
- `src/lib/types.ts` — add `shared_memory_slugs?: string[]` to `Job`.
- `src/lib/server/runner.ts` — branch on `block.scope`, populate `shared_memory_slugs`.
- `src/lib/server/runner.test.ts` — add reflection tests for `scope="shared"` and mixed.
- `src/routes/jobs/[jid]/+page.svelte` — add "Shared memory updated" list.
- `SPECIFICATION.md` — document scope attr; remove out-of-scope line.
- `docs/OPEN_QUESTIONS.md` — drop the memory-promotion entry.
- `docs/architecture.md`, `docs/data-model.md` — note scope behavior.

**No new files.**

---

## Task 1: Parser — add `scope` to `ParsedMemoryBlock`

**Files:**
- Modify: `src/lib/server/reflection.ts:1-23`
- Test: `src/lib/server/reflection.test.ts:4-45`

- [ ] **Step 1: Add failing tests for the scope attribute**

Append these tests inside the existing `describe('parseMemoryBlocks', ...)` block in `src/lib/server/reflection.test.ts` (just before the closing `});` of that describe — line ~44):

```ts
  it('defaults scope to "private" when attr is absent', () => {
    const out = parseMemoryBlocks('<<MEMORY title="A">>\nbody\n<</MEMORY>>');
    expect(out).toEqual([{ title: 'A', body: 'body', scope: 'private' }]);
  });

  it('returns scope "shared" when scope="shared"', () => {
    const out = parseMemoryBlocks(
      '<<MEMORY title="A" scope="shared">>\nbody\n<</MEMORY>>'
    );
    expect(out).toEqual([{ title: 'A', body: 'body', scope: 'shared' }]);
  });

  it('falls back to "private" for unknown scope values', () => {
    const out = parseMemoryBlocks(
      '<<MEMORY title="A" scope="team">>\nbody\n<</MEMORY>>'
    );
    expect(out[0].scope).toBe('private');
  });

  it('accepts scope in any attribute order', () => {
    const out = parseMemoryBlocks(
      '<<MEMORY scope="shared" title="A">>\nbody\n<</MEMORY>>'
    );
    expect(out[0]).toMatchObject({ title: 'A', scope: 'shared' });
  });
```

Also update the three existing parser assertions that compare full objects (`toEqual([{ title: ..., body: ... }])` on lines ~13, ~21–23) to include `scope: 'private'`:

```ts
  // line ~13
  expect(out).toEqual([{ title: 'Cash on hand', body: 'body one', scope: 'private' }]);

  // line ~21
  expect(out).toEqual([
    { title: 'A', body: 'aaa', scope: 'private' },
    { title: 'B', body: 'bbb', scope: 'private' }
  ]);
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/server/reflection.test.ts`
Expected: FAIL — new tests fail because `scope` field doesn't exist; existing tests fail because objects don't have `scope: 'private'`.

- [ ] **Step 3: Implement parser change**

Edit `src/lib/server/reflection.ts`. Replace the top of the file (lines 1–23) with:

```ts
export interface ParsedMemoryBlock {
  title: string;
  body: string;
  scope: 'private' | 'shared';
}

const BLOCK_RE = /<<MEMORY\b([^>]*)>>([\s\S]*?)<<\/MEMORY>>/g;
const TITLE_RE = /title="([^"]*)"/;
const ATTR_SCOPE_RE = /scope="([^"]*)"/;

export function parseMemoryBlocks(text: string): ParsedMemoryBlock[] {
  const out: ParsedMemoryBlock[] = [];
  let match: RegExpExecArray | null;
  BLOCK_RE.lastIndex = 0;
  while ((match = BLOCK_RE.exec(text)) !== null) {
    const attrs = match[1] ?? '';
    const titleMatch = TITLE_RE.exec(attrs);
    if (!titleMatch) continue;
    const title = titleMatch[1].trim();
    if (!title) continue;
    const body = match[2].replace(/^\n/, '').replace(/\s+$/, '');
    const scopeRaw = ATTR_SCOPE_RE.exec(attrs)?.[1]?.trim();
    const scope: 'private' | 'shared' = scopeRaw === 'shared' ? 'shared' : 'private';
    out.push({ title, body, scope });
  }
  return out;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/server/reflection.test.ts`
Expected: PASS — all parser tests green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/reflection.ts src/lib/server/reflection.test.ts
git commit -m "feat(reflection): parse scope attr on <<MEMORY>> blocks"
```

---

## Task 2: `createSharedNoteAutoSuffix` helper

**Files:**
- Modify: `src/lib/server/memory.ts:1-98`
- Test: `src/lib/server/memory.test.ts`

- [ ] **Step 1: Write failing tests for the helper**

Append to `src/lib/server/memory.test.ts` (after the last `it(...)` in the existing `describe('memory', ...)` block, before the closing `});`):

```ts
  it('createSharedNoteAutoSuffix writes a new note when slug is free', async () => {
    const { createSharedNoteAutoSuffix } = await import('./memory');
    const n = await createSharedNoteAutoSuffix({ title: 'House Rules', body: 'be kind' });
    expect(n.slug).toBe('house-rules');
    expect((await readNote('house-rules')).body).toContain('be kind');
  });

  it('createSharedNoteAutoSuffix suffixes on slug collision', async () => {
    const { createSharedNoteAutoSuffix } = await import('./memory');
    await createSharedNoteAutoSuffix({ title: 'Dup', body: 'first' });
    const second = await createSharedNoteAutoSuffix({ title: 'Dup', body: 'second' });
    expect(second.slug).toBe('dup-2');
    const third = await createSharedNoteAutoSuffix({ title: 'Dup', body: 'third' });
    expect(third.slug).toBe('dup-3');
  });

  it('createSharedNoteAutoSuffix prepends "# title" when body has no leading header', async () => {
    const { createSharedNoteAutoSuffix } = await import('./memory');
    const n = await createSharedNoteAutoSuffix({ title: 'Naked', body: 'plain body' });
    expect(n.body.startsWith('# Naked')).toBe(true);
    expect(n.body).toContain('plain body');
  });

  it('createNote (strict) still throws on collision — unchanged', async () => {
    await createNote({ title: 'Strict', body: 'first' });
    await expect(createNote({ title: 'Strict', body: 'second' })).rejects.toThrow(/already exists/);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/server/memory.test.ts`
Expected: FAIL — `createSharedNoteAutoSuffix` is not exported.

- [ ] **Step 3: Implement the helper**

Add to `src/lib/server/memory.ts`, just above `export async function createNote(...)` (around line 53):

```ts
function resolveAvailableSlug(baseSlug: string): string {
  let candidate = baseSlug;
  let n = 2;
  while (existsSync(noteFile(candidate))) {
    candidate = `${baseSlug}-${n}`;
    n++;
  }
  return candidate;
}

export async function createSharedNoteAutoSuffix(input: UpsertNoteInput): Promise<MemoryNote> {
  if (!hasCouncil()) throw new Error('No council exists in the current directory.');
  const title = input.title.trim();
  if (!title) throw new Error('Note title is required.');
  await mkdir(memoryDir(), { recursive: true });
  const baseSlug = slugify(title);
  const slug = resolveAvailableSlug(baseSlug);
  const file = noteFile(slug);
  const body = input.body.trimStart().startsWith('#')
    ? input.body
    : `# ${title}\n\n${input.body}`;
  await writeFile(file, body, 'utf8');
  const note = await readNote(slug);
  await indexUpsert({
    kind: 'memory',
    ref_id: slug,
    text: note.body,
    source_path: file,
    source_mtime: note.updated_at,
    title: note.title
  });
  return note;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/server/memory.test.ts`
Expected: PASS — all memory tests green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/memory.ts src/lib/server/memory.test.ts
git commit -m "feat(memory): add createSharedNoteAutoSuffix helper"
```

---

## Task 3: Job type + runner branches on `scope`

**Files:**
- Modify: `src/lib/types.ts:26-40`
- Modify: `src/lib/server/runner.ts:18-19, 98-120`
- Test: `src/lib/server/runner.test.ts` (extend the `runner reflection` describe block at line ~160)

- [ ] **Step 1: Add `shared_memory_slugs` to `Job`**

Edit `src/lib/types.ts`. In the `Job` interface (line 26–40), add `shared_memory_slugs?: string[];` immediately after `memory_slugs?: string[];`:

```ts
export interface Job {
  id: string;
  title: string;
  brief: string;
  councillor_slug: string;
  status: JobStatus;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  exit_code: number | null;
  error: string | null;
  memory_slugs?: string[];
  shared_memory_slugs?: string[];
  reflection_error?: string;
  spawned_by_schedule_id?: string | null;
}
```

- [ ] **Step 2: Write failing runner tests**

Append these tests inside the existing `describe('runner reflection', ...)` block in `src/lib/server/runner.test.ts` (find that describe around line ~160 and add before its closing `});`):

```ts
  it('writes shared memory when block has scope="shared"', async () => {
    const reflection = '<<MEMORY title="Council Rule" scope="shared">>\nBe kind.\n<</MEMORY>>';
    const adapterOverride = makeReflectionAdapter(reflection);
    const job = await createJob({ title: 'Probe', brief: 'do thing', councillor_slug: 'alice' });
    await runJobNow(job.id, { adapterOverride });
    const { listNotes } = await import('./memory');
    const shared = await listNotes();
    expect(shared.map((n) => n.slug)).toEqual(['council-rule']);
    const privates = await listPrivateNotes('alice');
    expect(privates).toEqual([]);
    const final = await readJob(job.id);
    expect(final.shared_memory_slugs).toEqual(['council-rule']);
    expect(final.memory_slugs ?? []).toEqual([]);
  });

  it('writes one private + one shared for mixed blocks', async () => {
    const reflection = [
      '<<MEMORY title="Private Lesson">>',
      'just for me',
      '<</MEMORY>>',
      '<<MEMORY title="Council Rule" scope="shared">>',
      'for everyone',
      '<</MEMORY>>'
    ].join('\n');
    const adapterOverride = makeReflectionAdapter(reflection);
    const job = await createJob({ title: 'Mix', brief: 'm', councillor_slug: 'alice' });
    await runJobNow(job.id, { adapterOverride });
    const { listNotes } = await import('./memory');
    expect((await listNotes()).map((n) => n.slug)).toEqual(['council-rule']);
    expect((await listPrivateNotes('alice')).map((n) => n.slug)).toEqual(['private-lesson']);
    const final = await readJob(job.id);
    expect(final.memory_slugs).toEqual(['private-lesson']);
    expect(final.shared_memory_slugs).toEqual(['council-rule']);
  });

  it('treats unknown scope value as private', async () => {
    const reflection = '<<MEMORY title="Misnamed" scope="team">>\nbody\n<</MEMORY>>';
    const adapterOverride = makeReflectionAdapter(reflection);
    const job = await createJob({ title: 'P', brief: 'b', councillor_slug: 'alice' });
    await runJobNow(job.id, { adapterOverride });
    const { listNotes } = await import('./memory');
    expect(await listNotes()).toEqual([]);
    expect((await listPrivateNotes('alice')).map((n) => n.slug)).toEqual(['misnamed']);
  });
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run src/lib/server/runner.test.ts`
Expected: FAIL — runner does not yet branch on scope; shared notes never get written.

- [ ] **Step 4: Update runner imports**

Edit `src/lib/server/runner.ts`. Replace the import at line 19:

```ts
import { createPrivateNote } from './memory_private';
```

with:

```ts
import { createPrivateNote } from './memory_private';
import { createSharedNoteAutoSuffix } from './memory';
```

- [ ] **Step 5: Implement scope branching + record shared slugs**

In `src/lib/server/runner.ts`, replace the block at lines 98–120 (from `const blocks = parseMemoryBlocks(reflectionOut);` through `await writeJob({ ...persisted, memory_slugs: slugs });`) with:

```ts
  const blocks = parseMemoryBlocks(reflectionOut);
  const privateSlugs: string[] = [];
  const sharedSlugs: string[] = [];
  for (const b of blocks) {
    try {
      if (b.scope === 'shared') {
        const note = await createSharedNoteAutoSuffix({ title: b.title, body: b.body });
        sharedSlugs.push(note.slug);
      } else {
        const note = await createPrivateNote(councillor.slug, { title: b.title, body: b.body });
        privateSlugs.push(note.slug);
      }
    } catch (err) {
      await appendEvent(job.id, {
        at: new Date().toISOString(),
        type: 'reflection_failed',
        message: `note "${b.title}" failed: ${err instanceof Error ? err.message : String(err)}`
      });
    }
  }

  const totalWritten = privateSlugs.length + sharedSlugs.length;
  await appendEvent(job.id, {
    at: new Date().toISOString(),
    type: 'reflected',
    message: `wrote ${totalWritten} memor${totalWritten === 1 ? 'y' : 'ies'}`
  });

  const persisted = await readJob(job.id);
  await writeJob({
    ...persisted,
    memory_slugs: privateSlugs,
    shared_memory_slugs: sharedSlugs
  });
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run src/lib/server/runner.test.ts`
Expected: PASS — all runner tests green, including the three new ones.

- [ ] **Step 7: Type-check the whole project**

Run: `npm run check`
Expected: 0 errors (pre-existing warnings are fine).

- [ ] **Step 8: Commit**

```bash
git add src/lib/types.ts src/lib/server/runner.ts src/lib/server/runner.test.ts
git commit -m "feat(runner): branch reflection blocks on scope; record shared slugs"
```

---

## Task 4: UI surface on `/jobs/[jid]`

**Files:**
- Modify: `src/routes/jobs/[jid]/+page.svelte:88-96`

- [ ] **Step 1: Add "Shared memory updated" section**

Edit `src/routes/jobs/[jid]/+page.svelte`. Immediately after the `{#if job.memory_slugs && job.memory_slugs.length > 0}` block (ends around line 97 with `{/if}`), insert:

```svelte
{#if job.shared_memory_slugs && job.shared_memory_slugs.length > 0}
  <section>
    <h2>Shared memory updated</h2>
    <ul class="mem-list">
      {#each job.shared_memory_slugs as slug}
        <li><a href="/memory/{slug}">{slug}</a></li>
      {/each}
    </ul>
  </section>
{/if}
```

- [ ] **Step 2: Type-check and verify**

Run: `npm run check`
Expected: 0 errors. The new `shared_memory_slugs` access type-checks against the updated `Job`.

- [ ] **Step 3: Smoke-test in the browser**

Run the dev server: `npm run dev`
- Open the dogfood council (or any council with a `mock:local` councillor).
- Edit a councillor's persona temporarily to emit a `<<MEMORY title="UI Smoke" scope="shared">>...<</MEMORY>>` block on reflection — OR — write a small one-off job whose brief asks for that block via a mock adapter.
- Run the job. After it succeeds, open `/jobs/<id>` and confirm both "Memories created" (if any private blocks emitted) and "Shared memory updated" sections render, with each `<li>` link going to `/memory/<slug>`.
- Click through to `/memory/<slug>` and confirm the shared note exists with the right body.
- Revert the persona tweak.

- [ ] **Step 4: Commit**

```bash
git add src/routes/jobs/[jid]/+page.svelte
git commit -m "feat(ui): show shared-memory writes on job detail"
```

---

## Task 5: Doc updates

**Files:**
- Modify: `SPECIFICATION.md`
- Modify: `docs/OPEN_QUESTIONS.md`
- Modify: `docs/architecture.md`
- Modify: `docs/data-model.md`

- [ ] **Step 1: Update `SPECIFICATION.md` — Agent Proposals section**

Find the `<<MEMORY>>` description in the "Agent Proposals" section (around line 117). Replace the bullet:

```
- **`<<MEMORY>>`** — applied directly. Written to the councillor's private memory dir; indexed under `memory_private`. Title collisions get a `-2`, `-3` suffix. The block parser is regex-tolerant of leading whitespace and trailing prose; unrecognized tags are ignored (forward-compat).
```

with:

```
- **`<<MEMORY>>`** — applied directly. Defaults to the councillor's private memory dir (indexed under `memory_private`). `scope="shared"` writes to the council-wide `memory/` dir instead (indexed under `memory`). Title collisions in either scope get a `-2`, `-3` suffix. The block parser is regex-tolerant of leading whitespace and trailing prose; unrecognized tags are ignored (forward-compat). Cleanup/dedupe of repeated shared writes is a deferred follow-up.
```

Also remove (around line 120):

```
Memory promotion (private → shared) is a known follow-up — design deferred until first real promote desire surfaces; both `<<PROMOTE>>` and `scope="shared"` on `<<MEMORY>>` are candidate forms.
```

- [ ] **Step 2: Update `SPECIFICATION.md` — Out of Scope section**

Find and delete the line (around line 228):

```
- Memory promotion (private → shared) — design candidates (`<<PROMOTE>>` block vs. `<<MEMORY scope="shared">>`) are documented; pick after first real promote desire
```

- [ ] **Step 3: Update `docs/OPEN_QUESTIONS.md`**

Delete the entire `## Memory promotion (private → shared)` section (lines 5–12), including the heading.

- [ ] **Step 4: Update `docs/architecture.md` and `docs/data-model.md`**

In both files, search for any mention of `<<MEMORY>>` or the reflection memory write path. Where the docs describe what the parser does or where memory blocks land, add a note that `scope="shared"` is now a real attribute and routes the write to shared memory. The exact insertion is contextual — keep it to one or two sentences in each file at the existing memory-write description.

Run: `grep -n "MEMORY" docs/architecture.md docs/data-model.md` (use Grep tool) to locate the spots.

- [ ] **Step 5: Verify the build still passes**

Run: `npm run check && npx vitest run`
Expected: 0 type errors, all tests pass.

- [ ] **Step 6: Commit**

```bash
git add SPECIFICATION.md docs/OPEN_QUESTIONS.md docs/architecture.md docs/data-model.md
git commit -m "docs: scope=shared memory writes are now real"
```

---

## Self-review checklist (for the implementer)

Before declaring the feature done, confirm:

- `parseMemoryBlocks` returns a `scope` field on every parsed block.
- Reflection output containing `scope="shared"` produces a file under `<council-root>/memory/`, not under any councillor's private dir.
- A second emission of the same title creates `-2`, `-3` suffixed shared notes (no overwrite).
- `Job.shared_memory_slugs` is populated when shared blocks were written; the existing `memory_slugs` only carries private writes.
- The job detail page renders both lists when relevant; private links go to `/councillors/<slug>/memory/<slug>`, shared links go to `/memory/<slug>`.
- `SPECIFICATION.md` and `docs/OPEN_QUESTIONS.md` no longer describe memory promotion as deferred.
- The UI form for creating shared notes manually (`/memory/new`) still throws on collisions (strict `createNote` is unchanged).
