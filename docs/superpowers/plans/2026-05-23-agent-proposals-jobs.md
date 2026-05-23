# Agent Proposals — Phase 1 (Roster + `<<JOB>>`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a councillor emit `<<JOB>>` blocks during reflection that land as pending proposals at `/proposals` for human approval; inject a terse roster into every prompt so cross-councillor `councillor="..."` routing has real slugs to target.

**Architecture:** Two new server modules (`roster.ts`, `proposals.ts`), an extension to the existing `reflection.ts` parser, three new lines in `runner.ts`'s `reflectAfterSuccess`, one new route group (`/proposals`), and three small UI touches (home badge, job detail subsection, councillor reference). Proposals are JSON files under `<council>/proposals/jobs/`; approval calls the existing `createJob` + `startJobInBackground` path so no new job-creation logic is introduced.

**Tech Stack:** SvelteKit, TypeScript, Vitest, node:fs/promises. Same conventions as existing `src/lib/server/*.ts` modules.

**Out of scope (Phase 2):** `<<MEMORY scope="shared">>` parsing and memory-promotion proposals — deferred until Option A vs B is decided in dogfood (see `docs/superpowers/specs/2026-05-23-agent-proposals.md` § `<<PROMOTE>>`).

---

## File Structure

**Create:**
- `src/lib/server/roster.ts` — terse roster string builder from `listCouncillors()`.
- `src/lib/server/roster.test.ts`
- `src/lib/server/proposals.ts` — JSON proposal file CRUD under `<council>/proposals/jobs/`.
- `src/lib/server/proposals.test.ts`
- `src/routes/proposals/+page.svelte`
- `src/routes/proposals/+page.server.ts`

**Modify:**
- `src/lib/server/reflection.ts` — add `parseJobBlocks(text)`; extend reflection prompt with `<<JOB>>` example.
- `src/lib/server/reflection.test.ts` — tests for `parseJobBlocks`.
- `src/lib/server/context.ts` — inject roster section in `assembleContextFor`.
- `src/lib/server/context.test.ts` — roster-injection test.
- `src/lib/server/runner.ts` — in `reflectAfterSuccess`, parse `<<JOB>>` blocks → write proposals + append event.
- `src/lib/server/runner.test.ts` — proposal-emission integration test.
- `src/lib/server/paths.ts` — add `proposalsDir()`, `jobProposalsDir()`.
- `src/lib/types.ts` — add `JobProposal`, extend `JobEvent['type']` with `'proposed_job'`.
- `src/routes/+page.server.ts` — surface pending-proposal count.
- `src/routes/+page.svelte` — badge next to council name.
- `src/routes/jobs/[jid]/+page.server.ts` — load proposals emitted by this job.
- `src/routes/jobs/[jid]/+page.svelte` — render "Proposals emitted" subsection.

---

## Task 1: Roster builder

**Files:**
- Create: `src/lib/server/roster.ts`
- Create: `src/lib/server/roster.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/server/roster.test.ts
import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('./councillors', () => ({ listCouncillors: vi.fn() }));

import { listCouncillors } from './councillors';
import { buildRosterSection } from './roster';

const mockList = vi.mocked(listCouncillors);

beforeEach(() => mockList.mockReset());

describe('buildRosterSection', () => {
  it('returns header + one line per councillor', async () => {
    mockList.mockResolvedValue([
      { slug: 'cfo', name: 'Vivian Park', role: 'finance', adapter: '', persona: '', reflect: true, created_at: '' },
      { slug: 'cto', name: 'Rao Sato', role: 'engineering', adapter: '', persona: '', reflect: true, created_at: '' }
    ]);
    const out = await buildRosterSection();
    expect(out).toBe('# Council roster\n\ncfo — Vivian Park — finance\ncto — Rao Sato — engineering');
  });

  it('emits header alone when only one councillor exists', async () => {
    mockList.mockResolvedValue([
      { slug: 'solo', name: 'Solo', role: 'all', adapter: '', persona: '', reflect: true, created_at: '' }
    ]);
    const out = await buildRosterSection();
    expect(out).toBe('# Council roster\n\nsolo — Solo — all');
  });

  it('renders an em-dash placeholder when role is empty', async () => {
    mockList.mockResolvedValue([
      { slug: 'x', name: 'X', role: '', adapter: '', persona: '', reflect: true, created_at: '' }
    ]);
    const out = await buildRosterSection();
    expect(out).toBe('# Council roster\n\nx — X — —');
  });

  it('returns empty string when no councillors exist', async () => {
    mockList.mockResolvedValue([]);
    expect(await buildRosterSection()).toBe('');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/server/roster.test.ts`
Expected: FAIL with "Cannot find module './roster'".

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/server/roster.ts
import { listCouncillors } from './councillors';

