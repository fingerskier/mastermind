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
