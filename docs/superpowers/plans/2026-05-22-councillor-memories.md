# Councillor Memories Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add private per-councillor memory created by a post-job reflection pass, retrieved top-K by similarity to the next job's brief, alongside existing shared council memory.

**Architecture:** Two-tier markdown storage (`<council>/memory/` shared; `<council>/councillors/<slug>/memory/` private). Successful jobs trigger one additional adapter call with a fixed reflection prompt; parsed `<<MEMORY>>` blocks become private notes and get indexed under a new `memory_private` kind. Prompt assembly replaces verbatim memory gluing with top-K semantic retrieval (8 shared + 8 private, 12k char budget), with fallback to today's verbatim behavior if the index is empty.

**Tech Stack:** SvelteKit, TypeScript, Node fs, vitest, better-sqlite3 + sqlite-vec (already in repo).

**Design spec:** `docs/superpowers/specs/2026-05-22-councillor-memories-design.md`

---

## File Structure

**New files:**
- `src/lib/server/memory_private.ts` — CRUD for `councillors/<slug>/memory/*.md`, indexer integration.
- `src/lib/server/memory_private.test.ts` — unit tests for above.
- `src/lib/server/reflection.ts` — reflection prompt builder + `<<MEMORY>>` block parser.
- `src/lib/server/reflection.test.ts` — parser tests.
- `src/lib/server/config.ts` — `MEMORY_TOPK_SHARED`, `MEMORY_TOPK_PRIVATE`, `MEMORY_CHAR_BUDGET` constants.
- `src/lib/server/context.ts` — `assembleContextFor(councillor_slug, brief)` with top-K retrieval + fallback.
- `src/lib/server/context.test.ts` — retrieval/eviction/fallback tests.
- `src/routes/councillors/[c_slug]/memory/[note]/+page.server.ts` + `+page.svelte` — view/edit/delete private notes.

**Modified files:**
- `src/lib/server/embeddings.ts` — add `memory_private` to `ChunkKind`.
- `src/lib/server/paths.ts` — add `councillorMemoryDir(slug)`.
- `src/lib/types.ts` — add `reflect?: boolean` to `Councillor`; add `memory_slugs?: string[]` to `Job`; add `'reflected'` + `'reflection_failed'` to `JobEvent['type']`.
- `src/lib/server/councillors.ts` — read/write/include `reflect` flag (default `true`).
- `src/lib/server/runner.ts` — use `assembleContextFor` in `buildPrompt`; run reflection on `succeeded`; record events + `memory_slugs` on Job.
- `src/routes/councillors/[c_slug]/+page.server.ts` — load private memory list.
- `src/routes/councillors/[c_slug]/+page.svelte` — render Memory section.
- `src/routes/jobs/[jid]/+page.server.ts` (already loads job) — surface `memory_slugs` to page.
- `src/routes/jobs/[jid]/+page.svelte` — render "Memories created" subsection.
- `scripts/reindex.ts` — walk per-councillor private memory dirs.

---

### Task 1: Add `memory_private` to ChunkKind

**Files:**
- Modify: `src/lib/server/embeddings.ts:9`

- [ ] **Step 1: Edit ChunkKind**

In `src/lib/server/embeddings.ts` line 9, change:

```ts
export type ChunkKind = 'memory' | 'job_input' | 'job_output' | 'transcript' | 'persona';
```

to:

```ts
export type ChunkKind = 'memory' | 'memory_private' | 'job_input' | 'job_output' | 'transcript' | 'persona';
```

- [ ] **Step 2: Run typecheck**

Run: `npx svelte-check --output human`
Expected: `0 errors and 0 warnings`.

- [ ] **Step 3: Commit**

```
git add src/lib/server/embeddings.ts
git commit -m "embeddings: add memory_private to ChunkKind"
```

---

### Task 2: Path helper for councillor memory dir

**Files:**
- Modify: `src/lib/server/paths.ts`

- [ ] **Step 1: Add helper**

Append to `src/lib/server/paths.ts` (after `councillorDir`):

```ts
export function councillorMemoryDir(councillorSlug: string): string {
  return join(councillorDir(councillorSlug), 'memory');
}
```

- [ ] **Step 2: Run typecheck**

Run: `npx svelte-check --output human`
Expected: `0 errors and 0 warnings`.

- [ ] **Step 3: Commit**

```
git add src/lib/server/paths.ts
git commit -m "paths: add councillorMemoryDir helper"
```

---

### Task 3: Private memory CRUD module (red)

