import { createJob, currentJobForCouncillor } from './jobs';
import { readCouncillor } from './councillors';
import { startJobInBackground } from './runner';
import {
  appendScheduleEvent,
  listSchedules,
  readSchedule,
  writeSchedule
} from './schedules';
import { nextFire, validateCron } from './cron';
import type { Schedule } from '$lib/types';

const TICK_MS = 30_000;
const MAX_MISSED_SLOTS = 1000;

interface TickOptions {
  /**
   * 'background' (default): start the spawned job via startJobInBackground.
   * 'skip': only create the job row; do not start the runner. Tests use this
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

async function disableWithError(s: Schedule, now: Date, message: string): Promise<void> {
  await appendScheduleEvent(s.id, { at: now.toISOString(), type: 'fire_error', message });
  s.enabled = false;
  s.next_fire_at = null;
  await writeSchedule(s);
}

async function fireSchedule(
  s: Schedule,
  now: Date,
  opts: TickOptions
): Promise<void> {
  // Pre-validate state before any side effects.
  if (s.kind === 'recurring' && (!s.cron || !validateCron(s.cron))) {
    await disableWithError(s, now, `Invalid cron "${s.cron}".`);
    return;
  }
  try {
    await readCouncillor(s.councillor_slug);
  } catch {
    await disableWithError(s, now, `Councillor "${s.councillor_slug}" not found.`);
    return;
  }

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
    await disableWithError(s, now, message);
    return;
  }

  if (s.kind === 'once') {
    s.enabled = false;
    s.fired_at = now.toISOString();
    s.next_fire_at = null;
  } else {
    s.next_fire_at = computeNext(s, now);
  }
  await writeSchedule(s);
}

export async function tickOnce(now: Date = new Date(), opts: TickOptions = {}): Promise<void> {
  if (ticking) return;
  ticking = true;
  try {
    const schedules = await listSchedules();
    for (const summary of schedules) {
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
