# Scheduler Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add one-shot and recurring job scheduling to Landsraad. A new `Schedule` entity (declared once) spawns one-shot Jobs (existing) on a cron expression or fixed `fire_at`, evaluated by a 30-second in-process tick loop.

**Architecture:** New `schedules/` dir at council root holds `*.json` + `*.events.jsonl` per schedule. `src/lib/server/schedules.ts` does CRUD. `src/lib/server/cron.ts` wraps `croner`. `src/lib/server/scheduler.ts` owns the tick loop and is started from `src/hooks.server.ts`. The runner is untouched; the scheduler calls existing `createJob` + `startJobInBackground`. UI adds `/schedules`, `/schedules/new`, `/schedules/[id]`, `/schedules/[id]/edit`, and a "Save as schedule" branch on `/jobs/new`. Crash-safety choice: `next_fire_at` advances *after* spawning a job (prefer missed-fire over duplicate-fire).

**Tech Stack:** SvelteKit 2 / Svelte 5, TypeScript strict, Vitest, Node ≥ 20, `croner` (new dep, ~14KB, zero deps, MIT, TZ-aware).

**Spec:** [`docs/superpowers/specs/2026-05-25-scheduler-design.md`](../specs/2026-05-25-scheduler-design.md)

---

## File map

**New files:**
- `src/lib/server/cron.ts` — croner wrapper (`validateCron`, `nextFire`, `previewNext`)
- `src/lib/server/cron.test.ts`
- `src/lib/server/schedules.ts` — CRUD + events JSONL
- `src/lib/server/schedules.test.ts`
- `src/lib/server/scheduler.ts` — `startScheduler`, `stopScheduler`, `tickOnce`, `catchUp`
- `src/lib/server/scheduler.test.ts`
- `src/routes/schedules/+page.server.ts`, `+page.svelte` — list
- `src/routes/schedules/new/+page.server.ts`, `+page.svelte` — create
- `src/routes/schedules/[id]/+page.server.ts`, `+page.svelte` — detail
- `src/routes/schedules/[id]/edit/+page.server.ts`, `+page.svelte` — edit

**Modified files:**
- `package.json` — add `croner` dep
- `src/lib/types.ts` — add `Schedule`, `ScheduleKind`, `ScheduleEvent`; add `spawned_by_schedule_id?` to `Job`; add `'fired'|'skipped_overlap'|'missed_fires'|'fire_error'|'edited'` to event union for schedules (separate type)
- `src/lib/server/paths.ts` — `schedulesDir`, `scheduleFile`, `scheduleEventsFile`, `scheduleIdFor`
- `src/lib/server/jobs.ts` — `NewJobInput.spawned_by_schedule_id?`; thread through `createJob`
- `src/hooks.server.ts` — call `startScheduler()` once at startup; SIGINT/SIGTERM cleanup
- `src/routes/+layout.svelte` — add `Schedules` nav link
- `src/routes/+page.server.ts` — load schedule summary (`active`, `nextFireAt`)
- `src/routes/+page.svelte` — render schedule summary line
- `src/routes/jobs/new/+page.server.ts` — handle `kind=schedule` branch
- `src/routes/jobs/new/+page.svelte` — "Save as schedule" disclosure
- `SPECIFICATION.md` — strike scheduler from "Out of scope"; add to v1 functionality
- `docs/data-model.md` and/or `docs/architecture.md` — describe the schedules dir + tick loop

---

## Task 1 — Add `croner` dependency

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install croner**

Run:

```bash
npm install croner
```

Expected: `package.json` `dependencies` gains `"croner": "^9.x"` (any 9.x); `package-lock.json` updates; one new package installed (croner is zero-dep).

- [ ] **Step 2: Verify**

Run:

```bash
node -e "const {Cron}=require('croner');console.log(new Cron('0 9 * * MON').nextRun()?.toISOString());"
```

Expected: prints an ISO timestamp for the next Monday 9am. (Just confirms the dep loads.)

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "deps: add croner for cron scheduling"
```

---

## Task 2 — Cron helper module

**Files:**
- Create: `src/lib/server/cron.ts`
- Test: `src/lib/server/cron.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/server/cron.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { nextFire, previewNext, validateCron } from './cron';