**Files:**
- Test: `src/lib/server/memory_private.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/lib/server/memory_private.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { env } from 'node:process';

import { createCouncil } from './councils';
import { createCouncillor } from './councillors';
import {
  createPrivateNote,
  deletePrivateNote,
  listPrivateNotes,
  readPrivateNote,
  updatePrivateNote
} from './memory_private';

let tmpRoot: string;
let prevEnv: string | undefined;

beforeEach(async () => {
  prevEnv = env.LANDSRAAD_COUNCIL_ROOT;
  tmpRoot = mkdtempSync(join(tmpdir(), 'landsraad-mempriv-'));
  env.LANDSRAAD_COUNCIL_ROOT = tmpRoot;
  await createCouncil({ name: 'Mem Test' });
  await createCouncillor({ name: 'Alice', role: 'cto' });
});

afterEach(() => {
  rmSync(tmpRoot, { recursive: true, force: true });
  if (prevEnv === undefined) delete env.LANDSRAAD_COUNCIL_ROOT;
  else env.LANDSRAAD_COUNCIL_ROOT = prevEnv;
});

describe('memory_private', () => {
  it('starts empty', async () => {
    expect(await listPrivateNotes('alice')).toEqual([]);
  });

  it('creates and reads a private note', async () => {
    const n = await createPrivateNote('alice', { title: 'Lesson One', body: 'Body here.' });
    expect(n.slug).toBe('lesson-one');
    expect(n.councillor_slug).toBe('alice');
    expect(await readPrivateNote('alice', 'lesson-one')).toMatchObject({ slug: 'lesson-one' });
  });

  it('appends -2, -3 on slug collisions', async () => {
    const a = await createPrivateNote('alice', { title: 'Same Title', body: 'first' });
    const b = await createPrivateNote('alice', { title: 'Same Title', body: 'second' });
    const c = await createPrivateNote('alice', { title: 'Same Title', body: 'third' });
    expect(a.slug).toBe('same-title');
    expect(b.slug).toBe('same-title-2');
    expect(c.slug).toBe('same-title-3');
  });

  it('updates a note body', async () => {
    await createPrivateNote('alice', { title: 'N', body: 'v1' });
    const updated = await updatePrivateNote('alice', 'n', 'v2');
    expect(updated.body).toBe('v2');
  });

  it('deletes a note', async () => {
    await createPrivateNote('alice', { title: 'Doomed', body: '...' });
    await deletePrivateNote('alice', 'doomed');
    expect(await listPrivateNotes('alice')).toEqual([]);
  });

  it('isolates notes per councillor', async () => {
    await createCouncillor({ name: 'Bob', role: 'cfo' });
    await createPrivateNote('alice', { title: 'A Only', body: 'a' });
    expect(await listPrivateNotes('alice')).toHaveLength(1);
    expect(await listPrivateNotes('bob')).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `npx vitest run src/lib/server/memory_private.test.ts`
Expected: FAIL — `Cannot find module './memory_private'`.

---

### Task 4: Implement private memory CRUD (green)

**Files:**
- Create: `src/lib/server/memory_private.ts`

- [ ] **Step 1: Write implementation**

Create `src/lib/server/memory_private.ts`:

```ts
import { mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { councillorMemoryDir, slugify } from './paths';
import { indexDelete, indexUpsert } from './indexer';

const NOTE_EXT = '.md';

export interface PrivateNote {
  slug: string;
  councillor_slug: string;
  title: string;
  body: string;
  updated_at: string;
}

export interface UpsertPrivateNoteInput {
  title: string;
  body: string;
}

function noteFile(councillorSlug: string, slug: string): string {
  return join(councillorMemoryDir(councillorSlug), `${slug}${NOTE_EXT}`);
}

function titleFromBody(body: string, fallback: string): string {
  const firstLine = body.split('\n').find((l) => l.trim()) ?? '';
  const heading = firstLine.replace(/^#+\s*/, '').trim();
  return heading || fallback;
}

export async function listPrivateNotes(councillorSlug: string): Promise<PrivateNote[]> {
  const dir = councillorMemoryDir(councillorSlug);
  if (!existsSync(dir)) return [];
  const entries = await readdir(dir, { withFileTypes: true });
  const notes: PrivateNote[] = [];
  for (const e of entries) {
    if (!e.isFile() || !e.name.endsWith(NOTE_EXT)) continue;
    const slug = e.name.slice(0, -NOTE_EXT.length);
    const n = await readPrivateNote(councillorSlug, slug).catch(() => null);
    if (n) notes.push(n);
  }
  notes.sort((a, b) => a.slug.localeCompare(b.slug));
  return notes;
}

export async function readPrivateNote(councillorSlug: string, slug: string): Promise<PrivateNote> {
  const file = noteFile(councillorSlug, slug);
  const body = await readFile(file, 'utf8');
  const st = await stat(file);
  return {
    slug,
    councillor_slug: councillorSlug,
    title: titleFromBody(body, slug),
    body,
    updated_at: st.mtime.toISOString()
  };
}

function resolveAvailableSlug(councillorSlug: string, baseSlug: string): string {
  let candidate = baseSlug;
  let n = 2;
  while (existsSync(noteFile(councillorSlug, candidate))) {
    candidate = `${baseSlug}-${n}`;
    n++;
  }
  return candidate;
}

export async function createPrivateNote(
  councillorSlug: string,
  input: UpsertPrivateNoteInput
): Promise<PrivateNote> {
  const title = input.title.trim();
  if (!title) throw new Error('Private note title is required.');
  await mkdir(councillorMemoryDir(councillorSlug), { recursive: true });
  const baseSlug = slugify(title);
  const slug = resolveAvailableSlug(councillorSlug, baseSlug);
  const file = noteFile(councillorSlug, slug);
  const body = input.body.trimStart().startsWith('#')
    ? input.body
    : `# ${title}\n\n${input.body}`;
  await writeFile(file, body, 'utf8');
  const note = await readPrivateNote(councillorSlug, slug);
  await indexUpsert({
    kind: 'memory_private',
    ref_id: `${councillorSlug}/${slug}`,
    text: note.body,
    source_path: file,
    source_mtime: note.updated_at,
    title: note.title,
    councillor_slug: councillorSlug
  });
  return note;
}

export async function updatePrivateNote(
  councillorSlug: string,
  slug: string,
  body: string
): Promise<PrivateNote> {
  const file = noteFile(councillorSlug, slug);
  if (!existsSync(file)) throw new Error(`Private note "${slug}" does not exist.`);
  await writeFile(file, body, 'utf8');
  const note = await readPrivateNote(councillorSlug, slug);
  await indexUpsert({
    kind: 'memory_private',
    ref_id: `${councillorSlug}/${slug}`,
    text: note.body,
    source_path: file,
    source_mtime: note.updated_at,
    title: note.title,
    councillor_slug: councillorSlug
  });
  return note;
}

export async function deletePrivateNote(councillorSlug: string, slug: string): Promise<void> {
  const file = noteFile(councillorSlug, slug);
  if (!existsSync(file)) return;
  await rm(file, { force: true });
  indexDelete('memory_private', `${councillorSlug}/${slug}`);
}
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `npx vitest run src/lib/server/memory_private.test.ts`
Expected: All 6 tests pass.

- [ ] **Step 3: Commit**

```
git add src/lib/server/memory_private.ts src/lib/server/memory_private.test.ts
git commit -m "memory_private: per-councillor CRUD with slug collision handling"
```

---

### Task 5: Reflection parser (red)

**Files:**
- Test: `src/lib/server/reflection.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/lib/server/reflection.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { parseMemoryBlocks, buildReflectionPrompt } from './reflection';

describe('parseMemoryBlocks', () => {
  it('returns empty array when no blocks present', () => {
    expect(parseMemoryBlocks('just some text, no memories')).toEqual([]);
  });

  it('parses a single block', () => {
    const out = parseMemoryBlocks(
      'preamble\n<<MEMORY title="Cash on hand">>\nbody one\n<</MEMORY>>\ntrailer'
    );
    expect(out).toEqual([{ title: 'Cash on hand', body: 'body one' }]);
  });

  it('parses multiple blocks', () => {
    const out = parseMemoryBlocks(
      '<<MEMORY title="A">>\naaa\n<</MEMORY>>\n<<MEMORY title="B">>\nbbb\n<</MEMORY>>'
    );
    expect(out).toEqual([
      { title: 'A', body: 'aaa' },
      { title: 'B', body: 'bbb' }
    ]);
  });

  it('preserves multi-line bodies', () => {
    const out = parseMemoryBlocks('<<MEMORY title="X">>\nline 1\nline 2\nline 3\n<</MEMORY>>');
    expect(out[0].body).toBe('line 1\nline 2\nline 3');
  });

  it('skips blocks without a title attribute', () => {
    const out = parseMemoryBlocks('<<MEMORY>>\nbody\n<</MEMORY>>');
    expect(out).toEqual([]);
  });

  it('skips blocks with empty title', () => {
    const out = parseMemoryBlocks('<<MEMORY title="">>\nbody\n<</MEMORY>>');
    expect(out).toEqual([]);
  });

  it('trims trailing whitespace on body', () => {
    const out = parseMemoryBlocks('<<MEMORY title="X">>\nbody  \n\n<</MEMORY>>');
    expect(out[0].body).toBe('body');
  });
});

describe('buildReflectionPrompt', () => {
  it('includes transcript and output sections', () => {
    const p = buildReflectionPrompt({
      title: 'Investigate cash burn',
      brief: 'Look at last quarter',
      transcript: 'TRANSCRIPT_BODY',
      output: 'OUTPUT_BODY'
    });
    expect(p).toContain('Investigate cash burn');
    expect(p).toContain('TRANSCRIPT_BODY');
    expect(p).toContain('OUTPUT_BODY');
    expect(p).toContain('<<MEMORY title=');
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `npx vitest run src/lib/server/reflection.test.ts`
Expected: FAIL — `Cannot find module './reflection'`.

---

### Task 6: Reflection module (green)

**Files:**
- Create: `src/lib/server/reflection.ts`

- [ ] **Step 1: Write implementation**

Create `src/lib/server/reflection.ts`:

```ts
export interface ParsedMemoryBlock {
  title: string;
  body: string;
}

const BLOCK_RE = /<<MEMORY\b([^>]*)>>([\s\S]*?)<<\/MEMORY>>/g;
const TITLE_RE = /title="([^"]*)"/;

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
    out.push({ title, body });
  }
  return out;
}

