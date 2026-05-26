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
