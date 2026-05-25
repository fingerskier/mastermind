# Council Templates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add first-class council templates — a JSON file format, a loader (URL or local path), a parser for in-memory JSON strings, a preview-then-confirm installer, an opt-in exporter, CLI subcommands, and UI routes — so directors can stand up the same council shape across directories and share councils with teammates.

**Architecture:** Single server module `src/lib/server/templates.ts` owns schema, loader (`loadTemplate`), parser (`parseTemplate`), pure `planApply`, mutating `applyTemplate`, `exportSelection`, and named error classes. Conflict rule is per-entity overwrite — `councillors/`, `memory/`, and council meta can be replaced on confirmation; `jobs/` run history is never touched and `sample_jobs` only seed into an empty `jobs/`. Two new routes (`/import`, `/export`) and two CLI scripts (`template-install.ts`, `template-export.ts`) wrap the same module. `bin/landsraad.js` gets a subcommand dispatcher. The old imperative `scripts/dogfood-init.ts` is removed in favor of a `templates/dogfood.template.json` seed installed through the same code path.

**Tech Stack:** TypeScript, SvelteKit (form actions + `+page.svelte`), Node.js (`node:fs/promises`, `node:readline/promises`, `fetch`), vitest, vite-node (CLI script runner).

**Spec:** `docs/superpowers/specs/2026-05-24-council-templates-design.md` (read first if you have no other context).

---

## File Structure

**Create:**
- `src/lib/server/templates.ts` — schema types, errors, `parseTemplate`, `loadTemplate`, `planApply`, `applyTemplate`, `exportSelection`.
- `src/lib/server/templates.test.ts` — unit tests for everything above + a round-trip test.
- `src/routes/import/+page.server.ts` — form actions `preview` and `apply`.
- `src/routes/import/+page.svelte` — source input (URL textbox + file upload) and plan/confirm UI.
- `src/routes/export/+page.server.ts` — load (lists councillors/memory/queued jobs), action `download`.
- `src/routes/export/+page.svelte` — picker (checkboxes + metadata fields).
- `scripts/template-install.ts` — CLI install with readline confirm.
- `scripts/template-export.ts` — CLI export with readline picker.
- `templates/dogfood.template.json` — bundled built-in template (replaces `dogfood-init.ts`).

**Modify:**
- `src/routes/+page.svelte` — add "Install from template" panel to the setup form (the `{#if !data.hasCouncil}` branch).
- `src/routes/+layout.svelte` — add "Install" + "Export" header links visible when a council exists. (Layout currently has no council-awareness; pull via `$page.data.hasCouncil` from the page load.)
- `bin/landsraad.js` — dispatch on `argv[2]`: `init` / `export` → spawn vite-node script, otherwise → existing server-start path.
- `package.json` — rewrite `dogfood:init` to wrap `template-install.ts`; add `template:install` and `template:export` script aliases.

**Delete:**
- `scripts/dogfood-init.ts` — superseded by `templates/dogfood.template.json` + the installer.

---

## Task 1: Schema types + named errors (no logic)

**Files:**
- Create: `src/lib/server/templates.ts`

This task creates the empty module with only types and error classes, so later tasks can `import` from it. No tests yet (type-only file is exercised by later tests via construction).

- [ ] **Step 1: Create the module with schema + errors**

Write `src/lib/server/templates.ts`:

```ts
import type { Job, Councillor, MemoryNote } from '$lib/types';

// ---------- schema ----------

export interface CouncilTemplate {
  format_version: 1;
  name: string;
  version: string;
  description?: string;
  author?: string;
  license?: string;
  council: {
    name: string;
    description?: string;
  };
  councillors: TemplateCouncillor[];
  memory?: TemplateMemoryNote[];
  sample_jobs?: TemplateSampleJob[];
}

export interface TemplateCouncillor {
  slug?: string;
  name: string;
  role: string;
  routing_hint?: string;
  adapter: string;
  persona: string;
  reflect?: boolean;
}

export interface TemplateMemoryNote {
  title: string;
  body: string;
}

export interface TemplateSampleJob {
  title: string;
  brief: string;
  councillor_slug: string;
}

// ---------- apply plan ----------

export interface ApplyPlan {
  council: { exists: boolean; willOverwrite: boolean };
  councillors: { add: string[]; overwrite: string[] };
  memory: { add: string[]; overwrite: string[] };
  sample_jobs: { add: number; skipped_because_jobs_exist: boolean };
}

// ---------- errors ----------

export class TemplateFetchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TemplateFetchError';
  }
}

export class TemplateParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TemplateParseError';
  }
}

export class TemplateValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TemplateValidationError';
  }
}

export class TemplateNeedsConfirmation extends Error {
  constructor(public plan: ApplyPlan) {
    super('Confirmation required for overwrite');
    this.name = 'TemplateNeedsConfirmation';
  }
}
```

- [ ] **Step 2: Type-check passes**