export interface ReflectionPromptInput {
  title: string;
  brief: string;
  transcript: string;
  output: string;
}

export function buildReflectionPrompt(input: ReflectionPromptInput): string {
  return [
    '# Reflection',
    '',
    'You just finished the job below. Decide whether anything from this run is worth remembering for next time — your future self will see retrieved memory entries before each new job, ranked by similarity to the new brief.',
    '',
    'Emit zero or more memory entries using this exact fenced format:',
    '',
    '<<MEMORY title="short slug-friendly title">>',
    'body markdown — include *why* this is worth remembering, not just what happened',
    '<</MEMORY>>',
    '',
    'If nothing is worth keeping, respond with no MEMORY blocks at all. Quality over quantity.',
    '',
    `## Job title`,
    '',
    input.title,
    '',
    `## Brief`,
    '',
    input.brief.trim(),
    '',
    `## Transcript`,
    '',
    input.transcript.trim() || '(empty)',
    '',
    `## Output`,
    '',
    input.output.trim() || '(empty)',
    ''
  ].join('\n');
}
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `npx vitest run src/lib/server/reflection.test.ts`
Expected: All 8 tests pass.

- [ ] **Step 3: Commit**

```
git add src/lib/server/reflection.ts src/lib/server/reflection.test.ts
git commit -m "reflection: prompt builder + <<MEMORY>> block parser"
```

---

### Task 7: Config constants

**Files:**
- Create: `src/lib/server/config.ts`

- [ ] **Step 1: Write file**

Create `src/lib/server/config.ts`:

```ts
export const MEMORY_TOPK_SHARED = 8;
export const MEMORY_TOPK_PRIVATE = 8;
export const MEMORY_CHAR_BUDGET = 12000;
```

- [ ] **Step 2: Run typecheck**

Run: `npx svelte-check --output human`
Expected: `0 errors and 0 warnings`.

- [ ] **Step 3: Commit**

```
git add src/lib/server/config.ts
git commit -m "config: memory retrieval constants"
```

---

### Task 8: Retrieval/assembly module (red)

**Files:**
- Test: `src/lib/server/context.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/lib/server/context.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { env } from 'node:process';

import { createCouncil } from './councils';
import { createCouncillor } from './councillors';
import { createNote } from './memory';
import { createPrivateNote } from './memory_private';
import { setEmbedder } from './indexer';
import { assembleContextFor } from './context';

let tmpRoot: string;
let prevEnv: string | undefined;

beforeEach(async () => {
  prevEnv = env.LANDSRAAD_COUNCIL_ROOT;
  tmpRoot = mkdtempSync(join(tmpdir(), 'landsraad-ctx-'));
  env.LANDSRAAD_COUNCIL_ROOT = tmpRoot;
  await createCouncil({ name: 'Ctx Test' });
  await createCouncillor({ name: 'Alice', role: 'cto' });
  setEmbedder(null); // no embedder → fallback path
});

afterEach(() => {
  rmSync(tmpRoot, { recursive: true, force: true });
  if (prevEnv === undefined) delete env.LANDSRAAD_COUNCIL_ROOT;
  else env.LANDSRAAD_COUNCIL_ROOT = prevEnv;
});

describe('assembleContextFor (no embedder fallback)', () => {
  it('returns empty when no memories exist', async () => {
    const ctx = await assembleContextFor('alice', 'any brief');
    expect(ctx).toBe('');
  });

  it('includes shared memory verbatim in fallback', async () => {
    await createNote({ title: 'Shared One', body: 'shared body' });
    const ctx = await assembleContextFor('alice', 'any brief');
    expect(ctx).toContain('# Shared council memory');
    expect(ctx).toContain('Shared One');
    expect(ctx).toContain('shared body');
  });

  it('does not leak another councillors private memory in fallback', async () => {
    await createCouncillor({ name: 'Bob', role: 'cfo' });
    await createPrivateNote('bob', { title: 'Bobs Secret', body: 'do not show' });
    const ctx = await assembleContextFor('alice', 'any brief');
    expect(ctx).not.toContain('Bobs Secret');
    expect(ctx).not.toContain('do not show');
  });

  it('includes councillors own private memory section in fallback', async () => {
    await createPrivateNote('alice', { title: 'Alice Note', body: 'private body' });
    const ctx = await assembleContextFor('alice', 'any brief');
    expect(ctx).toContain('# Your memory');
    expect(ctx).toContain('Alice Note');
    expect(ctx).toContain('private body');
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `npx vitest run src/lib/server/context.test.ts`
Expected: FAIL — `Cannot find module './context'`.

---

### Task 9: Retrieval/assembly module (green)

**Files:**
- Create: `src/lib/server/context.ts`

- [ ] **Step 1: Write implementation**

Create `src/lib/server/context.ts`:

```ts
import { hasEmbedder, indexSearch } from './indexer';
import { listNotes } from './memory';
import { listPrivateNotes } from './memory_private';
import { MEMORY_CHAR_BUDGET, MEMORY_TOPK_PRIVATE, MEMORY_TOPK_SHARED } from './config';