export async function buildRosterSection(): Promise<string> {
  const all = await listCouncillors();
  if (all.length === 0) return '';
  const lines = all.map((c) => `${c.slug} — ${c.name} — ${c.role || '—'}`);
  return `# Council roster\n\n${lines.join('\n')}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/server/roster.test.ts`
Expected: PASS, 4/4.

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/roster.ts src/lib/server/roster.test.ts
git commit -m "roster: terse council roster builder for prompt injection"
```

---

## Task 2: Inject roster into `assembleContextFor`

**Files:**
- Modify: `src/lib/server/context.ts`
- Modify: `src/lib/server/context.test.ts`

- [ ] **Step 1: Read the current test file**

Run: `Read src/lib/server/context.test.ts` (orient yourself before adding).

- [ ] **Step 2: Add failing roster-injection tests**

Append to `src/lib/server/context.test.ts`:

```ts
import { buildRosterSection } from './roster';
vi.mock('./roster', () => ({ buildRosterSection: vi.fn() }));
const mockRoster = vi.mocked(buildRosterSection);

describe('assembleContextFor — roster injection', () => {
  beforeEach(() => mockRoster.mockReset());

  it('prepends roster section above memory sections', async () => {
    mockRoster.mockResolvedValue('# Council roster\n\na — A — r1\nb — B — r2');
    // … set up any other mocks (memory/indexer) the same way other tests in this file do
    const out = await assembleContextFor('a', 'any brief');
    const rosterIdx = out.indexOf('# Council roster');
    const sharedIdx = out.indexOf('# Shared council memory');
    const privIdx = out.indexOf('# Your memory');
    expect(rosterIdx).toBeGreaterThanOrEqual(0);
    // roster appears before any memory section that is present
    if (sharedIdx >= 0) expect(rosterIdx).toBeLessThan(sharedIdx);
    if (privIdx >= 0) expect(rosterIdx).toBeLessThan(privIdx);
  });

  it('omits roster section when buildRosterSection returns empty', async () => {
    mockRoster.mockResolvedValue('');
    const out = await assembleContextFor('a', 'any brief');
    expect(out).not.toContain('# Council roster');
  });
});
```

> If the existing tests in `context.test.ts` already mock `./councillors`, `./memory`, `./memory_private`, `./indexer`, reuse those mocks rather than re-declaring. The shape of *those* mocks is not changed by this task.

- [ ] **Step 3: Run tests, confirm new ones fail**

Run: `npx vitest run src/lib/server/context.test.ts`
Expected: existing tests PASS, new roster tests FAIL (no roster section in output yet).

- [ ] **Step 4: Implement injection in `context.ts`**

In `src/lib/server/context.ts`:

a) Add import at top:
```ts
import { buildRosterSection } from './roster';
```

b) Modify `assembleContextFor` to prepend roster:
```ts
export async function assembleContextFor(councillorSlug: string, brief: string): Promise<string> {
  const roster = await buildRosterSection();

  if (!hasEmbedder()) {
    const body = await fallback(councillorSlug);
    return [roster, body].filter(Boolean).join('\n\n');
  }

  // … existing similarity / budget logic unchanged …

  const parts = [
    roster,
    formatSection('Shared council memory', shared),
    formatSection('Your memory', priv)
  ].filter(Boolean);
  return parts.join('\n\n');
}
```

Leave the fallback path's internal structure alone; just wrap its return with the roster prefix as shown.

- [ ] **Step 5: Run tests to verify pass**

Run: `npx vitest run src/lib/server/context.test.ts`
Expected: all PASS, including new roster tests.

- [ ] **Step 6: Commit**

```bash
git add src/lib/server/context.ts src/lib/server/context.test.ts
git commit -m "context: inject # Council roster section above memory"
```

---

## Task 3: Extend paths and types for proposals

**Files:**
- Modify: `src/lib/server/paths.ts`
- Modify: `src/lib/types.ts`

- [ ] **Step 1: Add path helpers**

In `src/lib/server/paths.ts`, append:

```ts
export function proposalsDir(): string {
  return join(councilRoot(), 'proposals');
}

export function jobProposalsDir(): string {
  return join(proposalsDir(), 'jobs');
}
```

- [ ] **Step 2: Add JobProposal type and event type**

In `src/lib/types.ts`:

a) Add the new type after the existing `Job` interface:
```ts
export type JobProposalStatus = 'pending' | 'approved' | 'rejected';

export interface JobProposal {
  id: string;              // filename without .json — `${created_at-safe}-${slug}`
  kind: 'job';
  proposed_by: string;     // source councillor slug
  source_job_id: string;
  title: string;
  brief: string;
  target_councillor: string | null;   // slug, null (unassigned), or "all"
  priority: 'low' | 'normal' | 'high';
  status: JobProposalStatus;
  created_at: string;
  decided_at?: string;
  decided_by?: 'user';
  reason?: string;
  resulting_job_ids?: string[];       // populated when status flips to approved
}
```

b) Extend `JobEvent['type']` union to include `'proposed_job'`:
```ts
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
  | 'reflection_failed'
  | 'proposed_job';
```

- [ ] **Step 3: Verify the project still type-checks**

Run: `npx svelte-check --tsconfig ./tsconfig.json`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/server/paths.ts src/lib/types.ts
git commit -m "types: JobProposal + proposed_job event + proposalsDir paths"
```

---

## Task 4: `parseJobBlocks` in reflection parser

**Files:**
- Modify: `src/lib/server/reflection.ts`
- Modify: `src/lib/server/reflection.test.ts`

- [ ] **Step 1: Write failing tests**

Append to `src/lib/server/reflection.test.ts`:

```ts
import { parseJobBlocks } from './reflection';

describe('parseJobBlocks', () => {
  it('returns empty array when no JOB blocks present', () => {
    expect(parseJobBlocks('just prose')).toEqual([]);
  });

  it('parses a single block with title only', () => {
    const out = parseJobBlocks('<<JOB title="Follow up on cash">>\nbrief body\n<</JOB>>');
    expect(out).toEqual([
      { title: 'Follow up on cash', brief: 'brief body', councillor: null, priority: 'normal' }
    ]);
  });

  it('parses councillor and priority attributes', () => {
    const out = parseJobBlocks(
      '<<JOB title="X" councillor="cfo" priority="high">>\nbody\n<</JOB>>'
    );
    expect(out[0].councillor).toBe('cfo');
    expect(out[0].priority).toBe('high');
  });

  it('treats councillor="all" as broadcast (preserved as "all")', () => {
    const out = parseJobBlocks('<<JOB title="X" councillor="all">>\nbody\n<</JOB>>');
    expect(out[0].councillor).toBe('all');
  });

  it('skips blocks without a title', () => {
    expect(parseJobBlocks('<<JOB councillor="x">>\nbody\n<</JOB>>')).toEqual([]);
  });

  it('skips blocks with empty title', () => {
    expect(parseJobBlocks('<<JOB title="">>\nbody\n<</JOB>>')).toEqual([]);
  });

  it('defaults priority to "normal" when omitted', () => {
    const out = parseJobBlocks('<<JOB title="T">>\nb\n<</JOB>>');
    expect(out[0].priority).toBe('normal');
  });

  it('ignores invalid priority and falls back to "normal"', () => {
    const out = parseJobBlocks('<<JOB title="T" priority="urgent">>\nb\n<</JOB>>');
    expect(out[0].priority).toBe('normal');
  });

  it('parses multiple blocks mixed with MEMORY blocks', () => {
    const text = [
      '<<MEMORY title="M">>',
      'mbody',
      '<</MEMORY>>',
      '<<JOB title="J1">>',
      'jb1',
      '<</JOB>>',
      '<<JOB title="J2" councillor="cto">>',
      'jb2',
      '<</JOB>>'
    ].join('\n');
    expect(parseJobBlocks(text)).toEqual([
      { title: 'J1', brief: 'jb1', councillor: null, priority: 'normal' },
      { title: 'J2', brief: 'jb2', councillor: 'cto', priority: 'normal' }
    ]);
  });
});
```

- [ ] **Step 2: Run tests, confirm failing**

Run: `npx vitest run src/lib/server/reflection.test.ts`
Expected: existing PASS, new `parseJobBlocks` tests FAIL.

- [ ] **Step 3: Implement `parseJobBlocks` + extend reflection prompt**

In `src/lib/server/reflection.ts`, append:

```ts
export interface ParsedJobBlock {
  title: string;
  brief: string;
  councillor: string | null;
  priority: 'low' | 'normal' | 'high';
}

const JOB_BLOCK_RE = /<<JOB\b([^>]*)>>([\s\S]*?)<<\/JOB>>/g;
const ATTR_TITLE_RE = /title="([^"]*)"/;
const ATTR_COUNCILLOR_RE = /councillor="([^"]*)"/;
const ATTR_PRIORITY_RE = /priority="([^"]*)"/;
const VALID_PRIORITY = new Set(['low', 'normal', 'high'] as const);

export function parseJobBlocks(text: string): ParsedJobBlock[] {
  const out: ParsedJobBlock[] = [];
  let match: RegExpExecArray | null;
  JOB_BLOCK_RE.lastIndex = 0;
  while ((match = JOB_BLOCK_RE.exec(text)) !== null) {
    const attrs = match[1] ?? '';
    const titleMatch = ATTR_TITLE_RE.exec(attrs);
    if (!titleMatch) continue;
    const title = titleMatch[1].trim();
    if (!title) continue;
    const brief = match[2].replace(/^\n/, '').replace(/\s+$/, '');
    const councillorRaw = ATTR_COUNCILLOR_RE.exec(attrs)?.[1]?.trim() ?? '';
    const councillor = councillorRaw === '' ? null : councillorRaw;
    const priorityRaw = ATTR_PRIORITY_RE.exec(attrs)?.[1]?.trim() ?? '';
    const priority = VALID_PRIORITY.has(priorityRaw as 'low' | 'normal' | 'high')
      ? (priorityRaw as 'low' | 'normal' | 'high')
      : 'normal';
    out.push({ title, brief, councillor, priority });
  }
  return out;
}
```

Then extend `buildReflectionPrompt` to mention `<<JOB>>`. Locate the line after `'If nothing is worth keeping, respond with no MEMORY blocks at all. Quality over quantity.',` and insert before the next `'',`:

```ts
    '',
    'You may also propose follow-up jobs (zero or more) using this format:',
    '',
    '<<JOB title="short slug-friendly title" councillor="optional-slug" priority="normal">>',
    'brief — what the job should accomplish and why',
    '<</JOB>>',
    '',
    '`councillor` is optional: omit to leave unassigned, or use "all" for a broadcast. Valid priorities: low, normal, high. Only propose jobs when there is a clear, scoped follow-up — not vague "could explore X" hand-waves.',
```

- [ ] **Step 4: Verify all reflection tests pass**

Run: `npx vitest run src/lib/server/reflection.test.ts`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/reflection.ts src/lib/server/reflection.test.ts
git commit -m "reflection: parseJobBlocks + prompt now describes <<JOB>>"
```

---

## Task 5: `proposals.ts` CRUD module

**Files:**
- Create: `src/lib/server/proposals.ts`
- Create: `src/lib/server/proposals.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/server/proposals.test.ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createJobProposal,
  listJobProposals,
  readJobProposal,
  setJobProposalDecision
} from './proposals';