Run: `npm run check`
Expected: 0 errors. (Unused-import warning on `Job`/`Councillor`/`MemoryNote` is fine; we'll consume them in later tasks. If `svelte-check` flags them as errors, drop the unused imports.)

- [ ] **Step 3: Commit**

```bash
git add src/lib/server/templates.ts
git commit -m "templates: schema types + named errors"
```

---

## Task 2: `parseTemplate` (JSON-string → validated template)

**Files:**
- Modify: `src/lib/server/templates.ts`
- Create: `src/lib/server/templates.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/lib/server/templates.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  parseTemplate,
  TemplateParseError,
  TemplateValidationError,
  type CouncilTemplate
} from './templates';

const validTemplate: CouncilTemplate = {
  format_version: 1,
  name: 'Test Council',
  version: '0.1.0',
  council: { name: 'Test', description: 'desc' },
  councillors: [
    { name: 'Mocky', role: 'echo', adapter: 'mock:local', persona: 'You are Mocky.' }
  ],
  memory: [{ title: 'House Rules', body: '- be terse.\n' }],
  sample_jobs: [
    { title: 'Hello', brief: 'say hi', councillor_slug: 'mocky' }
  ]
};

describe('parseTemplate', () => {
  it('parses a valid template', () => {
    const t = parseTemplate(JSON.stringify(validTemplate));
    expect(t.name).toBe('Test Council');
    expect(t.councillors).toHaveLength(1);
  });

  it('rejects non-JSON input', () => {
    expect(() => parseTemplate('not json')).toThrow(TemplateParseError);
  });

  it('rejects unsupported format_version', () => {
    const bad = { ...validTemplate, format_version: 2 };
    expect(() => parseTemplate(JSON.stringify(bad))).toThrow(/format_version 2/);
  });

  it('reports missing required field with path', () => {
    const bad = { ...validTemplate, councillors: [{ name: 'X', adapter: 'mock:local', persona: '' }] };
    expect(() => parseTemplate(JSON.stringify(bad))).toThrow(/councillors\[0\]\.role/);
  });

  it('rejects sample_jobs referencing unknown councillor slug', () => {
    const bad = {
      ...validTemplate,
      sample_jobs: [{ title: 'X', brief: 'y', councillor_slug: 'ghost' }]
    };
    expect(() => parseTemplate(JSON.stringify(bad))).toThrow(/sample_jobs\[0\]\.councillor_slug "ghost"/);
  });

  it('rejects councillor slug that does not match slugify(name)', () => {
    // createCouncillor derives slug from name; an explicit-but-divergent slug
    // would silently write to the wrong dir. Enforce the invariant up front.
    const bad = {
      ...validTemplate,
      councillors: [
        { slug: 'mismatched', name: 'Mocky', role: 'r', adapter: 'mock:local', persona: 'p' }
      ]
    };
    expect(() => parseTemplate(JSON.stringify(bad))).toThrow(/councillors\[0\]\.slug "mismatched"/);
  });

  it('throws TemplateValidationError on missing top-level field', () => {
    const bad = { ...validTemplate, name: undefined };
    expect(() => parseTemplate(JSON.stringify(bad))).toThrow(TemplateValidationError);
  });
});
```

- [ ] **Step 2: Run tests, confirm they fail**

Run: `npx vitest run src/lib/server/templates.test.ts`
Expected: FAIL — `parseTemplate` is not exported yet.

- [ ] **Step 3: Implement `parseTemplate`**

Add to the end of `src/lib/server/templates.ts`:

```ts
import { slugify } from './paths';

// ---------- validators ----------

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function requireString(obj: Record<string, unknown>, path: string, key: string): string {
  const v = obj[key];
  if (typeof v !== 'string' || !v.trim()) {
    throw new TemplateValidationError(`${path}.${key} is required (non-empty string).`);
  }
  return v;
}

function optionalString(obj: Record<string, unknown>, path: string, key: string): string | undefined {
  const v = obj[key];
  if (v === undefined) return undefined;
  if (typeof v !== 'string') {
    throw new TemplateValidationError(`${path}.${key} must be a string when provided.`);
  }
  return v;
}

function validateCouncillor(raw: unknown, path: string): TemplateCouncillor {
  if (!isObject(raw)) throw new TemplateValidationError(`${path} must be an object.`);
  const name = requireString(raw, path, 'name');
  const role = requireString(raw, path, 'role');
  const adapter = requireString(raw, path, 'adapter');
  const persona = requireString(raw, path, 'persona');
  const slug = optionalString(raw, path, 'slug');
  const routing_hint = optionalString(raw, path, 'routing_hint');
  const reflect = raw.reflect === undefined ? undefined : Boolean(raw.reflect);
  if (slug && slug !== slugify(name)) {
    throw new TemplateValidationError(
      `${path}.slug ${JSON.stringify(slug)} must match slugify(name) = ${JSON.stringify(slugify(name))}.`
    );
  }
  return { name, role, adapter, persona, slug, routing_hint, reflect };
}

function validateMemoryNote(raw: unknown, path: string): TemplateMemoryNote {
  if (!isObject(raw)) throw new TemplateValidationError(`${path} must be an object.`);
  const title = requireString(raw, path, 'title');
  const body = optionalString(raw, path, 'body') ?? '';
  return { title, body };
}

function validateSampleJob(raw: unknown, path: string): TemplateSampleJob {
  if (!isObject(raw)) throw new TemplateValidationError(`${path} must be an object.`);
  return {
    title: requireString(raw, path, 'title'),
    brief: requireString(raw, path, 'brief'),
    councillor_slug: requireString(raw, path, 'councillor_slug')
  };
}

function derivedSlug(c: TemplateCouncillor): string {
  return c.slug?.trim() ? slugify(c.slug) : slugify(c.name);
}

function validateTemplate(raw: unknown): CouncilTemplate {
  if (!isObject(raw)) throw new TemplateValidationError('Template root must be a JSON object.');
  if (raw.format_version !== 1) {
    throw new TemplateValidationError(
      `Unsupported format_version ${JSON.stringify(raw.format_version)}; expected 1.`
    );
  }
  const name = requireString(raw, 'template', 'name');
  const version = requireString(raw, 'template', 'version');
  const description = optionalString(raw, 'template', 'description');
  const author = optionalString(raw, 'template', 'author');
  const license = optionalString(raw, 'template', 'license');

  if (!isObject(raw.council)) throw new TemplateValidationError('template.council must be an object.');
  const council = {
    name: requireString(raw.council, 'template.council', 'name'),
    description: optionalString(raw.council, 'template.council', 'description')
  };

  if (!Array.isArray(raw.councillors)) {
    throw new TemplateValidationError('template.councillors must be an array.');
  }
  const councillors = raw.councillors.map((c, i) => validateCouncillor(c, `councillors[${i}]`));

  let memory: TemplateMemoryNote[] | undefined;
  if (raw.memory !== undefined) {
    if (!Array.isArray(raw.memory)) throw new TemplateValidationError('template.memory must be an array.');
    memory = raw.memory.map((n, i) => validateMemoryNote(n, `memory[${i}]`));
  }

  let sample_jobs: TemplateSampleJob[] | undefined;
  if (raw.sample_jobs !== undefined) {
    if (!Array.isArray(raw.sample_jobs)) {
      throw new TemplateValidationError('template.sample_jobs must be an array.');
    }
    sample_jobs = raw.sample_jobs.map((j, i) => validateSampleJob(j, `sample_jobs[${i}]`));
    const slugs = new Set(councillors.map(derivedSlug));
    sample_jobs.forEach((j, i) => {
      if (!slugs.has(j.councillor_slug)) {
        throw new TemplateValidationError(
          `sample_jobs[${i}].councillor_slug ${JSON.stringify(j.councillor_slug)} does not match any councillor.`
        );
      }
    });
  }

  return {
    format_version: 1,
    name,
    version,
    description,
    author,
    license,
    council,
    councillors,
    memory,
    sample_jobs
  };
}

export function parseTemplate(jsonString: string): CouncilTemplate {
  let raw: unknown;
  try {
    raw = JSON.parse(jsonString);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new TemplateParseError(`Invalid JSON: ${msg}`);
  }
  return validateTemplate(raw);
}
```

- [ ] **Step 4: Run tests, confirm pass**

Run: `npx vitest run src/lib/server/templates.test.ts`
Expected: PASS — 6 tests passing.

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/templates.ts src/lib/server/templates.test.ts
git commit -m "templates: parseTemplate + schema validation"
```

---

## Task 3: `loadTemplate` (path read + URL fetch)

**Files:**
- Modify: `src/lib/server/templates.ts`
- Modify: `src/lib/server/templates.test.ts`

- [ ] **Step 1: Write failing tests for path + URL paths**

Append to `src/lib/server/templates.test.ts`:

```ts
import { afterEach, beforeEach, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadTemplate, TemplateFetchError } from './templates';

describe('loadTemplate (path)', () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'lt-')); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  it('reads JSON from a local file path', async () => {
    const file = join(dir, 'x.json');
    writeFileSync(file, JSON.stringify(validTemplate), 'utf8');
    const t = await loadTemplate(file);
    expect(t.name).toBe('Test Council');
  });

  it('throws TemplateParseError on a non-JSON file', async () => {
    const file = join(dir, 'bad.json');
    writeFileSync(file, '<<<', 'utf8');
    await expect(loadTemplate(file)).rejects.toThrow(/Invalid JSON/);
  });
});

describe('loadTemplate (URL)', () => {
  let originalFetch: typeof globalThis.fetch;
  beforeEach(() => { originalFetch = globalThis.fetch; });
  afterEach(() => { globalThis.fetch = originalFetch; });

  it('fetches and parses JSON over http', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(validTemplate), { status: 200 })
    );
    const t = await loadTemplate('https://example.com/x.json');
    expect(t.name).toBe('Test Council');
  });

  it('throws TemplateFetchError on non-2xx', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response('', { status: 404 }));
    await expect(loadTemplate('https://example.com/missing.json')).rejects.toThrow(
      TemplateFetchError
    );
  });

  it('throws TemplateFetchError when body exceeds 2 MB', async () => {
    // Stream a body larger than the cap.
    const tooBig = new ReadableStream({
      start(controller) {
        const chunk = new Uint8Array(1024 * 1024); // 1 MB
        controller.enqueue(chunk);
        controller.enqueue(chunk);
        controller.enqueue(chunk); // 3 MB total
        controller.close();
      }
    });
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(tooBig, { status: 200 }));
    await expect(loadTemplate('https://example.com/huge.json')).rejects.toThrow(/2 MB/);
  });

  it('passes an AbortSignal to fetch (timeout wiring)', async () => {
    const spy = vi.fn().mockResolvedValue(new Response(JSON.stringify(validTemplate)));
    globalThis.fetch = spy as unknown as typeof fetch;
    await loadTemplate('https://example.com/x.json');
    const init = (spy.mock.calls[0][1] ?? {}) as RequestInit;
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });
});
```

- [ ] **Step 2: Run tests, confirm fail**

Run: `npx vitest run src/lib/server/templates.test.ts`
Expected: FAIL — `loadTemplate` is not exported.

- [ ] **Step 3: Implement `loadTemplate`**

Append to `src/lib/server/templates.ts`:

```ts
import { readFile } from 'node:fs/promises';
import { Buffer } from 'node:buffer';

const MAX_BODY_BYTES = 2 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 10_000;

function isUrl(source: string): boolean {
  return /^https?:\/\//i.test(source);
}