interface Entry {
  title: string;
  slug: string;
  body: string;
  similarity: number;
}

function formatSection(header: string, entries: Entry[]): string {
  if (entries.length === 0) return '';
  const blocks = entries.map((e) => `### ${e.title} (${e.slug})\n\n${e.body.trim()}`);
  return [`# ${header}`, ...blocks].join('\n\n');
}

function applyBudget(shared: Entry[], priv: Entry[], budget: number): { shared: Entry[]; priv: Entry[] } {
  let s = [...shared];
  let p = [...priv];
  const size = (e: Entry) => e.title.length + e.body.length + 16;
  let total = () => s.reduce((a, e) => a + size(e), 0) + p.reduce((a, e) => a + size(e), 0);
  while (total() > budget && (s.length || p.length)) {
    const sLow = s.length ? s[s.length - 1].similarity : Infinity;
    const pLow = p.length ? p[p.length - 1].similarity : Infinity;
    if (sLow <= pLow && s.length) s.pop();
    else if (p.length) p.pop();
    else s.pop();
  }
  return { shared: s, priv: p };
}

async function fallback(councillorSlug: string): Promise<string> {
  const shared = await listNotes();
  const priv = await listPrivateNotes(councillorSlug);
  const sharedEntries: Entry[] = shared.map((n) => ({
    title: n.title,
    slug: n.slug,
    body: n.body,
    similarity: 0
  }));
  const privEntries: Entry[] = priv.map((n) => ({
    title: n.title,
    slug: n.slug,
    body: n.body,
    similarity: 0
  }));
  const parts = [
    formatSection('Shared council memory', sharedEntries),
    formatSection('Your memory', privEntries)
  ].filter(Boolean);
  return parts.join('\n\n');
}

export async function assembleContextFor(councillorSlug: string, brief: string): Promise<string> {
  if (!hasEmbedder()) return fallback(councillorSlug);

  const sharedHits = await indexSearch(brief, { kinds: ['memory'], k: MEMORY_TOPK_SHARED });
  const privateHits = await indexSearch(brief, {
    kinds: ['memory_private'],
    k: MEMORY_TOPK_PRIVATE,
    councillor_slug: councillorSlug
  });

  const sharedEntries: Entry[] = sharedHits.map((h) => ({
    title: h.title ?? h.ref_id,
    slug: h.ref_id,
    body: h.text,
    similarity: h.similarity
  }));
  const privEntries: Entry[] = privateHits.map((h) => ({
    title: h.title ?? h.ref_id,
    slug: h.ref_id.includes('/') ? h.ref_id.split('/')[1] : h.ref_id,
    body: h.text,
    similarity: h.similarity
  }));

  if (sharedEntries.length === 0 && privEntries.length === 0) {
    return fallback(councillorSlug);
  }

  const { shared, priv } = applyBudget(sharedEntries, privEntries, MEMORY_CHAR_BUDGET);
  const parts = [
    formatSection('Shared council memory', shared),
    formatSection('Your memory', priv)
  ].filter(Boolean);
  return parts.join('\n\n');
}
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `npx vitest run src/lib/server/context.test.ts`
Expected: All 4 tests pass.

- [ ] **Step 3: Commit**

```
git add src/lib/server/context.ts src/lib/server/context.test.ts
git commit -m "context: assembleContextFor with top-K retrieval + fallback"
```

---

### Task 10: Wire runner to use assembleContextFor

**Files:**
- Modify: `src/lib/server/runner.ts:1-57`

- [ ] **Step 1: Edit runner**

In `src/lib/server/runner.ts`, change the import and `buildPrompt`:

Replace:

```ts
import { assembleMemoryContext } from './memory';
```

with:

```ts
import { assembleContextFor } from './context';
```

Replace the `buildPrompt` function:

```ts
async function buildPrompt(job: Job, personaBody: string): Promise<string> {
  const memCtx = await assembleMemoryContext();
  const sections: string[] = [];
  if (personaBody.trim()) sections.push(`# Persona\n\n${personaBody.trim()}`);
  if (memCtx) sections.push(memCtx);
  sections.push(`# Task: ${job.title}\n\n${job.brief.trim()}`);
  return sections.join('\n\n') + '\n';
}
```

with:

```ts
async function buildPrompt(job: Job, personaBody: string): Promise<string> {
  const memCtx = await assembleContextFor(job.councillor_slug, job.brief);
  const sections: string[] = [];
  if (personaBody.trim()) sections.push(`# Persona\n\n${personaBody.trim()}`);
  if (memCtx) sections.push(memCtx);
  sections.push(`# Task: ${job.title}\n\n${job.brief.trim()}`);
  return sections.join('\n\n') + '\n';
}
```

- [ ] **Step 2: Run typecheck + existing tests**

Run: `npx svelte-check --output human`
Expected: `0 errors and 0 warnings`.

Run: `npx vitest run`
Expected: all previous tests still pass (runner.test, memory.test, jobs.test, etc.).

- [ ] **Step 3: Commit**

```
git add src/lib/server/runner.ts
git commit -m "runner: use assembleContextFor for per-councillor memory retrieval"
```

---

### Task 11: Add `reflect` field to Councillor type + persistence

**Files:**
- Modify: `src/lib/types.ts:9-16`
- Modify: `src/lib/server/councillors.ts`

- [ ] **Step 1: Update type**

In `src/lib/types.ts`, change the `Councillor` interface:

```ts
export interface Councillor {
  slug: string;
  name: string;
  role: string;
  adapter: string;
  persona: string;
  reflect: boolean;
  created_at: string;
}
```

- [ ] **Step 2: Update councillors.ts**

In `src/lib/server/councillors.ts`:

1. Extend `CouncillorMeta`:

```ts
interface CouncillorMeta {
  slug: string;
  name: string;
  role: string;
  adapter: string;
  reflect?: boolean;
  created_at: string;
}
```

2. Extend `NewCouncillorInput` and `UpdateCouncillorInput`:

```ts
export interface NewCouncillorInput {
  name: string;
  role: string;
  adapter?: string;
  persona?: string;
  reflect?: boolean;
}