let tmp: string;
const originalEnv = process.env.LANDSRAAD_COUNCIL_ROOT;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'proposals-'));
  process.env.LANDSRAAD_COUNCIL_ROOT = tmp;
});
afterEach(() => {
  if (originalEnv === undefined) delete process.env.LANDSRAAD_COUNCIL_ROOT;
  else process.env.LANDSRAAD_COUNCIL_ROOT = originalEnv;
  rmSync(tmp, { recursive: true, force: true });
});

describe('proposals: createJobProposal', () => {
  it('creates a file under proposals/jobs and returns a pending proposal', async () => {
    const p = await createJobProposal({
      proposed_by: 'cfo',
      source_job_id: 'job-1',
      title: 'Follow up on cash',
      brief: 'check Q3 numbers',
      target_councillor: 'cto',
      priority: 'normal'
    });
    expect(p.status).toBe('pending');
    expect(p.id).toMatch(/follow-up-on-cash$/);
    const round = await readJobProposal(p.id);
    expect(round.title).toBe('Follow up on cash');
    expect(round.target_councillor).toBe('cto');
  });

  it('disambiguates simultaneous creates by suffixing', async () => {
    const fixedDate = new Date('2026-05-23T17:00:00.000Z');
    const a = await createJobProposal({
      proposed_by: 'cfo', source_job_id: 'j1',
      title: 'Same', brief: 'b1', target_councillor: null, priority: 'normal'
    }, fixedDate);
    const b = await createJobProposal({
      proposed_by: 'cfo', source_job_id: 'j1',
      title: 'Same', brief: 'b2', target_councillor: null, priority: 'normal'
    }, fixedDate);
    expect(a.id).not.toBe(b.id);
    const both = await listJobProposals();
    expect(both.map((x) => x.id).sort()).toEqual([a.id, b.id].sort());
  });
});