async function readStreamCapped(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BODY_BYTES) {
      try { await reader.cancel(); } catch { /* ignore */ }
      throw new TemplateFetchError(`Body exceeds 2 MB cap (got > ${total} bytes).`);
    }
    chunks.push(value);
  }
  return new TextDecoder('utf-8').decode(Buffer.concat(chunks));
}

async function fetchTemplateText(url: string): Promise<string> {
  let res: Response;
  try {
    res = await fetch(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      redirect: 'follow'
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new TemplateFetchError(`Failed to fetch ${url}: ${msg}`);
  }
  if (!res.ok) throw new TemplateFetchError(`HTTP ${res.status} from ${url}`);
  if (!res.body) throw new TemplateFetchError(`Empty response from ${url}`);
  return readStreamCapped(res.body);
}

export async function loadTemplate(source: string): Promise<CouncilTemplate> {
  const text = isUrl(source) ? await fetchTemplateText(source) : await readFile(source, 'utf8');
  return parseTemplate(text);
}
```

- [ ] **Step 4: Run tests, confirm pass**

Run: `npx vitest run src/lib/server/templates.test.ts`
Expected: PASS — all loadTemplate tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/templates.ts src/lib/server/templates.test.ts
git commit -m "templates: loadTemplate (path + URL w/ 2MB cap, 10s timeout)"
```

---

## Task 4: `planApply` (pure diff vs current council state)

**Files:**
- Modify: `src/lib/server/templates.ts`
- Modify: `src/lib/server/templates.test.ts`

- [ ] **Step 1: Write failing tests**

Append to `src/lib/server/templates.test.ts`:

```ts
import { hasCouncil, createCouncil } from './councils';
import { createCouncillor } from './councillors';
import { createNote } from './memory';
import { createJob } from './jobs';
import { planApply } from './templates';

describe('planApply', () => {
  let tmpRoot: string;
  let prevEnv: string | undefined;

  beforeEach(() => {
    prevEnv = process.env.LANDSRAAD_COUNCIL_ROOT;
    tmpRoot = mkdtempSync(join(tmpdir(), 'pa-'));
    process.env.LANDSRAAD_COUNCIL_ROOT = tmpRoot;
  });
  afterEach(() => {
    rmSync(tmpRoot, { recursive: true, force: true });
    if (prevEnv === undefined) delete process.env.LANDSRAAD_COUNCIL_ROOT;
    else process.env.LANDSRAAD_COUNCIL_ROOT = prevEnv;
  });

  it('on empty cwd reports all adds, no overwrites', async () => {
    const plan = await planApply(validTemplate);
    expect(plan.council).toEqual({ exists: false, willOverwrite: false });
    expect(plan.councillors).toEqual({ add: ['mocky'], overwrite: [] });
    expect(plan.memory.add).toEqual(['house-rules']);
    expect(plan.memory.overwrite).toEqual([]);
    expect(plan.sample_jobs).toEqual({ add: 1, skipped_because_jobs_exist: false });
  });

  it('on existing council with same-slug councillor reports overwrite', async () => {
    await createCouncil({ name: 'Existing' });
    await createCouncillor({ name: 'Mocky', role: 'orig', adapter: 'mock:local', persona: 'orig' });
    const plan = await planApply(validTemplate);
    expect(plan.council).toEqual({ exists: true, willOverwrite: true });
    expect(plan.councillors.overwrite).toEqual(['mocky']);
    expect(plan.councillors.add).toEqual([]);
  });

  it('reports sample_jobs skipped when council has any jobs', async () => {
    await createCouncil({ name: 'Existing' });
    await createCouncillor({ name: 'Mocky', role: 'r', adapter: 'mock:local', persona: 'p' });
    await createJob({ title: 'pre-existing', brief: 'b', councillor_slug: 'mocky' });
    const plan = await planApply(validTemplate);
    expect(plan.sample_jobs).toEqual({ add: 0, skipped_because_jobs_exist: true });
  });

  it('reports memory overwrite for same-slug note', async () => {
    await createCouncil({ name: 'Existing' });
    await createNote({ title: 'House Rules', body: '- different\n' });
    const plan = await planApply(validTemplate);
    expect(plan.memory.overwrite).toEqual(['house-rules']);
    expect(plan.memory.add).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests, confirm fail**

Run: `npx vitest run src/lib/server/templates.test.ts -t planApply`
Expected: FAIL — `planApply` not exported.

- [ ] **Step 3: Implement `planApply`**

Append to `src/lib/server/templates.ts`:

```ts
import { hasCouncil } from './councils';
import { listCouncillors } from './councillors';
import { listNotes } from './memory';
import { listJobs } from './jobs';

function memoryNoteSlug(n: TemplateMemoryNote): string {
  return slugify(n.title);
}

export async function planApply(t: CouncilTemplate): Promise<ApplyPlan> {
  const exists = hasCouncil();
  const existingCouncillorSlugs = exists
    ? new Set((await listCouncillors()).map((c) => c.slug))
    : new Set<string>();
  const existingMemorySlugs = exists
    ? new Set((await listNotes()).map((n) => n.slug))
    : new Set<string>();
  const jobsCount = exists ? (await listJobs()).length : 0;

  const cAdd: string[] = [];
  const cOver: string[] = [];
  for (const c of t.councillors) {
    const slug = derivedSlug(c);
    (existingCouncillorSlugs.has(slug) ? cOver : cAdd).push(slug);
  }

  const mAdd: string[] = [];
  const mOver: string[] = [];
  for (const n of t.memory ?? []) {
    const slug = memoryNoteSlug(n);
    (existingMemorySlugs.has(slug) ? mOver : mAdd).push(slug);
  }

  const sampleJobsRequested = (t.sample_jobs ?? []).length;
  const sample_jobs = jobsCount > 0
    ? { add: 0, skipped_because_jobs_exist: true }
    : { add: sampleJobsRequested, skipped_because_jobs_exist: false };

  return {
    council: { exists, willOverwrite: exists },
    councillors: { add: cAdd, overwrite: cOver },
    memory: { add: mAdd, overwrite: mOver },
    sample_jobs
  };
}
```

- [ ] **Step 4: Run tests, confirm pass**

Run: `npx vitest run src/lib/server/templates.test.ts -t planApply`
Expected: PASS — all 4 planApply tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/templates.ts src/lib/server/templates.test.ts
git commit -m "templates: planApply (pure diff vs current council state)"
```

---

## Task 5: `applyTemplate` (mutating; needs confirmation on overwrite)

**Files:**
- Modify: `src/lib/server/templates.ts`
- Modify: `src/lib/server/templates.test.ts`

- [ ] **Step 1: Write failing tests**

Append to `src/lib/server/templates.test.ts`:

```ts
import { readCouncil, updateCouncil } from './councils';
import { readCouncillor, listCouncillors as listCs } from './councillors';
import { readNote, listNotes as listN } from './memory';
import { listJobs as listJ } from './jobs';
import { applyTemplate, TemplateNeedsConfirmation } from './templates';

describe('applyTemplate (empty cwd)', () => {
  let tmpRoot: string;
  let prevEnv: string | undefined;
  beforeEach(() => {
    prevEnv = process.env.LANDSRAAD_COUNCIL_ROOT;
    tmpRoot = mkdtempSync(join(tmpdir(), 'at-'));
    process.env.LANDSRAAD_COUNCIL_ROOT = tmpRoot;
  });
  afterEach(() => {
    rmSync(tmpRoot, { recursive: true, force: true });
    if (prevEnv === undefined) delete process.env.LANDSRAAD_COUNCIL_ROOT;
    else process.env.LANDSRAAD_COUNCIL_ROOT = prevEnv;
  });

  it('creates council, councillors, memory, sample jobs', async () => {
    await applyTemplate(validTemplate, { confirmedOverwrite: false });
    const council = await readCouncil();
    expect(council.name).toBe('Test');
    expect(council.template).toBe('Test Council@0.1.0');

    const cs = await listCs();
    expect(cs.map((c) => c.slug)).toEqual(['mocky']);
    expect(cs[0].persona).toBe('You are Mocky.');

    const notes = await listN();
    expect(notes.map((n) => n.slug)).toEqual(['house-rules']);

    const jobs = await listJ();
    expect(jobs).toHaveLength(1);
    expect(jobs[0].status).toBe('queued');
    expect(jobs[0].title).toBe('Hello');
    expect(jobs[0].councillor_slug).toBe('mocky');
  });
});

describe('applyTemplate (existing council, conflicts)', () => {
  let tmpRoot: string;
  let prevEnv: string | undefined;
  beforeEach(async () => {
    prevEnv = process.env.LANDSRAAD_COUNCIL_ROOT;
    tmpRoot = mkdtempSync(join(tmpdir(), 'at2-'));
    process.env.LANDSRAAD_COUNCIL_ROOT = tmpRoot;
    await createCouncil({ name: 'Existing', description: 'orig' });
    await createCouncillor({ name: 'Mocky', role: 'orig', adapter: 'mock:local', persona: 'orig' });
  });
  afterEach(() => {
    rmSync(tmpRoot, { recursive: true, force: true });
    if (prevEnv === undefined) delete process.env.LANDSRAAD_COUNCIL_ROOT;
    else process.env.LANDSRAAD_COUNCIL_ROOT = prevEnv;
  });

  it('throws TemplateNeedsConfirmation when not confirmed', async () => {
    await expect(
      applyTemplate(validTemplate, { confirmedOverwrite: false })
    ).rejects.toThrow(TemplateNeedsConfirmation);
  });

  it('replaces conflicting councillor persona when confirmed', async () => {
    await applyTemplate(validTemplate, { confirmedOverwrite: true });
    const c = await readCouncillor('mocky');
    expect(c.persona).toBe('You are Mocky.');
    expect(c.role).toBe('echo');
  });

  it('skips sample_jobs when jobs already exist', async () => {
    await createJob({ title: 'pre', brief: 'b', councillor_slug: 'mocky' });
    const before = (await listJ()).length;
    await applyTemplate(validTemplate, { confirmedOverwrite: true });
    const after = (await listJ()).length;
    expect(after).toBe(before);
  });

  it('never touches existing jobs/ run artifacts', async () => {
    const j = await createJob({ title: 'pre', brief: 'b', councillor_slug: 'mocky' });
    await applyTemplate(validTemplate, { confirmedOverwrite: true });
    const jobs = await listJ();
    expect(jobs.find((x) => x.id === j.id)).toBeDefined();
  });

  it('overwrites council meta to template values (slug follows new name)', async () => {
    // updateCouncil re-derives slug from name. Council slug is metadata only;
    // the council root is the cwd, so changing the slug is safe.
    await applyTemplate(validTemplate, { confirmedOverwrite: true });
    const c = await readCouncil();
    expect(c.name).toBe('Test');
    expect(c.slug).toBe('test');
    expect(c.description).toBe('desc');
    expect(c.template).toBe('Test Council@0.1.0');
  });
});
```

- [ ] **Step 2: Run tests, confirm fail**

Run: `npx vitest run src/lib/server/templates.test.ts -t applyTemplate`
Expected: FAIL — `applyTemplate` not exported.

- [ ] **Step 3: Implement `applyTemplate`**

Append to `src/lib/server/templates.ts`:

```ts
import { createCouncil, updateCouncil } from './councils';
import { createCouncillor, updateCouncillor } from './councillors';
import { createNote, updateNote } from './memory';
import { createJob } from './jobs';

function provenance(t: CouncilTemplate): string {
  return `${t.name}@${t.version}`;
}

export async function applyTemplate(
  t: CouncilTemplate,
  opts: { confirmedOverwrite: boolean }
): Promise<ApplyPlan> {
  const plan = await planApply(t);
  const needsConfirm =
    plan.council.willOverwrite ||
    plan.councillors.overwrite.length > 0 ||
    plan.memory.overwrite.length > 0;
  if (needsConfirm && !opts.confirmedOverwrite) {
    throw new TemplateNeedsConfirmation(plan);
  }

  // 1. Council meta.
  if (plan.council.exists) {
    await updateCouncil({
      name: t.council.name,
      description: t.council.description ?? '',
      template: provenance(t)
    });
  } else {
    await createCouncil({
      name: t.council.name,
      description: t.council.description ?? '',
      template: provenance(t)
    });
  }

  // 2. Councillors (overwrite or create).
  const overwriteSet = new Set(plan.councillors.overwrite);
  for (const c of t.councillors) {
    const slug = derivedSlug(c);
    if (overwriteSet.has(slug)) {
      await updateCouncillor(slug, {
        name: c.name,
        role: c.role,
        routing_hint: c.routing_hint,
        adapter: c.adapter,
        persona: c.persona,
        reflect: c.reflect
      });
    } else {
      await createCouncillor({
        name: c.name,
        role: c.role,
        routing_hint: c.routing_hint,
        adapter: c.adapter,
        persona: c.persona,
        reflect: c.reflect
      });
    }
  }

  // 3. Memory (overwrite or create).
  const memOverwriteSet = new Set(plan.memory.overwrite);
  for (const n of t.memory ?? []) {
    const slug = memoryNoteSlug(n);
    if (memOverwriteSet.has(slug)) {
      await updateNote(slug, n.body);
    } else {
      await createNote({ title: n.title, body: n.body });
    }
  }

  // 4. Sample jobs (only if jobs dir is empty per plan).
  if (!plan.sample_jobs.skipped_because_jobs_exist) {
    for (const j of t.sample_jobs ?? []) {
      await createJob({
        title: j.title,
        brief: j.brief,
        councillor_slug: j.councillor_slug
      });
    }
  }

  return plan;
}
```

- [ ] **Step 4: Run tests, confirm pass**

Run: `npx vitest run src/lib/server/templates.test.ts`
Expected: PASS — all applyTemplate tests pass; earlier tests still pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/templates.ts src/lib/server/templates.test.ts
git commit -m "templates: applyTemplate w/ per-entity overwrite + jobs preservation"
```

---

## Task 6: `exportSelection` (read side) + round-trip test

**Files:**
- Modify: `src/lib/server/templates.ts`
- Modify: `src/lib/server/templates.test.ts`

- [ ] **Step 1: Write failing tests**

Append to `src/lib/server/templates.test.ts`:

```ts
import { exportSelection } from './templates';

describe('exportSelection', () => {
  let tmpRoot: string;
  let prevEnv: string | undefined;
  beforeEach(async () => {
    prevEnv = process.env.LANDSRAAD_COUNCIL_ROOT;
    tmpRoot = mkdtempSync(join(tmpdir(), 'ex-'));
    process.env.LANDSRAAD_COUNCIL_ROOT = tmpRoot;
    await createCouncil({ name: 'Source' });
    await createCouncillor({ name: 'Mocky', role: 'r', adapter: 'mock:local', persona: 'p' });
    await createCouncillor({ name: 'Polly', role: 'r2', adapter: 'mock:local', persona: 'p2' });
    await createNote({ title: 'House Rules', body: '- rule\n' });
    await createJob({ title: 'Sample', brief: 'do thing', councillor_slug: 'mocky' });
  });
  afterEach(() => {
    rmSync(tmpRoot, { recursive: true, force: true });
    if (prevEnv === undefined) delete process.env.LANDSRAAD_COUNCIL_ROOT;
    else process.env.LANDSRAAD_COUNCIL_ROOT = prevEnv;
  });

  it('exports selected councillors, no memory, no jobs', async () => {
    const t = await exportSelection({
      council: { name: 'Exported', version: '0.1.0' },
      councillor_slugs: ['mocky'],
      memory_slugs: [],
      sample_job_ids: []
    });
    expect(t.name).toBe('Exported');
    expect(t.councillors.map((c) => c.slug ?? slugify(c.name))).toEqual(['mocky']);
    expect(t.memory ?? []).toEqual([]);
    expect(t.sample_jobs ?? []).toEqual([]);
  });

  it('includes only queued sample jobs that are selected', async () => {
    const jobs = await listJ();
    const sampleId = jobs[0].id;
    const t = await exportSelection({
      council: { name: 'Exported', version: '0.1.0' },
      councillor_slugs: ['mocky'],
      memory_slugs: [],
      sample_job_ids: [sampleId]
    });
    expect(t.sample_jobs).toHaveLength(1);
    expect(t.sample_jobs?.[0].title).toBe('Sample');
    expect(t.sample_jobs?.[0].councillor_slug).toBe('mocky');
  });

  it('round-trip: export -> load -> apply into fresh cwd', async () => {
    const exported = await exportSelection({
      council: { name: 'RT', version: '0.1.0', description: 'rt' },
      councillor_slugs: ['mocky', 'polly'],
      memory_slugs: ['house-rules'],
      sample_job_ids: []
    });
    const json = JSON.stringify(exported);

    // Switch to a fresh cwd.
    const freshRoot = mkdtempSync(join(tmpdir(), 'ex-fresh-'));
    process.env.LANDSRAAD_COUNCIL_ROOT = freshRoot;
    try {
      const reparsed = parseTemplate(json);
      await applyTemplate(reparsed, { confirmedOverwrite: false });
      expect((await readCouncil()).name).toBe('RT');
      expect((await listCs()).map((c) => c.slug).sort()).toEqual(['mocky', 'polly']);
      expect((await listN()).map((n) => n.slug)).toEqual(['house-rules']);
    } finally {
      rmSync(freshRoot, { recursive: true, force: true });
    }
  });
});
```

- [ ] **Step 2: Run tests, confirm fail**

Run: `npx vitest run src/lib/server/templates.test.ts -t exportSelection`
Expected: FAIL — `exportSelection` not exported.

- [ ] **Step 3: Implement `exportSelection`**

Append to `src/lib/server/templates.ts`:

```ts
import { readCouncillor } from './councillors';
import { readNote } from './memory';
import { readJob } from './jobs';

export interface ExportSelection {
  council: {
    name: string;
    version: string;
    description?: string;
    author?: string;
    license?: string;
  };
  councillor_slugs: string[];
  memory_slugs: string[];
  sample_job_ids: string[];
}

export async function exportSelection(s: ExportSelection): Promise<CouncilTemplate> {
  const current = await readCouncil();

  const councillors: TemplateCouncillor[] = [];
  for (const slug of s.councillor_slugs) {
    const c = await readCouncillor(slug);
    councillors.push({
      slug: c.slug,
      name: c.name,
      role: c.role,
      routing_hint: c.routing_hint || undefined,
      adapter: c.adapter,
      persona: c.persona,
      reflect: c.reflect
    });
  }

  const memory: TemplateMemoryNote[] = [];
  for (const slug of s.memory_slugs) {
    const n = await readNote(slug);
    memory.push({ title: n.title, body: n.body });
  }

  const sample_jobs: TemplateSampleJob[] = [];
  for (const id of s.sample_job_ids) {
    const j = await readJob(id);
    if (j.status !== 'queued') continue; // never export run artifacts
    sample_jobs.push({
      title: j.title,
      brief: j.brief,
      councillor_slug: j.councillor_slug
    });
  }

  return {
    format_version: 1,
    name: s.council.name,
    version: s.council.version,
    description: s.council.description,
    author: s.council.author,
    license: s.council.license,
    council: {
      name: current.name,
      description: current.description || undefined
    },
    councillors,
    memory: memory.length ? memory : undefined,
    sample_jobs: sample_jobs.length ? sample_jobs : undefined
  };
}
```

- [ ] **Step 4: Run tests, confirm pass**

Run: `npx vitest run src/lib/server/templates.test.ts`
Expected: PASS — all tests in the file pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/templates.ts src/lib/server/templates.test.ts
git commit -m "templates: exportSelection + round-trip test"
```

---

## Task 7: Bundle `templates/dogfood.template.json`, delete old script, rewrite `dogfood:init`

**Files:**
- Create: `templates/dogfood.template.json`
- Delete: `scripts/dogfood-init.ts`
- Modify: `package.json`

- [ ] **Step 1: Write the dogfood template JSON**

Create `templates/dogfood.template.json`:

```json
{
  "format_version": 1,
  "name": "Dogfood",
  "version": "1.0.0",
  "description": "Built-in council used to exercise Landsraad locally.",
  "license": "MIT",
  "council": {
    "name": "Dogfood",
    "description": "Built-in council used to exercise Landsraad locally."
  },
  "councillors": [
    {
      "name": "Mocky",
      "role": "Echo test councillor",
      "adapter": "mock:local",
      "persona": "You are Mocky, a mock councillor that simply echoes its prompt back. Useful for end-to-end verification."
    },
    {
      "name": "Polly",
      "role": "Second mock councillor",
      "adapter": "mock:local",
      "persona": "You are Polly. You acknowledge requests succinctly and confirm receipt."
    }
  ],
  "memory": [
    {
      "title": "House Rules",
      "body": "- Be concise.\n- Cite assumptions explicitly.\n- Never invent facts about the user.\n"
    }
  ],
  "sample_jobs": [
    {
      "title": "Hello world",
      "brief": "Greet the council in one short paragraph.",
      "councillor_slug": "mocky"
    }
  ]
}
```

- [ ] **Step 2: Delete the old imperative seeder**

Run: `git rm scripts/dogfood-init.ts`

- [ ] **Step 3: Rewrite the `dogfood:init` npm script**

Edit `package.json` `scripts` block — replace the existing `dogfood:init` line so the block becomes:

```json
"scripts": {
  "dev": "vite dev",
  "build": "vite build",
  "preview": "vite preview",
  "start": "node build/index.js",
  "check": "svelte-kit sync && svelte-check --tsconfig ./tsconfig.json",
  "test": "vitest run",
  "test:watch": "vitest",
  "dogfood:init": "vite-node scripts/template-install.ts -- templates/dogfood.template.json --target ./dogfood --yes",
  "template:install": "vite-node scripts/template-install.ts --",
  "template:export": "vite-node scripts/template-export.ts --",
  "reindex": "vite-node scripts/reindex.ts"
}
```

Note: `scripts/template-install.ts` is created in Task 8. `npm run dogfood:init` will fail until Task 8 is committed — that's expected for an incremental plan.

- [ ] **Step 4: Commit**

```bash
git add templates/dogfood.template.json package.json
git rm --cached scripts/dogfood-init.ts 2>/dev/null || true
git commit -m "templates: bundle dogfood template, remove imperative seeder"
```

(`git rm` in step 2 already staged the deletion; the explicit `git rm --cached` is a no-op safety net in case of a re-run.)

---

## Task 8: `scripts/template-install.ts` (CLI with readline confirm)

**Files:**
- Create: `scripts/template-install.ts`

This script is invoked as `vite-node scripts/template-install.ts -- <source> [--target <dir>] [--yes]`. Anything after `--` is the script's own argv.

- [ ] **Step 1: Write the install script**

Create `scripts/template-install.ts`:

```ts
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

interface Args {
  source: string;
  target?: string;
  yes: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { source: '', yes: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--yes' || a === '-y') args.yes = true;
    else if (a === '--target' || a === '-t') args.target = argv[++i];
    else if (!args.source) args.source = a;
    else throw new Error(`Unexpected extra arg: ${a}`);
  }
  if (!args.source) {
    throw new Error('Usage: landsraad init <url-or-path> [--target <dir>] [--yes]');
  }
  return args;
}

function describePlan(plan: import('../src/lib/server/templates').ApplyPlan): string {
  const lines: string[] = [];
  if (plan.council.exists && plan.council.willOverwrite) {
    lines.push('~ council meta will be replaced');
  } else if (!plan.council.exists) {
    lines.push('+ create council');
  }
  for (const s of plan.councillors.add) lines.push(`+ councillor: ${s}`);
  for (const s of plan.councillors.overwrite) lines.push(`~ councillor (overwrite): ${s}`);
  for (const s of plan.memory.add) lines.push(`+ memory note: ${s}`);
  for (const s of plan.memory.overwrite) lines.push(`~ memory note (overwrite): ${s}`);
  if (plan.sample_jobs.skipped_because_jobs_exist) {
    lines.push('• sample_jobs: skipped (jobs/ already non-empty)');
  } else if (plan.sample_jobs.add > 0) {
    lines.push(`+ sample jobs: ${plan.sample_jobs.add}`);
  }
  return lines.join('\n');
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.target) {
    const abs = resolve(process.cwd(), args.target);
    if (!existsSync(abs)) await mkdir(abs, { recursive: true });
    process.env.LANDSRAAD_COUNCIL_ROOT = abs;
  }

  const { loadTemplate, planApply, applyTemplate, TemplateNeedsConfirmation } =
    await import('../src/lib/server/templates');

  const t = await loadTemplate(args.source);
  const plan = await planApply(t);
  const requiresConfirm =
    plan.council.willOverwrite ||
    plan.councillors.overwrite.length > 0 ||
    plan.memory.overwrite.length > 0;

  console.log(`Template: ${t.name}@${t.version}`);
  console.log(describePlan(plan));

  if (requiresConfirm && !args.yes) {
    const rl = createInterface({ input, output });
    const ans = (await rl.question('Proceed? [y/N] ')).trim().toLowerCase();
    rl.close();
    if (ans !== 'y' && ans !== 'yes') {
      console.log('Aborted.');
      process.exit(1);
    }
  }

  try {
    await applyTemplate(t, { confirmedOverwrite: requiresConfirm });
  } catch (err) {
    if (err instanceof TemplateNeedsConfirmation) {
      console.error('Confirmation required but not provided.');
      process.exit(2);
    }
    throw err;
  }
  console.log('Done.');
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
```

- [ ] **Step 2: Verify the dogfood seed path works end-to-end**

Run (from a fresh temp dir to avoid polluting the repo): `npm run dogfood:init`
Expected: prints `Template: Dogfood@1.0.0` then plan lines, then `Done.`. A `./dogfood/` directory now contains `council.json`, `councillors/mocky/`, `councillors/polly/`, `memory/house-rules.md`, `jobs/<id>-hello-world/`.

Cleanup: `rm -rf ./dogfood`

- [ ] **Step 3: Commit**

```bash
git add scripts/template-install.ts
git commit -m "templates: CLI install script w/ readline confirm"
```

---

## Task 9: `scripts/template-export.ts` (interactive picker)

**Files:**
- Create: `scripts/template-export.ts`

- [ ] **Step 1: Write the export script**

Create `scripts/template-export.ts`:

```ts
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

interface Args {
  out: string;
  all: boolean;
  councillorsOnly: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { out: '', all: false, councillorsOnly: false };
  for (const a of argv) {
    if (a === '--all') args.all = true;
    else if (a === '--councillors-only') args.councillorsOnly = true;
    else if (!args.out) args.out = a;
    else throw new Error(`Unexpected extra arg: ${a}`);
  }
  if (!args.out) {
    throw new Error('Usage: landsraad export <out.json> [--all | --councillors-only]');
  }
  return args;
}

async function pick<T extends { id?: string; slug?: string; title?: string; name?: string }>(
  rl: import('node:readline/promises').Interface,
  label: string,
  items: T[],
  idKey: 'id' | 'slug',
  defaultIncluded: boolean
): Promise<string[]> {
  if (items.length === 0) return [];
  console.log(`\n${label}:`);
  items.forEach((it, i) => {
    const id = (it as Record<string, string>)[idKey];
    const display = it.name ?? it.title ?? id;
    console.log(`  [${i + 1}] ${display} (${id})`);
  });
  const prompt = defaultIncluded
    ? 'Include which? (comma-separated indexes, "all", or blank to include all): '
    : 'Include which? (comma-separated indexes, "all", or blank to skip): ';
  const ans = (await rl.question(prompt)).trim();
  if (ans === '' && defaultIncluded) return items.map((it) => (it as Record<string, string>)[idKey]);
  if (ans === '') return [];
  if (ans.toLowerCase() === 'all') return items.map((it) => (it as Record<string, string>)[idKey]);
  const idxs = ans.split(',').map((s) => parseInt(s.trim(), 10) - 1);
  return idxs.filter((i) => i >= 0 && i < items.length).map((i) => (items[i] as Record<string, string>)[idKey]);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const { listCouncillors } = await import('../src/lib/server/councillors');
  const { listNotes } = await import('../src/lib/server/memory');
  const { listJobs } = await import('../src/lib/server/jobs');
  const { exportSelection } = await import('../src/lib/server/templates');

  const [councillors, notes, jobs] = await Promise.all([
    listCouncillors(),
    listNotes(),
    listJobs()
  ]);
  const queued = jobs.filter((j) => j.status === 'queued');

  let councillorSlugs: string[];
  let memorySlugs: string[];
  let jobIds: string[];
  let meta: { name: string; version: string; description?: string; author?: string; license?: string };

  if (args.all || args.councillorsOnly) {
    councillorSlugs = councillors.map((c) => c.slug);
    memorySlugs = args.all ? notes.map((n) => n.slug) : [];
    jobIds = args.all ? queued.map((j) => j.id) : [];
    meta = { name: 'untitled', version: '0.1.0' };
  } else {
    const rl = createInterface({ input, output });
    meta = {
      name: (await rl.question('Template name: ')).trim() || 'untitled',
      version: (await rl.question('Version (e.g. 0.1.0): ')).trim() || '0.1.0',
      description: (await rl.question('Description (optional): ')).trim() || undefined,
      author: (await rl.question('Author (optional): ')).trim() || undefined,
      license: (await rl.question('License (optional): ')).trim() || undefined
    };
    councillorSlugs = await pick(rl, 'Councillors', councillors, 'slug', true);
    memorySlugs = await pick(rl, 'Memory notes', notes, 'slug', false);
    jobIds = await pick(rl, 'Queued sample jobs', queued, 'id', false);
    rl.close();
  }

  const template = await exportSelection({
    council: meta,
    councillor_slugs: councillorSlugs,
    memory_slugs: memorySlugs,
    sample_job_ids: jobIds
  });

  const outPath = resolve(process.cwd(), args.out);
  await writeFile(outPath, JSON.stringify(template, null, 2) + '\n', 'utf8');
  console.log(`Wrote ${outPath}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
```

- [ ] **Step 2: Manual smoke test**

Run (from a council directory, e.g. after the dogfood seed in Task 8):
```bash
cd dogfood
npm --prefix .. run template:export -- exported.json --all
```
Expected: writes `dogfood/exported.json`; file has `format_version: 1`, two councillors, one memory note, one sample job.

Cleanup: `rm -rf dogfood`

- [ ] **Step 3: Commit**

```bash
git add scripts/template-export.ts
git commit -m "templates: CLI export script w/ interactive picker"
```

---

## Task 10: `bin/landsraad.js` subcommand dispatcher

**Files:**
- Modify: `bin/landsraad.js`

- [ ] **Step 1: Rewrite the bin entry to dispatch**

Replace the entirety of `bin/landsraad.js` with:

```js
#!/usr/bin/env node
// Entry point for `npx landsraad`.
//   landsraad                    -> start production SvelteKit server
//   landsraad init <source> ...  -> install a council template
//   landsraad export <out> ...   -> export the current council to a template

import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');

const [, , sub, ...rest] = process.argv;

function runScript(scriptRel) {
  const child = spawn(
    process.execPath,
    [resolve(repoRoot, 'node_modules', 'vite-node', 'vite-node.mjs'), scriptRel, '--', ...rest],
    { stdio: 'inherit', env: process.env, cwd: process.cwd() }
  );
  child.on('exit', (code) => process.exit(code ?? 0));
}

if (sub === 'init') {
  runScript(resolve(repoRoot, 'scripts', 'template-install.ts'));
} else if (sub === 'export') {
  runScript(resolve(repoRoot, 'scripts', 'template-export.ts'));
} else {
  // Default: start the server.
  const buildEntry = resolve(repoRoot, 'build', 'index.js');
  if (!existsSync(buildEntry)) {
    console.error(
      'Landsraad has not been built yet.\n' +
        'From the repo root, run:\n' +
        '  npm install\n' +
        '  npm run build\n' +
        '  npm start\n\n' +
        'Or for development: npm run dev'
    );
    process.exit(1);
  }
  const child = spawn(process.execPath, [buildEntry], { stdio: 'inherit', env: process.env });
  child.on('exit', (code) => process.exit(code ?? 0));
}
```

- [ ] **Step 2: Manual test — default still starts the server message**

Run: `node bin/landsraad.js`
Expected: same "not been built yet" error as before (unless `build/` exists, in which case it starts the server).

- [ ] **Step 3: Manual test — init subcommand dispatches**

Run (from a temp dir): `node /full/path/to/repo/bin/landsraad.js init /full/path/to/repo/templates/dogfood.template.json --yes`
Expected: same output as `npm run dogfood:init`, creating a council in the current dir.

Cleanup: remove the council files in the temp dir.

- [ ] **Step 4: Commit**

```bash
git add bin/landsraad.js
git commit -m "bin: dispatch init/export subcommands to template scripts"
```

---

## Task 11: `/import` route (server actions + UI)

**Files:**
- Create: `src/routes/import/+page.server.ts`
- Create: `src/routes/import/+page.svelte`

- [ ] **Step 1: Write the server actions**

Create `src/routes/import/+page.server.ts`:

```ts
import { fail, redirect } from '@sveltejs/kit';
import {
  applyTemplate,
  loadTemplate,
  parseTemplate,
  TemplateFetchError,
  TemplateNeedsConfirmation,
  TemplateParseError,
  TemplateValidationError,
  type ApplyPlan,
  type CouncilTemplate
} from '$lib/server/templates';
import type { Actions } from './$types';

const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;

async function readFormSource(formData: FormData): Promise<CouncilTemplate> {
  const source = String(formData.get('source') ?? '').trim();
  const file = formData.get('file');
  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_UPLOAD_BYTES) {
      throw new TemplateFetchError(`Uploaded file exceeds 2 MB cap (${file.size} bytes).`);
    }
    const text = await file.text();
    return parseTemplate(text);
  }
  if (!source) throw new TemplateValidationError('Provide a URL, path, or upload a file.');
  return loadTemplate(source);
}