export interface UpdateCouncillorInput {
  name?: string;
  role?: string;
  adapter?: string;
  persona?: string;
  reflect?: boolean;
}
```

3. In `readCouncillor`, default `reflect: meta.reflect ?? true`:

```ts
export async function readCouncillor(slug: string): Promise<Councillor> {
  const dir = councillorDir(slug);
  const metaRaw = await readFile(join(dir, COUNCILLOR_FILE), 'utf8');
  const meta = JSON.parse(metaRaw) as CouncillorMeta;
  const persona = await readFile(join(dir, PERSONA_FILE), 'utf8').catch(() => '');
  return {
    slug,
    name: meta.name,
    role: meta.role,
    adapter: meta.adapter,
    persona,
    reflect: meta.reflect ?? true,
    created_at: meta.created_at
  };
}
```

4. In `createCouncillor`, accept and persist `reflect` (default true):

```ts
const meta: CouncillorMeta = {
  slug,
  name: input.name.trim(),
  role: input.role.trim(),
  adapter: (input.adapter ?? '').trim(),
  reflect: input.reflect ?? true,
  created_at: new Date().toISOString()
};
```

And the returned object: `return { ...meta, persona, reflect: meta.reflect ?? true };`

5. In `updateCouncillor`, propagate `reflect`:

```ts
const meta: CouncillorMeta = {
  slug: current.slug,
  name: input.name?.trim() ?? current.name,
  role: input.role?.trim() ?? current.role,
  adapter: input.adapter?.trim() ?? current.adapter,
  reflect: input.reflect ?? current.reflect,
  created_at: current.created_at
};
```

And return: `return { ...meta, persona, reflect: meta.reflect ?? true };`

- [ ] **Step 3: Run typecheck + tests**

Run: `npx svelte-check --output human`
Expected: `0 errors and 0 warnings`.

Run: `npx vitest run`
Expected: all tests pass.

- [ ] **Step 4: Commit**

```
git add src/lib/types.ts src/lib/server/councillors.ts
git commit -m "councillor: add reflect flag (default true)"
```

---

### Task 12: Job/JobEvent type updates

**Files:**
- Modify: `src/lib/types.ts:22-49`

- [ ] **Step 1: Update Job + JobEvent**

In `src/lib/types.ts`, change:

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
}

export interface JobEvent {
  at: string;
  type:
    | 'created'
    | 'started'
    | 'stdout'
    | 'stderr'
    | 'succeeded'
    | 'failed'
    | 'cancelled'
    | 'note';
  message?: string;
}
```

to:

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
  reflection_error?: string;
}

export interface JobEvent {
  at: string;
  type:
    | 'created'
    | 'started'
    | 'stdout'
    | 'stderr'
    | 'succeeded'
    | 'failed'
    | 'cancelled'
    | 'note'
    | 'reflected'
    | 'reflection_failed';
  message?: string;
}
```

- [ ] **Step 2: Run typecheck**

Run: `npx svelte-check --output human`
Expected: `0 errors and 0 warnings`.

- [ ] **Step 3: Commit**

```
git add src/lib/types.ts
git commit -m "types: Job.memory_slugs/reflection_error + reflect events"
```

---

### Task 13: Reflection runner (red)

**Files:**
- Test: append to `src/lib/server/runner.test.ts` (or create if absent)

- [ ] **Step 1: Check existing runner test**

Run: `npx vitest run src/lib/server/runner.test.ts`
If it does not exist, create it; if it does, append the test below.

- [ ] **Step 2: Write failing test**

In `src/lib/server/runner.test.ts`, add:

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { env } from 'node:process';

import { createCouncil } from './councils';
import { createCouncillor } from './councillors';
import { createJob, readEvents, readJob } from './jobs';
import { runJobNow } from './runner';
import { listPrivateNotes } from './memory_private';
import type { Adapter, AdapterRunStreams } from './adapters/types';

function makeAdapterEmittingReflection(reflectionOutput: string) {
  let call = 0;
  const adapter = {
    id: 'mock:test',
    invoke() { throw new Error('unused'); },
    run(): AdapterRunStreams {
      call++;
      const stdout = call === 1 ? 'job output body' : reflectionOutput;
      async function* chunks() { yield { stream: 'stdout' as const, text: stdout }; }
      return {
        chunks: chunks(),
        result: Promise.resolve({ exit_code: 0, stdout, stderr: '' })
      };
    }
  };
  return adapter as unknown as Adapter & {
    run(input: { prompt: string; cwd: string; signal?: AbortSignal }): AdapterRunStreams;
  };
}

describe('runner reflection', () => {
  let tmpRoot: string;
  let prevEnv: string | undefined;

  beforeEach(async () => {
    prevEnv = env.LANDSRAAD_COUNCIL_ROOT;
    tmpRoot = mkdtempSync(join(tmpdir(), 'landsraad-reflect-'));
    env.LANDSRAAD_COUNCIL_ROOT = tmpRoot;
    await createCouncil({ name: 'Reflect Test' });
    await createCouncillor({ name: 'Alice', role: 'cto' });
  });

  afterEach(() => {
    rmSync(tmpRoot, { recursive: true, force: true });
    if (prevEnv === undefined) delete env.LANDSRAAD_COUNCIL_ROOT;
    else env.LANDSRAAD_COUNCIL_ROOT = prevEnv;
  });

  it('writes private memories from reflection output on success', async () => {
    const reflection = '<<MEMORY title="Lesson From Run">>\nAlways check exit code first.\n<</MEMORY>>';
    const adapter = makeAdapterEmittingReflection(reflection);
    const job = await createJob({ title: 'Probe', brief: 'do thing', councillor_slug: 'alice' });
    await runJobNow(job.id, { adapterOverride: adapter });
    const finished = await readJob(job.id);
    expect(finished.status).toBe('succeeded');
    expect(finished.memory_slugs).toEqual(['lesson-from-run']);
    const notes = await listPrivateNotes('alice');
    expect(notes.map((n) => n.slug)).toEqual(['lesson-from-run']);
    const events = await readEvents(job.id);
    expect(events.some((e) => e.type === 'reflected')).toBe(true);
  });

  it('skips reflection when councillor.reflect=false', async () => {
    const { updateCouncillor } = await import('./councillors');
    await updateCouncillor('alice', { reflect: false });
    const reflection = '<<MEMORY title="Skip Me">>\nbody\n<</MEMORY>>';
    const adapter = makeAdapterEmittingReflection(reflection);
    const job = await createJob({ title: 'P', brief: 'b', councillor_slug: 'alice' });
    await runJobNow(job.id, { adapterOverride: adapter });
    expect(await listPrivateNotes('alice')).toEqual([]);
  });

  it('keeps job succeeded with zero memories when reflection output has no blocks', async () => {
    const adapter = makeAdapterEmittingReflection('no memory blocks here, just plain text');
    const job = await createJob({ title: 'P2', brief: 'b2', councillor_slug: 'alice' });
    await runJobNow(job.id, { adapterOverride: adapter });
    const finished = await readJob(job.id);
    expect(finished.status).toBe('succeeded');
    expect(finished.memory_slugs ?? []).toEqual([]);
    expect(await listPrivateNotes('alice')).toEqual([]);
  });

  it('does not reflect on failed jobs', async () => {
    function makeFailingAdapter() {
      return {
        id: 'mock:bad',
        invoke() { throw new Error('unused'); },
        run(): AdapterRunStreams {
          async function* chunks() { yield { stream: 'stderr' as const, text: 'boom' }; }
          return {
            chunks: chunks(),
            result: Promise.resolve({ exit_code: 1, stdout: '', stderr: 'boom' })
          };
        }
      } as unknown as Adapter & {
        run(input: { prompt: string; cwd: string; signal?: AbortSignal }): AdapterRunStreams;
      };
    }
    const job = await createJob({ title: 'Bad', brief: 'b', councillor_slug: 'alice' });
    await runJobNow(job.id, { adapterOverride: makeFailingAdapter() });
    const finished = await readJob(job.id);
    expect(finished.status).toBe('failed');
    expect(await listPrivateNotes('alice')).toEqual([]);
  });
});
```