describe('proposals: listJobProposals filters by status', () => {
  it('returns only pending by default', async () => {
    const p = await createJobProposal({
      proposed_by: 'cfo', source_job_id: 'j',
      title: 'T', brief: 'b', target_councillor: null, priority: 'normal'
    });
    await setJobProposalDecision(p.id, { status: 'approved', resulting_job_ids: ['x'] });
    const pending = await listJobProposals({ status: 'pending' });
    expect(pending).toHaveLength(0);
    const all = await listJobProposals({ status: 'all' });
    expect(all).toHaveLength(1);
  });
});

describe('proposals: setJobProposalDecision', () => {
  it('records decided_at and resulting_job_ids on approve', async () => {
    const p = await createJobProposal({
      proposed_by: 'cfo', source_job_id: 'j',
      title: 'T', brief: 'b', target_councillor: 'cto', priority: 'normal'
    });
    const out = await setJobProposalDecision(p.id, {
      status: 'approved',
      resulting_job_ids: ['new-job-1']
    });
    expect(out.status).toBe('approved');
    expect(out.resulting_job_ids).toEqual(['new-job-1']);
    expect(out.decided_at).toBeDefined();
  });

  it('records reason on reject', async () => {
    const p = await createJobProposal({
      proposed_by: 'cfo', source_job_id: 'j',
      title: 'T', brief: 'b', target_councillor: null, priority: 'normal'
    });
    const out = await setJobProposalDecision(p.id, { status: 'rejected', reason: 'duplicate' });
    expect(out.reason).toBe('duplicate');
  });
});
```

- [ ] **Step 2: Run, confirm fail**

Run: `npx vitest run src/lib/server/proposals.test.ts`
Expected: FAIL ("Cannot find module './proposals'").

- [ ] **Step 3: Implement `proposals.ts`**

```ts
// src/lib/server/proposals.ts
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { JobProposal, JobProposalStatus } from '$lib/types';
import { jobProposalsDir, slugify } from './paths';

const EXT = '.json';

export interface NewJobProposalInput {
  proposed_by: string;
  source_job_id: string;
  title: string;
  brief: string;
  target_councillor: string | null;
  priority: 'low' | 'normal' | 'high';
}

function proposalFile(id: string): string {
  return join(jobProposalsDir(), `${id}${EXT}`);
}

function timestampPart(now: Date): string {
  return now.toISOString().replace(/[:.]/g, '-');
}

function resolveAvailableId(base: string): string {
  let candidate = base;
  let n = 2;
  while (existsSync(proposalFile(candidate))) {
    candidate = `${base}-${n}`;
    n++;
  }
  return candidate;
}

export async function createJobProposal(
  input: NewJobProposalInput,
  now: Date = new Date()
): Promise<JobProposal> {
  const title = input.title.trim();
  if (!title) throw new Error('Proposal title is required.');
  const brief = input.brief.trim();
  if (!brief) throw new Error('Proposal brief is required.');
  await mkdir(jobProposalsDir(), { recursive: true });
  const baseId = `${timestampPart(now)}-${slugify(title)}`;
  const id = resolveAvailableId(baseId);
  const proposal: JobProposal = {
    id,
    kind: 'job',
    proposed_by: input.proposed_by,
    source_job_id: input.source_job_id,
    title,
    brief,
    target_councillor: input.target_councillor,
    priority: input.priority,
    status: 'pending',
    created_at: now.toISOString()
  };
  await writeFile(proposalFile(id), JSON.stringify(proposal, null, 2) + '\n', 'utf8');
  return proposal;
}

export async function readJobProposal(id: string): Promise<JobProposal> {
  const raw = await readFile(proposalFile(id), 'utf8');
  return JSON.parse(raw) as JobProposal;
}

export interface ListProposalsOptions {
  status?: JobProposalStatus | 'all';
}

export async function listJobProposals(opts: ListProposalsOptions = {}): Promise<JobProposal[]> {
  const dir = jobProposalsDir();
  if (!existsSync(dir)) return [];
  const status = opts.status ?? 'pending';
  const entries = await readdir(dir, { withFileTypes: true });
  const out: JobProposal[] = [];
  for (const e of entries) {
    if (!e.isFile() || !e.name.endsWith(EXT)) continue;
    const id = e.name.slice(0, -EXT.length);
    const p = await readJobProposal(id).catch(() => null);
    if (!p) continue;
    if (status === 'all' || p.status === status) out.push(p);
  }
  out.sort((a, b) => b.id.localeCompare(a.id));
  return out;
}

