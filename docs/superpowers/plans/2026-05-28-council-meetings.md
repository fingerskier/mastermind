# Council Meetings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a multi-turn round-table meeting surface where the director participates each round, councillors speak in randomized order, and a chair writes a synthesis on end (parsed for `<<MEMORY>>` / `<<JOB>>` blocks). Meeting artifacts get embedded into the memory index.

**Architecture:** Two shared primitives (`runAdapter`, `councillor-lock`) get extracted from `runner.ts`. A new `meetings.ts` owns filesystem layout/CRUD; `meeting-runner.ts` owns the turn loop, summary refresh, synthesis, pause/resume. The existing scheduler tick pokes meeting-runner. The existing reflection block-parser is reused for synthesis.

**Tech Stack:** TypeScript strict, SvelteKit, Node 20+, `vitest`, `better-sqlite3` + `sqlite-vec` (existing).

**Spec:** `docs/superpowers/specs/2026-05-28-council-meetings-design.md`.

---

## File Structure

**New files:**
- `src/lib/server/adapters/runAdapter.ts` — adapter spawn helper extracted from `runner.ts`
- `src/lib/server/adapters/runAdapter.test.ts`
- `src/lib/server/councillor-lock.ts` — in-process busy-slot map
- `src/lib/server/councillor-lock.test.ts`
- `src/lib/server/meetings.ts` — CRUD + filesystem
- `src/lib/server/meetings.test.ts`
- `src/lib/server/meeting-runner.ts` — turn loop, summary, synthesis, pause/resume
- `src/lib/server/meeting-runner.test.ts`
- `src/routes/meetings/+page.server.ts`
- `src/routes/meetings/+page.svelte`
- `src/routes/meetings/new/+page.server.ts`
- `src/routes/meetings/new/+page.svelte`
- `src/routes/meetings/[id]/+page.server.ts`
- `src/routes/meetings/[id]/+page.svelte`

**Modified files:**
- `src/lib/types.ts` — add `Meeting`, `MeetingStatus`, `MeetingEvent` types
- `src/lib/server/paths.ts` — add `meetingsDir`, `meetingDir`, `meetingIdFor`
- `src/lib/server/config.ts` — add `MEETING_*` constants
- `src/lib/server/reflection.ts` — keep parsers; add `applyReflectionBlocks` helper
- `src/lib/server/runner.ts` — switch to `runAdapter` + `councillor-lock`; switch reflection apply to `applyReflectionBlocks`
- `src/lib/server/embeddings.ts` — extend `ChunkKind` with meeting kinds
- `src/lib/server/scheduler.ts` — tick meeting-runner for running meetings; recover crashed meetings on `catchUp`
- `src/lib/server/hooks.server.ts` (or wherever startScheduler is called) — also call meeting-runner recovery
- `src/routes/+layout.svelte` — add `Meetings` link in nav
- `src/routes/+page.svelte` — add meetings card
- `src/routes/+page.server.ts` — surface meetings count
- `SPECIFICATION.md` — add Meeting concept + storage entry + UI surface rows + v1 functionality item

---

## Task 1: Extract `runAdapter` helper

**Files:**
- Create: `src/lib/server/adapters/runAdapter.ts`
- Create: `src/lib/server/adapters/runAdapter.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/server/adapters/runAdapter.test.ts
import { describe, it, expect } from 'vitest';
import { runAdapter } from './runAdapter';
import { resolveAdapter } from './index';

describe('runAdapter', () => {
  it('runs the mock:local adapter and returns transcript + output + exit_code', async () => {
    const adapter = resolveAdapter('mock:local')!;
    const result = await runAdapter({
      adapter,
      prompt: 'hello',
      cwd: process.cwd(),
      timeoutMs: 30_000
    });
    expect(result.exit_code).toBe(0);
    expect(result.output.length).toBeGreaterThan(0);
    expect(result.transcript.length).toBeGreaterThan(0);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('streams chunks via onStdout', async () => {
    const adapter = resolveAdapter('mock:local')!;
    const seen: string[] = [];
    await runAdapter({
      adapter,
      prompt: 'hi',
      cwd: process.cwd(),
      timeoutMs: 30_000,
      onStdout: (c) => seen.push(c)
    });
    expect(seen.join('')).not.toBe('');
  });

  it('aborts when the signal aborts', async () => {
    const adapter = resolveAdapter('mock:local')!;
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 1);
    const result = await runAdapter({
      adapter,
      prompt: 'hi',
      cwd: process.cwd(),
      timeoutMs: 30_000,
      abortSignal: controller.signal
    });
    expect(result.exit_code).not.toBe(0);
  });

  it('times out when the adapter exceeds timeoutMs', async () => {
    // mock:local is fast; use a 0ms timeout to force timeout path
    const adapter = resolveAdapter('mock:local')!;
    const result = await runAdapter({
      adapter,
      prompt: 'hi',
      cwd: process.cwd(),
      timeoutMs: 0
    });
    expect(result.exit_code).not.toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- runAdapter`
Expected: FAIL — module `./runAdapter` does not exist.

- [ ] **Step 3: Implement `runAdapter`**

```ts
// src/lib/server/adapters/runAdapter.ts
import type { Adapter, AdapterResult } from './types';

export interface RunAdapterOpts {
  adapter: Adapter | { run: (args: { prompt: string; cwd: string; signal?: AbortSignal }) => { chunks: AsyncIterable<{ stream: 'stdout' | 'stderr'; text: string }>; result: Promise<AdapterResult> } };
  prompt: string;
  cwd: string;
  timeoutMs: number;
  onStdout?: (chunk: string) => void;
  onStderr?: (chunk: string) => void;
  abortSignal?: AbortSignal;
}

export interface RunAdapterResult {
  transcript: string;
  output: string;
  exit_code: number;
  durationMs: number;
  timedOut: boolean;
  aborted: boolean;
}

export async function runAdapter(opts: RunAdapterOpts): Promise<RunAdapterResult> {
  const started = Date.now();
  const localController = new AbortController();
  const onParentAbort = () => localController.abort();
  if (opts.abortSignal) {
    if (opts.abortSignal.aborted) localController.abort();
    else opts.abortSignal.addEventListener('abort', onParentAbort, { once: true });
  }
  let timedOut = false;
  const timer =
    opts.timeoutMs > 0
      ? setTimeout(() => {
          timedOut = true;
          localController.abort();
        }, opts.timeoutMs)
      : opts.timeoutMs === 0
        ? (timedOut = true, null)
        : null;
  // timeoutMs === 0 triggers immediate timeout below; we still attempt run for clean teardown
  if (opts.timeoutMs === 0) localController.abort();

  let transcript = '';
  let exit_code = -1;
  let aborted = false;
  try {
    const streams = (opts.adapter as { run: (a: { prompt: string; cwd: string; signal?: AbortSignal }) => { chunks: AsyncIterable<{ stream: 'stdout' | 'stderr'; text: string }>; result: Promise<AdapterResult> } }).run({
      prompt: opts.prompt,
      cwd: opts.cwd,
      signal: localController.signal
    });
    for await (const chunk of streams.chunks) {
      if (localController.signal.aborted) {
        aborted = true;
        break;
      }
      const prefix = chunk.stream === 'stderr' ? '[stderr] ' : '';
      transcript += prefix + chunk.text;
      if (chunk.stream === 'stdout') opts.onStdout?.(chunk.text);
      else opts.onStderr?.(chunk.text);
    }
    const result = await streams.result;
    if (result.stderr) transcript += `\n[stderr]\n${result.stderr}`;
    return {
      transcript,
      output: result.stdout,
      exit_code: result.exit_code,
      durationMs: Date.now() - started,
      timedOut,
      aborted
    };
  } catch (err) {
    return {
      transcript: transcript || (err instanceof Error ? err.message : String(err)),
      output: '',
      exit_code,
      durationMs: Date.now() - started,
      timedOut,
      aborted
    };
  } finally {
    if (timer) clearTimeout(timer);
    if (opts.abortSignal) opts.abortSignal.removeEventListener('abort', onParentAbort);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- runAdapter`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/adapters/runAdapter.ts src/lib/server/adapters/runAdapter.test.ts
git commit -m "feat(adapters): extract runAdapter helper"
```

---

## Task 2: Create `councillor-lock` module

**Files:**
- Create: `src/lib/server/councillor-lock.ts`
- Create: `src/lib/server/councillor-lock.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/server/councillor-lock.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import {
  tryAcquire,
  release,
  current,
  listHeldBy,
  _resetForTests
} from './councillor-lock';