- [ ] **Step 3: Run test to verify failure**

Run: `npx vitest run src/lib/server/runner.test.ts -t "runner reflection"`
Expected: FAIL — reflection logic does not yet exist; `memory_slugs` undefined and no private notes created.

---

### Task 14: Reflection runner (green)

**Files:**
- Modify: `src/lib/server/runner.ts`
- Modify: `src/lib/server/jobs.ts` (small: writeJob can persist `memory_slugs` already via the Job type — verify)

- [ ] **Step 1: Edit runner.ts**

In `src/lib/server/runner.ts`:

1. Add imports near the top:

```ts
import { buildReflectionPrompt, parseMemoryBlocks } from './reflection';
import { createPrivateNote } from './memory_private';
import { readOutput, readTranscript, writeJob } from './jobs';
```

2. Add a `reflect` helper above `runJobNow`:

```ts
async function reflectAfterSuccess(
  job: Job,
  councillor: { slug: string; reflect: boolean },
  adapter: ResolvedAdapter,
  signal: AbortSignal
): Promise<void> {
  if (!councillor.reflect) return;
  const transcript = await readTranscript(job.id).catch(() => '');
  const output = await readOutput(job.id).catch(() => '');
  const prompt = buildReflectionPrompt({
    title: job.title,
    brief: job.brief,
    transcript,
    output
  });

  let reflectionOut = '';
  try {
    const streams = adapter.run({ prompt, cwd: councilRoot(), signal });
    for await (const _chunk of streams.chunks) void _chunk;
    const result = await streams.result;
    if (result.exit_code !== 0) {
      await appendEvent(job.id, {
        at: new Date().toISOString(),
        type: 'reflection_failed',
        message: result.stderr || `exit ${result.exit_code}`
      });
      return;
    }
    reflectionOut = result.stdout;
  } catch (err) {
    await appendEvent(job.id, {
      at: new Date().toISOString(),
      type: 'reflection_failed',
      message: err instanceof Error ? err.message : String(err)
    });
    return;
  }

  const blocks = parseMemoryBlocks(reflectionOut);
  const slugs: string[] = [];
  for (const b of blocks) {
    try {
      const note = await createPrivateNote(councillor.slug, { title: b.title, body: b.body });
      slugs.push(note.slug);
    } catch (err) {
      await appendEvent(job.id, {
        at: new Date().toISOString(),
        type: 'reflection_failed',
        message: `note "${b.title}" failed: ${err instanceof Error ? err.message : String(err)}`
      });
    }
  }

  await appendEvent(job.id, {
    at: new Date().toISOString(),
    type: 'reflected',
    message: `wrote ${slugs.length} memor${slugs.length === 1 ? 'y' : 'ies'}`
  });

  const persisted = await readJob(job.id);
  await writeJob({ ...persisted, memory_slugs: slugs });
}
```

3. In `runJobNow`, just after the line `return await setStatus(jobId, 'succeeded', ...)` succeeds, replace the success branch to capture the result and invoke reflection. Replace:

```ts
      if (result.exit_code === 0) {
        return await setStatus(jobId, 'succeeded', {
          finished_at: new Date().toISOString(),
          exit_code: 0
        });
      }
```

with:

```ts
      if (result.exit_code === 0) {
        const succeeded = await setStatus(jobId, 'succeeded', {
          finished_at: new Date().toISOString(),
          exit_code: 0
        });
        try {
          await reflectAfterSuccess(succeeded, councillor, adapter, controller.signal);
        } catch (err) {
          await appendEvent(jobId, {
            at: new Date().toISOString(),
            type: 'reflection_failed',
            message: err instanceof Error ? err.message : String(err)
          });
        }
        return await readJob(jobId);
      }
```

- [ ] **Step 2: Run reflection tests**

Run: `npx vitest run src/lib/server/runner.test.ts -t "runner reflection"`
Expected: All 4 reflection tests pass.

- [ ] **Step 3: Run full suite**

Run: `npx vitest run`
Expected: all tests pass.

- [ ] **Step 4: Commit**

```
git add src/lib/server/runner.ts
git commit -m "runner: reflection pass on success writes private memories"
```

---

### Task 15: Surface private memory on councillor detail page

**Files:**
- Modify: `src/routes/councillors/[c_slug]/+page.server.ts`
- Modify: `src/routes/councillors/[c_slug]/+page.svelte`

- [ ] **Step 1: Edit server load**

Replace `load` in `src/routes/councillors/[c_slug]/+page.server.ts`:

```ts
import { error, fail, redirect } from '@sveltejs/kit';
import { deleteCouncillor, readCouncillor, updateCouncillor } from '$lib/server/councillors';
import { listKnownAdapters } from '$lib/server/adapters';
import { listPrivateNotes } from '$lib/server/memory_private';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
  try {
    const councillor = await readCouncillor(params.c_slug);
    const memories = await listPrivateNotes(params.c_slug);
    return { councillor, adapters: listKnownAdapters(), memories };
  } catch {
    error(404, 'Councillor not found');
  }
};
```