export interface ProposalDecisionInput {
  status: 'approved' | 'rejected';
  reason?: string;
  resulting_job_ids?: string[];
}

export async function setJobProposalDecision(
  id: string,
  decision: ProposalDecisionInput
): Promise<JobProposal> {
  const current = await readJobProposal(id);
  const next: JobProposal = {
    ...current,
    status: decision.status,
    decided_at: new Date().toISOString(),
    decided_by: 'user',
    ...(decision.reason !== undefined ? { reason: decision.reason } : {}),
    ...(decision.resulting_job_ids ? { resulting_job_ids: decision.resulting_job_ids } : {})
  };
  await writeFile(proposalFile(id), JSON.stringify(next, null, 2) + '\n', 'utf8');
  return next;
}

export async function listProposalsForSourceJob(sourceJobId: string): Promise<JobProposal[]> {
  const all = await listJobProposals({ status: 'all' });
  return all.filter((p) => p.source_job_id === sourceJobId);
}
```

- [ ] **Step 4: Run tests, verify all pass**

Run: `npx vitest run src/lib/server/proposals.test.ts`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/proposals.ts src/lib/server/proposals.test.ts
git commit -m "proposals: JSON file CRUD for <<JOB>> proposals"
```

---

## Task 6: Wire `<<JOB>>` parsing into `reflectAfterSuccess`

**Files:**
- Modify: `src/lib/server/runner.ts`
- Modify: `src/lib/server/runner.test.ts`

- [ ] **Step 1: Skim the runner test file**

Run: `Read src/lib/server/runner.test.ts` (find the existing reflection-success integration test — you'll add a sibling test next to it).

- [ ] **Step 2: Add failing test**

Add a new test inside the same describe block as the existing reflection integration test:

```ts
import { listJobProposals } from './proposals';

// (within the existing describe that already sets up LANDSRAAD_COUNCIL_ROOT, a councillor, etc.)

it('reflectAfterSuccess parses <<JOB>> blocks into pending proposals', async () => {
  // Arrange: configure a mock adapter whose reflection turn returns BOTH a MEMORY and a JOB block.
  //   - MEMORY ensures we did not regress private-note creation.
  //   - JOB block should land as a pending proposal.
  // The exact mock-adapter wiring should mirror what the existing reflection test does
  // — reuse its `setMockAdapterReflectionOutput()` helper (or equivalent) and return:
  //
  //   <<MEMORY title="m1">>
  //   body
  //   <</MEMORY>>
  //   <<JOB title="Follow up" councillor="cto" priority="high">>
  //   look at Q3 numbers
  //   <</JOB>>

  // Act: run the job to success exactly the way the existing reflection test does.

  // Assert proposals
  const proposals = await listJobProposals({ status: 'pending' });
  expect(proposals).toHaveLength(1);
  expect(proposals[0].title).toBe('Follow up');
  expect(proposals[0].target_councillor).toBe('cto');
  expect(proposals[0].priority).toBe('high');
  expect(proposals[0].proposed_by).toBe(/* the councillor slug used by the existing test */ '__REPLACE__');
  expect(proposals[0].source_job_id).toBeDefined();

  // Assert event
  const events = await readEvents(/* the job id */ '__REPLACE__');
  expect(events.some((e) => e.type === 'proposed_job')).toBe(true);
});
```

> Replace the `__REPLACE__` placeholders with the actual values the surrounding test setup produces. If the existing test does not yet expose helpers for mock-adapter reflection output, copy its exact setup pattern into this test rather than inventing a new one.

- [ ] **Step 3: Run, confirm new test fails**

Run: `npx vitest run src/lib/server/runner.test.ts`
Expected: existing PASS, new test FAIL (no proposal file written).

- [ ] **Step 4: Implement in `runner.ts`**

In `src/lib/server/runner.ts`:

a) Extend the existing reflection-parsing import:
```ts
import { buildReflectionPrompt, parseJobBlocks, parseMemoryBlocks } from './reflection';
import { createJobProposal } from './proposals';
```

b) In `reflectAfterSuccess`, after the existing `for (const b of blocks)` loop that writes private memories, append a sibling loop that parses `<<JOB>>` blocks and writes proposals:

```ts
const jobBlocks = parseJobBlocks(reflectionOut);
const proposalIds: string[] = [];
for (const jb of jobBlocks) {
  try {
    const p = await createJobProposal({
      proposed_by: councillor.slug,
      source_job_id: job.id,
      title: jb.title,
      brief: jb.brief,
      target_councillor: jb.councillor,
      priority: jb.priority
    });
    proposalIds.push(p.id);
    await appendEvent(job.id, {
      at: new Date().toISOString(),
      type: 'proposed_job',
      message: `proposal ${p.id} (target: ${jb.councillor ?? 'unassigned'})`
    });
  } catch (err) {
    await appendEvent(job.id, {
      at: new Date().toISOString(),
      type: 'reflection_failed',
      message: `job proposal "${jb.title}" failed: ${err instanceof Error ? err.message : String(err)}`
    });
  }
}
```

Place this block **after** the existing `reflected` event is appended (so the order of events is: memory writes → reflected → proposed_job × N). No other changes.

- [ ] **Step 5: Run all runner tests**

Run: `npx vitest run src/lib/server/runner.test.ts`
Expected: all PASS, including the new test.

- [ ] **Step 6: Run the full unit suite once for regression check**