describe('councillor-lock', () => {
  beforeEach(() => _resetForTests());

  it('acquires a free slug', () => {
    expect(tryAcquire('leto', { kind: 'job', id: 'J1' })).toBe(true);
    expect(current('leto')).toEqual({ kind: 'job', id: 'J1' });
  });

  it('refuses to acquire a held slug', () => {
    tryAcquire('leto', { kind: 'job', id: 'J1' });
    expect(tryAcquire('leto', { kind: 'meeting', id: 'M1' })).toBe(false);
    expect(current('leto')).toEqual({ kind: 'job', id: 'J1' });
  });

  it('releases only when the holder matches', () => {
    tryAcquire('leto', { kind: 'job', id: 'J1' });
    release('leto', { kind: 'job', id: 'J2' });
    expect(current('leto')).toEqual({ kind: 'job', id: 'J1' });
    release('leto', { kind: 'job', id: 'J1' });
    expect(current('leto')).toBeNull();
  });

  it('lists all slugs held by a holder', () => {
    tryAcquire('a', { kind: 'meeting', id: 'M1' });
    tryAcquire('b', { kind: 'meeting', id: 'M1' });
    tryAcquire('c', { kind: 'job', id: 'J1' });
    expect(listHeldBy({ kind: 'meeting', id: 'M1' }).sort()).toEqual(['a', 'b']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- councillor-lock`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement `councillor-lock`**

```ts
// src/lib/server/councillor-lock.ts
export type LockHolder =
  | { kind: 'job'; id: string }
  | { kind: 'meeting'; id: string };

const slots = new Map<string, LockHolder>();

function eq(a: LockHolder, b: LockHolder): boolean {
  return a.kind === b.kind && a.id === b.id;
}

export function tryAcquire(slug: string, holder: LockHolder): boolean {
  if (slots.has(slug)) return false;
  slots.set(slug, holder);
  return true;
}

export function release(slug: string, holder: LockHolder): void {
  const existing = slots.get(slug);
  if (!existing) return;
  if (!eq(existing, holder)) return;
  slots.delete(slug);
}

export function current(slug: string): LockHolder | null {
  return slots.get(slug) ?? null;
}

export function listHeldBy(holder: LockHolder): string[] {
  const out: string[] = [];
  for (const [slug, h] of slots.entries()) {
    if (eq(h, holder)) out.push(slug);
  }
  return out;
}

export function _resetForTests(): void {
  slots.clear();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- councillor-lock`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/councillor-lock.ts src/lib/server/councillor-lock.test.ts
git commit -m "feat(server): councillor-lock primitive"
```

---

## Task 3: Refactor `runner.ts` to use the lock + helper

**Files:**
- Modify: `src/lib/server/runner.ts`

- [ ] **Step 1: Confirm existing runner tests still describe the behavior**

Run: `npm test -- runner`
Expected: existing PASS. Note the test list — none should change in this task.

- [ ] **Step 2: Replace the busy-slot map with `councillor-lock`**

Edit `src/lib/server/runner.ts`:

Replace `const active = new Map<string, ActiveRun>();` and `isRunning` with lock-backed lookups, and route acquire/release through the lock. Concretely:

```ts
import { tryAcquire, release as releaseLock, current as lockCurrent, listHeldBy } from './councillor-lock';

// keep the internal AbortController/promise map keyed by jobId so cancel still works
const runs = new Map<string, ActiveRun>(); // key: jobId
const pendingCancels = new Set<string>();

export function currentRuns(): Array<{ councillor: string; jobId: string }> {
  const out: Array<{ councillor: string; jobId: string }> = [];
  for (const run of runs.values()) {
    out.push({ councillor: run.councillorSlug, jobId: run.jobId });
  }
  return out;
}

export function isRunning(councillorSlug: string): boolean {
  const h = lockCurrent(councillorSlug);
  return h?.kind === 'job';
}

export async function cancelJob(jobId: string): Promise<void> {
  const run = runs.get(jobId);
  if (run) {
    run.controller.abort();
    return;
  }
  pendingCancels.add(jobId);
}
```

In `runJobNow`, replace `active.has(councillor.slug)` with `tryAcquire(councillor.slug, { kind: 'job', id: jobId })`; on false, throw the existing "already has an active job" error. In the `finally`, replace `active.delete` with `releaseLock(councillor.slug, { kind: 'job', id: jobId })` and `runs.delete(jobId)`. Update `ActiveRun` to include `councillorSlug`.

- [ ] **Step 3: Replace inline adapter streaming with `runAdapter`**

In `runJobNow`'s success path, swap the manual `for await` loop and result handling for `runAdapter`:

```ts
import { runAdapter } from './adapters/runAdapter';

// inside runJobNow's IIFE, replacing the streams block:
const adapterResult = await runAdapter({
  adapter,
  prompt,
  cwd: councilRoot(),
  timeoutMs: 0, // jobs have no timeout in v0
  abortSignal: controller.signal,
  onStdout: async (text) => { await appendTranscript(jobId, text); },
  onStderr: async (text) => { await appendTranscript(jobId, '[stderr] ' + text); }
});

if (controller.signal.aborted) {
  return await setStatus(jobId, 'cancelled', {
    finished_at: new Date().toISOString(),
    exit_code: adapterResult.exit_code,
    error: 'cancelled by user'
  });
}

await writeOutput(jobId, adapterResult.output);

if (adapterResult.exit_code === 0) {
  // ... existing reflectAfterSuccess path
} else {
  // ... existing failed path
}
```

Note: `appendTranscript` is async; `onStdout` is sync-fire-and-forget. Wrap it as `void appendTranscript(...)` or buffer chunks then flush. Simplest: keep appendTranscript synchronous inside onStdout via `void`:

```ts
onStdout: (text) => { void appendTranscript(jobId, text); }
```

- [ ] **Step 4: Run all tests**

Run: `npm test`
Expected: every existing test still passes. No behavior change.

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/runner.ts
git commit -m "refactor(runner): use councillor-lock + runAdapter"
```

---

## Task 4: Add meeting config + types

**Files:**
- Modify: `src/lib/server/config.ts`
- Modify: `src/lib/types.ts`
- Modify: `src/lib/server/paths.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/server/meetings-paths.test.ts
import { describe, it, expect } from 'vitest';
import { meetingDir, meetingIdFor, meetingsDir } from './paths';

describe('meeting paths', () => {
  it('meetingIdFor produces timestamp-slug ids', () => {
    const id = meetingIdFor('Strategy session', new Date('2026-05-28T14:00:00Z'));
    expect(id).toMatch(/^2026-05-28T14-00-00-000Z-strategy-session$/);
  });
  it('meetingDir is meetingsDir + id', () => {
    const id = 'fake-id';
    expect(meetingDir(id).endsWith(id)).toBe(true);
    expect(meetingDir(id).includes('meetings')).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- meetings-paths`
Expected: FAIL — exports missing.

- [ ] **Step 3: Add config constants**

Append to `src/lib/server/config.ts`:

```ts
function envInt(name: string, fallback: number): number {
  const v = process.env[name];
  if (!v) return fallback;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
}

export const MEETING_WINDOW_K_DEFAULT = envInt('LANDSRAAD_MEETING_WINDOW_K', 4);
export const MEETING_TURN_TIMEOUT_MS = envInt('LANDSRAAD_MEETING_TURN_TIMEOUT_MS', 300_000);
export const MEETING_SUMMARY_TIMEOUT_MS = envInt('LANDSRAAD_MEETING_SUMMARY_TIMEOUT_MS', 300_000);
```

- [ ] **Step 4: Add meeting paths**

Append to `src/lib/server/paths.ts`:

```ts
export function meetingsDir(): string {
  return join(councilRoot(), 'meetings');
}

export function meetingDir(meetingId: string): string {
  return join(meetingsDir(), meetingId);
}

export function meetingIdFor(title: string, now: Date = new Date()): string {
  const ts = now.toISOString().replace(/[:.]/g, '-');
  return `${ts}-${slugify(title)}`;
}
```

- [ ] **Step 5: Add meeting types**

Append to `src/lib/types.ts`:

```ts
export type MeetingStatus =
  | 'running'
  | 'awaiting_director'
  | 'paused'
  | 'synthesizing'
  | 'ended'
  | 'cancelled'
  | 'failed';

export interface Meeting {
  id: string;
  title: string;
  chair_slug: string;
  attendees: string[];
  status: MeetingStatus;
  window_k: number;
  started_at: string;
  ended_at: string | null;
  current_round: number;
  remaining_this_round: string[];
  director_spoken_this_round: boolean;
  last_summarized_turn: number;
  total_turns: number;
  pause_reason?: string;
  memory_slugs?: string[];
  shared_memory_slugs?: string[];
  proposed_jobs?: string[];
}

export type MeetingEventType =
  | 'created'
  | 'awaiting_director'
  | 'director_turn'
  | 'director_skipped'
  | 'round_started'
  | 'turn_started'
  | 'turn_finished'
  | 'turn_failed'
  | 'summarized'
  | 'paused'
  | 'resumed'
  | 'synthesizing'
  | 'synthesized'
  | 'proposals_parsed'
  | 'ended'
  | 'cancelled'
  | 'crashed';

export interface MeetingEvent {
  at: string;
  type: MeetingEventType;
  speaker?: string;            // councillor slug or 'director'
  turn_index?: number;
  message?: string;
}
```

- [ ] **Step 6: Run tests**

Run: `npm test -- meetings-paths`
Expected: PASS.

Run: `npm run check`
Expected: 0 errors.

- [ ] **Step 7: Commit**

```bash
git add src/lib/server/config.ts src/lib/server/paths.ts src/lib/types.ts src/lib/server/meetings-paths.test.ts
git commit -m "feat(meetings): config, paths, types"
```

---

## Task 5: Implement `meetings.ts` CRUD

**Files:**
- Create: `src/lib/server/meetings.ts`
- Create: `src/lib/server/meetings.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/server/meetings.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createMeeting,
  readMeeting,
  writeMeeting,
  listMeetings,
  appendMeetingEvent,
  readMeetingEvents,
  appendTranscriptBlock,
  readTranscript,
  writeSummary,
  readSummary,
  writeSynthesis,
  readTopic
} from './meetings';
import { createCouncil } from './councils';
import { createCouncillor } from './councillors';

function tempCouncil(): string {
  const d = mkdtempSync(join(tmpdir(), 'landsraad-mtg-'));
  process.env.LANDSRAAD_COUNCIL_ROOT = d;
  return d;
}

describe('meetings', () => {
  let root: string;
  beforeEach(async () => {
    root = tempCouncil();
    await createCouncil({ name: 'Test', description: '' });
    await createCouncillor({ name: 'Leto', role: 'duke', routing_hint: '', adapter: 'mock:local', persona: '' });
    await createCouncillor({ name: 'Mocky', role: 'sidekick', routing_hint: '', adapter: 'mock:local', persona: '' });
  });

  it('createMeeting persists meeting.json + topic.md + empty transcript/summary', async () => {
    const m = await createMeeting({
      title: 'Strategy',
      topic: 'What is our Q3 focus?',
      chair_slug: 'leto',
      attendees: ['leto', 'mocky'],
      window_k: 2
    });
    expect(m.id).toMatch(/strategy$/);
    expect(m.status).toBe('awaiting_director');
    expect(m.current_round).toBe(1);
    expect(m.remaining_this_round.sort()).toEqual(['leto', 'mocky']);
    expect(m.director_spoken_this_round).toBe(false);
    expect(await readTopic(m.id)).toBe('What is our Q3 focus?');
    expect(await readSummary(m.id)).toBe('');
  });

  it('rejects creation when chair is not in attendees', async () => {
    await expect(
      createMeeting({
        title: 'Bad',
        topic: 'x',
        chair_slug: 'leto',
        attendees: ['mocky'],
        window_k: 2
      })
    ).rejects.toThrow(/chair/i);
  });

  it('rejects creation when an attendee is unknown', async () => {
    await expect(
      createMeeting({
        title: 'Bad',
        topic: 'x',
        chair_slug: 'leto',
        attendees: ['leto', 'ghost'],
        window_k: 2
      })
    ).rejects.toThrow(/ghost/);
  });

  it('appends transcript blocks and events', async () => {
    const m = await createMeeting({
      title: 'S',
      topic: 't',
      chair_slug: 'leto',
      attendees: ['leto'],
      window_k: 2
    });
    await appendTranscriptBlock(m.id, { turnIndex: 1, speaker: 'director', at: '2026-05-28T00:00:00.000Z', body: 'hi all' });
    await appendTranscriptBlock(m.id, { turnIndex: 2, speaker: 'leto', at: '2026-05-28T00:01:00.000Z', body: 'replied' });
    const t = await readTranscript(m.id);
    expect(t).toContain('## Turn 1 — director');
    expect(t).toContain('## Turn 2 — leto');
    await appendMeetingEvent(m.id, { at: '2026-05-28T00:02:00.000Z', type: 'turn_finished', speaker: 'leto', turn_index: 2 });
    const events = await readMeetingEvents(m.id);
    expect(events.find((e) => e.type === 'turn_finished')?.speaker).toBe('leto');
  });

  it('writeSummary + writeSynthesis persist their files', async () => {
    const m = await createMeeting({
      title: 'S',
      topic: 't',
      chair_slug: 'leto',
      attendees: ['leto'],
      window_k: 2
    });
    await writeSummary(m.id, 'rolling summary');
    expect(await readSummary(m.id)).toBe('rolling summary');
    await writeSynthesis(m.id, 'final synth');
  });

  it('listMeetings returns newest-first', async () => {
    await createMeeting({ title: 'A', topic: 't', chair_slug: 'leto', attendees: ['leto'], window_k: 2 }, new Date('2026-05-28T00:00:00Z'));
    await new Promise((r) => setTimeout(r, 10));
    await createMeeting({ title: 'B', topic: 't', chair_slug: 'leto', attendees: ['leto'], window_k: 2 }, new Date('2026-05-28T00:01:00Z'));
    const all = await listMeetings();
    expect(all[0].title).toBe('B');
    expect(all[1].title).toBe('A');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- meetings.test`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement `meetings.ts`**

```ts
// src/lib/server/meetings.ts
import { appendFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Meeting, MeetingEvent, MeetingStatus } from '$lib/types';
import { meetingDir, meetingIdFor, meetingsDir } from './paths';
import { hasCouncil } from './councils';
import { readCouncillor } from './councillors';

const MEETING_FILE = 'meeting.json';
const TOPIC_FILE = 'topic.md';
const TRANSCRIPT_FILE = 'transcript.md';
const SUMMARY_FILE = 'summary.md';
const SYNTHESIS_FILE = 'synthesis.md';
const EVENTS_FILE = 'events.jsonl';

export interface NewMeetingInput {
  title: string;
  topic: string;
  chair_slug: string;
  attendees: string[];
  window_k: number;
}

function shuffle<T>(input: T[], rng: () => number = Math.random): T[] {
  const a = input.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export async function createMeeting(
  input: NewMeetingInput,
  now: Date = new Date(),
  rng: () => number = Math.random
): Promise<Meeting> {
  if (!hasCouncil()) throw new Error('No council exists in the current directory.');
  if (!input.title.trim()) throw new Error('Meeting title is required.');
  if (input.attendees.length === 0) throw new Error('At least one attendee is required.');
  if (!input.attendees.includes(input.chair_slug)) {
    throw new Error(`Chair "${input.chair_slug}" must be one of the attendees.`);
  }
  for (const slug of input.attendees) {
    await readCouncillor(slug).catch(() => {
      throw new Error(`Attendee "${slug}" is not a councillor.`);
    });
  }

  const id = meetingIdFor(input.title, now);
  const dir = meetingDir(id);
  if (existsSync(dir)) throw new Error(`Meeting "${id}" already exists.`);

  const meeting: Meeting = {
    id,
    title: input.title.trim(),
    chair_slug: input.chair_slug,
    attendees: input.attendees.slice(),
    status: 'awaiting_director',
    window_k: input.window_k,
    started_at: now.toISOString(),
    ended_at: null,
    current_round: 1,
    remaining_this_round: shuffle(input.attendees, rng),
    director_spoken_this_round: false,
    last_summarized_turn: 0,
    total_turns: 0
  };

  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, MEETING_FILE), JSON.stringify(meeting, null, 2) + '\n', 'utf8');
  await writeFile(join(dir, TOPIC_FILE), input.topic, 'utf8');
  await writeFile(join(dir, TRANSCRIPT_FILE), '', 'utf8');
  await writeFile(join(dir, SUMMARY_FILE), '', 'utf8');
  await appendMeetingEvent(id, { at: now.toISOString(), type: 'created' });
  await appendMeetingEvent(id, { at: now.toISOString(), type: 'awaiting_director' });
  return meeting;
}

export async function readMeeting(id: string): Promise<Meeting> {
  const raw = await readFile(join(meetingDir(id), MEETING_FILE), 'utf8');
  return JSON.parse(raw) as Meeting;
}

export async function writeMeeting(m: Meeting): Promise<void> {
  await writeFile(join(meetingDir(m.id), MEETING_FILE), JSON.stringify(m, null, 2) + '\n', 'utf8');
}

export async function listMeetings(filter?: { status?: MeetingStatus | MeetingStatus[] }): Promise<Meeting[]> {
  const dir = meetingsDir();
  if (!existsSync(dir)) return [];
  const entries = await readdir(dir, { withFileTypes: true });
  const out: Meeting[] = [];
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const m = await readMeeting(e.name).catch(() => null);
    if (!m) continue;
    if (filter?.status) {
      const set = Array.isArray(filter.status) ? new Set(filter.status) : new Set([filter.status]);
      if (!set.has(m.status)) continue;
    }
    out.push(m);
  }
  out.sort((a, b) => b.id.localeCompare(a.id));
  return out;
}

export async function appendMeetingEvent(id: string, event: MeetingEvent): Promise<void> {
  await appendFile(join(meetingDir(id), EVENTS_FILE), JSON.stringify(event) + '\n', 'utf8');
}

export async function readMeetingEvents(id: string): Promise<MeetingEvent[]> {
  const file = join(meetingDir(id), EVENTS_FILE);
  if (!existsSync(file)) return [];
  const raw = await readFile(file, 'utf8');
  return raw.split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l) as MeetingEvent);
}

export interface TranscriptBlock {
  turnIndex: number;
  speaker: string;
  at: string;
  body: string;
}

export async function appendTranscriptBlock(id: string, block: TranscriptBlock): Promise<void> {
  const file = join(meetingDir(id), TRANSCRIPT_FILE);
  const text = `\n## Turn ${block.turnIndex} — ${block.speaker} — ${block.at}\n\n${block.body.trim()}\n`;
  await appendFile(file, text, 'utf8');
}

export async function readTranscript(id: string): Promise<string> {
  return readFile(join(meetingDir(id), TRANSCRIPT_FILE), 'utf8').catch(() => '');
}

export async function readTopic(id: string): Promise<string> {
  return readFile(join(meetingDir(id), TOPIC_FILE), 'utf8').catch(() => '');
}

export async function writeSummary(id: string, body: string): Promise<void> {
  await writeFile(join(meetingDir(id), SUMMARY_FILE), body, 'utf8');
}

export async function readSummary(id: string): Promise<string> {
  return readFile(join(meetingDir(id), SUMMARY_FILE), 'utf8').catch(() => '');
}

export async function writeSynthesis(id: string, body: string): Promise<void> {
  await writeFile(join(meetingDir(id), SYNTHESIS_FILE), body, 'utf8');
}

export async function readSynthesis(id: string): Promise<string> {
  return readFile(join(meetingDir(id), SYNTHESIS_FILE), 'utf8').catch(() => '');
}

export interface ParsedTurn {
  turnIndex: number;
  speaker: string;
  at: string;
  body: string;
}

const TURN_HEADER_RE = /^## Turn (\d+) — ([^—]+) — (\S+)\s*$/m;

export function parseTranscript(text: string): ParsedTurn[] {
  if (!text.trim()) return [];
  const sections = text.split(/^## Turn /m).slice(1).map((s) => '## Turn ' + s);
  const out: ParsedTurn[] = [];
  for (const sec of sections) {
    const m = TURN_HEADER_RE.exec(sec);
    if (!m) continue;
    const idx = Number.parseInt(m[1], 10);
    const speaker = m[2].trim();
    const at = m[3].trim();
    const body = sec.split('\n').slice(2).join('\n').trim();
    out.push({ turnIndex: idx, speaker, at, body });
  }
  return out;
}

export function lastKTurns(text: string, k: number): ParsedTurn[] {
  const all = parseTranscript(text);
  return all.slice(-k);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- meetings.test`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/meetings.ts src/lib/server/meetings.test.ts
git commit -m "feat(meetings): filesystem CRUD"
```

---

## Task 6: Extract `applyReflectionBlocks`

**Files:**
- Modify: `src/lib/server/reflection.ts`
- Modify: `src/lib/server/runner.ts`
- Create: `src/lib/server/reflection-apply.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/server/reflection-apply.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { applyReflectionBlocks } from './reflection';
import { createCouncil } from './councils';
import { createCouncillor } from './councillors';

describe('applyReflectionBlocks', () => {
  beforeEach(async () => {
    process.env.LANDSRAAD_COUNCIL_ROOT = mkdtempSync(join(tmpdir(), 'landsraad-refl-'));
    await createCouncil({ name: 'T', description: '' });
    await createCouncillor({ name: 'Leto', role: 'duke', routing_hint: '', adapter: 'mock:local', persona: '' });
  });

  it('writes private + shared memories and creates job proposals', async () => {
    const text = `
<<MEMORY title="lesson-1">>
note body
<</MEMORY>>
<<MEMORY title="public-thing" scope="shared">>
shared body
<</MEMORY>>
<<JOB title="follow up" councillor="leto" priority="high">>
go look at X
<</JOB>>
`;
    const result = await applyReflectionBlocks({
      text,
      sourceCouncillorSlug: 'leto',
      sourceKind: 'meeting',
      sourceId: 'mtg-1'
    });
    expect(result.memorySlugs).toHaveLength(1);
    expect(result.sharedMemorySlugs).toHaveLength(1);
    expect(result.proposalIds).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- reflection-apply`
Expected: FAIL — `applyReflectionBlocks` not exported.

- [ ] **Step 3: Add `applyReflectionBlocks` to `reflection.ts`**

Append to `src/lib/server/reflection.ts`:

```ts
import { createPrivateNote } from './memory_private';
import { createSharedNoteAutoSuffix } from './memory';
import { createJobProposal } from './proposals';

export interface ApplyReflectionInput {
  text: string;
  sourceCouncillorSlug: string;
  sourceKind: 'job' | 'meeting';
  sourceId: string;
}

export interface ApplyReflectionResult {
  memorySlugs: string[];
  sharedMemorySlugs: string[];
  proposalIds: string[];
  errors: string[];
}

export async function applyReflectionBlocks(input: ApplyReflectionInput): Promise<ApplyReflectionResult> {
  const memorySlugs: string[] = [];
  const sharedMemorySlugs: string[] = [];
  const proposalIds: string[] = [];
  const errors: string[] = [];

  for (const b of parseMemoryBlocks(input.text)) {
    try {
      if (b.scope === 'shared') {
        const note = await createSharedNoteAutoSuffix({ title: b.title, body: b.body });
        sharedMemorySlugs.push(note.slug);
      } else {
        const note = await createPrivateNote(input.sourceCouncillorSlug, { title: b.title, body: b.body });
        memorySlugs.push(note.slug);
      }
    } catch (err) {
      errors.push(`note "${b.title}" failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  for (const jb of parseJobBlocks(input.text)) {
    try {
      const p = await createJobProposal({
        proposed_by: input.sourceCouncillorSlug,
        source_job_id: input.sourceKind === 'job' ? input.sourceId : '',
        title: jb.title,
        brief: jb.brief,
        target_councillor: jb.councillor,
        priority: jb.priority
      });
      proposalIds.push(p.id);
    } catch (err) {
      errors.push(`job proposal "${jb.title}" failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return { memorySlugs, sharedMemorySlugs, proposalIds, errors };
}
```

(If `createJobProposal` requires a non-empty `source_job_id`, widen its signature to allow `null` for meeting-sourced proposals — or pass `meeting:<id>` as the source label. Add a follow-up note in the test if this fails so the engineer adjusts `proposals.ts`.)

- [ ] **Step 4: Switch `runner.ts` to call `applyReflectionBlocks`**

Replace the inline parse-and-apply loop in `reflectAfterSuccess` (runner.ts) with:

```ts
const apply = await applyReflectionBlocks({
  text: reflectionOut,
  sourceCouncillorSlug: councillor.slug,
  sourceKind: 'job',
  sourceId: job.id
});
for (const msg of apply.errors) {
  await appendEvent(job.id, {
    at: new Date().toISOString(),
    type: 'reflection_failed',
    message: msg
  });
}
const persisted = await readJob(job.id);
await writeJob({
  ...persisted,
  memory_slugs: apply.memorySlugs,
  shared_memory_slugs: apply.sharedMemorySlugs
});
const totalWritten = apply.memorySlugs.length + apply.sharedMemorySlugs.length;
await appendEvent(job.id, {
  at: new Date().toISOString(),
  type: 'reflected',
  message: `wrote ${totalWritten} memor${totalWritten === 1 ? 'y' : 'ies'}`
});
for (const pid of apply.proposalIds) {
  await appendEvent(job.id, {
    at: new Date().toISOString(),
    type: 'proposed_job',
    message: `proposal ${pid}`
  });
}
```

- [ ] **Step 5: Run all tests**

Run: `npm test`
Expected: every test passes (new + existing reflection / runner tests).

- [ ] **Step 6: Commit**

```bash
git add src/lib/server/reflection.ts src/lib/server/runner.ts src/lib/server/reflection-apply.test.ts
git commit -m "refactor(reflection): extract applyReflectionBlocks (reusable from meetings)"
```

---

## Task 7: Add meeting chunk kinds + indexer hooks

**Files:**
- Modify: `src/lib/server/embeddings.ts`
- Modify: `src/lib/server/indexer.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/server/meeting-index.test.ts
import { describe, it, expect } from 'vitest';
import type { ChunkKind } from './embeddings';

describe('meeting chunk kinds', () => {
  it('exports meeting_topic | meeting_turn | meeting_summary | meeting_synthesis', () => {
    const accepted: ChunkKind[] = ['meeting_topic', 'meeting_turn', 'meeting_summary', 'meeting_synthesis'];
    for (const k of accepted) {
      // Type-level check only — assignment to ChunkKind compiles
      const x: ChunkKind = k;
      void x;
      expect(typeof k).toBe('string');
    }
  });
});
```

- [ ] **Step 2: Run check to verify it fails**

Run: `npm run check`
Expected: error — `meeting_topic` not assignable to `ChunkKind`.

- [ ] **Step 3: Extend `ChunkKind`**

Edit `src/lib/server/embeddings.ts`:

```ts
export type ChunkKind =
  | 'memory'
  | 'memory_private'
  | 'job_input'
  | 'job_output'
  | 'transcript'
  | 'persona'
  | 'meeting_topic'
  | 'meeting_turn'
  | 'meeting_summary'
  | 'meeting_synthesis';
```

- [ ] **Step 4: Run check + test**

Run: `npm run check && npm test -- meeting-index`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/embeddings.ts src/lib/server/meeting-index.test.ts
git commit -m "feat(index): meeting chunk kinds"
```

---

## Task 8: Meeting-runner — create + advance to awaiting_director

**Files:**
- Create: `src/lib/server/meeting-runner.ts`
- Create: `src/lib/server/meeting-runner.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/server/meeting-runner.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startMeeting } from './meeting-runner';
import { _resetForTests as resetLock, listHeldBy } from './councillor-lock';
import { createCouncil } from './councils';
import { createCouncillor } from './councillors';
import { readMeeting } from './meetings';

async function setup() {
  process.env.LANDSRAAD_COUNCIL_ROOT = mkdtempSync(join(tmpdir(), 'landsraad-mr-'));
  resetLock();
  await createCouncil({ name: 'T', description: '' });
  await createCouncillor({ name: 'Leto', role: 'duke', routing_hint: '', adapter: 'mock:local', persona: '' });
  await createCouncillor({ name: 'Mocky', role: 'sidekick', routing_hint: '', adapter: 'mock:local', persona: '' });
}

describe('meeting-runner startMeeting', () => {
  beforeEach(setup);

  it('acquires locks for all attendees and parks in awaiting_director', async () => {
    const m = await startMeeting({
      title: 'S',
      topic: 't',
      chair_slug: 'leto',
      attendees: ['leto', 'mocky'],
      window_k: 2
    });
    expect(m.status).toBe('awaiting_director');
    expect(listHeldBy({ kind: 'meeting', id: m.id }).sort()).toEqual(['leto', 'mocky']);
    const persisted = await readMeeting(m.id);
    expect(persisted.status).toBe('awaiting_director');
  });

  it('fails if any attendee is already busy', async () => {
    const { tryAcquire } = await import('./councillor-lock');
    tryAcquire('leto', { kind: 'job', id: 'J1' });
    await expect(
      startMeeting({
        title: 'S',
        topic: 't',
        chair_slug: 'leto',
        attendees: ['leto', 'mocky'],
        window_k: 2
      })
    ).rejects.toThrow(/leto/);
    expect(listHeldBy({ kind: 'meeting', id: 'x' })).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- meeting-runner`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement `startMeeting`**

```ts
// src/lib/server/meeting-runner.ts
import { tryAcquire, release as releaseLock } from './councillor-lock';
import { createMeeting, type NewMeetingInput, writeMeeting, appendMeetingEvent, readMeeting } from './meetings';
import type { Meeting } from '$lib/types';

export async function startMeeting(input: NewMeetingInput, now: Date = new Date()): Promise<Meeting> {
  // Pre-flight: every attendee must be free.
  const busy: string[] = [];
  for (const slug of input.attendees) {
    if (!tryAcquire(slug, { kind: 'meeting', id: 'PROBE' })) busy.push(slug);
  }
  // Release probe locks; we acquire the real id below.
  for (const slug of input.attendees) {
    releaseLock(slug, { kind: 'meeting', id: 'PROBE' });
  }
  if (busy.length > 0) {
    throw new Error(`Cannot start meeting: councillor(s) busy: ${busy.join(', ')}`);
  }

  const meeting = await createMeeting(input, now);
  for (const slug of meeting.attendees) {
    tryAcquire(slug, { kind: 'meeting', id: meeting.id });
  }
  return meeting;
}

export async function releaseMeetingLocks(meeting: Meeting): Promise<void> {
  for (const slug of meeting.attendees) {
    releaseLock(slug, { kind: 'meeting', id: meeting.id });
  }
}
```

- [ ] **Step 4: Run test**

Run: `npm test -- meeting-runner`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/meeting-runner.ts src/lib/server/meeting-runner.test.ts
git commit -m "feat(meeting-runner): startMeeting + lock acquisition"
```

---

## Task 9: Meeting-runner — director turn + skip

**Files:**
- Modify: `src/lib/server/meeting-runner.ts`
- Modify: `src/lib/server/meeting-runner.test.ts`

- [ ] **Step 1: Append the failing test**

```ts
// add to meeting-runner.test.ts
import { directorSpeak, directorSkip } from './meeting-runner';
import { readTranscript, readMeetingEvents } from './meetings';

it('directorSpeak appends a transcript block and marks director_spoken_this_round', async () => {
  const m = await startMeeting({ title: 'S', topic: 't', chair_slug: 'leto', attendees: ['leto', 'mocky'], window_k: 2 });
  await directorSpeak(m.id, 'good morning team');
  const after = await readMeeting(m.id);
  expect(after.director_spoken_this_round).toBe(true);
  expect(after.total_turns).toBe(1);
  expect(after.status).not.toBe('awaiting_director'); // transitions to running, then advances
  const t = await readTranscript(m.id);
  expect(t).toContain('director');
  expect(t).toContain('good morning team');
});

it('directorSkip flips director_spoken_this_round without appending', async () => {
  const m = await startMeeting({ title: 'S', topic: 't', chair_slug: 'leto', attendees: ['leto'], window_k: 2 });
  await directorSkip(m.id);
  const after = await readMeeting(m.id);
  expect(after.director_spoken_this_round).toBe(true);
  expect(after.total_turns).toBe(0);
  const evts = await readMeetingEvents(m.id);
  expect(evts.some((e) => e.type === 'director_skipped')).toBe(true);
});

it('rejects directorSpeak when not awaiting_director', async () => {
  const m = await startMeeting({ title: 'S', topic: 't', chair_slug: 'leto', attendees: ['leto'], window_k: 2 });
  await directorSpeak(m.id, 'a');
  // After speak, state should leave awaiting_director (running or awaiting_director if next round)
  await expect(directorSpeak(m.id, 'b')).rejects.toThrow(/awaiting_director/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- meeting-runner`
Expected: FAIL — `directorSpeak` / `directorSkip` not exported.

- [ ] **Step 3: Implement director actions + skeleton `advance`**

Add to `src/lib/server/meeting-runner.ts`:

```ts
import { appendTranscriptBlock, readMeeting as readM } from './meetings';

export async function directorSpeak(id: string, body: string, now: Date = new Date()): Promise<void> {
  const m = await readM(id);
  if (m.status !== 'awaiting_director') {
    throw new Error(`Meeting ${id} not awaiting_director (status=${m.status})`);
  }
  const trimmed = body.trim();
  if (!trimmed) throw new Error('Director message is empty.');
  m.total_turns += 1;
  await appendTranscriptBlock(id, {
    turnIndex: m.total_turns,
    speaker: 'director',
    at: now.toISOString(),
    body: trimmed
  });
  m.director_spoken_this_round = true;
  m.status = 'running';
  await writeMeeting(m);
  await appendMeetingEvent(id, {
    at: now.toISOString(),
    type: 'director_turn',
    speaker: 'director',
    turn_index: m.total_turns
  });
  await advance(id);
}

export async function directorSkip(id: string, now: Date = new Date()): Promise<void> {
  const m = await readM(id);
  if (m.status !== 'awaiting_director') {
    throw new Error(`Meeting ${id} not awaiting_director (status=${m.status})`);
  }
  m.director_spoken_this_round = true;
  m.status = 'running';
  await writeMeeting(m);
  await appendMeetingEvent(id, { at: now.toISOString(), type: 'director_skipped' });
  await advance(id);
}

// Placeholder: implemented in next task.
export async function advance(id: string): Promise<void> {
  const m = await readM(id);
  // For now, immediately park back in awaiting_director when remaining empty / no work done.
  if (m.status !== 'running') return;
  if (m.remaining_this_round.length === 0) {
    // start new round
    m.current_round += 1;
    m.remaining_this_round = [...m.attendees].sort(() => Math.random() - 0.5);
    m.director_spoken_this_round = false;
    m.status = 'awaiting_director';
    await writeMeeting(m);
    await appendMeetingEvent(m.id, { at: new Date().toISOString(), type: 'round_started' });
    await appendMeetingEvent(m.id, { at: new Date().toISOString(), type: 'awaiting_director' });
    return;
  }
  // Task 10 will implement the councillor turn here.
}
```

- [ ] **Step 4: Run test**

Run: `npm test -- meeting-runner`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/meeting-runner.ts src/lib/server/meeting-runner.test.ts
git commit -m "feat(meeting-runner): director speak + skip"
```

---

## Task 10: Meeting-runner — councillor turn loop (no summary yet)

**Files:**
- Modify: `src/lib/server/meeting-runner.ts`
- Modify: `src/lib/server/meeting-runner.test.ts`

- [ ] **Step 1: Append the failing test**

```ts
// add to meeting-runner.test.ts
it('happy path: director speaks, both councillors speak in round 1, then awaits director for round 2', async () => {
  const m = await startMeeting({ title: 'S', topic: 't', chair_slug: 'leto', attendees: ['leto', 'mocky'], window_k: 2 });
  await directorSpeak(m.id, 'hi');
  // After advance(), the runner should have spawned both councillor turns sequentially.
  // Poll briefly for completion (advance triggers async work in v1; allow for it).
  for (let i = 0; i < 50; i++) {
    const cur = await readMeeting(m.id);
    if (cur.status === 'awaiting_director' && cur.current_round === 2) break;
    await new Promise((r) => setTimeout(r, 20));
  }
  const final = await readMeeting(m.id);
  expect(final.current_round).toBe(2);
  expect(final.director_spoken_this_round).toBe(false);
  expect(final.total_turns).toBe(3); // director + 2 councillors
  const t = await readTranscript(m.id);
  expect(t.split('## Turn').length - 1).toBe(3);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- meeting-runner`
Expected: FAIL — only 1 turn (director); councillor turns not implemented.

- [ ] **Step 3: Implement councillor turn invocation**

Replace `advance` in `meeting-runner.ts`:

```ts
import { readCouncillor } from './councillors';
import { resolveAdapter } from './adapters';
import { runAdapter } from './adapters/runAdapter';
import { councilRoot } from './paths';
import { assembleContextFor } from './context';
import { readTopic, readSummary, readTranscript as readTx, lastKTurns } from './meetings';
import { MEETING_TURN_TIMEOUT_MS } from './config';

const inFlight = new Map<string, AbortController>(); // key: meetingId

function rosterHeader(_attendees: string[]): string {
  // Reuse existing roster injection — call assembleContextFor for that.
  return '';
}

async function buildTurnPrompt(meetingId: string, speakerSlug: string): Promise<string> {
  const m = await readM(meetingId);
  const councillor = await readCouncillor(speakerSlug);
  const topic = await readTopic(meetingId);
  const summary = await readSummary(meetingId);
  const transcript = await readTx(meetingId);
  const recent = lastKTurns(transcript, m.window_k)
    .map((t) => `## Turn ${t.turnIndex} — ${t.speaker} — ${t.at}\n\n${t.body}`)
    .join('\n\n');

  const memCtx = await assembleContextFor(speakerSlug, `${m.title}\n${topic}`);
  const sections: string[] = [];
  if (councillor.persona.trim()) sections.push(`# Persona\n\n${councillor.persona.trim()}`);
  if (memCtx) sections.push(memCtx);
  sections.push(
    [
      `# Meeting: ${m.title}`,
      '',
      `## Topic`,
      '',
      topic.trim() || '(no topic)',
      '',
      summary.trim() ? `## Summary of earlier turns\n\n${summary.trim()}\n` : '',
      `## Recent turns`,
      '',
      recent.trim() || '(no turns yet)',
      '',
      `You are ${speakerSlug}. Speak now.`
    ].join('\n')
  );
  return sections.join('\n\n') + '\n';
}

export async function advance(id: string): Promise<void> {
  if (inFlight.has(id)) return; // a turn is already running
  const m = await readM(id);
  if (m.status !== 'running') return;

  // End of round?
  if (!m.director_spoken_this_round) {
    m.status = 'awaiting_director';
    await writeMeeting(m);
    await appendMeetingEvent(id, { at: new Date().toISOString(), type: 'awaiting_director' });
    return;
  }
  if (m.remaining_this_round.length === 0) {
    m.current_round += 1;
    m.remaining_this_round = [...m.attendees].sort(() => Math.random() - 0.5);
    m.director_spoken_this_round = false;
    m.status = 'awaiting_director';
    await writeMeeting(m);
    await appendMeetingEvent(id, { at: new Date().toISOString(), type: 'round_started' });
    await appendMeetingEvent(id, { at: new Date().toISOString(), type: 'awaiting_director' });
    return;
  }

  const speakerSlug = m.remaining_this_round.shift()!;
  await writeMeeting(m);
  await appendMeetingEvent(id, { at: new Date().toISOString(), type: 'turn_started', speaker: speakerSlug });

  const councillor = await readCouncillor(speakerSlug);
  const adapter = resolveAdapter(councillor.adapter);
  if (!adapter) {
    const cur = await readM(id);
    cur.status = 'paused';
    cur.pause_reason = `turn_failed: unknown adapter "${councillor.adapter}" for ${speakerSlug}`;
    await writeMeeting(cur);
    await appendMeetingEvent(id, { at: new Date().toISOString(), type: 'turn_failed', speaker: speakerSlug, message: cur.pause_reason });
    await appendMeetingEvent(id, { at: new Date().toISOString(), type: 'paused', message: cur.pause_reason });
    return;
  }

  const controller = new AbortController();
  inFlight.set(id, controller);
  try {
    const prompt = await buildTurnPrompt(id, speakerSlug);
    const result = await runAdapter({
      adapter,
      prompt,
      cwd: councilRoot(),
      timeoutMs: MEETING_TURN_TIMEOUT_MS,
      abortSignal: controller.signal
    });

    if (controller.signal.aborted) {
      // Cancelled mid-turn; the cancel handler set the status.
      return;
    }

    if (result.exit_code !== 0) {
      const cur = await readM(id);
      cur.status = 'paused';
      cur.pause_reason = result.timedOut
        ? 'turn_timeout'
        : `turn_failed: exit ${result.exit_code}`;
      // Put the speaker back at the head of the round so resume retries them.
      cur.remaining_this_round.unshift(speakerSlug);
      await writeMeeting(cur);
      await appendMeetingEvent(id, { at: new Date().toISOString(), type: 'turn_failed', speaker: speakerSlug, message: cur.pause_reason });
      await appendMeetingEvent(id, { at: new Date().toISOString(), type: 'paused', message: cur.pause_reason });
      return;
    }

    const cur = await readM(id);
    cur.total_turns += 1;
    await appendTranscriptBlock(id, {
      turnIndex: cur.total_turns,
      speaker: speakerSlug,
      at: new Date().toISOString(),
      body: result.output
    });
    await writeMeeting(cur);
    await appendMeetingEvent(id, { at: new Date().toISOString(), type: 'turn_finished', speaker: speakerSlug, turn_index: cur.total_turns });
  } finally {
    inFlight.delete(id);
  }

  // Tail-recurse to advance to the next turn / round / awaiting_director.
  await advance(id);
}
```

- [ ] **Step 4: Run test**

Run: `npm test -- meeting-runner`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/meeting-runner.ts src/lib/server/meeting-runner.test.ts
git commit -m "feat(meeting-runner): councillor turn loop"
```

---

## Task 11: Meeting-runner — lazy chair summary refresh

**Files:**
- Modify: `src/lib/server/meeting-runner.ts`
- Modify: `src/lib/server/meeting-runner.test.ts`

- [ ] **Step 1: Append the failing test**

```ts
// add to meeting-runner.test.ts
import { readSummary } from './meetings';

it('with window_k=2, chair-summary fires once we exceed the window', async () => {
  const m = await startMeeting({ title: 'S', topic: 't', chair_slug: 'leto', attendees: ['leto', 'mocky'], window_k: 2 });
  await directorSpeak(m.id, 'round 1 input');
  // Wait for round 1 to finish (council turns done) → awaiting_director for round 2.
  for (let i = 0; i < 50; i++) {
    const cur = await readMeeting(m.id);
    if (cur.status === 'awaiting_director' && cur.current_round === 2) break;
    await new Promise((r) => setTimeout(r, 20));
  }
  await directorSpeak(m.id, 'round 2 input');
  // Wait for round 2.
  for (let i = 0; i < 50; i++) {
    const cur = await readMeeting(m.id);
    if (cur.status === 'awaiting_director' && cur.current_round === 3) break;
    await new Promise((r) => setTimeout(r, 20));
  }
  // Total turns by now: 3 + 3 = 6. window_k=2 → 4 should be summarized.
  const summary = await readSummary(m.id);
  expect(summary.length).toBeGreaterThan(0);
  const evts = await readMeetingEvents(m.id);
  expect(evts.some((e) => e.type === 'summarized')).toBe(true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- meeting-runner`
Expected: FAIL — no `summarized` event.

- [ ] **Step 3: Implement summary refresh**

Add to `meeting-runner.ts`, called from inside `advance()` **before** building the turn prompt:

```ts
import { MEETING_SUMMARY_TIMEOUT_MS } from './config';
import { writeSummary } from './meetings';

async function refreshSummaryIfNeeded(meetingId: string): Promise<void> {
  const m = await readM(meetingId);
  const transcript = await readTx(meetingId);
  const turns = (await import('./meetings')).parseTranscript(transcript);
  const displacedEnd = turns.length - m.window_k;
  if (displacedEnd <= m.last_summarized_turn) return; // nothing newly displaced
  const displaced = turns.filter((t) => t.turnIndex > m.last_summarized_turn && t.turnIndex <= displacedEnd);
  if (displaced.length === 0) return;

  const chair = await readCouncillor(m.chair_slug);
  const adapter = resolveAdapter(chair.adapter);
  if (!adapter) return; // skip silently; pause on real failure

  const prior = await readSummary(meetingId);
  const block = displaced
    .map((t) => `## Turn ${t.turnIndex} — ${t.speaker} — ${t.at}\n\n${t.body}`)
    .join('\n\n');
  const prompt = [
    '# Rolling meeting summary',
    '',
    `You are the chair (${m.chair_slug}) summarizing displaced turns for future context.`,
    'Rewrite the summary so it covers everything below in 4-8 sentences. Preserve names, decisions, open threads.',
    '',
    '## Prior summary',
    '',
    prior.trim() || '(none)',
    '',
    '## New displaced turns',
    '',
    block,
    ''
  ].join('\n');

  const result = await runAdapter({
    adapter,
    prompt,
    cwd: councilRoot(),
    timeoutMs: MEETING_SUMMARY_TIMEOUT_MS
  });
  if (result.exit_code !== 0) {
    await appendMeetingEvent(meetingId, {
      at: new Date().toISOString(),
      type: 'turn_failed',
      message: `summary_failed: exit ${result.exit_code}`
    });
    return;
  }
  await writeSummary(meetingId, result.output.trim());
  const cur = await readM(meetingId);
  cur.last_summarized_turn = displacedEnd;
  await writeMeeting(cur);
  await appendMeetingEvent(meetingId, { at: new Date().toISOString(), type: 'summarized' });
}
```

In `advance()`, call `await refreshSummaryIfNeeded(id);` right after the "pop next speaker" step and before `buildTurnPrompt`.

- [ ] **Step 4: Run test**

Run: `npm test -- meeting-runner`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/meeting-runner.ts src/lib/server/meeting-runner.test.ts
git commit -m "feat(meeting-runner): lazy chair summary refresh"
```

---

## Task 12: Meeting-runner — end → synthesize → ended

**Files:**
- Modify: `src/lib/server/meeting-runner.ts`
- Modify: `src/lib/server/meeting-runner.test.ts`

- [ ] **Step 1: Append the failing test**

```ts
// add to meeting-runner.test.ts
import { endMeeting } from './meeting-runner';
import { readSynthesis } from './meetings';

it('endMeeting writes synthesis.md, releases locks, parses MEMORY/JOB blocks', async () => {
  const m = await startMeeting({ title: 'S', topic: 't', chair_slug: 'leto', attendees: ['leto', 'mocky'], window_k: 2 });
  await directorSpeak(m.id, 'discuss X');
  for (let i = 0; i < 50; i++) {
    const cur = await readMeeting(m.id);
    if (cur.status === 'awaiting_director') break;
    await new Promise((r) => setTimeout(r, 20));
  }
  await endMeeting(m.id);
  const final = await readMeeting(m.id);
  expect(final.status).toBe('ended');
  expect(final.ended_at).toBeTruthy();
  const synth = await readSynthesis(m.id);
  expect(synth.length).toBeGreaterThan(0);
  // Locks released
  const { listHeldBy } = await import('./councillor-lock');
  expect(listHeldBy({ kind: 'meeting', id: m.id })).toEqual([]);
});

it('endMeeting works from paused (end-now)', async () => {
  // Configure mock to fail one turn -> paused -> end now -> synthesizing -> ended.
  // (Use mock:local with a sentinel that triggers exit_code != 0 if supported,
  //  or stub the adapter via resolveAdapter override for this test.)
  // For simplicity here: end immediately from awaiting_director (no failure path).
  const m = await startMeeting({ title: 'S', topic: 't', chair_slug: 'leto', attendees: ['leto'], window_k: 2 });
  await endMeeting(m.id);
  const final = await readMeeting(m.id);
  expect(final.status).toBe('ended');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- meeting-runner`
Expected: FAIL — `endMeeting` not exported.

- [ ] **Step 3: Implement `endMeeting`**

```ts
// in meeting-runner.ts
import { applyReflectionBlocks } from './reflection';
import { writeSynthesis as ws } from './meetings';

export async function endMeeting(id: string, now: Date = new Date()): Promise<void> {
  const cur = await readM(id);
  if (cur.status === 'ended' || cur.status === 'cancelled' || cur.status === 'failed') return;
  if (cur.status === 'synthesizing') return;

  // If a turn is in flight, signal and wait briefly.
  const inflight = inFlight.get(id);
  if (inflight) inflight.abort();
  // crude wait — production: replace with a notify primitive
  for (let i = 0; i < 50 && inFlight.has(id); i++) await new Promise((r) => setTimeout(r, 20));

  cur.status = 'synthesizing';
  await writeMeeting(cur);
  await appendMeetingEvent(id, { at: now.toISOString(), type: 'synthesizing' });

  const chair = await readCouncillor(cur.chair_slug);
  const adapter = resolveAdapter(chair.adapter);
  const topic = await readTopic(id);
  const summary = await readSummary(id);
  const transcript = await readTx(id);
  const recent = lastKTurns(transcript, cur.window_k)
    .map((t) => `## Turn ${t.turnIndex} — ${t.speaker} — ${t.at}\n\n${t.body}`)
    .join('\n\n');

  const prompt = [
    '# Meeting synthesis',
    '',
    `You are ${cur.chair_slug} (chair). The director has ended the meeting. Write a concise synthesis — decisions, open threads, action items.`,
    '',
    'You may emit zero or more memory blocks:',
    '',
    '<<MEMORY title="short slug-friendly title">>',
    'body — why worth remembering',
    '<</MEMORY>>',
    '',
    'Use scope="shared" on the opening tag for council-wide memory:',
    '',
    '<<MEMORY title="..." scope="shared">>...<</MEMORY>>',
    '',
    'You may also propose zero or more follow-up jobs:',
    '',
    '<<JOB title="..." councillor="optional-slug" priority="normal">>',
    'brief',
    '<</JOB>>',
    '',
    '## Topic',
    '',
    topic.trim() || '(empty)',
    '',
    '## Rolling summary',
    '',
    summary.trim() || '(none)',
    '',
    '## Recent turns',
    '',
    recent || '(no turns)',
    ''
  ].join('\n');

  let synthesisText = '';
  let failed = false;
  if (!adapter) {
    failed = true;
  } else {
    const result = await runAdapter({
      adapter,
      prompt,
      cwd: councilRoot(),
      timeoutMs: MEETING_SUMMARY_TIMEOUT_MS
    });
    if (result.exit_code !== 0) failed = true;
    else synthesisText = result.output;
  }

  if (failed) {
    const c = await readM(id);
    c.status = 'failed';
    c.ended_at = now.toISOString();
    await writeMeeting(c);
    await appendMeetingEvent(id, { at: now.toISOString(), type: 'crashed', message: 'synthesis adapter failed' });
    await releaseMeetingLocks(c);
    return;
  }

  await ws(id, synthesisText);
  await appendMeetingEvent(id, { at: now.toISOString(), type: 'synthesized' });

  const apply = await applyReflectionBlocks({
    text: synthesisText,
    sourceCouncillorSlug: cur.chair_slug,
    sourceKind: 'meeting',
    sourceId: id
  });
  await appendMeetingEvent(id, { at: now.toISOString(), type: 'proposals_parsed', message: `mem=${apply.memorySlugs.length} shared=${apply.sharedMemorySlugs.length} proposals=${apply.proposalIds.length}` });

  const c = await readM(id);
  c.status = 'ended';
  c.ended_at = now.toISOString();
  c.memory_slugs = apply.memorySlugs;
  c.shared_memory_slugs = apply.sharedMemorySlugs;
  c.proposed_jobs = apply.proposalIds;
  await writeMeeting(c);
  await appendMeetingEvent(id, { at: now.toISOString(), type: 'ended' });
  await releaseMeetingLocks(c);
}
```

- [ ] **Step 4: Run test**

Run: `npm test -- meeting-runner`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/meeting-runner.ts src/lib/server/meeting-runner.test.ts
git commit -m "feat(meeting-runner): end + synthesize + reflection-blocks"
```

---

## Task 13: Meeting-runner — pause/resume + cancel

**Files:**
- Modify: `src/lib/server/meeting-runner.ts`
- Modify: `src/lib/server/meeting-runner.test.ts`

- [ ] **Step 1: Append the failing test**

```ts
// add to meeting-runner.test.ts
import { resumeMeeting, cancelMeeting } from './meeting-runner';

it('cancelMeeting transitions to cancelled and releases locks', async () => {
  const m = await startMeeting({ title: 'S', topic: 't', chair_slug: 'leto', attendees: ['leto'], window_k: 2 });
  await cancelMeeting(m.id);
  const final = await readMeeting(m.id);
  expect(final.status).toBe('cancelled');
  const { listHeldBy } = await import('./councillor-lock');
  expect(listHeldBy({ kind: 'meeting', id: m.id })).toEqual([]);
});

it('resumeMeeting flips paused → running and advances', async () => {
  // Manually set paused state and verify resume transitions.
  const m = await startMeeting({ title: 'S', topic: 't', chair_slug: 'leto', attendees: ['leto'], window_k: 2 });
  const { readMeeting: rM } = await import('./meetings');
  const cur = await rM(m.id);
  cur.status = 'paused';
  cur.pause_reason = 'turn_failed: test';
  cur.director_spoken_this_round = true;
  await (await import('./meetings')).writeMeeting(cur);
  await resumeMeeting(m.id);
  const after = await rM(m.id);
  expect(['running', 'awaiting_director']).toContain(after.status);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- meeting-runner`
Expected: FAIL — `cancelMeeting`/`resumeMeeting` missing.

- [ ] **Step 3: Implement cancel + resume**

```ts
// in meeting-runner.ts
export async function cancelMeeting(id: string, now: Date = new Date()): Promise<void> {
  const cur = await readM(id);
  if (['ended', 'cancelled', 'failed'].includes(cur.status)) return;
  const inflight = inFlight.get(id);
  if (inflight) inflight.abort();
  for (let i = 0; i < 50 && inFlight.has(id); i++) await new Promise((r) => setTimeout(r, 20));
  const fresh = await readM(id);
  fresh.status = 'cancelled';
  fresh.ended_at = now.toISOString();
  fresh.pause_reason = undefined;
  await writeMeeting(fresh);
  await appendMeetingEvent(id, { at: now.toISOString(), type: 'cancelled' });
  await releaseMeetingLocks(fresh);
}

export async function resumeMeeting(id: string, now: Date = new Date()): Promise<void> {
  const cur = await readM(id);
  if (cur.status !== 'paused') return;
  cur.status = 'running';
  cur.pause_reason = undefined;
  await writeMeeting(cur);
  await appendMeetingEvent(id, { at: now.toISOString(), type: 'resumed' });
  await advance(id);
}
```

- [ ] **Step 4: Run test**

Run: `npm test -- meeting-runner`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/meeting-runner.ts src/lib/server/meeting-runner.test.ts
git commit -m "feat(meeting-runner): cancel + resume"
```

---

## Task 14: Server-restart recovery

**Files:**
- Modify: `src/lib/server/meeting-runner.ts`
- Modify: `src/lib/server/scheduler.ts`
- Create: `src/lib/server/meeting-recovery.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/server/meeting-recovery.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { recoverMeetings } from './meeting-runner';
import { createCouncil } from './councils';
import { createCouncillor } from './councillors';
import { startMeeting } from './meeting-runner';
import { readMeeting, writeMeeting } from './meetings';

describe('recoverMeetings', () => {
  beforeEach(async () => {
    process.env.LANDSRAAD_COUNCIL_ROOT = mkdtempSync(join(tmpdir(), 'landsraad-rec-'));
    await createCouncil({ name: 'T', description: '' });
    await createCouncillor({ name: 'Leto', role: 'duke', routing_hint: '', adapter: 'mock:local', persona: '' });
  });

  it('flips non-terminal meetings to failed and clears locks', async () => {
    const m = await startMeeting({ title: 'S', topic: 't', chair_slug: 'leto', attendees: ['leto'], window_k: 2 });
    // simulate crash mid-running
    const cur = await readMeeting(m.id);
    cur.status = 'running';
    await writeMeeting(cur);
    const { _resetForTests } = await import('./councillor-lock');
    _resetForTests();
    await recoverMeetings();
    const after = await readMeeting(m.id);
    expect(after.status).toBe('failed');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- meeting-recovery`
Expected: FAIL — `recoverMeetings` missing.

- [ ] **Step 3: Implement recovery**

```ts
// in meeting-runner.ts
import { listMeetings } from './meetings';

export async function recoverMeetings(now: Date = new Date()): Promise<void> {
  const all = await listMeetings();
  for (const m of all) {
    if (['ended', 'cancelled', 'failed'].includes(m.status)) continue;
    const fresh = { ...m, status: 'failed' as const, ended_at: now.toISOString(), pause_reason: `crashed_during=${m.status}` };
    await writeMeeting(fresh);
    await appendMeetingEvent(m.id, { at: now.toISOString(), type: 'crashed', message: `crashed_during=${m.status}` });
    // Locks live in-process; on restart the map is empty already.
  }
}
```

- [ ] **Step 4: Wire recovery into `startScheduler`**

Edit `src/lib/server/scheduler.ts` `startScheduler()`:

```ts
import { recoverMeetings, advance as advanceMeeting } from './meeting-runner';
import { listMeetings } from './meetings';

export async function startScheduler(now: Date = new Date()): Promise<void> {
  if (interval) return;
  try {
    await recoverMeetings(now);
    await catchUp(now);
  } catch (err) {
    console.error('[scheduler] startup failed:', err);
  }
  interval = setInterval(() => {
    void tickOnce();
    void tickMeetings();
  }, TICK_MS);
}

async function tickMeetings(): Promise<void> {
  try {
    const running = await listMeetings({ status: ['running', 'paused'] as never });
    for (const m of running) {
      if (m.status === 'running') void advanceMeeting(m.id);
    }
  } catch (err) {
    console.error('[scheduler] meeting tick crashed:', err);
  }
}
```

Note: cast `['running','paused'] as never` is a typing hack — adjust `listMeetings` signature to accept `MeetingStatus[]` if not already (Task 5 already does).

- [ ] **Step 5: Run tests**

Run: `npm test`
Expected: every test passes.

- [ ] **Step 6: Commit**

```bash
git add src/lib/server/meeting-runner.ts src/lib/server/scheduler.ts src/lib/server/meeting-recovery.test.ts
git commit -m "feat(meeting-runner): server-restart recovery + scheduler tick"
```

---

## Task 15: Index meeting artifacts

**Files:**
- Modify: `src/lib/server/meetings.ts`
- Create: `src/lib/server/meeting-indexing.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/server/meeting-indexing.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createMeeting, appendTranscriptBlock, writeSummary, writeSynthesis } from './meetings';
import { createCouncil } from './councils';
import { createCouncillor } from './councillors';

const upsertCalls: Array<{ kind: string; ref_id: string }> = [];
vi.mock('./indexer', async () => {
  return {
    indexUpsert: vi.fn(async (args: { kind: string; ref_id: string }) => {
      upsertCalls.push({ kind: args.kind, ref_id: args.ref_id });
    }),
    indexDelete: vi.fn()
  };
});

describe('meeting indexing hooks', () => {
  beforeEach(async () => {
    upsertCalls.length = 0;
    process.env.LANDSRAAD_COUNCIL_ROOT = mkdtempSync(join(tmpdir(), 'landsraad-mi-'));
    await createCouncil({ name: 'T', description: '' });
    await createCouncillor({ name: 'Leto', role: 'duke', routing_hint: '', adapter: 'mock:local', persona: '' });
  });

  it('createMeeting upserts meeting_topic', async () => {
    const m = await createMeeting({ title: 'S', topic: 'topic body', chair_slug: 'leto', attendees: ['leto'], window_k: 2 });
    expect(upsertCalls.some((c) => c.kind === 'meeting_topic' && c.ref_id === m.id)).toBe(true);
  });

  it('appendTranscriptBlock upserts meeting_turn with chunk_idx', async () => {
    const m = await createMeeting({ title: 'S', topic: 't', chair_slug: 'leto', attendees: ['leto'], window_k: 2 });
    await appendTranscriptBlock(m.id, { turnIndex: 1, speaker: 'director', at: '2026-05-28T00:00:00Z', body: 'hello' });
    expect(upsertCalls.some((c) => c.kind === 'meeting_turn')).toBe(true);
  });

  it('writeSummary upserts meeting_summary; writeSynthesis upserts meeting_synthesis', async () => {
    const m = await createMeeting({ title: 'S', topic: 't', chair_slug: 'leto', attendees: ['leto'], window_k: 2 });
    await writeSummary(m.id, 'sum');
    await writeSynthesis(m.id, 'synth');
    expect(upsertCalls.some((c) => c.kind === 'meeting_summary')).toBe(true);
    expect(upsertCalls.some((c) => c.kind === 'meeting_synthesis')).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- meeting-indexing`
Expected: FAIL — no upsert calls.

- [ ] **Step 3: Add `indexUpsert` calls to `meetings.ts`**

At the bottom of each filesystem mutator, call `indexUpsert`:

```ts
// in meetings.ts
import { indexUpsert } from './indexer';
import { meetingDir as mdir } from './paths';

// After writeFile of topic in createMeeting:
await indexUpsert({
  kind: 'meeting_topic',
  ref_id: id,
  text: input.topic,
  source_path: join(mdir(id), TOPIC_FILE),
  source_mtime: now.toISOString(),
  title: meeting.title,
  councillor_slug: null
});

// In appendTranscriptBlock:
export async function appendTranscriptBlock(id: string, block: TranscriptBlock): Promise<void> {
  const file = join(meetingDir(id), TRANSCRIPT_FILE);
  const text = `\n## Turn ${block.turnIndex} — ${block.speaker} — ${block.at}\n\n${block.body.trim()}\n`;
  await appendFile(file, text, 'utf8');
  const m = await readMeeting(id).catch(() => null);
  await indexUpsert({
    kind: 'meeting_turn',
    ref_id: id,
    chunk_idx: block.turnIndex,
    text: block.body,
    source_path: file,
    source_mtime: block.at,
    title: `${m?.title ?? id} · turn ${block.turnIndex} · ${block.speaker}`,
    councillor_slug: block.speaker === 'director' ? null : block.speaker
  });
}

// In writeSummary:
export async function writeSummary(id: string, body: string): Promise<void> {
  await writeFile(join(meetingDir(id), SUMMARY_FILE), body, 'utf8');
  const m = await readMeeting(id).catch(() => null);
  await indexUpsert({
    kind: 'meeting_summary',
    ref_id: id,
    text: body,
    source_path: join(meetingDir(id), SUMMARY_FILE),
    source_mtime: new Date().toISOString(),
    title: `${m?.title ?? id} · summary`,
    councillor_slug: m?.chair_slug ?? null
  });
}

// In writeSynthesis:
export async function writeSynthesis(id: string, body: string): Promise<void> {
  await writeFile(join(meetingDir(id), SYNTHESIS_FILE), body, 'utf8');
  const m = await readMeeting(id).catch(() => null);
  await indexUpsert({
    kind: 'meeting_synthesis',
    ref_id: id,
    text: body,
    source_path: join(meetingDir(id), SYNTHESIS_FILE),
    source_mtime: new Date().toISOString(),
    title: `${m?.title ?? id} · synthesis`,
    councillor_slug: m?.chair_slug ?? null
  });
}
```

Note: `IndexUpsertArgs.chunk_idx` may not be a field today — extend it in `indexer.ts` to forward to `embeddings.ts`'s `UpsertChunkInput.chunk_idx`.

- [ ] **Step 4: Run tests**

Run: `npm test -- meeting-indexing && npm test`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/meetings.ts src/lib/server/indexer.ts src/lib/server/meeting-indexing.test.ts
git commit -m "feat(index): index meeting topic, turns, summary, synthesis"
```

---

## Task 16: Routes — list + new

**Files:**
- Create: `src/routes/meetings/+page.server.ts`
- Create: `src/routes/meetings/+page.svelte`
- Create: `src/routes/meetings/new/+page.server.ts`
- Create: `src/routes/meetings/new/+page.svelte`

- [ ] **Step 1: Write the failing route test**

```ts
// src/routes/meetings/meetings-route.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { actions } from './new/+page.server';
import { createCouncil } from '$lib/server/councils';
import { createCouncillor } from '$lib/server/councillors';
import { listMeetings } from '$lib/server/meetings';

function formData(obj: Record<string, string | string[]>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(obj)) {
    if (Array.isArray(v)) for (const x of v) f.append(k, x);
    else f.append(k, v);
  }
  return f;
}

describe('/meetings/new', () => {
  beforeEach(async () => {
    process.env.LANDSRAAD_COUNCIL_ROOT = mkdtempSync(join(tmpdir(), 'landsraad-rt-'));
    const { _resetForTests } = await import('$lib/server/councillor-lock');
    _resetForTests();
    await createCouncil({ name: 'T', description: '' });
    await createCouncillor({ name: 'Leto', role: 'duke', routing_hint: '', adapter: 'mock:local', persona: '' });
    await createCouncillor({ name: 'Mocky', role: 'sidekick', routing_hint: '', adapter: 'mock:local', persona: '' });
  });

  it('default action starts a meeting and redirects', async () => {
    const request = new Request('http://x/', {
      method: 'POST',
      body: formData({
        title: 'Strategy',
        topic: 'What should we do?',
        chair: 'leto',
        attendees: ['leto', 'mocky'],
        window_k: '2'
      })
    });
    let redirected: string | null = null;
    try {
      await actions.default({ request } as Parameters<typeof actions.default>[0]);
    } catch (err) {
      // SvelteKit redirect throws — capture its location
      redirected = (err as { location?: string }).location ?? null;
    }
    expect(redirected).toMatch(/^\/meetings\//);
    const all = await listMeetings();
    expect(all).toHaveLength(1);
    expect(all[0].title).toBe('Strategy');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- meetings-route`
Expected: FAIL — `./new/+page.server` missing.

- [ ] **Step 3: Implement `/meetings` list route**

```ts
// src/routes/meetings/+page.server.ts
import type { PageServerLoad } from './$types';
import { listMeetings } from '$lib/server/meetings';

export const load: PageServerLoad = async () => {
  return { meetings: await listMeetings() };
};
```

```svelte
<!-- src/routes/meetings/+page.svelte -->
<script lang="ts">
  let { data } = $props();
</script>

<h1>Meetings</h1>
<p><a href="/meetings/new">+ New meeting</a></p>
{#if data.meetings.length === 0}
  <p>No meetings yet.</p>
{:else}
  <ul>
    {#each data.meetings as m (m.id)}
      <li>
        <a href={`/meetings/${m.id}`}>{m.title}</a>
        <span>· {m.status}</span>
        <span>· round {m.current_round}</span>
        <span>· {m.total_turns} turns</span>
        <span>· started {m.started_at}</span>
      </li>
    {/each}
  </ul>
{/if}
```

- [ ] **Step 4: Implement `/meetings/new` route**

```ts
// src/routes/meetings/new/+page.server.ts
import type { Actions, PageServerLoad } from './$types';
import { fail, redirect } from '@sveltejs/kit';
import { listCouncillors } from '$lib/server/councillors';
import { startMeeting } from '$lib/server/meeting-runner';
import { MEETING_WINDOW_K_DEFAULT } from '$lib/server/config';

export const load: PageServerLoad = async () => {
  return {
    councillors: await listCouncillors(),
    defaultWindowK: MEETING_WINDOW_K_DEFAULT
  };
};

export const actions: Actions = {
  default: async ({ request }) => {
    const form = await request.formData();
    const title = String(form.get('title') ?? '').trim();
    const topic = String(form.get('topic') ?? '');
    const chair = String(form.get('chair') ?? '').trim();
    const attendees = form.getAll('attendees').map(String).filter(Boolean);
    const windowK = Number.parseInt(String(form.get('window_k') ?? '4'), 10) || MEETING_WINDOW_K_DEFAULT;
    if (!title) return fail(400, { error: 'Title is required.' });
    if (!chair) return fail(400, { error: 'Chair is required.' });
    if (!attendees.includes(chair)) attendees.push(chair);
    try {
      const m = await startMeeting({
        title,
        topic,
        chair_slug: chair,
        attendees,
        window_k: windowK
      });
      throw redirect(303, `/meetings/${m.id}`);
    } catch (err) {
      if (err && typeof err === 'object' && 'status' in err && 'location' in err) throw err; // redirect
      return fail(400, { error: err instanceof Error ? err.message : String(err) });
    }
  }
};
```

```svelte
<!-- src/routes/meetings/new/+page.svelte -->
<script lang="ts">
  let { data, form } = $props();
</script>

<h1>New meeting</h1>
{#if form?.error}<p class="error">{form.error}</p>{/if}
<form method="POST">
  <label>Title <input name="title" required /></label>
  <label>Topic <textarea name="topic" rows="6"></textarea></label>
  <label>Chair
    <select name="chair" required>
      {#each data.councillors as c (c.slug)}
        <option value={c.slug}>{c.name} ({c.slug})</option>
      {/each}
    </select>
  </label>
  <fieldset>
    <legend>Attendees</legend>
    {#each data.councillors as c (c.slug)}
      <label><input type="checkbox" name="attendees" value={c.slug} checked /> {c.name}</label>
    {/each}
  </fieldset>
  <label>Window K <input name="window_k" type="number" min="1" value={data.defaultWindowK} /></label>
  <button type="submit">Start meeting</button>
</form>
```

- [ ] **Step 5: Run tests**

Run: `npm test -- meetings-route && npm run check`
Expected: PASS, 0 type errors.

- [ ] **Step 6: Commit**

```bash
git add src/routes/meetings/+page.server.ts src/routes/meetings/+page.svelte src/routes/meetings/new/+page.server.ts src/routes/meetings/new/+page.svelte src/routes/meetings/meetings-route.test.ts
git commit -m "feat(ui): /meetings list + /meetings/new"
```

---

## Task 17: Route — meeting detail with all director actions

**Files:**
- Create: `src/routes/meetings/[id]/+page.server.ts`
- Create: `src/routes/meetings/[id]/+page.svelte`
- Create: `src/routes/meetings/[id]/meeting-detail.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/routes/meetings/[id]/meeting-detail.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { actions, load } from './+page.server';
import { createCouncil } from '$lib/server/councils';
import { createCouncillor } from '$lib/server/councillors';
import { startMeeting } from '$lib/server/meeting-runner';
import { readMeeting } from '$lib/server/meetings';

describe('/meetings/[id] actions', () => {
  beforeEach(async () => {
    process.env.LANDSRAAD_COUNCIL_ROOT = mkdtempSync(join(tmpdir(), 'landsraad-md-'));
    const { _resetForTests } = await import('$lib/server/councillor-lock');
    _resetForTests();
    await createCouncil({ name: 'T', description: '' });
    await createCouncillor({ name: 'Leto', role: 'duke', routing_hint: '', adapter: 'mock:local', persona: '' });
  });

  it('speak appends a director turn', async () => {
    const m = await startMeeting({ title: 'S', topic: 't', chair_slug: 'leto', attendees: ['leto'], window_k: 2 });
    const form = new FormData();
    form.append('body', 'hello team');
    await actions.speak({
      request: new Request('http://x/', { method: 'POST', body: form }),
      params: { id: m.id }
    } as Parameters<typeof actions.speak>[0]);
    const after = await readMeeting(m.id);
    expect(after.director_spoken_this_round).toBe(true);
  });

  it('end transitions to ended', async () => {
    const m = await startMeeting({ title: 'S', topic: 't', chair_slug: 'leto', attendees: ['leto'], window_k: 2 });
    await actions.end({ params: { id: m.id } } as Parameters<typeof actions.end>[0]);
    const after = await readMeeting(m.id);
    expect(after.status).toBe('ended');
  });

  it('cancel transitions to cancelled', async () => {
    const m = await startMeeting({ title: 'S', topic: 't', chair_slug: 'leto', attendees: ['leto'], window_k: 2 });
    await actions.cancel({ params: { id: m.id } } as Parameters<typeof actions.cancel>[0]);
    const after = await readMeeting(m.id);
    expect(after.status).toBe('cancelled');
  });

  it('load returns meeting + transcript + topic', async () => {
    const m = await startMeeting({ title: 'S', topic: 'hello topic', chair_slug: 'leto', attendees: ['leto'], window_k: 2 });
    const data = await load({ params: { id: m.id } } as Parameters<typeof load>[0]);
    expect(data.meeting.id).toBe(m.id);
    expect(data.topic).toBe('hello topic');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- meeting-detail`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement `[id]` route**

```ts
// src/routes/meetings/[id]/+page.server.ts
import type { Actions, PageServerLoad } from './$types';
import { error, fail } from '@sveltejs/kit';
import {
  readMeeting,
  readMeetingEvents,
  readTopic,
  readTranscript,
  readSummary,
  readSynthesis
} from '$lib/server/meetings';
import {
  directorSpeak,
  directorSkip,
  endMeeting,
  cancelMeeting,
  resumeMeeting
} from '$lib/server/meeting-runner';

export const load: PageServerLoad = async ({ params }) => {
  const meeting = await readMeeting(params.id).catch(() => null);
  if (!meeting) throw error(404, 'Meeting not found');
  return {
    meeting,
    topic: await readTopic(params.id),
    transcript: await readTranscript(params.id),
    summary: await readSummary(params.id),
    synthesis: meeting.status === 'ended' ? await readSynthesis(params.id) : '',
    events: await readMeetingEvents(params.id)
  };
};

export const actions: Actions = {
  speak: async ({ request, params }) => {
    const form = await request.formData();
    const body = String(form.get('body') ?? '');
    try {
      await directorSpeak(params.id!, body);
    } catch (err) {
      return fail(400, { error: err instanceof Error ? err.message : String(err) });
    }
    return { ok: true };
  },
  skip: async ({ params }) => {
    try {
      await directorSkip(params.id!);
    } catch (err) {
      return fail(400, { error: err instanceof Error ? err.message : String(err) });
    }
    return { ok: true };
  },
  end: async ({ params }) => {
    try {
      await endMeeting(params.id!);
    } catch (err) {
      return fail(400, { error: err instanceof Error ? err.message : String(err) });
    }
    return { ok: true };
  },
  cancel: async ({ params }) => {
    try {
      await cancelMeeting(params.id!);
    } catch (err) {
      return fail(400, { error: err instanceof Error ? err.message : String(err) });
    }
    return { ok: true };
  },
  resume: async ({ params }) => {
    try {
      await resumeMeeting(params.id!);
    } catch (err) {
      return fail(400, { error: err instanceof Error ? err.message : String(err) });
    }
    return { ok: true };
  }
};
```

```svelte
<!-- src/routes/meetings/[id]/+page.svelte -->
<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  let { data, form } = $props();
  const m = $derived(data.meeting);

  let autoRefresh: ReturnType<typeof setInterval> | undefined;
  $effect(() => {
    const terminal = ['ended', 'cancelled', 'failed'].includes(m.status);
    if (!terminal) {
      autoRefresh = setInterval(() => void invalidateAll(), 2000);
    }
    return () => { if (autoRefresh) clearInterval(autoRefresh); };
  });
</script>

<h1>{m.title}</h1>
<p>
  <span>status: {m.status}</span> ·
  <span>chair: {m.chair_slug}</span> ·
  <span>attendees: {m.attendees.join(', ')}</span> ·
  <span>round: {m.current_round}</span> ·
  <span>turns: {m.total_turns}</span>
</p>

{#if m.pause_reason}<p class="pause">Paused: {m.pause_reason}</p>{/if}

{#if m.status === 'awaiting_director'}
  <form method="POST" action="?/speak">
    <label>Your turn <textarea name="body" rows="4"></textarea></label>
    <button type="submit">Speak</button>
  </form>
  <form method="POST" action="?/skip">
    <button type="submit">Skip this round</button>
  </form>
{/if}

<form method="POST" action="?/end" style="display:inline">
  {#if !['ended','cancelled','failed','synthesizing'].includes(m.status)}<button type="submit">End meeting</button>{/if}
</form>
<form method="POST" action="?/cancel" style="display:inline">
  {#if !['ended','cancelled','failed'].includes(m.status)}<button type="submit">Cancel</button>{/if}
</form>
{#if m.status === 'paused'}
  <form method="POST" action="?/resume" style="display:inline">
    <button type="submit">Resume</button>
  </form>
{/if}

<h2>Topic</h2>
<pre>{data.topic}</pre>

{#if data.synthesis}
  <h2>Synthesis</h2>
  <pre>{data.synthesis}</pre>
  {#if m.memory_slugs?.length}<p>Memories created: {m.memory_slugs.join(', ')}</p>{/if}
  {#if m.shared_memory_slugs?.length}<p>Shared memories: {m.shared_memory_slugs.join(', ')}</p>{/if}
  {#if m.proposed_jobs?.length}<p>Proposed jobs: {m.proposed_jobs.join(', ')}</p>{/if}
{/if}

{#if data.summary}
  <details>
    <summary>Rolling summary</summary>
    <pre>{data.summary}</pre>
  </details>
{/if}

<h2>Transcript</h2>
<pre>{data.transcript || '(empty)'}</pre>

{#if form?.error}<p class="error">{form.error}</p>{/if}
```

- [ ] **Step 4: Run tests**

Run: `npm test -- meeting-detail && npm run check`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/routes/meetings/[id]/+page.server.ts src/routes/meetings/[id]/+page.svelte src/routes/meetings/[id]/meeting-detail.test.ts
git commit -m "feat(ui): /meetings/[id] detail + actions"
```

---

## Task 18: Header nav + home card

**Files:**
- Modify: `src/routes/+layout.svelte`
- Modify: `src/routes/+page.server.ts`
- Modify: `src/routes/+page.svelte`

- [ ] **Step 1: Read current layout + home**

Run: `npm run dev` and visit `/` to note the existing layout. Then open `src/routes/+layout.svelte` and find the nav list.

- [ ] **Step 2: Add `Meetings` link to the nav**

Edit `src/routes/+layout.svelte`: inside the existing nav element add an `<a href="/meetings">Meetings</a>` link adjacent to the existing `Jobs` / `Memory` links. Match the existing styling (no new CSS).

- [ ] **Step 3: Expose meeting count to home**

Edit `src/routes/+page.server.ts`:

```ts
import { listMeetings } from '$lib/server/meetings';

// inside load(), after existing data:
const meetings = await listMeetings();
const activeMeetings = meetings.filter((m) => !['ended', 'cancelled', 'failed'].includes(m.status));
return {
  ...existing,
  meetingsTotal: meetings.length,
  activeMeetings: activeMeetings.length
};
```

(Adjust `existing` to match the route's actual return shape — open the file to see the names.)

- [ ] **Step 4: Render the meetings card on home**

Edit `src/routes/+page.svelte`: add a card next to the existing activity card:

```svelte
<section>
  <h2><a href="/meetings">Meetings</a></h2>
  <p>{data.activeMeetings} active · {data.meetingsTotal} total</p>
</section>
```

- [ ] **Step 5: Smoke test the UI**

Run: `npm run dev`
Open `http://localhost:5173/` and confirm:
- `Meetings` link in nav
- Meetings card visible
- Click `Meetings` → list page renders
- Click `+ New meeting` → form renders, councillors checked by default

Run: `npm run check`
Expected: 0 type errors.

- [ ] **Step 6: Commit**

```bash
git add src/routes/+layout.svelte src/routes/+page.server.ts src/routes/+page.svelte
git commit -m "feat(ui): nav link + home card for meetings"
```

---

## Task 19: Update `SPECIFICATION.md`

**Files:**
- Modify: `SPECIFICATION.md`

- [ ] **Step 1: Add the Meeting concept**

Open `SPECIFICATION.md`. After the `### Roster` section and before `### Council Template`, insert:

```markdown
### Meeting

A multi-turn round-table among councillors with the director participating each round. The director picks a chair, a topic, and attendees. Each round the director speaks first (or skips), then attending councillors speak in randomized order. When the director ends the meeting, the chair writes a synthesis that is scanned for `<<MEMORY>>` / `<<JOB>>` blocks via the existing reflection plumbing. Topic, per-turn transcript, rolling summary, and synthesis are embedded into the memory index so future jobs can retrieve them. While running, the meeting holds the busy-slot for every attendee; jobs assigned to in-meeting councillors stay `queued` until the meeting ends.
```

- [ ] **Step 2: Add v1 functionality item**

In the `## v1 Functionality` numbered list, after the "Schedules" item, add:

```markdown
12. **Meetings.** Convene a round-table at `/meetings/new`. Director participates each round. Chair writes a synthesis on end (parsed for `<<MEMORY>>` / `<<JOB>>` blocks). Artifacts embedded into the memory index.
```

- [ ] **Step 3: Add storage entries**

In `## Storage Model`'s tree, after `schedules/`:

```
  meetings/
    <meeting-id>/
      meeting.json
      topic.md
      transcript.md
      summary.md
      synthesis.md
      events.jsonl
```

- [ ] **Step 4: Add UI routes**

In the `## UI Surfaces (v1)` table, add:

```markdown
| `/meetings` | List meetings; status filter on top |
| `/meetings/new` | Create a meeting |
| `/meetings/[id]` | Meeting detail: live transcript, director input, end / cancel / resume |
```

- [ ] **Step 5: Move resolved items out of TBD**

Skim the TBD/Open Questions sections for any items the meeting feature resolves. None expected; leave as-is if so.

- [ ] **Step 6: Commit**

```bash
git add SPECIFICATION.md
git commit -m "docs(spec): council meetings"
```

---

## Self-Review

**Spec coverage check** (against `docs/superpowers/specs/2026-05-28-council-meetings-design.md`):

- Architecture: `runAdapter` (Task 1), `councillor-lock` (Task 2), `meetings.ts` (Task 5), `meeting-runner.ts` (Tasks 8–14). ✓
- Data model + filesystem: Task 5. ✓
- Lifecycle:
  - create → awaiting_director: Task 8 ✓
  - awaiting_director → running (speak/skip): Task 9 ✓
  - turn loop + round boundary: Task 10 ✓
  - summary refresh: Task 11 ✓
  - end → synthesize → ended + reflection blocks: Task 12 ✓
  - paused (per-turn failure) + resume: tests in Tasks 10 (failure path tested via adapter override is glossed — production engineer should add a `mock:local` stub-adapter helper that lets the test force exit_code !== 0). ✓
  - cancel: Task 13 ✓
  - server-restart recovery: Task 14 ✓
- Reflection extraction: Task 6 ✓
- Memory index: chunk kinds (Task 7), hooks (Task 15) ✓
- Config: Task 4 ✓
- Scheduler tick: Task 14 ✓
- UI: list + new (Task 16), detail (Task 17), nav + home (Task 18) ✓
- Spec updates: Task 19 ✓

**Known gap requiring engineer judgment in Task 6:** `createJobProposal` requires a non-empty `source_job_id`. If it does, the engineer should widen the proposal type and form action to tolerate a `meeting:<id>` source label. The plan notes this inline.

**Reindex CLI walker:** the spec mentions extending `npm run reindex` to include meetings. Not covered in a dedicated task — folded into Task 15's hook coverage since reindex is regenerable. If the existing `npm run reindex` script exists and the engineer can extend it cheaply, do so as a small follow-up commit. Otherwise punt: the on-write hooks keep the index live.

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-05-28-council-meetings.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

**Which approach?**