(Keep the existing `actions` block unchanged.)

- [ ] **Step 2: Edit page**

In `src/routes/councillors/[c_slug]/+page.svelte`, after the `<section>` containing Persona, add:

```svelte
<section>
  <h2>Memory</h2>
  {#if data.memories.length === 0}
    <p class="empty">No memories yet. They accrue automatically after successful jobs.</p>
  {:else}
    <ul class="mem-list">
      {#each data.memories as m (m.slug)}
        <li>
          <a class="mem-card" href="/councillors/{c.slug}/memory/{m.slug}">
            <div class="mem-title">{m.title}</div>
            <div class="mem-meta">Updated {new Date(m.updated_at).toLocaleString()}</div>
          </a>
        </li>
      {/each}
    </ul>
  {/if}
</section>
```

In the `<style>` block, append:

```css
.mem-list { list-style: none; padding: 0; display: grid; gap: 0.6rem; }
.mem-card { display: block; border: 1px solid var(--border); border-radius: 6px; padding: 0.6rem 0.8rem; text-decoration: none; color: var(--fg); }
.mem-card:hover { border-color: var(--accent); }
.mem-title { font-weight: 500; }
.mem-meta { color: var(--muted); font-size: 0.8em; margin-top: 0.2rem; }
```

- [ ] **Step 3: Run typecheck**

Run: `npx svelte-check --output human`
Expected: `0 errors and 0 warnings`.

- [ ] **Step 4: Commit**

```
git add src/routes/councillors/[c_slug]/+page.server.ts src/routes/councillors/[c_slug]/+page.svelte
git commit -m "councillor page: list private memories"
```

---

### Task 16: Private note view/edit/delete route

**Files:**
- Create: `src/routes/councillors/[c_slug]/memory/[note]/+page.server.ts`
- Create: `src/routes/councillors/[c_slug]/memory/[note]/+page.svelte`

- [ ] **Step 1: Server file**

Create `src/routes/councillors/[c_slug]/memory/[note]/+page.server.ts`:

```ts
import { error, fail, redirect } from '@sveltejs/kit';
import { deletePrivateNote, readPrivateNote, updatePrivateNote } from '$lib/server/memory_private';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
  try {
    const note = await readPrivateNote(params.c_slug, params.note);
    return { note, c_slug: params.c_slug };
  } catch {
    error(404, 'Memory not found');
  }
};

export const actions: Actions = {
  save: async ({ params, request }) => {
    const form = await request.formData();
    const body = String(form.get('body') ?? '');
    try {
      await updatePrivateNote(params.c_slug, params.note, body);
    } catch (err) {
      return fail(400, { error: err instanceof Error ? err.message : 'Save failed.' });
    }
    return { saved: true };
  },
  delete: async ({ params }) => {
    await deletePrivateNote(params.c_slug, params.note);
    redirect(303, `/councillors/${params.c_slug}`);
  }
};
```

- [ ] **Step 2: Page file**

Create `src/routes/councillors/[c_slug]/memory/[note]/+page.svelte`:

```svelte
<script lang="ts">
  import type { ActionData, PageData } from './$types';
  let { data, form }: { data: PageData; form: ActionData } = $props();
  const n = $derived(data.note);
</script>

<p><a href="/councillors/{data.c_slug}">&larr; Back to councillor</a></p>

<header class="head">
  <h1>{n.title}</h1>
  <form method="POST" action="?/delete" onsubmit={(e) => { if (!confirm('Delete this memory?')) e.preventDefault(); }}>
    <button class="btn danger" type="submit">Delete</button>
  </form>
</header>

<p class="meta">Updated {new Date(n.updated_at).toLocaleString()}</p>

{#if form?.error}<p class="error">{form.error}</p>{/if}
{#if form?.saved}<p class="saved">Saved.</p>{/if}

<form method="POST" action="?/save">
  <textarea name="body" rows="20">{n.body}</textarea>
  <div class="actions">
    <button class="btn primary" type="submit">Save</button>
  </div>
</form>

<style>
  h1 { margin: 0; }
  .head { display: flex; justify-content: space-between; align-items: center; gap: 1rem; }
  .meta { color: var(--muted); margin: 0.25rem 0 1rem; font-size: 0.9em; }
  textarea {
    width: 100%; background: #1a1d24; color: var(--fg);
    border: 1px solid var(--border); border-radius: 6px;
    padding: 0.7rem; font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 0.9em; min-height: 20rem;
  }
  textarea:focus { outline: 2px solid var(--accent); border-color: var(--accent); }
  .actions { margin-top: 1rem; display: flex; gap: 0.5rem; justify-content: flex-end; }
  .btn { display: inline-block; padding: 0.5rem 0.9rem; border-radius: 6px; border: 1px solid var(--border); text-decoration: none; color: var(--fg); background: transparent; cursor: pointer; }
  .btn.primary { background: var(--accent); color: #0f1115; border-color: var(--accent); font-weight: 600; }
  .btn.danger { border-color: var(--danger); color: var(--danger); }
  .error { color: var(--danger); }
  .saved { color: #8bb98b; }
</style>
```

- [ ] **Step 3: Run typecheck**

Run: `npx svelte-check --output human`
Expected: `0 errors and 0 warnings`.

- [ ] **Step 4: Commit**

```
git add src/routes/councillors/[c_slug]/memory
git commit -m "private memory: view/edit/delete route"
```

---

### Task 17: Surface memories on job detail page

**Files:**
- Read first: `src/routes/jobs/[jid]/+page.server.ts`
- Modify: `src/routes/jobs/[jid]/+page.server.ts` (only if it does not already return the full `job` object)
- Modify: `src/routes/jobs/[jid]/+page.svelte`

- [ ] **Step 1: Verify server already passes `job`**

Run: `Read src/routes/jobs/[jid]/+page.server.ts`.

The current load function returns `{ job, ... }` with the full Job object (memory_slugs is part of Job after Task 12). No server change needed unless the file destructures fields explicitly — in that case, ensure `memory_slugs` is forwarded.

- [ ] **Step 2: Add Memories section to page**

In `src/routes/jobs/[jid]/+page.svelte`, after the `{#if job.error}` section and before `<details>`, add:

```svelte
{#if job.memory_slugs && job.memory_slugs.length > 0}
  <section>
    <h2>Memories created</h2>
    <ul class="mem-list">
      {#each job.memory_slugs as slug}
        <li><a href="/councillors/{job.councillor_slug}/memory/{slug}">{slug}</a></li>
      {/each}
    </ul>
  </section>
{/if}
```