function errorMessage(err: unknown): string {
  if (
    err instanceof TemplateFetchError ||
    err instanceof TemplateParseError ||
    err instanceof TemplateValidationError
  ) {
    return err.message;
  }
  return err instanceof Error ? err.message : 'Unknown error';
}

export const actions: Actions = {
  preview: async ({ request }) => {
    const form = await request.formData();
    let t: CouncilTemplate;
    try {
      t = await readFormSource(form);
    } catch (err) {
      return fail(400, {
        error: errorMessage(err),
        source: String(form.get('source') ?? '')
      });
    }
    const { planApply } = await import('$lib/server/templates');
    const plan: ApplyPlan = await planApply(t);
    return {
      preview: true as const,
      plan,
      template: t,
      templateJson: JSON.stringify(t),
      summary: `${t.name}@${t.version}`
    };
  },

  apply: async ({ request }) => {
    const form = await request.formData();
    const json = String(form.get('templateJson') ?? '');
    if (!json) return fail(400, { error: 'Missing template JSON on confirm.' });
    let t: CouncilTemplate;
    try {
      t = parseTemplate(json);
    } catch (err) {
      return fail(400, { error: errorMessage(err) });
    }
    try {
      await applyTemplate(t, { confirmedOverwrite: true });
    } catch (err) {
      if (err instanceof TemplateNeedsConfirmation) {
        return fail(400, { error: 'Confirmation lost; please re-preview.' });
      }
      return fail(500, { error: errorMessage(err) });
    }
    throw redirect(303, '/');
  }
};
```

- [ ] **Step 2: Write the page UI**

Create `src/routes/import/+page.svelte`:

```svelte
<script lang="ts">
  import type { ActionData } from './$types';
  let { form }: { form: ActionData } = $props();
