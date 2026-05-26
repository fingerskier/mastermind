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