describe('cron', () => {
  it('validateCron accepts a 5-field expression', () => {
    expect(validateCron('0 9 * * MON')).toBe(true);
    expect(validateCron('*/15 * * * *')).toBe(true);
    expect(validateCron('0 0 1 * *')).toBe(true);
  });

  it('validateCron rejects garbage', () => {
    expect(validateCron('bogus')).toBe(false);
    expect(validateCron('')).toBe(false);
    expect(validateCron('60 * * * *')).toBe(false);
  });

  it('validateCron rejects 6-field expressions', () => {
    expect(validateCron('0 0 9 * * MON')).toBe(false);
  });

  it('nextFire returns the next ISO UTC timestamp after the given moment', () => {
    const after = new Date('2026-05-26T08:30:00Z');
    const fire = nextFire('0 9 * * *', after);
    expect(fire).not.toBeNull();
    expect(new Date(fire!).getTime()).toBeGreaterThan(after.getTime());
    const fireDate = new Date(fire!);
    expect(fireDate.getUTCHours() === 9 || fireDate.getHours() === 9).toBe(true);
  });

  it('nextFire returns null for invalid cron', () => {
    expect(nextFire('garbage', new Date())).toBeNull();
  });

  it('previewNext returns N consecutive fires', () => {
    const after = new Date('2026-05-26T00:00:00Z');
    const fires = previewNext('*/15 * * * *', 3, after);
    expect(fires).toHaveLength(3);
    const ts = fires.map((s) => new Date(s).getTime());
    expect(ts[1] - ts[0]).toBe(15 * 60_000);
    expect(ts[2] - ts[1]).toBe(15 * 60_000);
  });

  it('previewNext returns [] for invalid cron', () => {
    expect(previewNext('bogus', 3, new Date())).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
npx vitest run src/lib/server/cron.test.ts
```

Expected: FAIL — `Cannot find module './cron'`.

- [ ] **Step 3: Implement the helper**

Create `src/lib/server/cron.ts`:

```ts
import { Cron } from 'croner';

function tryParse(expr: string): Cron | null {
  try {
    return new Cron(expr);
  } catch {
    return null;
  }
}

export function validateCron(expr: string): boolean {
  if (typeof expr !== 'string' || !expr.trim()) return false;
  if (expr.trim().split(/\s+/).length !== 5) return false;
  return tryParse(expr.trim()) !== null;
}

export function nextFire(expr: string, after: Date): string | null {
  const c = tryParse(expr);
  if (!c) return null;
  const d = c.nextRun(after);
  return d ? d.toISOString() : null;
}

export function previewNext(expr: string, count: number, after: Date): string[] {
  const c = tryParse(expr);
  if (!c) return [];
  const out: string[] = [];
  let cursor = after;
  for (let i = 0; i < count; i++) {
    const d = c.nextRun(cursor);
    if (!d) break;
    out.push(d.toISOString());
    cursor = new Date(d.getTime() + 1);
  }
  return out;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run:

```bash
npx vitest run src/lib/server/cron.test.ts
```

Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/cron.ts src/lib/server/cron.test.ts
git commit -m "feat(scheduler): cron parsing/preview helper over croner"
```

---

## Task 3 — Types and path helpers

**Files:**
- Modify: `src/lib/types.ts`
- Modify: `src/lib/server/paths.ts`

- [ ] **Step 1: Extend types**

Edit `src/lib/types.ts`. Append to the bottom of the file:

```ts
export type ScheduleKind = 'once' | 'recurring';

export interface Schedule {
  id: string;
  title: string;
  brief: string;
  councillor_slug: string;
  kind: ScheduleKind;
  fire_at: string | null;
  cron: string | null;
  enabled: boolean;
  next_fire_at: string | null;
  last_fire_job_id: string | null;
  fire_count: number;
  fired_at: string | null;
  created_at: string;
}

export type ScheduleEventType =
  | 'created'
  | 'enabled'
  | 'disabled'
  | 'edited'
  | 'fired'
  | 'skipped_overlap'
  | 'missed_fires'
  | 'fire_error';

export interface ScheduleEvent {
  at: string;
  type: ScheduleEventType;
  message?: string;
  job_id?: string;
  prior_job_id?: string;
  from?: string;
  to?: string | null;
  count?: number;
}
```

Also add the optional `spawned_by_schedule_id` field on `Job`. Modify the existing `Job` interface to read:

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
  spawned_by_schedule_id?: string | null;
}
```

- [ ] **Step 2: Add path helpers**

Edit `src/lib/server/paths.ts`. Append to the bottom of the file:

```ts
export function schedulesDir(): string {
  return join(councilRoot(), 'schedules');
}

export function scheduleFile(scheduleId: string): string {
  return join(schedulesDir(), `${scheduleId}.json`);
}

export function scheduleEventsFile(scheduleId: string): string {
  return join(schedulesDir(), `${scheduleId}.events.jsonl`);
}

export function scheduleIdFor(title: string, now: Date = new Date()): string {
  const ts = now.toISOString().replace(/[:.]/g, '-');
  const titleSlug = slugify(title);
  return `${ts}-${titleSlug}`;
}
```

- [ ] **Step 3: Type-check**

Run:

```bash
npm run check
```

Expected: PASS (or only pre-existing warnings — no new errors). Re-run tests to make sure nothing broke:

```bash
npm test
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/lib/types.ts src/lib/server/paths.ts
git commit -m "types(scheduler): Schedule + ScheduleEvent + schedules dir paths"
```

---

## Task 4 — Schedules CRUD

**Files:**
- Create: `src/lib/server/schedules.ts`
- Test: `src/lib/server/schedules.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/server/schedules.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { env } from 'node:process';

import { createCouncil } from './councils';
import { createCouncillor } from './councillors';
import {
  appendScheduleEvent,
  createSchedule,
  deleteSchedule,
  listSchedules,
  readSchedule,
  readScheduleEvents,
  setEnabled,
  writeSchedule
} from './schedules';

let tmpRoot: string;
let prevEnv: string | undefined;

beforeEach(async () => {
  prevEnv = env.LANDSRAAD_COUNCIL_ROOT;
  tmpRoot = mkdtempSync(join(tmpdir(), 'landsraad-schedules-'));
  env.LANDSRAAD_COUNCIL_ROOT = tmpRoot;
  await createCouncil({ name: 'Sched Test' });
  await createCouncillor({ name: 'Alice', role: 'cto', adapter: 'mock:local' });
});

afterEach(() => {
  rmSync(tmpRoot, { recursive: true, force: true });
  if (prevEnv === undefined) delete env.LANDSRAAD_COUNCIL_ROOT;
  else env.LANDSRAAD_COUNCIL_ROOT = prevEnv;
});

describe('schedules', () => {
  it('creates a recurring schedule with next_fire_at', async () => {
    const now = new Date('2026-05-26T08:00:00Z');
    const s = await createSchedule(
      {
        title: 'Weekly news',
        brief: 'Summarize the week.',
        councillor_slug: 'alice',
        kind: 'recurring',
        cron: '0 9 * * *',
        enabled: true
      },
      now
    );
    expect(s.id).toMatch(/weekly-news$/);
    expect(s.kind).toBe('recurring');
    expect(s.enabled).toBe(true);
    expect(s.next_fire_at).not.toBeNull();
    expect(new Date(s.next_fire_at!).getTime()).toBeGreaterThan(now.getTime());
    expect(s.fire_count).toBe(0);
    const events = await readScheduleEvents(s.id);
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('created');
  });

  it('creates a once schedule with fire_at', async () => {
    const now = new Date('2026-05-26T08:00:00Z');
    const at = '2026-06-01T09:00:00Z';
    const s = await createSchedule(
      {
        title: 'Quarterly',
        brief: 'do it',
        councillor_slug: 'alice',
        kind: 'once',
        fire_at: at,
        enabled: true
      },
      now
    );
    expect(s.kind).toBe('once');
    expect(s.fire_at).toBe(at);
    expect(s.next_fire_at).toBe(at);
  });

  it('rejects recurring without cron / once without fire_at', async () => {
    await expect(
      createSchedule({
        title: 'a',
        brief: 'a',
        councillor_slug: 'alice',
        kind: 'recurring',
        enabled: true
      } as any)
    ).rejects.toThrow(/cron/);
    await expect(
      createSchedule({
        title: 'a',
        brief: 'a',
        councillor_slug: 'alice',
        kind: 'once',
        enabled: true
      } as any)
    ).rejects.toThrow(/fire_at/);
  });

  it('rejects unknown councillor', async () => {
    await expect(
      createSchedule({
        title: 'a',
        brief: 'a',
        councillor_slug: 'ghost',
        kind: 'recurring',
        cron: '0 9 * * *',
        enabled: true
      })
    ).rejects.toThrow(/councillor/i);
  });

  it('rejects invalid cron', async () => {
    await expect(
      createSchedule({
        title: 'a',
        brief: 'a',
        councillor_slug: 'alice',
        kind: 'recurring',
        cron: 'bogus',
        enabled: true
      })
    ).rejects.toThrow(/cron/i);
  });

  it('slug collision produces -2, -3 suffixes', async () => {
    const now = new Date('2026-05-26T08:00:00Z');
    const a = await createSchedule(
      { title: 'same', brief: 'a', councillor_slug: 'alice', kind: 'recurring', cron: '0 9 * * *', enabled: true },
      now
    );
    const b = await createSchedule(
      { title: 'same', brief: 'b', councillor_slug: 'alice', kind: 'recurring', cron: '0 9 * * *', enabled: true },
      now
    );
    const c = await createSchedule(
      { title: 'same', brief: 'c', councillor_slug: 'alice', kind: 'recurring', cron: '0 9 * * *', enabled: true },
      now
    );
    expect(a.id.endsWith('-same')).toBe(true);
    expect(b.id.endsWith('-same-2')).toBe(true);
    expect(c.id.endsWith('-same-3')).toBe(true);
  });

  it('listSchedules returns all created, sorted newest first', async () => {
    await createSchedule(
      { title: 'a', brief: 'a', councillor_slug: 'alice', kind: 'recurring', cron: '0 9 * * *', enabled: true },
      new Date('2026-05-26T08:00:00Z')
    );
    await createSchedule(
      { title: 'b', brief: 'b', councillor_slug: 'alice', kind: 'recurring', cron: '0 9 * * *', enabled: true },
      new Date('2026-05-26T09:00:00Z')
    );
    const list = await listSchedules();
    expect(list).toHaveLength(2);
    expect(list[0].title).toBe('b');
  });

  it('listSchedules returns [] when dir absent', async () => {
    expect(await listSchedules()).toEqual([]);
  });

  it('setEnabled(false) clears next_fire_at and logs event', async () => {
    const s = await createSchedule(
      { title: 'a', brief: 'a', councillor_slug: 'alice', kind: 'recurring', cron: '0 9 * * *', enabled: true },
      new Date('2026-05-26T08:00:00Z')
    );
    const after = await setEnabled(s.id, false);
    expect(after.enabled).toBe(false);
    expect(after.next_fire_at).toBeNull();
    const events = await readScheduleEvents(s.id);
    expect(events.map((e) => e.type)).toContain('disabled');
  });

  it('setEnabled(true) recomputes next_fire_at from now', async () => {
    const s = await createSchedule(
      { title: 'a', brief: 'a', councillor_slug: 'alice', kind: 'recurring', cron: '0 9 * * *', enabled: true },
      new Date('2026-05-26T08:00:00Z')
    );
    await setEnabled(s.id, false);
    const after = await setEnabled(s.id, true, new Date('2026-05-26T10:00:00Z'));
    expect(after.enabled).toBe(true);
    expect(after.next_fire_at).not.toBeNull();
    expect(new Date(after.next_fire_at!).getTime()).toBeGreaterThan(
      new Date('2026-05-26T10:00:00Z').getTime()
    );
  });

  it('round-trips through writeSchedule', async () => {
    const s = await createSchedule(
      { title: 'a', brief: 'a', councillor_slug: 'alice', kind: 'recurring', cron: '0 9 * * *', enabled: true },
      new Date('2026-05-26T08:00:00Z')
    );
    s.fire_count = 5;
    s.last_fire_job_id = 'some-job-id';
    await writeSchedule(s);
    const read = await readSchedule(s.id);
    expect(read.fire_count).toBe(5);
    expect(read.last_fire_job_id).toBe('some-job-id');
  });

  it('deleteSchedule removes file and events', async () => {
    const s = await createSchedule(
      { title: 'a', brief: 'a', councillor_slug: 'alice', kind: 'recurring', cron: '0 9 * * *', enabled: true },
      new Date('2026-05-26T08:00:00Z')
    );
    await deleteSchedule(s.id);
    expect(await listSchedules()).toEqual([]);
    expect(await readScheduleEvents(s.id)).toEqual([]);
  });

  it('appendScheduleEvent writes JSONL', async () => {
    const s = await createSchedule(
      { title: 'a', brief: 'a', councillor_slug: 'alice', kind: 'recurring', cron: '0 9 * * *', enabled: true },
      new Date('2026-05-26T08:00:00Z')
    );
    await appendScheduleEvent(s.id, { at: new Date().toISOString(), type: 'fired', job_id: 'j-1' });
    const events = await readScheduleEvents(s.id);
    expect(events.some((e) => e.type === 'fired' && e.job_id === 'j-1')).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
npx vitest run src/lib/server/schedules.test.ts
```

Expected: FAIL — `Cannot find module './schedules'`.

- [ ] **Step 3: Implement**

Create `src/lib/server/schedules.ts`:

```ts
import { appendFile, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import type { Schedule, ScheduleEvent, ScheduleKind } from '$lib/types';
import { scheduleEventsFile, scheduleFile, scheduleIdFor, schedulesDir, slugify } from './paths';
import { hasCouncil } from './councils';
import { readCouncillor } from './councillors';
import { nextFire, validateCron } from './cron';

export interface NewScheduleInput {
  title: string;
  brief: string;
  councillor_slug: string;
  kind: ScheduleKind;
  fire_at?: string | null;
  cron?: string | null;
  enabled: boolean;
}

export interface UpdateScheduleInput {
  title?: string;
  brief?: string;
  councillor_slug?: string;
  kind?: ScheduleKind;
  fire_at?: string | null;
  cron?: string | null;
  enabled?: boolean;
}

async function ensureCouncillor(slug: string): Promise<void> {
  try {
    await readCouncillor(slug);
  } catch {
    throw new Error(`Councillor "${slug}" does not exist.`);
  }
}

function computeNext(s: { kind: ScheduleKind; fire_at: string | null; cron: string | null }, after: Date): string | null {
  if (s.kind === 'once') return s.fire_at;
  if (!s.cron) return null;
  return nextFire(s.cron, after);
}

async function uniqueId(baseTitle: string, now: Date): Promise<string> {
  const base = scheduleIdFor(baseTitle, now);
  let candidate = base;
  let n = 1;
  while (existsSync(scheduleFile(candidate))) {
    n += 1;
    candidate = `${base}-${n}`;
  }
  return candidate;
}

function validateNew(input: NewScheduleInput): void {
  if (!input.title.trim()) throw new Error('Schedule title is required.');
  if (!input.brief.trim()) throw new Error('Schedule brief is required.');
  if (input.kind === 'recurring') {
    if (!input.cron || !input.cron.trim()) throw new Error('A cron expression is required for recurring schedules.');
    if (!validateCron(input.cron)) throw new Error(`Invalid cron expression: "${input.cron}".`);
  } else if (input.kind === 'once') {
    if (!input.fire_at) throw new Error('fire_at is required for once schedules.');
    if (isNaN(Date.parse(input.fire_at))) throw new Error(`Invalid fire_at: "${input.fire_at}".`);
  } else {
    throw new Error(`Unknown schedule kind: "${input.kind}".`);
  }
  // Touch slugify to surface the same error early as elsewhere.
  slugify(input.title);
}

export async function createSchedule(input: NewScheduleInput, now: Date = new Date()): Promise<Schedule> {
  if (!hasCouncil()) throw new Error('No council exists in the current directory.');
  validateNew(input);
  await ensureCouncillor(input.councillor_slug);

  const id = await uniqueId(input.title, now);
  const schedule: Schedule = {
    id,
    title: input.title.trim(),
    brief: input.brief,
    councillor_slug: input.councillor_slug.trim(),
    kind: input.kind,
    fire_at: input.kind === 'once' ? input.fire_at! : null,
    cron: input.kind === 'recurring' ? input.cron!.trim() : null,
    enabled: input.enabled,
    next_fire_at: null,
    last_fire_job_id: null,
    fire_count: 0,
    fired_at: null,
    created_at: now.toISOString()
  };
  schedule.next_fire_at = schedule.enabled ? computeNext(schedule, now) : null;

  await mkdir(schedulesDir(), { recursive: true });
  await writeFile(scheduleFile(id), JSON.stringify(schedule, null, 2) + '\n', 'utf8');
  await appendScheduleEvent(id, { at: now.toISOString(), type: 'created' });
  return schedule;
}

export async function readSchedule(id: string): Promise<Schedule> {
  const raw = await readFile(scheduleFile(id), 'utf8');
  return JSON.parse(raw) as Schedule;
}

export async function writeSchedule(s: Schedule): Promise<void> {
  await mkdir(schedulesDir(), { recursive: true });
  await writeFile(scheduleFile(s.id), JSON.stringify(s, null, 2) + '\n', 'utf8');
}

export async function listSchedules(): Promise<Schedule[]> {
  const dir = schedulesDir();
  if (!existsSync(dir)) return [];
  const entries = await readdir(dir, { withFileTypes: true });
  const out: Schedule[] = [];
  for (const e of entries) {
    if (!e.isFile()) continue;
    if (!e.name.endsWith('.json')) continue;
    const id = e.name.slice(0, -'.json'.length);
    const s = await readSchedule(id).catch(() => null);
    if (s) out.push(s);
  }
  out.sort((a, b) => b.id.localeCompare(a.id));
  return out;
}

export async function deleteSchedule(id: string): Promise<void> {
  await rm(scheduleFile(id), { force: true });
  await rm(scheduleEventsFile(id), { force: true });
}

export async function updateSchedule(
  id: string,
  patch: UpdateScheduleInput,
  now: Date = new Date()
): Promise<Schedule> {
  const current = await readSchedule(id);
  const merged: Schedule = {
    ...current,
    title: patch.title?.trim() ?? current.title,
    brief: patch.brief ?? current.brief,
    councillor_slug: patch.councillor_slug?.trim() ?? current.councillor_slug,
    kind: patch.kind ?? current.kind,
    fire_at: patch.fire_at !== undefined ? patch.fire_at : current.fire_at,
    cron: patch.cron !== undefined ? (patch.cron ? patch.cron.trim() : null) : current.cron,
    enabled: patch.enabled ?? current.enabled
  };
  if (merged.kind === 'recurring') {
    if (!merged.cron) throw new Error('A cron expression is required for recurring schedules.');
    if (!validateCron(merged.cron)) throw new Error(`Invalid cron expression: "${merged.cron}".`);
    merged.fire_at = null;
  } else {
    if (!merged.fire_at) throw new Error('fire_at is required for once schedules.');
    if (isNaN(Date.parse(merged.fire_at))) throw new Error(`Invalid fire_at: "${merged.fire_at}".`);
    merged.cron = null;
  }
  if (patch.councillor_slug !== undefined) {
    await ensureCouncillor(merged.councillor_slug);
  }
  merged.next_fire_at = merged.enabled ? computeNext(merged, now) : null;
  await writeSchedule(merged);
  await appendScheduleEvent(id, { at: now.toISOString(), type: 'edited' });
  return merged;
}

export async function setEnabled(id: string, enabled: boolean, now: Date = new Date()): Promise<Schedule> {
  const s = await readSchedule(id);
  s.enabled = enabled;
  s.next_fire_at = enabled ? computeNext(s, now) : null;
  await writeSchedule(s);
  await appendScheduleEvent(id, {
    at: now.toISOString(),
    type: enabled ? 'enabled' : 'disabled'
  });
  return s;
}

export async function appendScheduleEvent(id: string, event: ScheduleEvent): Promise<void> {
  await mkdir(schedulesDir(), { recursive: true });
  await appendFile(scheduleEventsFile(id), JSON.stringify(event) + '\n', 'utf8');
}

export async function readScheduleEvents(id: string): Promise<ScheduleEvent[]> {
  const file = scheduleEventsFile(id);
  if (!existsSync(file)) return [];
  const raw = await readFile(file, 'utf8');
  return raw
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as ScheduleEvent);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run:

```bash
npx vitest run src/lib/server/schedules.test.ts
```

Expected: PASS (13 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/schedules.ts src/lib/server/schedules.test.ts
git commit -m "feat(scheduler): Schedule CRUD with events JSONL"
```

---

## Task 5 — Thread `spawned_by_schedule_id` through `createJob`

**Files:**
- Modify: `src/lib/server/jobs.ts`
- Test: `src/lib/server/jobs.test.ts`

- [ ] **Step 1: Add a failing test**

Append to `src/lib/server/jobs.test.ts` (inside the `describe('jobs', …)` block, before the closing `});`):

```ts
  it('createJob persists spawned_by_schedule_id when provided', async () => {
    const j = await createJob({
      title: 'Spawned',
      brief: 'auto',
      councillor_slug: 'cfo',
      spawned_by_schedule_id: 'some-schedule-id'
    });
    expect(j.spawned_by_schedule_id).toBe('some-schedule-id');
    const read = await readJob(j.id);
    expect(read.spawned_by_schedule_id).toBe('some-schedule-id');
  });

  it('createJob defaults spawned_by_schedule_id to null', async () => {
    const j = await createJob({
      title: 'Manual',
      brief: 'human',
      councillor_slug: 'cfo'
    });
    expect(j.spawned_by_schedule_id ?? null).toBeNull();
  });
```

- [ ] **Step 2: Run to verify failure**

Run:

```bash
npx vitest run src/lib/server/jobs.test.ts
```

Expected: FAIL — `Object literal may only specify known properties` (TS) or runtime field absent.

- [ ] **Step 3: Implement**

Edit `src/lib/server/jobs.ts`. Modify the `NewJobInput` interface and the `Job` construction in `createJob`:

```ts
export interface NewJobInput {
  title: string;
  brief: string;
  councillor_slug: string;
  spawned_by_schedule_id?: string | null;
}
```

Inside `createJob`, modify the `job` literal so the field is included:

```ts
  const job: Job = {
    id,
    title: input.title.trim(),
    brief: input.brief,
    councillor_slug: input.councillor_slug.trim(),
    status: 'queued',
    created_at: now.toISOString(),
    started_at: null,
    finished_at: null,
    exit_code: null,
    error: null,
    spawned_by_schedule_id: input.spawned_by_schedule_id ?? null
  };
```

- [ ] **Step 4: Run to verify pass**

Run:

```bash
npx vitest run src/lib/server/jobs.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/jobs.ts src/lib/server/jobs.test.ts
git commit -m "feat(jobs): support spawned_by_schedule_id on createJob"
```

---

## Task 6 — Scheduler tick

**Files:**
- Create: `src/lib/server/scheduler.ts`
- Test: `src/lib/server/scheduler.test.ts`

- [ ] **Step 1: Write the failing tests for `tickOnce`**

Create `src/lib/server/scheduler.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { env } from 'node:process';

import { createCouncil } from './councils';
import { createCouncillor } from './councillors';
import {
  createSchedule,
  listSchedules,
  readSchedule,
  readScheduleEvents,
  setEnabled
} from './schedules';
import { listJobs, readJob, setStatus } from './jobs';
import { catchUp, tickOnce } from './scheduler';

let tmpRoot: string;
let prevEnv: string | undefined;

beforeEach(async () => {
  prevEnv = env.LANDSRAAD_COUNCIL_ROOT;
  tmpRoot = mkdtempSync(join(tmpdir(), 'landsraad-scheduler-'));
  env.LANDSRAAD_COUNCIL_ROOT = tmpRoot;
  await createCouncil({ name: 'Sched' });
  await createCouncillor({ name: 'Alice', role: 'cto', adapter: 'mock:local' });
});

afterEach(() => {
  rmSync(tmpRoot, { recursive: true, force: true });
  if (prevEnv === undefined) delete env.LANDSRAAD_COUNCIL_ROOT;
  else env.LANDSRAAD_COUNCIL_ROOT = prevEnv;
});

describe('scheduler.tickOnce', () => {
  it('fires a due recurring schedule, spawns a job, advances next_fire_at', async () => {
    const past = new Date('2026-05-26T08:00:00Z');
    const s = await createSchedule(
      {
        title: 'Hourly',
        brief: 'do thing',
        councillor_slug: 'alice',
        kind: 'recurring',
        cron: '0 * * * *',
        enabled: true
      },
      past
    );
    const now = new Date('2026-05-26T10:30:00Z');
    await tickOnce(now, { spawn: 'skip' });
    const after = await readSchedule(s.id);
    expect(after.fire_count).toBe(1);
    expect(after.last_fire_job_id).not.toBeNull();
    expect(after.next_fire_at).not.toBeNull();
    expect(new Date(after.next_fire_at!).getTime()).toBeGreaterThan(now.getTime());
    const jobs = await listJobs();
    expect(jobs).toHaveLength(1);
    expect(jobs[0].spawned_by_schedule_id).toBe(s.id);
    expect(jobs[0].title).toBe('Hourly');
    expect(jobs[0].brief).toBe('do thing');
    expect(jobs[0].councillor_slug).toBe('alice');
    const events = await readScheduleEvents(s.id);
    expect(events.some((e) => e.type === 'fired' && e.job_id === jobs[0].id)).toBe(true);
  });

  it('does not fire a schedule whose next_fire_at is still in the future', async () => {
    const now = new Date('2026-05-26T08:00:00Z');
    await createSchedule(
      {
        title: 'Future',
        brief: 'later',
        councillor_slug: 'alice',
        kind: 'recurring',
        cron: '0 9 * * *',
        enabled: true
      },
      now
    );
    await tickOnce(now, { spawn: 'skip' });
    expect(await listJobs()).toHaveLength(0);
  });

  it('does not fire disabled schedules', async () => {
    const now = new Date('2026-05-26T08:00:00Z');
    const s = await createSchedule(
      {
        title: 'Off',
        brief: 'b',
        councillor_slug: 'alice',
        kind: 'recurring',
        cron: '0 * * * *',
        enabled: true
      },
      now
    );
    await setEnabled(s.id, false);
    await tickOnce(new Date('2026-05-26T10:30:00Z'), { spawn: 'skip' });
    expect(await listJobs()).toHaveLength(0);
  });

  it('once-kind schedule fires once, then disables itself with fired_at', async () => {
    const at = '2026-05-26T09:00:00Z';
    const s = await createSchedule(
      {
        title: 'Once',
        brief: 'b',
        councillor_slug: 'alice',
        kind: 'once',
        fire_at: at,
        enabled: true
      },
      new Date('2026-05-26T08:00:00Z')
    );
    const now = new Date('2026-05-26T09:00:01Z');
    await tickOnce(now, { spawn: 'skip' });
    const after = await readSchedule(s.id);
    expect(after.enabled).toBe(false);
    expect(after.fired_at).toBe(now.toISOString());
    expect(after.next_fire_at).toBeNull();
    expect(after.fire_count).toBe(1);
    expect((await listJobs())).toHaveLength(1);
  });

  it('skips overlap when prior job for same councillor is still running', async () => {
    const past = new Date('2026-05-26T08:00:00Z');
    const s = await createSchedule(
      {
        title: 'Hourly',
        brief: 'b',
        councillor_slug: 'alice',
        kind: 'recurring',
        cron: '0 * * * *',
        enabled: true
      },
      past
    );
    // Fire #1
    await tickOnce(new Date('2026-05-26T10:30:00Z'), { spawn: 'skip' });
    const jobs1 = await listJobs();
    expect(jobs1).toHaveLength(1);
    // Job is still "queued"; flip to "running" manually to simulate in-flight.
    await setStatus(jobs1[0].id, 'running', { started_at: new Date().toISOString() });
    // Fire #2 — should skip.
    await tickOnce(new Date('2026-05-26T11:30:00Z'), { spawn: 'skip' });
    expect((await listJobs())).toHaveLength(1);
    const events = await readScheduleEvents(s.id);
    expect(events.some((e) => e.type === 'skipped_overlap')).toBe(true);
    const after = await readSchedule(s.id);
    expect(new Date(after.next_fire_at!).getTime()).toBeGreaterThan(
      new Date('2026-05-26T11:30:00Z').getTime()
    );
    expect(after.fire_count).toBe(1);
  });

  it('isolates a bad cron in storage: disables the schedule, logs fire_error, continues with siblings', async () => {
    const past = new Date('2026-05-26T08:00:00Z');
    const bad = await createSchedule(
      {
        title: 'Bad',
        brief: 'b',
        councillor_slug: 'alice',
        kind: 'recurring',
        cron: '0 * * * *',
        enabled: true
      },
      past
    );
    // Corrupt on disk.
    const corrupted = await readSchedule(bad.id);
    corrupted.cron = 'broken';
    const { writeSchedule } = await import('./schedules');
    await writeSchedule(corrupted);

    const good = await createSchedule(
      {
        title: 'Good',
        brief: 'g',
        councillor_slug: 'alice',
        kind: 'recurring',
        cron: '0 * * * *',
        enabled: true
      },
      past
    );

    await tickOnce(new Date('2026-05-26T10:30:00Z'), { spawn: 'skip' });
    const badAfter = await readSchedule(bad.id);
    expect(badAfter.enabled).toBe(false);
    const ev = await readScheduleEvents(bad.id);
    expect(ev.some((e) => e.type === 'fire_error')).toBe(true);

    const goodAfter = await readSchedule(good.id);
    expect(goodAfter.fire_count).toBe(1);
  });

  it('reentrancy guard: a second tickOnce while one is in flight returns immediately', async () => {
    // Use a slow spawn to keep the first tick alive.
    let spawnCalls = 0;
    const slowSpawn = async () => {
      spawnCalls++;
      await new Promise((r) => setTimeout(r, 50));
    };
    const past = new Date('2026-05-26T08:00:00Z');
    await createSchedule(
      {
        title: 'Hourly',
        brief: 'b',
        councillor_slug: 'alice',
        kind: 'recurring',
        cron: '0 * * * *',
        enabled: true
      },
      past
    );
    const now = new Date('2026-05-26T10:30:00Z');
    const a = tickOnce(now, { spawn: 'skip', _delaySpawn: slowSpawn });
    const b = tickOnce(now, { spawn: 'skip', _delaySpawn: slowSpawn });
    await Promise.all([a, b]);
    expect(spawnCalls).toBe(1);
  });

  it('records fire_error and disables when councillor was deleted', async () => {
    const past = new Date('2026-05-26T08:00:00Z');
    const s = await createSchedule(
      {
        title: 'Orphan',
        brief: 'b',
        councillor_slug: 'alice',
        kind: 'recurring',
        cron: '0 * * * *',
        enabled: true
      },
      past
    );
    const { deleteCouncillor } = await import('./councillors');
    await deleteCouncillor('alice');
    await tickOnce(new Date('2026-05-26T10:30:00Z'), { spawn: 'skip' });
    const after = await readSchedule(s.id);
    expect(after.enabled).toBe(false);
    const ev = await readScheduleEvents(s.id);
    expect(ev.some((e) => e.type === 'fire_error')).toBe(true);
  });
});

describe('scheduler.catchUp', () => {
  it('advances stale recurring schedule to future and logs missed_fires (no spawn)', async () => {
    const past = new Date('2026-01-01T00:00:00Z');
    const s = await createSchedule(
      {
        title: 'Old',
        brief: 'b',
        councillor_slug: 'alice',
        kind: 'recurring',
        cron: '0 9 * * *',
        enabled: true
      },
      past
    );
    // The just-created schedule already has a next_fire_at slightly past 'past'.
    const now = new Date('2026-05-26T10:00:00Z');
    await catchUp(now);
    const after = await readSchedule(s.id);
    expect(new Date(after.next_fire_at!).getTime()).toBeGreaterThan(now.getTime());
    expect(await listJobs()).toEqual([]);
    const ev = await readScheduleEvents(s.id);
    expect(ev.some((e) => e.type === 'missed_fires')).toBe(true);
  });

  it('once-kind with fire_at in the past gets disabled (never fired)', async () => {
    const past = new Date('2026-01-01T00:00:00Z');
    const s = await createSchedule(
      {
        title: 'Missed',
        brief: 'b',
        councillor_slug: 'alice',
        kind: 'once',
        fire_at: '2026-02-01T00:00:00Z',
        enabled: true
      },
      past
    );
    await catchUp(new Date('2026-05-26T10:00:00Z'));
    const after = await readSchedule(s.id);
    expect(after.enabled).toBe(false);
    expect(after.next_fire_at).toBeNull();
    expect(after.fired_at).toBeNull();
    expect(await listJobs()).toEqual([]);
  });

  it('leaves future schedules untouched', async () => {
    const now = new Date('2026-05-26T08:00:00Z');
    const s = await createSchedule(
      {
        title: 'Future',
        brief: 'b',
        councillor_slug: 'alice',
        kind: 'recurring',
        cron: '0 9 * * *',
        enabled: true
      },
      now
    );
    const before = await readSchedule(s.id);
    await catchUp(now);
    const after = await readSchedule(s.id);
    expect(after.next_fire_at).toBe(before.next_fire_at);
    const ev = await readScheduleEvents(s.id);
    expect(ev.some((e) => e.type === 'missed_fires')).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run:

```bash
npx vitest run src/lib/server/scheduler.test.ts
```

Expected: FAIL — `Cannot find module './scheduler'`.

- [ ] **Step 3: Implement `scheduler.ts`**

Create `src/lib/server/scheduler.ts`:

```ts
import { createJob, currentJobForCouncillor } from './jobs';
import { startJobInBackground } from './runner';
import {
  appendScheduleEvent,
  listSchedules,
  readSchedule,
  writeSchedule
} from './schedules';
import { nextFire } from './cron';
import type { Schedule } from '$lib/types';

const TICK_MS = 30_000;
const MAX_MISSED_SLOTS = 1000;

interface TickOptions {
  /**
   * 'background' (default): start the spawned job via startJobInBackground.
   * 'skip': only create the job row; do not start the runner.  Tests use this
   * to avoid in-process job execution.
   */
  spawn?: 'background' | 'skip';
  /** Test hook: inject a delay between picking a schedule and writing it back. */
  _delaySpawn?: () => Promise<void>;
}

let interval: ReturnType<typeof setInterval> | null = null;
let ticking = false;

function computeNext(s: Schedule, after: Date): string | null {
  if (s.kind === 'once') return null;
  if (!s.cron) return null;
  return nextFire(s.cron, after);
}

function countMissedSlots(s: Schedule, from: Date, to: Date): number {
  if (s.kind === 'once') return 1;
  if (!s.cron) return 0;
  let count = 0;
  let cursor = from;
  while (count < MAX_MISSED_SLOTS) {
    const n = nextFire(s.cron, cursor);
    if (!n) break;
    const nDate = new Date(n);
    if (nDate.getTime() > to.getTime()) break;
    count += 1;
    cursor = new Date(nDate.getTime() + 1);
  }
  return count;
}

async function fireSchedule(
  s: Schedule,
  now: Date,
  opts: TickOptions
): Promise<void> {
  const prior = await currentJobForCouncillor(s.councillor_slug);
  if (prior && prior.status === 'running') {
    await appendScheduleEvent(s.id, {
      at: now.toISOString(),
      type: 'skipped_overlap',
      prior_job_id: prior.id
    });
    s.next_fire_at = computeNext(s, now);
    await writeSchedule(s);
    return;
  }

  try {
    if (opts._delaySpawn) await opts._delaySpawn();
    const job = await createJob(
      {
        title: s.title,
        brief: s.brief,
        councillor_slug: s.councillor_slug,
        spawned_by_schedule_id: s.id
      },
      now
    );
    s.last_fire_job_id = job.id;
    s.fire_count += 1;
    await appendScheduleEvent(s.id, {
      at: now.toISOString(),
      type: 'fired',
      job_id: job.id
    });
    if ((opts.spawn ?? 'background') === 'background') {
      startJobInBackground(job.id);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await appendScheduleEvent(s.id, {
      at: now.toISOString(),
      type: 'fire_error',
      message
    });
    s.enabled = false;
    s.next_fire_at = null;
    await writeSchedule(s);
    return;
  }

  if (s.kind === 'once') {
    s.enabled = false;
    s.fired_at = now.toISOString();
    s.next_fire_at = null;
  } else {
    s.next_fire_at = computeNext(s, now);
    if (s.next_fire_at === null) {
      // Cron parse failed despite earlier validation; treat as a fire_error and disable.
      await appendScheduleEvent(s.id, {
        at: now.toISOString(),
        type: 'fire_error',
        message: `Cron "${s.cron}" produced no next fire.`
      });
      s.enabled = false;
    }
  }
  await writeSchedule(s);
}

export async function tickOnce(now: Date = new Date(), opts: TickOptions = {}): Promise<void> {
  if (ticking) return;
  ticking = true;
  try {
    const schedules = await listSchedules();
    for (const summary of schedules) {
      // Re-read to pick up any concurrent edits made by HTTP requests during the tick.
      const s = await readSchedule(summary.id).catch(() => null);
      if (!s) continue;
      if (!s.enabled) continue;
      if (!s.next_fire_at) continue;
      if (new Date(s.next_fire_at).getTime() > now.getTime()) continue;
      try {
        await fireSchedule(s, now, opts);
      } catch (err) {
        console.error(`[scheduler] schedule ${s.id} fire crashed:`, err);
      }
    }
  } catch (err) {
    console.error('[scheduler] tick crashed:', err);
  } finally {
    ticking = false;
  }
}

export async function catchUp(now: Date = new Date()): Promise<void> {
  const schedules = await listSchedules();
  for (const summary of schedules) {
    const s = await readSchedule(summary.id).catch(() => null);
    if (!s) continue;
    if (!s.enabled) continue;
    if (!s.next_fire_at) continue;
    const nextDate = new Date(s.next_fire_at);
    if (nextDate.getTime() >= now.getTime()) continue;

    const missedFrom = s.next_fire_at;
    let missedCount = 0;
    if (s.kind === 'once') {
      missedCount = 1;
      s.enabled = false;
      s.next_fire_at = null;
    } else {
      missedCount = countMissedSlots(s, nextDate, now);
      s.next_fire_at = computeNext(s, now);
    }
    await appendScheduleEvent(s.id, {
      at: now.toISOString(),
      type: 'missed_fires',
      from: missedFrom,
      to: s.next_fire_at,
      count: missedCount
    });
    await writeSchedule(s);
  }
}

export async function startScheduler(now: Date = new Date()): Promise<void> {
  if (interval) return;
  try {
    await catchUp(now);
  } catch (err) {
    console.error('[scheduler] catchUp failed:', err);
  }
  interval = setInterval(() => {
    void tickOnce();
  }, TICK_MS);
}

export function stopScheduler(): void {
  if (interval) {
    clearInterval(interval);
    interval = null;
  }
}

export function _resetForTests(): void {
  ticking = false;
  if (interval) {
    clearInterval(interval);
    interval = null;
  }
}
```

- [ ] **Step 4: Run to verify pass**

Run:

```bash
npx vitest run src/lib/server/scheduler.test.ts
```

Expected: PASS (11 tests).

- [ ] **Step 5: Full test sweep**

Run:

```bash
npm test
```

Expected: PASS (all suites green, including the modified jobs.test.ts).

- [ ] **Step 6: Commit**

```bash
git add src/lib/server/scheduler.ts src/lib/server/scheduler.test.ts
git commit -m "feat(scheduler): tick loop, catch-up, skip-overlap, fire-error isolation"
```

---

## Task 7 — Boot the scheduler from `hooks.server.ts`

**Files:**
- Modify: `src/hooks.server.ts`

- [ ] **Step 1: Implement**

Edit `src/hooks.server.ts`. After the embedder init block (before the `SILENT_PROBES` set), add:

```ts
import { startScheduler, stopScheduler } from '$lib/server/scheduler';

if (env.LANDSRAAD_SCHEDULER !== '0') {
  startScheduler().catch((err) => {
    console.warn('[landsraad] scheduler start failed:', (err as Error).message);
  });
  for (const sig of ['SIGINT', 'SIGTERM'] as const) {
    process.once(sig, () => {
      stopScheduler();
    });
  }
}
```

- [ ] **Step 2: Type-check and test**

Run:

```bash
npm run check
npm test
```

Expected: PASS for both.

- [ ] **Step 3: Manual smoke (no commit between)**

Spin up the dogfood council in another shell:

```bash
npm run dogfood:init
LANDSRAAD_COUNCIL_ROOT=./dogfood npm run dev
```

Then in another shell create a `*/1 * * * *` recurring schedule by hand to verify the runtime hook does start the loop (write the JSON to `./dogfood/schedules/` and wait one minute). After confirming the job appears under `./dogfood/jobs/`, kill the dev server. Delete the manual artifact (`./dogfood/schedules/*`, the spawned job dir) before continuing if you want a clean dogfood; or leave it — the UI tasks below will exercise this end-to-end.

- [ ] **Step 4: Commit**

```bash
git add src/hooks.server.ts
git commit -m "feat(scheduler): start tick loop from hooks.server.ts"
```

---

## Task 8 — Schedules list route

**Files:**
- Create: `src/routes/schedules/+page.server.ts`
- Create: `src/routes/schedules/+page.svelte`

- [ ] **Step 1: Implement the loader + delete action**

Create `src/routes/schedules/+page.server.ts`:

```ts
import { error, fail } from '@sveltejs/kit';
import { hasCouncil } from '$lib/server/councils';
import { deleteSchedule, listSchedules, setEnabled } from '$lib/server/schedules';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
  if (!hasCouncil()) error(404, 'No council in this directory');
  const schedules = await listSchedules();
  return { schedules };
};

export const actions: Actions = {
  toggle: async ({ request }) => {
    const form = await request.formData();
    const id = String(form.get('id') ?? '');
    const enabled = String(form.get('enabled') ?? '') === 'true';
    if (!id) return fail(400, { error: 'id is required' });
    try {
      await setEnabled(id, enabled);
    } catch (err) {
      return fail(400, { error: err instanceof Error ? err.message : 'toggle failed' });
    }
    return { ok: true };
  },
  delete: async ({ request }) => {
    const form = await request.formData();
    const id = String(form.get('id') ?? '');
    if (!id) return fail(400, { error: 'id is required' });
    await deleteSchedule(id);
    return { ok: true };
  }
};
```

- [ ] **Step 2: Implement the view**

Create `src/routes/schedules/+page.svelte`:

```svelte
<script lang="ts">
  import type { PageData } from './$types';
  let { data }: { data: PageData } = $props();
  const items = $derived(data.schedules);

  function fmt(iso: string | null): string {
    if (!iso) return '—';
    try { return new Date(iso).toLocaleString(); } catch { return iso; }
  }
</script>

<p><a href="/">&larr; Council</a></p>

<header class="head">
  <h1>Schedules</h1>
  <a class="btn primary" href="/schedules/new">+ New schedule</a>
</header>

{#if items.length === 0}
  <p class="empty">No schedules yet.</p>
{:else}
  <table class="t">
    <thead>
      <tr>
        <th>Title</th>
        <th>Councillor</th>
        <th>Kind</th>
        <th>When</th>
        <th>Next fire</th>
        <th>Fires</th>
        <th></th>
      </tr>
    </thead>
    <tbody>
      {#each items as s (s.id)}
        <tr class={s.enabled ? '' : 'off'}>
          <td><a href="/schedules/{s.id}">{s.title}</a></td>
          <td>{s.councillor_slug}</td>
          <td>{s.kind}</td>
          <td>
            {#if s.kind === 'recurring'}
              <code>{s.cron}</code>
            {:else}
              {fmt(s.fire_at)}
            {/if}
          </td>
          <td>{fmt(s.next_fire_at)}</td>
          <td>{s.fire_count}{#if s.last_fire_job_id} · <a href="/jobs/{s.last_fire_job_id}">last</a>{/if}</td>
          <td class="row-actions">
            <form method="POST" action="?/toggle">
              <input type="hidden" name="id" value={s.id} />
              <input type="hidden" name="enabled" value={(!s.enabled).toString()} />
              <button class="link" type="submit">{s.enabled ? 'Disable' : 'Enable'}</button>
            </form>
            <form method="POST" action="?/delete" onsubmit={(e) => { if (!confirm(`Delete schedule "${s.title}"?`)) e.preventDefault(); }}>
              <input type="hidden" name="id" value={s.id} />
              <button class="link danger" type="submit">Delete</button>
            </form>
          </td>
        </tr>
      {/each}
    </tbody>
  </table>
{/if}

<style>
  .head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem; }
  h1 { margin: 0; }
  .empty { color: var(--muted); }
  .t { width: 100%; border-collapse: collapse; }
  .t th, .t td { padding: 0.5rem 0.75rem; border-bottom: 1px solid var(--border); text-align: left; vertical-align: top; font-size: 0.95em; }
  .t th { color: var(--muted); font-weight: 500; font-size: 0.85em; }
  .t tr.off td { opacity: 0.55; }
  .row-actions { display: flex; gap: 0.5rem; }
  .row-actions form { display: inline; }
  .btn { display: inline-block; padding: 0.5rem 0.9rem; border-radius: 6px; border: 1px solid var(--border); text-decoration: none; color: var(--fg); background: transparent; cursor: pointer; }
  .btn.primary { background: var(--accent); color: #0f1115; border-color: var(--accent); font-weight: 600; }
  .link { background: none; border: none; padding: 0; color: var(--accent); cursor: pointer; font: inherit; text-decoration: underline; }
  .link.danger { color: var(--danger); }
  code { background: rgba(255,255,255,0.04); padding: 0.05rem 0.35rem; border-radius: 4px; font-size: 0.9em; }
</style>
```

- [ ] **Step 3: Smoke**

Run:

```bash
npm run check
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/routes/schedules/+page.server.ts src/routes/schedules/+page.svelte
git commit -m "feat(scheduler): /schedules list view with enable/disable/delete"
```

---

## Task 9 — Schedules `new` route

**Files:**
- Create: `src/routes/schedules/new/+page.server.ts`
- Create: `src/routes/schedules/new/+page.svelte`

- [ ] **Step 1: Implement the loader + action**

Create `src/routes/schedules/new/+page.server.ts`:

```ts
import { error, fail, redirect } from '@sveltejs/kit';
import { hasCouncil, readCouncilWithCouncillors } from '$lib/server/councils';
import { createSchedule } from '$lib/server/schedules';
import { previewNext, validateCron } from '$lib/server/cron';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
  if (!hasCouncil()) error(404, 'No council in this directory');
  const council = await readCouncilWithCouncillors();
  return { council };
};

function parseFireAtLocal(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (isNaN(d.getTime())) return null;
  return d.toISOString();
}

export const actions: Actions = {
  default: async ({ request }) => {
    const form = await request.formData();
    const title = String(form.get('title') ?? '').trim();
    const brief = String(form.get('brief') ?? '').trim();
    const councillor_slug = String(form.get('councillor_slug') ?? '').trim();
    const kind = String(form.get('kind') ?? 'recurring') as 'once' | 'recurring';
    const cronRaw = String(form.get('cron') ?? '').trim();
    const fireAtRaw = String(form.get('fire_at') ?? '').trim();
    const enabled = form.get('enabled') === 'on';

    const formState = { title, brief, councillor_slug, kind, cron: cronRaw, fire_at: fireAtRaw, enabled };

    if (!title || !brief || !councillor_slug) {
      return fail(400, { ...formState, error: 'Title, brief, and councillor are required.' });
    }
    if (kind === 'recurring' && !validateCron(cronRaw)) {
      return fail(400, { ...formState, error: `Invalid cron expression: "${cronRaw}".` });
    }
    if (kind === 'once') {
      const iso = parseFireAtLocal(fireAtRaw);
      if (!iso) return fail(400, { ...formState, error: 'A valid fire-at datetime is required.' });
    }

    try {
      const schedule = await createSchedule({
        title,
        brief,
        councillor_slug,
        kind,
        cron: kind === 'recurring' ? cronRaw : null,
        fire_at: kind === 'once' ? parseFireAtLocal(fireAtRaw) : null,
        enabled
      });
      redirect(303, `/schedules/${schedule.id}`);
    } catch (err) {
      if (err instanceof Response) throw err;
      return fail(400, { ...formState, error: err instanceof Error ? err.message : 'Failed to create schedule.' });
    }
  }
};

export const _previewNext = previewNext;
```

- [ ] **Step 2: Implement the view**

Create `src/routes/schedules/new/+page.svelte`:

```svelte
<script lang="ts">
  import type { ActionData, PageData } from './$types';
  let { data, form }: { data: PageData; form: ActionData } = $props();
  const c = $derived(data.council);

  let kind = $state<'recurring' | 'once'>(form?.kind ?? 'recurring');
  let cron = $state<string>(form?.cron ?? '0 9 * * MON');
  let fireAt = $state<string>(form?.fire_at ?? '');
</script>

<p><a href="/schedules">&larr; Schedules</a></p>

<h1>New schedule</h1>

{#if form?.error}<p class="error">{form.error}</p>{/if}

{#if c.councillors.length === 0}
  <p class="empty">Add a councillor first.</p>
  <p><a class="btn primary" href="/councillors/new">+ New councillor</a></p>
{:else}
  <form method="POST" class="stack">
    <label>
      <span>Title</span>
      <input name="title" required value={form?.title ?? ''} />
    </label>
    <label>
      <span>Councillor</span>
      <select name="councillor_slug" required>
        <option value="">— pick one —</option>
        {#each c.councillors as cl (cl.slug)}
          <option value={cl.slug} selected={form?.councillor_slug === cl.slug}>{cl.name}</option>
        {/each}
      </select>
    </label>
    <fieldset>
      <legend>Kind</legend>
      <label class="radio"><input type="radio" name="kind" value="recurring" bind:group={kind} /> Recurring (cron)</label>
      <label class="radio"><input type="radio" name="kind" value="once" bind:group={kind} /> One-shot (fire at)</label>
    </fieldset>
    {#if kind === 'recurring'}
      <label>
        <span>Cron expression (5-field, system TZ)</span>
        <input name="cron" bind:value={cron} placeholder="0 9 * * MON" />
      </label>
    {:else}
      <label>
        <span>Fire at (local time)</span>
        <input name="fire_at" type="datetime-local" bind:value={fireAt} />
      </label>
    {/if}
    <label>
      <span>Brief</span>
      <textarea name="brief" rows="8" required>{form?.brief ?? ''}</textarea>
    </label>
    <label class="check">
      <input type="checkbox" name="enabled" checked={form?.enabled ?? true} />
      <span>Enabled</span>
    </label>
    <div class="actions">
      <a class="btn" href="/schedules">Cancel</a>
      <button class="btn primary" type="submit">Create schedule</button>
    </div>
  </form>
{/if}

<style>
  h1 { margin: 0 0 1.5rem; }
  .error { color: var(--danger); }
  .empty { color: var(--muted); }
  .stack { display: grid; gap: 1rem; max-width: 640px; }
  label { display: grid; gap: 0.3rem; }
  label > span { font-size: 0.9em; color: var(--muted); }
  label.check, label.radio { grid-auto-flow: column; justify-content: start; align-items: center; gap: 0.5rem; }
  label.check > span, label.radio > span { color: var(--fg); }
  fieldset { border: 1px solid var(--border); border-radius: 8px; padding: 0.5rem 0.9rem 0.75rem; margin: 0; display: grid; gap: 0.35rem; }
  fieldset legend { padding: 0 0.35rem; font-size: 0.9em; color: var(--muted); }
  input, textarea, select {
    background: #1a1d24; color: var(--fg);
    border: 1px solid var(--border); border-radius: 6px; padding: 0.55rem 0.7rem;
  }
  input:focus, textarea:focus, select:focus { outline: 2px solid var(--accent); border-color: var(--accent); }
  textarea { resize: vertical; min-height: 6rem; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
  .actions { display: flex; gap: 0.5rem; justify-content: flex-end; }
  .btn { display: inline-block; padding: 0.5rem 0.9rem; border-radius: 6px; border: 1px solid var(--border); text-decoration: none; color: var(--fg); background: transparent; cursor: pointer; }
  .btn.primary { background: var(--accent); color: #0f1115; border-color: var(--accent); font-weight: 600; }
</style>
```

- [ ] **Step 3: Smoke**

Run:

```bash
npm run check
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/routes/schedules/new/+page.server.ts src/routes/schedules/new/+page.svelte
git commit -m "feat(scheduler): /schedules/new create form"
```

---

## Task 10 — Schedules detail route

**Files:**
- Create: `src/routes/schedules/[id]/+page.server.ts`
- Create: `src/routes/schedules/[id]/+page.svelte`

- [ ] **Step 1: Implement the loader + actions**

Create `src/routes/schedules/[id]/+page.server.ts`:

```ts
import { error, fail, redirect } from '@sveltejs/kit';
import { hasCouncil } from '$lib/server/councils';
import {
  deleteSchedule,
  readSchedule,
  readScheduleEvents,
  setEnabled
} from '$lib/server/schedules';
import { previewNext } from '$lib/server/cron';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
  if (!hasCouncil()) error(404, 'No council in this directory');
  const schedule = await readSchedule(params.id).catch(() => null);
  if (!schedule) error(404, `Schedule "${params.id}" not found`);
  const events = (await readScheduleEvents(params.id)).slice(-20).reverse();
  const upcoming =
    schedule.kind === 'recurring' && schedule.cron
      ? previewNext(schedule.cron, 3, new Date())
      : schedule.kind === 'once' && schedule.fire_at
        ? [schedule.fire_at]
        : [];
  return { schedule, events, upcoming };
};

export const actions: Actions = {
  toggle: async ({ params, request }) => {
    const form = await request.formData();
    const enabled = String(form.get('enabled') ?? '') === 'true';
    try {
      await setEnabled(params.id, enabled);
    } catch (err) {
      return fail(400, { error: err instanceof Error ? err.message : 'toggle failed' });
    }
    return { ok: true };
  },
  delete: async ({ params }) => {
    await deleteSchedule(params.id);
    redirect(303, '/schedules');
  }
};
```

- [ ] **Step 2: Implement the view**

Create `src/routes/schedules/[id]/+page.svelte`:

```svelte
<script lang="ts">
  import type { PageData } from './$types';
  let { data }: { data: PageData } = $props();
  const s = $derived(data.schedule);
  const events = $derived(data.events);
  const upcoming = $derived(data.upcoming);

  function fmt(iso: string | null | undefined): string {
    if (!iso) return '—';
    try { return new Date(iso).toLocaleString(); } catch { return String(iso); }
  }
</script>

<p><a href="/schedules">&larr; Schedules</a></p>

<header class="head">
  <div>
    <h1>{s.title}{#if !s.enabled} <span class="badge off">disabled</span>{/if}</h1>
    <p class="meta">
      {s.kind} · councillor <a href="/councillors/{s.councillor_slug}">{s.councillor_slug}</a> · fired {s.fire_count} times
    </p>
  </div>
  <div class="head-actions">
    <a class="btn" href="/schedules/{s.id}/edit">Edit</a>
    <form method="POST" action="?/toggle">
      <input type="hidden" name="enabled" value={(!s.enabled).toString()} />
      <button class="btn" type="submit">{s.enabled ? 'Disable' : 'Enable'}</button>
    </form>
    <form method="POST" action="?/delete" onsubmit={(e) => { if (!confirm(`Delete schedule "${s.title}"?`)) e.preventDefault(); }}>
      <button class="btn danger" type="submit">Delete</button>
    </form>
  </div>
</header>

<section class="card">
  <h2>Definition</h2>
  <dl>
    <dt>Kind</dt><dd>{s.kind}</dd>
    {#if s.kind === 'recurring'}
      <dt>Cron</dt><dd><code>{s.cron}</code></dd>
    {:else}
      <dt>Fire at</dt><dd>{fmt(s.fire_at)}</dd>
    {/if}
    <dt>Next fire</dt><dd>{fmt(s.next_fire_at)}</dd>
    <dt>Last spawned job</dt>
    <dd>{#if s.last_fire_job_id}<a href="/jobs/{s.last_fire_job_id}">{s.last_fire_job_id}</a>{:else}—{/if}</dd>
    {#if s.fired_at}<dt>Fired at</dt><dd>{fmt(s.fired_at)}</dd>{/if}
  </dl>
  <h3>Brief</h3>
  <pre class="brief">{s.brief}</pre>
</section>

{#if upcoming.length > 0}
  <section class="card">
    <h2>Next {upcoming.length} fire{upcoming.length === 1 ? '' : 's'}</h2>
    <ul>
      {#each upcoming as iso, i}
        <li>{i + 1}. {fmt(iso)}</li>
      {/each}
    </ul>
  </section>
{/if}

<section class="card">
  <h2>Recent events</h2>
  {#if events.length === 0}
    <p class="empty">No events yet.</p>
  {:else}
    <ul class="events">
      {#each events as e}
        <li>
          <code>{e.type}</code>
          <span class="ts">{fmt(e.at)}</span>
          {#if e.job_id}· <a href="/jobs/{e.job_id}">job {e.job_id}</a>{/if}
          {#if e.prior_job_id}· prior <a href="/jobs/{e.prior_job_id}">{e.prior_job_id}</a>{/if}
          {#if e.message}<div class="msg">{e.message}</div>{/if}
          {#if e.count !== undefined}<div class="msg">missed {e.count} fire{e.count === 1 ? '' : 's'} between {fmt(e.from)} and {fmt(e.to)}</div>{/if}
        </li>
      {/each}
    </ul>
  {/if}
</section>

<style>
  h1 { margin: 0; }
  .head { display: flex; justify-content: space-between; gap: 1rem; align-items: flex-start; margin-bottom: 1.5rem; }
  .head-actions { display: flex; gap: 0.5rem; align-items: center; }
  .head-actions form { display: inline; }
  .meta { color: var(--muted); margin: 0.25rem 0 0; font-size: 0.9em; }
  .card { border: 1px solid var(--border); border-radius: 8px; padding: 1rem 1.25rem; margin-bottom: 1.25rem; }
  .card h2 { margin: 0 0 0.75rem; }
  .card h3 { margin: 0.75rem 0 0.35rem; font-size: 0.95em; color: var(--muted); }
  .brief { white-space: pre-wrap; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; background: rgba(255,255,255,0.02); padding: 0.65rem 0.85rem; border-radius: 6px; margin: 0; }
  dl { display: grid; grid-template-columns: 11rem 1fr; gap: 0.35rem 1rem; margin: 0; }
  dt { color: var(--muted); }
  dd { margin: 0; }
  .events { list-style: none; padding: 0; margin: 0; display: grid; gap: 0.5rem; }
  .events code { background: rgba(255,255,255,0.04); padding: 0.05rem 0.35rem; border-radius: 4px; font-size: 0.85em; }
  .events .ts { color: var(--muted); font-size: 0.85em; }
  .events .msg { color: var(--muted); margin-top: 0.15rem; font-size: 0.9em; }
  .empty { color: var(--muted); }
  .badge.off { font-size: 0.55em; padding: 0.15rem 0.5rem; border-radius: 999px; border: 1px solid var(--muted); color: var(--muted); vertical-align: middle; margin-left: 0.5rem; }
  .btn { display: inline-block; padding: 0.5rem 0.9rem; border-radius: 6px; border: 1px solid var(--border); text-decoration: none; color: var(--fg); background: transparent; cursor: pointer; }
  .btn.danger { border-color: var(--danger); color: var(--danger); }
  code { background: rgba(255,255,255,0.04); padding: 0.05rem 0.35rem; border-radius: 4px; font-size: 0.9em; }
</style>
```

- [ ] **Step 3: Smoke**

Run:

```bash
npm run check
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/routes/schedules/\[id\]/+page.server.ts src/routes/schedules/\[id\]/+page.svelte
git commit -m "feat(scheduler): /schedules/[id] detail with events + upcoming"
```

(If the shell is PowerShell and the literal `[id]` causes globbing trouble, run `git add src/routes/schedules` instead.)

---

## Task 11 — Schedules edit route

**Files:**
- Create: `src/routes/schedules/[id]/edit/+page.server.ts`
- Create: `src/routes/schedules/[id]/edit/+page.svelte`

- [ ] **Step 1: Implement the loader + action**

Create `src/routes/schedules/[id]/edit/+page.server.ts`:

```ts
import { error, fail, redirect } from '@sveltejs/kit';
import { hasCouncil, readCouncilWithCouncillors } from '$lib/server/councils';
import { readSchedule, updateSchedule } from '$lib/server/schedules';
import { validateCron } from '$lib/server/cron';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
  if (!hasCouncil()) error(404, 'No council in this directory');
  const schedule = await readSchedule(params.id).catch(() => null);
  if (!schedule) error(404, `Schedule "${params.id}" not found`);
  const council = await readCouncilWithCouncillors();
  return { schedule, council };
};

function parseFireAtLocal(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (isNaN(d.getTime())) return null;
  return d.toISOString();
}

export const actions: Actions = {
  default: async ({ params, request }) => {
    const form = await request.formData();
    const title = String(form.get('title') ?? '').trim();
    const brief = String(form.get('brief') ?? '').trim();
    const councillor_slug = String(form.get('councillor_slug') ?? '').trim();
    const kind = String(form.get('kind') ?? 'recurring') as 'once' | 'recurring';
    const cronRaw = String(form.get('cron') ?? '').trim();
    const fireAtRaw = String(form.get('fire_at') ?? '').trim();
    const enabled = form.get('enabled') === 'on';

    const formState = { title, brief, councillor_slug, kind, cron: cronRaw, fire_at: fireAtRaw, enabled };

    if (!title || !brief || !councillor_slug) {
      return fail(400, { ...formState, error: 'Title, brief, and councillor are required.' });
    }
    if (kind === 'recurring' && !validateCron(cronRaw)) {
      return fail(400, { ...formState, error: `Invalid cron expression: "${cronRaw}".` });
    }
    if (kind === 'once' && !parseFireAtLocal(fireAtRaw)) {
      return fail(400, { ...formState, error: 'A valid fire-at datetime is required.' });
    }
    try {
      await updateSchedule(params.id, {
        title,
        brief,
        councillor_slug,
        kind,
        cron: kind === 'recurring' ? cronRaw : null,
        fire_at: kind === 'once' ? parseFireAtLocal(fireAtRaw) : null,
        enabled
      });
      redirect(303, `/schedules/${params.id}`);
    } catch (err) {
      if (err instanceof Response) throw err;
      return fail(400, { ...formState, error: err instanceof Error ? err.message : 'Failed to update schedule.' });
    }
  }
};
```

- [ ] **Step 2: Implement the view**

Create `src/routes/schedules/[id]/edit/+page.svelte`:

```svelte
<script lang="ts">
  import type { ActionData, PageData } from './$types';
  let { data, form }: { data: PageData; form: ActionData } = $props();
  const s = $derived(data.schedule);
  const c = $derived(data.council);

  function toLocalInput(iso: string | null): string {
    if (!iso) return '';
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  let kind = $state<'recurring' | 'once'>(form?.kind ?? s.kind);
  let cron = $state<string>(form?.cron ?? s.cron ?? '');
  let fireAt = $state<string>(form?.fire_at ?? toLocalInput(s.fire_at));
</script>

<p><a href="/schedules/{s.id}">&larr; {s.title}</a></p>

<h1>Edit schedule</h1>

{#if form?.error}<p class="error">{form.error}</p>{/if}

<form method="POST" class="stack">
  <label>
    <span>Title</span>
    <input name="title" required value={form?.title ?? s.title} />
  </label>
  <label>
    <span>Councillor</span>
    <select name="councillor_slug" required>
      {#each c.councillors as cl (cl.slug)}
        <option value={cl.slug} selected={(form?.councillor_slug ?? s.councillor_slug) === cl.slug}>{cl.name}</option>
      {/each}
    </select>
  </label>
  <fieldset>
    <legend>Kind</legend>
    <label class="radio"><input type="radio" name="kind" value="recurring" bind:group={kind} /> Recurring (cron)</label>
    <label class="radio"><input type="radio" name="kind" value="once" bind:group={kind} /> One-shot (fire at)</label>
  </fieldset>
  {#if kind === 'recurring'}
    <label>
      <span>Cron expression</span>
      <input name="cron" bind:value={cron} placeholder="0 9 * * MON" />
    </label>
  {:else}
    <label>
      <span>Fire at (local time)</span>
      <input name="fire_at" type="datetime-local" bind:value={fireAt} />
    </label>
  {/if}
  <label>
    <span>Brief</span>
    <textarea name="brief" rows="8" required>{form?.brief ?? s.brief}</textarea>
  </label>
  <label class="check">
    <input type="checkbox" name="enabled" checked={form?.enabled ?? s.enabled} />
    <span>Enabled</span>
  </label>
  <div class="actions">
    <a class="btn" href="/schedules/{s.id}">Cancel</a>
    <button class="btn primary" type="submit">Save changes</button>
  </div>
</form>

<style>
  h1 { margin: 0 0 1.5rem; }
  .error { color: var(--danger); }
  .stack { display: grid; gap: 1rem; max-width: 640px; }
  label { display: grid; gap: 0.3rem; }
  label > span { font-size: 0.9em; color: var(--muted); }
  label.check, label.radio { grid-auto-flow: column; justify-content: start; align-items: center; gap: 0.5rem; }
  label.check > span, label.radio > span { color: var(--fg); }
  fieldset { border: 1px solid var(--border); border-radius: 8px; padding: 0.5rem 0.9rem 0.75rem; margin: 0; display: grid; gap: 0.35rem; }
  fieldset legend { padding: 0 0.35rem; font-size: 0.9em; color: var(--muted); }
  input, textarea, select {
    background: #1a1d24; color: var(--fg);
    border: 1px solid var(--border); border-radius: 6px; padding: 0.55rem 0.7rem;
  }
  input:focus, textarea:focus, select:focus { outline: 2px solid var(--accent); border-color: var(--accent); }
  textarea { resize: vertical; min-height: 6rem; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
  .actions { display: flex; gap: 0.5rem; justify-content: flex-end; }
  .btn { display: inline-block; padding: 0.5rem 0.9rem; border-radius: 6px; border: 1px solid var(--border); text-decoration: none; color: var(--fg); background: transparent; cursor: pointer; }
  .btn.primary { background: var(--accent); color: #0f1115; border-color: var(--accent); font-weight: 600; }
</style>
```

- [ ] **Step 3: Smoke**

Run:

```bash
npm run check
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/routes/schedules
git commit -m "feat(scheduler): /schedules/[id]/edit form"
```

---

## Task 12 — "Save as schedule" branch on `/jobs/new`

**Files:**
- Modify: `src/routes/jobs/new/+page.server.ts`
- Modify: `src/routes/jobs/new/+page.svelte`

- [ ] **Step 1: Extend the server action**

Edit `src/routes/jobs/new/+page.server.ts`. Add the import:

```ts
import { createSchedule } from '$lib/server/schedules';
import { validateCron } from '$lib/server/cron';
```

Replace the existing `actions: Actions` block with:

```ts
function parseFireAtLocal(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (isNaN(d.getTime())) return null;
  return d.toISOString();
}

export const actions: Actions = {
  default: async ({ request }) => {
    const form = await request.formData();
    const title = String(form.get('title') ?? '').trim();
    const brief = String(form.get('brief') ?? '').trim();
    const slugs = form
      .getAll('councillor_slugs')
      .map((v) => String(v).trim())
      .filter(Boolean);
    const start_now = form.get('start_now') === 'on';
    const save_as = String(form.get('save_as') ?? 'job') as 'job' | 'schedule';

    if (!title || !brief || slugs.length === 0) {
      return fail(400, {
        error: 'Title, brief, and at least one councillor are required.',
        title,
        brief,
        councillor_slugs: slugs
      });
    }

    const council = await readCouncilWithCouncillors();
    const validSlugs = new Set(council.councillors.map((c) => c.slug));
    const unknown = slugs.filter((s) => !validSlugs.has(s));
    if (unknown.length > 0) {
      return fail(400, {
        error: `Unknown councillor${unknown.length === 1 ? '' : 's'}: ${unknown.join(', ')}`,
        title,
        brief,
        councillor_slugs: slugs
      });
    }

    if (save_as === 'schedule') {
      if (slugs.length !== 1) {
        return fail(400, {
          error: 'Save as schedule requires exactly one councillor.',
          title, brief, councillor_slugs: slugs
        });
      }
      const kind = String(form.get('sched_kind') ?? 'recurring') as 'once' | 'recurring';
      const cronRaw = String(form.get('sched_cron') ?? '').trim();
      const fireAtRaw = String(form.get('sched_fire_at') ?? '').trim();
      const enabled = form.get('sched_enabled') === 'on';
      if (kind === 'recurring' && !validateCron(cronRaw)) {
        return fail(400, { error: `Invalid cron expression: "${cronRaw}".`, title, brief, councillor_slugs: slugs });
      }
      if (kind === 'once' && !parseFireAtLocal(fireAtRaw)) {
        return fail(400, { error: 'A valid fire-at datetime is required.', title, brief, councillor_slugs: slugs });
      }
      try {
        const s = await createSchedule({
          title,
          brief,
          councillor_slug: slugs[0],
          kind,
          cron: kind === 'recurring' ? cronRaw : null,
          fire_at: kind === 'once' ? parseFireAtLocal(fireAtRaw) : null,
          enabled
        });
        redirect(303, `/schedules/${s.id}`);
      } catch (err) {
        if (err instanceof Response) throw err;
        return fail(400, { error: err instanceof Error ? err.message : 'Failed to create schedule.', title, brief, councillor_slugs: slugs });
      }
    }

    const uniqueSlugs = Array.from(new Set(slugs));
    const now = new Date();
    const created: string[] = [];
    try {
      for (let i = 0; i < uniqueSlugs.length; i++) {
        const stamp = new Date(now.getTime() + i);
        const job = await createJob(
          { title, brief, councillor_slug: uniqueSlugs[i] },
          stamp
        );
        created.push(job.id);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create job.';
      return fail(400, { error: message, title, brief, councillor_slugs: slugs });
    }

    if (start_now) for (const id of created) startJobInBackground(id);

    if (created.length === 1) redirect(303, `/jobs/${created[0]}`);
    redirect(303, '/');
  }
};
```

- [ ] **Step 2: Extend the view**

Edit `src/routes/jobs/new/+page.svelte`. Inside the `<form>`, immediately *before* the existing `<div class="actions">…</div>` block, insert the "Save as schedule" disclosure:

```svelte
    <fieldset class="schedule">
      <legend>
        <label class="radio inline">
          <input type="radio" name="save_as" value="job" checked={form?.save_as !== 'schedule'} />
          Run now (default)
        </label>
        <label class="radio inline">
          <input type="radio" name="save_as" value="schedule" checked={form?.save_as === 'schedule'} disabled={selected.size !== 1} />
          Save as schedule {#if selected.size !== 1}<small>(pick exactly 1 councillor)</small>{/if}
        </label>
      </legend>
      <div class="sched-fields">
        <label class="radio inline"><input type="radio" name="sched_kind" value="recurring" checked /> Recurring (cron)</label>
        <label class="radio inline"><input type="radio" name="sched_kind" value="once" /> One-shot</label>
        <label>
          <span>Cron expression</span>
          <input name="sched_cron" placeholder="0 9 * * MON" value={form?.sched_cron ?? ''} />
        </label>
        <label>
          <span>Or fire at (local time)</span>
          <input name="sched_fire_at" type="datetime-local" value={form?.sched_fire_at ?? ''} />
        </label>
        <label class="check">
          <input type="checkbox" name="sched_enabled" checked />
          <span>Enabled</span>
        </label>
      </div>
    </fieldset>
```

And append to the `<style>` block:

```svelte
  fieldset.schedule { border: 1px dashed var(--border); border-radius: 8px; padding: 0.5rem 0.9rem 0.75rem; margin: 0; display: grid; gap: 0.5rem; }
  fieldset.schedule legend { padding: 0 0.35rem; font-size: 0.9em; color: var(--muted); display: flex; gap: 1rem; }
  fieldset.schedule .sched-fields { display: grid; gap: 0.5rem; }
  label.radio.inline { display: inline-flex; align-items: center; gap: 0.35rem; }
  small { color: var(--muted); }
```

(The server action only consumes the `sched_*` inputs when `save_as=schedule`, so leaving them visible at all times is fine.)

- [ ] **Step 3: Smoke**

Run:

```bash
npm run check
npm test
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/routes/jobs/new/+page.server.ts src/routes/jobs/new/+page.svelte
git commit -m "feat(scheduler): 'save as schedule' branch on /jobs/new"
```

---

## Task 13 — Council home schedule summary + nav

**Files:**
- Modify: `src/lib/server/scheduler.ts` (export a summary helper)
- Modify: `src/routes/+page.server.ts`
- Modify: `src/routes/+page.svelte`
- Modify: `src/routes/+layout.svelte`

- [ ] **Step 1: Add a summary helper**

Append to `src/lib/server/scheduler.ts`:

```ts
export interface ScheduleSummary {
  active: number;
  next_fire_at: string | null;
  next_schedule_id: string | null;
}

export async function scheduleSummary(): Promise<ScheduleSummary> {
  const all = await listSchedules();
  const active = all.filter((s) => s.enabled && s.next_fire_at);
  active.sort((a, b) => (a.next_fire_at! < b.next_fire_at! ? -1 : 1));
  const head = active[0] ?? null;
  return {
    active: active.length,
    next_fire_at: head?.next_fire_at ?? null,
    next_schedule_id: head?.id ?? null
  };
}
```

- [ ] **Step 2: Wire into the home loader**

Edit `src/routes/+page.server.ts`. Add the import:

```ts
import { scheduleSummary } from '$lib/server/scheduler';
```

Change the `Promise.all` call to also fetch the summary, and return it on the data object:

```ts
  const [jobs, notes, pendingProposals, schedules] = await Promise.all([
    listJobs(),
    listNotes(),
    listJobProposals({ status: 'pending' }),
    scheduleSummary()
  ]);
```

```ts
  return {
    hasCouncil: true as const,
    council,
    notes,
    recentByCouncillor,
    running: Array.from(running),
    pendingProposalCount: pendingProposals.length,
    schedules
  };
```

- [ ] **Step 3: Render in `+page.svelte`**

Edit `src/routes/+page.svelte`. Just below `{@const recent = data.recentByCouncillor}`, add:

```svelte
  {@const sched = data.schedules}
  function relTime(iso: string): string {
    const diffMs = new Date(iso).getTime() - Date.now();
    const abs = Math.abs(diffMs);
    const min = Math.round(abs / 60000);
    if (min < 60) return `${diffMs >= 0 ? 'in' : ''} ${min}m${diffMs < 0 ? ' ago' : ''}`.trim();
    const hr = Math.round(abs / 3_600_000);
    if (hr < 48) return `${diffMs >= 0 ? 'in' : ''} ${hr}h${diffMs < 0 ? ' ago' : ''}`.trim();
    const days = Math.round(abs / 86_400_000);
    return `${diffMs >= 0 ? 'in' : ''} ${days}d${diffMs < 0 ? ' ago' : ''}`.trim();
  }
```

Note: the `function` declaration goes inside the existing `<script lang="ts">` block at the top of the file, NOT inside the markup. Move it up there. Then in the markup, immediately after the closing `</header>` of the council header, add:

```svelte
  <section class="schedules-line">
    {#if sched.active === 0}
      <a class="dim" href="/schedules">Schedules: none active</a>
    {:else}
      <a href="/schedules">
        Schedules: {sched.active} active{#if sched.next_fire_at} · next fires {relTime(sched.next_fire_at)}{/if}
      </a>
    {/if}
  </section>
```

Append to the `<style>` block:

```svelte
  .schedules-line { margin: -0.75rem 0 1.25rem; font-size: 0.9em; }
  .schedules-line a { color: var(--accent); text-decoration: none; }
  .schedules-line a:hover { text-decoration: underline; }
  .schedules-line .dim { color: var(--muted); }
```

- [ ] **Step 4: Add nav link in the layout**

Edit `src/routes/+layout.svelte`. In the existing `<nav class="links">` block, add a `Schedules` link as the *first* nav item:

```svelte
    <nav class="links">
      <a href="/schedules">Schedules</a>
      <a href="/import">Install template</a>
      <a href="/export">Export…</a>
    </nav>
```

- [ ] **Step 5: Smoke**

Run:

```bash
npm run check
npm test
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/server/scheduler.ts src/routes/+page.server.ts src/routes/+page.svelte src/routes/+layout.svelte
git commit -m "feat(scheduler): council home summary line + nav link"
```

---

## Task 14 — Link spawned jobs back to their schedule on `/jobs/[jid]`

**Files:**
- Modify: `src/routes/jobs/[jid]/+page.svelte`

- [ ] **Step 1: Render the link**

Edit `src/routes/jobs/[jid]/+page.svelte`. Locate the existing header / meta line that displays the job's title and status, and inject the schedule link if present. Add to the `<script lang="ts">` block (alongside the existing job derivation):

```svelte
  const fromSchedule = $derived(data.job.spawned_by_schedule_id ?? null);
```

In the existing header markup, just after the line that prints the job's councillor or status (use the spot that currently shows the job's title metadata — e.g. just below the `<h1>` or the meta `<p>`), add:

```svelte
  {#if fromSchedule}
    <p class="meta">From schedule: <a href="/schedules/{fromSchedule}">{fromSchedule}</a></p>
  {/if}
```

If the existing file uses a different prop name for the job, use that one. The optional field on the loaded `Job` is `spawned_by_schedule_id` — no loader changes needed; SvelteKit already passes the full job through.

- [ ] **Step 2: Smoke**

Run:

```bash
npm run check
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/routes/jobs/\[jid\]/+page.svelte
git commit -m "feat(scheduler): job detail links back to spawning schedule"
```

---

## Task 15 — Update SPECIFICATION.md and docs

**Files:**
- Modify: `SPECIFICATION.md`
- Modify: `docs/data-model.md` (if it exists; verify before editing)
- Modify: `docs/architecture.md` (if it exists; verify before editing)

- [ ] **Step 1: Strike scheduler from "Out of Scope" in SPECIFICATION.md**

Edit `SPECIFICATION.md`. Remove the bullet `Cron / recurring jobs / scheduler` from the "Out of Scope" list (around line 211). In the "TBD" section, remove `cron / recurring jobs. v1 jobs are one-shot.` Add a new "Schedules" concept section (sibling to "Job"), and add corresponding bullets to "v1 Functionality" and the "Storage Model" / "UI Surfaces" tables.

New "Schedule" concept (insert near the "Job" section):

```markdown
### Schedule

A declaration that a job should be created at a future time (`kind: "once"`) or on a cron expression (`kind: "recurring"`). Schedules spawn jobs on the in-process tick loop (30s resolution) and otherwise leave the job lifecycle unchanged. Cron expressions are 5-field, interpreted in the system local TZ. Schedules with `enabled: false` do not fire. On `kind: "once"` fire, the schedule auto-disables and records `fired_at` + `last_fire_job_id`.

If the app was down at a fire time, startup logs a single `missed_fires` event per stale schedule and advances `next_fire_at` to the next future occurrence — no replay. If a recurring fire is due but the prior spawned job is still `running` on the same councillor, the fire is skipped (`skipped_overlap` event) and `next_fire_at` advances.
```

Add to the "v1 Functionality" list:

```markdown
11. **Schedules.** Declare future or recurring work via `/schedules` (or "Save as schedule" on `/jobs/new`). The in-process scheduler ticks every 30s, spawning jobs on the configured councillor.
```

Add to the UI Surfaces table:

```markdown
| `/schedules` | List schedules; enable/disable; delete |
| `/schedules/new` | Create a schedule |
| `/schedules/[id]` | Schedule detail (definition, next-3-fires, last 20 events, spawned job links) |
| `/schedules/[id]/edit` | Edit a schedule |
```

Add to the Storage Model directory tree (inside the `<council-root>/` block, before `.index/`):

```
  schedules/
    <schedule-id>.json
    <schedule-id>.events.jsonl
```

Add to the existing "Out of Scope" list (keep what's still deferred):

```markdown
- Per-schedule TZ; sub-minute resolution
- Schedule proposals from reflection (`<<SCHEDULE …>>`)
- Schedule export/import in council templates
```

- [ ] **Step 2: Touch docs/data-model.md and docs/architecture.md as appropriate**

Run:

```bash
npm run check
```

Then open `docs/data-model.md` and `docs/architecture.md` and add short subsections that match what's actually there. Keep edits minimal — describe the `schedules/` directory and the in-process tick loop in one paragraph each. Do not invent structure those docs do not already use.

- [ ] **Step 3: Commit**

```bash
git add SPECIFICATION.md docs/data-model.md docs/architecture.md
git commit -m "docs(scheduler): add schedules concept + storage + UI surfaces"
```

---

## Task 16 — Manual end-to-end smoke

**No code changes.** This validates the wire-up.

- [ ] **Step 1: Reset the dogfood council**

Run:

```bash
npm run reset -- ./dogfood --yes
npm run dogfood:init
```

Expected: dogfood directory is rebuilt.

- [ ] **Step 2: Start the dev server against dogfood**

Run:

```bash
LANDSRAAD_COUNCIL_ROOT=./dogfood npm run dev
```

Open `http://localhost:5173/schedules`. Expected: empty list.

- [ ] **Step 3: Create a recurring schedule via the UI**

Navigate to `/schedules/new`. Submit:

- Title: `Tick test`
- Councillor: (one of the dogfood mock councillors)
- Kind: Recurring
- Cron: `*/1 * * * *`
- Enabled: checked

Expected: redirect to `/schedules/<id>`; "Next fire" is within the next minute.

- [ ] **Step 4: Watch a job spawn**

Wait up to ~90 seconds. Refresh `/`. Expected: a new job appears under the chosen councillor with title `Tick test`. Its detail page shows `From schedule: …`. The schedule's detail page shows `fire_count: 1`, a `fired` event, and `next_fire_at` advanced by 1 minute.

- [ ] **Step 5: Test catch-up**

Stop the dev server (Ctrl+C). Wait 3 minutes. Restart:

```bash
LANDSRAAD_COUNCIL_ROOT=./dogfood npm run dev
```

Expected: on `/schedules/<id>`, exactly ONE new `missed_fires` event recorded (count ~3), `next_fire_at` advanced to the next future minute, no extra `Tick test` jobs spawned during the downtime.

- [ ] **Step 6: Test "Save as schedule" from /jobs/new**

On `/`, click `+` for one councillor (single-select preselect). Title: `Once test`. Brief: `b`. Select the `Save as schedule` radio. Switch to `One-shot`, set the fire-at to 2 minutes from now. Submit.

Expected: redirect to `/schedules/<id>` for the new schedule. After 2-3 minutes, exactly one spawned job appears; schedule is auto-disabled with `fired_at` set.

- [ ] **Step 7: Cleanup**

Stop the dev server. No commit (no code changes).

---

## Task 17 — Final sweep

- [ ] **Step 1: Run full check + tests**

Run:

```bash
npm run check
npm test
```

Expected: PASS, PASS.

- [ ] **Step 2: Make sure no extra files are staged**

Run:

```bash
git status
```

Expected: working tree clean (every change made was committed in its task).

- [ ] **Step 3: Bump the package version**

Edit `package.json`. Increment the `version` to today's release (current format: `YYYY.M.D`, e.g. `2026.5.26`).

Run:

```bash
git add package.json
git commit -m "release 2026.5.26: scheduler v1 (one-shot + recurring jobs)"
```

---

## Notes for the implementer

- The whole feature avoids touching `runner.ts`. The scheduler uses `createJob` + `startJobInBackground` like the UI does.
- Tests rely on `LANDSRAAD_COUNCIL_ROOT` plus a temp dir per `beforeEach` — same pattern as `jobs.test.ts` and `runner.test.ts`.
- `tickOnce` accepts `{ spawn: 'skip' }` so tests can drive it without actually running adapter subprocesses. Production paths use the default `'background'`.
- `croner`'s `nextRun(after)` returns the next fire strictly *after* `after` (not at-or-after), so callers don't need to add 1ms themselves. `previewNext` does add 1ms when stepping past a returned slot, to avoid getting the same slot twice.
- DST transitions: croner is TZ-aware and will skip / repeat slots correctly when the system TZ has DST. The test in Task 2 only verifies that *some* future fire is produced across the spring-forward; tighter assertions would couple tests to the runner's TZ.
- The `[id]` directory literal can be quoted in PowerShell as `'[id]'` if `git add` complains.