Run: `npx vitest run`
Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/server/runner.ts src/lib/server/runner.test.ts
git commit -m "runner: emit job proposals from <<JOB>> reflection blocks"
```

---

## Task 7: `/proposals` route — list, approve, reject

**Files:**
- Create: `src/routes/proposals/+page.server.ts`
- Create: `src/routes/proposals/+page.svelte`

- [ ] **Step 1: Implement the load and actions**

```ts
// src/routes/proposals/+page.server.ts
import { error, fail, redirect } from '@sveltejs/kit';
import { hasCouncil } from '$lib/server/councils';
import { listCouncillors } from '$lib/server/councillors';
import { listJobProposals, readJobProposal, setJobProposalDecision } from '$lib/server/proposals';
import { createJob } from '$lib/server/jobs';
import { startJobInBackground } from '$lib/server/runner';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url }) => {
  if (!hasCouncil()) error(404, 'No council in this directory');
  const statusParam = url.searchParams.get('status');
  const status = statusParam === 'all' || statusParam === 'approved' || statusParam === 'rejected'
    ? statusParam
    : 'pending';
  const [proposals, councillors] = await Promise.all([
    listJobProposals({ status }),
    listCouncillors()
  ]);
  const knownSlugs = new Set(councillors.map((c) => c.slug));
  const decorated = proposals.map((p) => ({
    ...p,
    target_unknown:
      p.target_councillor !== null && p.target_councillor !== 'all' && !knownSlugs.has(p.target_councillor)
  }));
  return { proposals: decorated, status, councillors };
};

export const actions: Actions = {
  approve: async ({ request }) => {
    const form = await request.formData();
    const id = String(form.get('id') ?? '');
    const start_now = form.get('start_now') === 'on';
    if (!id) return fail(400, { error: 'Missing proposal id.' });

    const proposal = await readJobProposal(id).catch(() => null);
    if (!proposal) return fail(404, { error: `Proposal ${id} not found.` });
    if (proposal.status !== 'pending') {
      return fail(400, { error: `Proposal ${id} already ${proposal.status}.` });
    }

    const targets: string[] = [];
    if (proposal.target_councillor === 'all') {
      const all = await listCouncillors();
      for (const c of all) targets.push(c.slug);
    } else if (proposal.target_councillor) {
      const known = await listCouncillors();
      if (!known.some((c) => c.slug === proposal.target_councillor)) {
        return fail(400, { error: `Unknown target councillor "${proposal.target_councillor}".` });
      }
      targets.push(proposal.target_councillor);
    } else {
      const overrideSlug = String(form.get('reassign_to') ?? '').trim();
      if (!overrideSlug) {
        return fail(400, { error: 'Unassigned proposal — pick a councillor before approving.' });
      }
      targets.push(overrideSlug);
    }

    const now = new Date();
    const createdIds: string[] = [];
    for (let i = 0; i < targets.length; i++) {
      const job = await createJob(
        { title: proposal.title, brief: proposal.brief, councillor_slug: targets[i] },
        new Date(now.getTime() + i)
      );
      createdIds.push(job.id);
    }
    await setJobProposalDecision(id, { status: 'approved', resulting_job_ids: createdIds });
    if (start_now) for (const jid of createdIds) startJobInBackground(jid);
    redirect(303, '/proposals');
  },
  reject: async ({ request }) => {
    const form = await request.formData();
    const id = String(form.get('id') ?? '');
    const reason = String(form.get('reason') ?? '').trim() || undefined;
    if (!id) return fail(400, { error: 'Missing proposal id.' });
    const proposal = await readJobProposal(id).catch(() => null);
    if (!proposal) return fail(404, { error: `Proposal ${id} not found.` });
    if (proposal.status !== 'pending') {
      return fail(400, { error: `Proposal ${id} already ${proposal.status}.` });
    }
    await setJobProposalDecision(id, { status: 'rejected', reason });
    redirect(303, '/proposals');
  }
};
```

- [ ] **Step 2: Implement the page**

```svelte
<!-- src/routes/proposals/+page.svelte -->
<script lang="ts">
  import type { ActionData, PageData } from './$types';
  let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

<header class="head">
  <h1>Proposals</h1>
  <nav class="tabs">
    <a class:active={data.status === 'pending'} href="/proposals?status=pending">Pending</a>
    <a class:active={data.status === 'approved'} href="/proposals?status=approved">Approved</a>
    <a class:active={data.status === 'rejected'} href="/proposals?status=rejected">Rejected</a>
    <a class:active={data.status === 'all'} href="/proposals?status=all">All</a>
  </nav>
</header>