</script>

<section>
  <h1>Install a council template</h1>

  {#if form?.error}<div class="error">{form.error}</div>{/if}

  {#if !form?.preview}
    <form method="POST" action="?/preview" enctype="multipart/form-data" class="form">
      <label>
        <span>URL or local path</span>
        <input name="source" placeholder="https://example.com/foo.template.json or ./local.json" value={form?.source ?? ''} />
      </label>
      <p class="meta">or</p>
      <label>
        <span>Upload a JSON template</span>
        <input type="file" name="file" accept="application/json" />
      </label>
      <div class="actions">
        <button type="submit" class="btn primary">Preview</button>
        <a href="/" class="btn">Cancel</a>
      </div>
    </form>
  {:else}
    {@const plan = form.plan}
    <h2>Plan for {form.summary}</h2>
    <ul class="plan">
      {#if plan.council.exists && plan.council.willOverwrite}<li>~ council meta will be replaced</li>{/if}
      {#if !plan.council.exists}<li>+ create council</li>{/if}
      {#each plan.councillors.add as s}<li>+ councillor: {s}</li>{/each}
      {#each plan.councillors.overwrite as s}<li>~ councillor (overwrite): {s}</li>{/each}
      {#each plan.memory.add as s}<li>+ memory note: {s}</li>{/each}
      {#each plan.memory.overwrite as s}<li>~ memory note (overwrite): {s}</li>{/each}
      {#if plan.sample_jobs.skipped_because_jobs_exist}
        <li>• sample_jobs: skipped (jobs/ already non-empty)</li>
      {:else if plan.sample_jobs.add > 0}
        <li>+ sample jobs: {plan.sample_jobs.add}</li>
      {/if}
    </ul>
    <form method="POST" action="?/apply">
      <input type="hidden" name="templateJson" value={form.templateJson} />
      <div class="actions">
        <button type="submit" class="btn primary">Confirm install</button>
        <a href="/import" class="btn">Cancel</a>
      </div>
    </form>
  {/if}
</section>

<style>
  .form { display: grid; gap: 1rem; max-width: 560px; margin-top: 1rem; }
  label { display: grid; gap: 0.35rem; }
  label > span { color: var(--muted); font-size: 0.9em; }
  input[type="text"], input:not([type]) {
    background: #1a1d24; color: var(--fg);
    border: 1px solid var(--border); border-radius: 6px; padding: 0.55rem 0.7rem;
  }
  .actions { display: flex; gap: 0.5rem; }
  .meta { color: var(--muted); font-size: 0.9em; margin: 0; }
  .error { background: rgba(210,114,114,0.15); border: 1px solid var(--danger); color: var(--danger); padding: 0.6rem 0.8rem; border-radius: 6px; }
  .plan { list-style: none; padding: 0.5rem 1rem; border: 1px solid var(--border); border-radius: 6px; background: rgba(255,255,255,0.01); }
  .btn { display: inline-block; padding: 0.5rem 0.9rem; border-radius: 6px; border: 1px solid var(--border); text-decoration: none; color: var(--fg); background: transparent; cursor: pointer; }
  .btn.primary { background: var(--accent); color: #0f1115; border-color: var(--accent); font-weight: 600; }
</style>
```

- [ ] **Step 3: Manual smoke test**

Start dev server with a temp council root:
```bash
LANDSRAAD_COUNCIL_ROOT=/tmp/lt-import npm run dev
```
Open `/import`, upload `templates/dogfood.template.json`, click Preview → plan renders, click Confirm install → redirects to `/`.

Cleanup: `rm -rf /tmp/lt-import`

- [ ] **Step 4: Type-check passes**

Run: `npm run check`
Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add src/routes/import
git commit -m "ui: /import route w/ preview + confirm + file upload"
```

---

## Task 12: `/export` route (picker + JSON download)

**Files:**
- Create: `src/routes/export/+page.server.ts`
- Create: `src/routes/export/+page.svelte`

- [ ] **Step 1: Write the server action + loader**

Create `src/routes/export/+page.server.ts`:

```ts
import { error } from '@sveltejs/kit';
import { hasCouncil } from '$lib/server/councils';
import { listCouncillors } from '$lib/server/councillors';
import { listNotes } from '$lib/server/memory';
import { listJobs } from '$lib/server/jobs';
import { exportSelection } from '$lib/server/templates';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
  if (!hasCouncil()) throw error(404, 'No council in this directory.');
  const [councillors, notes, jobs] = await Promise.all([
    listCouncillors(),
    listNotes(),
    listJobs()
  ]);
  return {
    councillors,
    notes,
    queuedJobs: jobs.filter((j) => j.status === 'queued')
  };
};

export const actions: Actions = {
  download: async ({ request }) => {
    const form = await request.formData();
    const name = String(form.get('name') ?? '').trim() || 'untitled';
    const version = String(form.get('version') ?? '').trim() || '0.1.0';
    const description = String(form.get('description') ?? '').trim() || undefined;
    const author = String(form.get('author') ?? '').trim() || undefined;
    const license = String(form.get('license') ?? '').trim() || undefined;
    const councillor_slugs = form.getAll('councillors').map(String);
    const memory_slugs = form.getAll('memory').map(String);
    const sample_job_ids = form.getAll('jobs').map(String);

    const template = await exportSelection({
      council: { name, version, description, author, license },
      councillor_slugs,
      memory_slugs,
      sample_job_ids
    });
    const body = JSON.stringify(template, null, 2) + '\n';
    const filename = `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.template.json`;
    return new Response(body, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="${filename}"`
      }
    });
  }
};
```

Note: `action` returning a `Response` directly is supported by SvelteKit form actions (the runtime forwards it as-is when not a `fail`/`redirect`/object).

- [ ] **Step 2: Write the picker UI**

Create `src/routes/export/+page.svelte`:

```svelte
<script lang="ts">
  import type { PageData } from './$types';
  let { data }: { data: PageData } = $props();
</script>

<section>
  <h1>Export council as template</h1>
  <p class="meta">
    Templates are sharable JSON. Pick what's safe to include — memory and sample jobs default to off
    so you don't accidentally publish private notes.
  </p>

  <form method="POST" action="?/download" class="form">
    <fieldset>
      <legend>Template metadata</legend>
      <label><span>Name *</span><input name="name" required maxlength="80" /></label>
      <label><span>Version *</span><input name="version" required value="0.1.0" /></label>
      <label><span>Description</span><textarea name="description" rows="2"></textarea></label>
      <label><span>Author</span><input name="author" /></label>
      <label><span>License</span><input name="license" placeholder="e.g. MIT" /></label>
    </fieldset>

    <fieldset>
      <legend>Councillors (default: all)</legend>
      {#each data.councillors as c (c.slug)}
        <label class="check">
          <input type="checkbox" name="councillors" value={c.slug} checked />
          <span>{c.name} <code>({c.slug})</code></span>
        </label>
      {/each}
      {#if data.councillors.length === 0}<p class="meta">No councillors.</p>{/if}
    </fieldset>

    <fieldset>
      <legend>Memory notes (default: none)</legend>
      {#each data.notes as n (n.slug)}
        <label class="check">
          <input type="checkbox" name="memory" value={n.slug} />
          <span>{n.title} <code>({n.slug})</code></span>
        </label>
      {/each}
      {#if data.notes.length === 0}<p class="meta">No memory notes.</p>{/if}
    </fieldset>

    <fieldset>
      <legend>Sample jobs — queued only (default: none)</legend>
      {#each data.queuedJobs as j (j.id)}
        <label class="check">
          <input type="checkbox" name="jobs" value={j.id} />
          <span>{j.title} <code>({j.councillor_slug})</code></span>
        </label>
      {/each}
      {#if data.queuedJobs.length === 0}<p class="meta">No queued jobs.</p>{/if}
    </fieldset>

    <div class="actions">
      <button type="submit" class="btn primary">Download template JSON</button>
      <a href="/" class="btn">Cancel</a>
    </div>
  </form>
</section>

<style>
  .form { display: grid; gap: 1.25rem; max-width: 640px; margin-top: 1rem; }
  fieldset { border: 1px solid var(--border); border-radius: 6px; padding: 0.75rem 1rem; }
  legend { padding: 0 0.5rem; color: var(--muted); font-size: 0.9em; }
  label { display: grid; gap: 0.35rem; margin-bottom: 0.5rem; }
  label > span { color: var(--muted); font-size: 0.9em; }
  label.check { display: flex; gap: 0.5rem; align-items: center; }
  input[type="text"], input:not([type]), textarea {
    background: #1a1d24; color: var(--fg);
    border: 1px solid var(--border); border-radius: 6px; padding: 0.45rem 0.6rem;
  }
  .actions { display: flex; gap: 0.5rem; }
  .meta { color: var(--muted); font-size: 0.9em; margin: 0; }
  .btn { display: inline-block; padding: 0.5rem 0.9rem; border-radius: 6px; border: 1px solid var(--border); text-decoration: none; color: var(--fg); background: transparent; cursor: pointer; }
  .btn.primary { background: var(--accent); color: #0f1115; border-color: var(--accent); font-weight: 600; }
</style>
```

- [ ] **Step 3: Manual smoke test**

Start dev against the dogfood council, open `/export`, fill in `name=dogfood` `version=1.0.0`, leave defaults, click Download. Expected: browser downloads `dogfood.template.json` with two councillors, no memory, no jobs. Then re-export with memory + jobs ticked and verify they appear in the downloaded JSON.

- [ ] **Step 4: Type-check passes**

Run: `npm run check`
Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add src/routes/export
git commit -m "ui: /export route w/ opt-in picker, streams attachment"
```

---

## Task 13: Setup-page install panel + layout header links

**Files:**
- Modify: `src/routes/+page.svelte`
- Modify: `src/routes/+layout.svelte`

- [ ] **Step 1: Add "Install from template" link to the setup form**

Edit `src/routes/+page.svelte`. Find the `{#if !data.hasCouncil}` branch and append a small section under the existing form (after the closing `</form>` and before `</section>`):

```svelte
    <p class="or">— or —</p>
    <p>
      <a class="btn" href="/import">Install from template (URL or file)</a>
    </p>
```

Add a style rule alongside the existing `.form` style:

```css
  .or { color: var(--muted); margin: 1.25rem 0 0.5rem; text-align: center; max-width: 560px; }
```

- [ ] **Step 2: Add header links when a council exists**

Edit `src/routes/+layout.svelte`. Replace the existing `<header>...</header>` block with:

```svelte
<script lang="ts">
  import { page } from '$app/state';
  let { children } = $props();
</script>

<header>
  <a href="/" class="brand">Landsraad</a>
  {#if page.data?.hasCouncil}
    <nav class="links">
      <a href="/import">Install template</a>
      <a href="/export">Export…</a>
    </nav>
  {/if}
</header>

<main>
  {@render children?.()}
</main>
```

Add to the existing layout styles:

```css
  header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .links { display: flex; gap: 1rem; }
  .links a { color: var(--muted); text-decoration: none; font-size: 0.9em; }
  .links a:hover { color: var(--accent); }
```

(Replace the existing `header` rule; keep the rest of the layout styles intact.)

- [ ] **Step 3: Manual smoke test — setup → install → header appears**

```bash
rm -rf /tmp/lt-flow
LANDSRAAD_COUNCIL_ROOT=/tmp/lt-flow npm run dev
```
Open `/`. The setup form shows "Install from template (URL or file)" link. Click it → install dogfood template via upload. Redirected to `/` → council home renders, header now shows "Install template" and "Export…" links. Click "Export…" → picker loads with two councillors checked.

Cleanup: `rm -rf /tmp/lt-flow`

- [ ] **Step 4: Type-check + tests**

Run: `npm run check && npm test`
Expected: 0 type errors; all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/routes/+page.svelte src/routes/+layout.svelte
git commit -m "ui: setup-page install link + layout header Install/Export"
```

---

## Self-review

**Spec coverage:**
- Schema (§Template file format) → Task 1
- `parseTemplate` (§Loader) → Task 2
- `loadTemplate` w/ URL guards (§Loader) → Task 3
- `planApply` + per-entity overwrite rules (§Plan / Apply) → Task 4
- `applyTemplate` + confirmation gate + jobs-preserved + provenance (§Plan / Apply) → Task 5
- `exportSelection` (§Export) → Task 6
- Built-in dogfood template + removal of imperative seeder → Task 7
- CLI install (§CLI) → Task 8
- CLI export (§CLI) → Task 9
- `bin/landsraad.js` dispatcher (§CLI) → Task 10
- `/import` route w/ file-upload + URL (§UI surfaces) → Task 11
- `/export` route w/ opt-in picker (§UI surfaces) → Task 12
- Setup-page panel + layout header links (§UI surfaces) → Task 13
- Named errors (§Errors) → Task 1; surfacing in UI → Task 11
- No-rollback / partial write limitation (§Plan / Apply) — documented in spec; no code change required.

All spec sections have at least one task.

**Placeholder scan:** none.

**Type consistency:** `ApplyPlan`, `CouncilTemplate`, `ExportSelection`, `TemplateNeedsConfirmation`, all error classes, and the four exported functions (`parseTemplate`, `loadTemplate`, `planApply`, `applyTemplate`, `exportSelection`) are used with the same signatures wherever they appear.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-24-council-templates.md`.

Two execution options:

1. **Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — I execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