In the `<style>` block append:

```css
.mem-list { list-style: none; padding: 0; display: grid; gap: 0.3rem; }
.mem-list a { color: var(--fg); }
.mem-list a:hover { color: var(--accent); }
```

- [ ] **Step 3: Run typecheck**

Run: `npx svelte-check --output human`
Expected: `0 errors and 0 warnings`.

- [ ] **Step 4: Commit**

```
git add src/routes/jobs/[jid]/+page.svelte
git commit -m "job page: show memories created by reflection"
```

---

### Task 18: Extend reindex CLI to walk private memory

**Files:**
- Modify: `scripts/reindex.ts`

- [ ] **Step 1: Add collectPrivateMemories**

In `scripts/reindex.ts`, after `collectMemory`:

```ts
async function collectPrivateMemories(): Promise<Target[]> {
  const { listCouncillors: listCs } = await import('../src/lib/server/councillors');
  const { councillorMemoryDir } = await import('../src/lib/server/paths');
  const { existsSync: exists } = await import('node:fs');
  const cs = await listCs();
  const targets: Target[] = [];
  for (const c of cs) {
    const dir = councillorMemoryDir(c.slug);
    if (!exists(dir)) continue;
    const entries = await readdir(dir, { withFileTypes: true });
    for (const e of entries) {
      if (!e.isFile() || !e.name.endsWith('.md')) continue;
      const slug = e.name.slice(0, -3);
      targets.push({
        kind: 'memory_private',
        ref_id: `${c.slug}/${slug}`,
        path: join(dir, e.name),
        title: slug,
        councillor_slug: c.slug
      });
    }
  }
  return targets;
}
```

Then update the targets line in `reindex()`:

```ts
const targets = [
  ...(await collectMemory()),
  ...(await collectPrivateMemories()),
  ...(await collectPersonas()),
  ...(await collectJobs())
];
```

- [ ] **Step 2: Run typecheck**

Run: `npx svelte-check --output human`
Expected: `0 errors and 0 warnings`.

- [ ] **Step 3: Smoke run (optional)**

Run: `npx vite-node scripts/reindex.ts -- .`
Expected: prints `Reindexing council at <path>` and `Done. Indexed N, skipped M.` without errors.

- [ ] **Step 4: Commit**

```
git add scripts/reindex.ts
git commit -m "reindex: walk per-councillor private memory dirs"
```

---

### Task 19: Integration smoke test

**Files:**
- Test: append to `src/lib/server/runner.test.ts`

- [ ] **Step 1: Write end-to-end test**

Add to `src/lib/server/runner.test.ts`:

```ts
describe('runner reflection — next job sees prior memory', () => {
  it('private memory from job 1 appears in job 2 prompt assembly', async () => {
    const prevEnv = env.LANDSRAAD_COUNCIL_ROOT;
    const tmpRoot = mkdtempSync(join(tmpdir(), 'landsraad-e2e-'));
    env.LANDSRAAD_COUNCIL_ROOT = tmpRoot;
    try {
      await createCouncil({ name: 'E2E' });
      await createCouncillor({ name: 'Alice', role: 'cto' });

      const reflection = '<<MEMORY title="Cash flow rule">>\nAlways verify against the ledger.\n<</MEMORY>>';
      const adapter = makeAdapterEmittingReflection(reflection);
      const job1 = await createJob({ title: 'Audit', brief: 'investigate cash', councillor_slug: 'alice' });
      await runJobNow(job1.id, { adapterOverride: adapter });

      const { assembleContextFor } = await import('./context');
      const ctx = await assembleContextFor('alice', 'follow up on cash');
      expect(ctx).toContain('# Your memory');
      expect(ctx).toContain('Cash flow rule');
      expect(ctx).toContain('Always verify against the ledger.');
    } finally {
      rmSync(tmpRoot, { recursive: true, force: true });
      if (prevEnv === undefined) delete env.LANDSRAAD_COUNCIL_ROOT;
      else env.LANDSRAAD_COUNCIL_ROOT = prevEnv;
    }
  });
});
```

- [ ] **Step 2: Run test**

Run: `npx vitest run src/lib/server/runner.test.ts -t "next job sees prior memory"`
Expected: PASS.

- [ ] **Step 3: Final full-suite run**

Run: `npx vitest run`
Expected: all tests pass.

Run: `npx svelte-check --output human`
Expected: `0 errors and 0 warnings`.

- [ ] **Step 4: Commit**

```
git add src/lib/server/runner.test.ts
git commit -m "test: end-to-end private memory persists across jobs"
```

---

## Self-review notes

- **Spec coverage check**
  - Storage layout (private memory dir) → Tasks 2, 4.
  - Index kind `memory_private` → Tasks 1, 4 (writes), 18 (reindex).
  - Reflection prompt + parser → Tasks 5, 6.
  - Reflection trigger on success + opt-out + non-fatal → Task 14.
  - `assembleContextFor` retrieval + budget + fallback → Tasks 8, 9, 10.
  - `reflect` flag on Councillor → Task 11.
  - `memory_slugs` on Job + reflection events → Tasks 12, 14.
  - UI: councillor Memory section → Task 15; private note view/edit/delete → Task 16; job page memories → Task 17.
  - Reindex CLI → Task 18.
  - All non-goals (promote, TTL, search_memory tool, etc.) are explicitly omitted from tasks.
- **Type consistency**: `createPrivateNote(councillorSlug, input)` signature is consistent in Tasks 3/4 and used in Task 14. `memory_slugs` field consistent in Tasks 12/14/17. `reflect` consistent in Tasks 11/14.
- **No placeholders**: every step has concrete code, exact commands, expected output.

## Risks left for execution

- The reflection test in Task 13 uses a hand-rolled adapter override. If the existing test suite relies on a different injection pattern, follow the patterns in `src/lib/server/runner.test.ts` (if present) or fall back to the `createMockAdapter` factory in `src/lib/server/adapters/mock.ts` extended with a configurable stdout per call.
- The reflection adapter call reuses the same `AbortController.signal` as the job. If the user cancels during reflection, the reflection silently aborts and is recorded as `reflection_failed`. Acceptable for v1.
- `setEmbedder(null)` is used in tests to force the fallback path. The production code uses `xenovaEmbedder()` (registered at SvelteKit hook level, not visible in this plan). If reflection runs in a context where the embedder is loaded, `assembleContextFor` will exercise the top-K path on the *next* job.