{#if form?.error}<div class="error">{form.error}</div>{/if}

{#if data.proposals.length === 0}
  <p class="empty">No {data.status} proposals.</p>
{:else}
  <ul class="list">
    {#each data.proposals as p (p.id)}
      <li class="card">
        <div class="card-head">
          <div>
            <div class="card-title">{p.title}</div>
            <div class="meta">
              from <code>{p.proposed_by}</code> · target:
              {#if p.target_councillor === 'all'}
                <span class="chip">all</span>
              {:else if p.target_councillor}
                <code>{p.target_councillor}</code>
                {#if p.target_unknown}<span class="chip warn">unknown slug</span>{/if}
              {:else}
                <span class="chip">unassigned</span>
              {/if}
              · priority <code>{p.priority}</code>
              · source <a href="/jobs/{p.source_job_id}">{p.source_job_id}</a>
            </div>
          </div>
          <div class="status status-{p.status}">{p.status}</div>
        </div>
        <pre class="brief">{p.brief}</pre>
        {#if p.status === 'pending'}
          <div class="actions">
            <form method="POST" action="?/approve" class="approve-form">
              <input type="hidden" name="id" value={p.id} />
              {#if !p.target_councillor}
                <label class="inline">
                  Assign to
                  <select name="reassign_to" required>
                    <option value="">— pick councillor —</option>
                    {#each data.councillors as c (c.slug)}
                      <option value={c.slug}>{c.name} ({c.slug})</option>
                    {/each}
                  </select>
                </label>
              {/if}
              <label class="inline">
                <input type="checkbox" name="start_now" /> start now
              </label>
              <button type="submit" class="btn primary">Approve</button>
            </form>
            <form method="POST" action="?/reject" class="reject-form">
              <input type="hidden" name="id" value={p.id} />
              <input type="text" name="reason" placeholder="reason (optional)" />
              <button type="submit" class="btn danger">Reject</button>
            </form>
          </div>
        {:else if p.status === 'approved' && p.resulting_job_ids}
          <div class="meta">
            Approved → {#each p.resulting_job_ids as jid, i (jid)}
              {#if i > 0}, {/if}
              <a href="/jobs/{jid}">{jid}</a>
            {/each}
          </div>
        {:else if p.status === 'rejected' && p.reason}
          <div class="meta">Rejected: {p.reason}</div>
        {/if}
      </li>
    {/each}
  </ul>
{/if}

<style>
  .head { display: flex; justify-content: space-between; align-items: baseline; gap: 1rem; margin-bottom: 1.5rem; }
  h1 { margin: 0; }
  .tabs { display: flex; gap: 0.75rem; }
  .tabs a { color: var(--muted); text-decoration: none; padding: 0.25rem 0.5rem; border-radius: 6px; }
  .tabs a:hover, .tabs a.active { color: var(--fg); background: rgba(255,255,255,0.04); }
  .error { background: rgba(210,114,114,0.15); border: 1px solid var(--danger); color: var(--danger); padding: 0.6rem 0.8rem; border-radius: 6px; margin-bottom: 1rem; }
  .empty { color: var(--muted); padding: 1rem 0; }
  .list { list-style: none; padding: 0; display: grid; gap: 0.75rem; }
  .card { border: 1px solid var(--border); border-radius: 8px; padding: 1rem; display: grid; gap: 0.75rem; }
  .card-head { display: flex; justify-content: space-between; gap: 1rem; align-items: flex-start; }
  .card-title { font-weight: 600; }
  .meta { color: var(--muted); font-size: 0.9em; }
  .brief { white-space: pre-wrap; background: rgba(255,255,255,0.02); border: 1px solid var(--border); border-radius: 6px; padding: 0.6rem 0.7rem; margin: 0; font-size: 0.9em; }
  .actions { display: flex; flex-wrap: wrap; gap: 1rem; align-items: center; }
  .approve-form, .reject-form { display: flex; gap: 0.5rem; align-items: center; }
  .inline { display: inline-flex; gap: 0.4rem; align-items: center; color: var(--muted); font-size: 0.9em; }
  select, input[type="text"] { background: #1a1d24; color: var(--fg); border: 1px solid var(--border); border-radius: 6px; padding: 0.4rem 0.6rem; }
  .btn { display: inline-block; padding: 0.4rem 0.8rem; border-radius: 6px; border: 1px solid var(--border); text-decoration: none; color: var(--fg); background: transparent; cursor: pointer; }
  .btn.primary { background: var(--accent); color: #0f1115; border-color: var(--accent); font-weight: 600; }
  .btn.danger { border-color: var(--danger); color: var(--danger); }
  .chip { font-size: 0.75em; padding: 0.05rem 0.4rem; border-radius: 999px; border: 1px solid var(--border); color: var(--muted); }
  .chip.warn { color: var(--danger); border-color: var(--danger); }
  .status { font-size: 0.75em; padding: 0.05rem 0.5rem; border-radius: 999px; border: 1px solid var(--border); color: var(--muted); }
  .status-pending { color: var(--accent); border-color: var(--accent); }
  .status-approved { color: #8bb98b; border-color: #4f6b4f; }
  .status-rejected { color: var(--danger); border-color: var(--danger); }
</style>
```

- [ ] **Step 3: Manual smoke-test**

Run dev server: `npm run dev`
Visit `http://localhost:5173/proposals`. With no proposals it should show "No pending proposals." (No proposals exist yet — that's expected; the end-to-end smoke is in Task 9.)

- [ ] **Step 4: Commit**

```bash
git add src/routes/proposals/+page.server.ts src/routes/proposals/+page.svelte
git commit -m "ui: /proposals page — list, approve, reject job proposals"
```

---

## Task 8: Home-page badge for pending proposal count

**Files:**
- Modify: `src/routes/+page.server.ts`
- Modify: `src/routes/+page.svelte`

- [ ] **Step 1: Surface count in load**

In `src/routes/+page.server.ts`:

a) Add the import at top:
```ts
import { listJobProposals } from '$lib/server/proposals';
```

b) Inside `load`, after the `Promise.all([listJobs(), listNotes()])` line, add:
```ts
const pendingProposals = await listJobProposals({ status: 'pending' });
```

c) Add `pendingProposalCount: pendingProposals.length` to the returned object.

- [ ] **Step 2: Render badge in the page**

In `src/routes/+page.svelte`, locate `<h1>{c.name}</h1>` and replace with:

```svelte
<h1>
  {c.name}
  {#if data.pendingProposalCount > 0}
    <a class="badge" href="/proposals" title="{data.pendingProposalCount} pending proposal{data.pendingProposalCount === 1 ? '' : 's'}">
      {data.pendingProposalCount} proposal{data.pendingProposalCount === 1 ? '' : 's'}
    </a>
  {/if}
</h1>
```

Add a style rule at the end of the `<style>` block:
```css
.badge {
  display: inline-block; vertical-align: middle; margin-left: 0.5rem;
  font-size: 0.55em; padding: 0.2rem 0.55rem; border-radius: 999px;
  border: 1px solid var(--accent); color: var(--accent);
  background: rgba(255,255,255,0.02); text-decoration: none; font-weight: 600;
}
.badge:hover { background: var(--accent); color: #0f1115; }
```

- [ ] **Step 3: Manual smoke**

Run: `npm run dev`
Verify home page still renders. (Badge won't appear until proposals exist; that's tested in Task 9.)

- [ ] **Step 4: Commit**

```bash
git add src/routes/+page.server.ts src/routes/+page.svelte
git commit -m "home: badge with pending-proposal count next to council name"
```

---

## Task 9: Job-detail "Proposals emitted" subsection

**Files:**
- Modify: `src/routes/jobs/[jid]/+page.server.ts`
- Modify: `src/routes/jobs/[jid]/+page.svelte`

- [ ] **Step 1: Skim the existing job-detail load**

Run: `Read src/routes/jobs/[jid]/+page.server.ts` (so the next step inserts in the right place).

- [ ] **Step 2: Load proposals emitted by this job**

In `src/routes/jobs/[jid]/+page.server.ts`:

a) Add import:
```ts
import { listProposalsForSourceJob } from '$lib/server/proposals';
```

b) In `load`, alongside whatever else it reads, add:
```ts
const proposals = await listProposalsForSourceJob(params.jid);
```

c) Include `proposals` in the returned object.

- [ ] **Step 3: Render the subsection in the page**

In `src/routes/jobs/[jid]/+page.svelte`, find the existing "Memories created" subsection (it should be present from the prior memories work). Immediately after it, add:

```svelte
{#if data.proposals && data.proposals.length > 0}
  <section class="panel">
    <h2>Proposals emitted</h2>
    <ul class="proposal-list">
      {#each data.proposals as p (p.id)}
        <li>
          <a class="proposal-link" href="/proposals?status={p.status}">
            <span class="proposal-title">{p.title}</span>
            <span class="status status-{p.status}">{p.status}</span>
            <span class="meta">
              target {p.target_councillor ?? 'unassigned'} · priority {p.priority}
            </span>
          </a>
        </li>
      {/each}
    </ul>
  </section>
{/if}

<style>
  .proposal-list { list-style: none; padding: 0; display: grid; gap: 0.5rem; }
  .proposal-link { display: flex; gap: 0.6rem; align-items: center; border: 1px solid var(--border); border-radius: 6px; padding: 0.5rem 0.7rem; text-decoration: none; color: var(--fg); }
  .proposal-link:hover { border-color: var(--accent); }
  .proposal-title { font-weight: 500; }
</style>
```

> If `.status`, `.status-pending`, etc., are already styled in this file (mirroring the memories list), reuse those; don't redeclare.

- [ ] **Step 4: Manual end-to-end smoke**

Run the existing mock-adapter test path manually:

```bash
npm run dev
```

1. Create a council (if not already present), add 2 councillors using the mock adapter.
2. Create a job with a brief crafted to elicit a `<<JOB>>` block (or set the mock adapter's reflection output env hook used by the runner tests).
3. Watch the job succeed → reload `/jobs/<jid>` → "Proposals emitted" subsection should list the proposal with `pending` status.
4. Click through to `/proposals` → approve with `start now` → verify a new job shows on home page for the target councillor.
5. Verify pending-count badge on `/` increments when proposals are pending and disappears when none remain.

- [ ] **Step 5: Run the full test suite for regression check**

Run: `npx vitest run`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add src/routes/jobs/[jid]/+page.server.ts src/routes/jobs/[jid]/+page.svelte
git commit -m "job detail: render Proposals emitted subsection"
```

---

## Task 10: Update OPEN_QUESTIONS.md to reflect Phase 1 shipped

**Files:**
- Modify: `docs/OPEN_QUESTIONS.md`

- [ ] **Step 1: Edit to mark Phase 1 done**

Change the "Agent Proposals" bullet to:

```markdown
# Agent Proposals
* ~~jobs for other agents~~ — shipped Phase 1: `<<JOB>>` blocks → `/proposals` review queue. Spec: `superpowers/specs/2026-05-23-agent-proposals.md`. Plan: `superpowers/plans/2026-05-23-agent-proposals-jobs.md`.
  * councillor awareness — roster auto-injected in every prompt by `assembleContextFor`.
* jobs for the user?
```

Leave the "Memories → promote private to shared" bullet alone (Phase 2 — still stub).

- [ ] **Step 2: Commit**

```bash
git add docs/OPEN_QUESTIONS.md
git commit -m "docs: mark Agent Proposals Phase 1 shipped in OPEN_QUESTIONS"
```

---

## Self-review checklist (run before handing off)

- [ ] **Spec coverage:** `<<JOB>>` parse (Task 4), proposal file storage (Tasks 3, 5), runner emits proposals (Task 6), `/proposals` review UI (Task 7), home badge (Task 8), job-detail subsection (Task 9), roster injection (Tasks 1, 2). `<<PROMOTE>>` explicitly deferred — see plan opener.
- [ ] **No placeholders** in committed code; only `__REPLACE__` markers are in Task 6 test scaffolding where the engineer must mirror the existing reflection test's setup.
- [ ] **Type consistency:** `JobProposal` shape used identically in `proposals.ts`, `proposals.test.ts`, `+page.server.ts`. `'proposed_job'` event added to union in Task 3 before being referenced in Task 6.
- [ ] **TDD discipline:** every code-bearing task starts with a failing test before implementation.
- [ ] **Commits:** one logical step per commit; messages match existing repo style (lowercase prefix `area: subject`).
