import { appendFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Job, JobEvent, JobStatus } from '$lib/types';
import { councilDir, jobDir, jobIdFor, jobsDir } from './paths';

const JOB_FILE = 'job.json';
const INPUT_FILE = 'input.md';
const TRANSCRIPT_FILE = 'transcript.md';
const OUTPUT_FILE = 'output.md';
const EVENTS_FILE = 'events.jsonl';

export interface NewJobInput {
  title: string;
  brief: string;
  councillor_slug: string;
}

export async function createJob(councilSlug: string, input: NewJobInput, now: Date = new Date()): Promise<Job> {
  if (!existsSync(councilDir(councilSlug))) throw new Error(`Council "${councilSlug}" does not exist.`);
  if (!input.title.trim()) throw new Error('Job title is required.');
  if (!input.brief.trim()) throw new Error('Job brief is required.');
  if (!input.councillor_slug.trim()) throw new Error('A councillor must be assigned.');

  const id = jobIdFor(input.title, now);
  const dir = jobDir(councilSlug, id);
  if (existsSync(dir)) throw new Error(`Job "${id}" already exists.`);

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
    error: null
  };

  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, JOB_FILE), JSON.stringify(job, null, 2) + '\n', 'utf8');
  await writeFile(join(dir, INPUT_FILE), '', 'utf8');
  await writeFile(join(dir, TRANSCRIPT_FILE), '', 'utf8');
  await writeFile(join(dir, OUTPUT_FILE), '', 'utf8');
  await appendEvent(councilSlug, id, { at: now.toISOString(), type: 'created' });
  return job;
}

export async function readJob(councilSlug: string, id: string): Promise<Job> {
  const raw = await readFile(join(jobDir(councilSlug, id), JOB_FILE), 'utf8');
  return JSON.parse(raw) as Job;
}

export async function writeJob(councilSlug: string, job: Job): Promise<void> {
  await writeFile(join(jobDir(councilSlug, job.id), JOB_FILE), JSON.stringify(job, null, 2) + '\n', 'utf8');
}

export async function listJobs(councilSlug: string): Promise<Job[]> {
  const dir = jobsDir(councilSlug);
  if (!existsSync(dir)) return [];
  const entries = await readdir(dir, { withFileTypes: true });
  const jobs: Job[] = [];
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const job = await readJob(councilSlug, e.name).catch(() => null);
    if (job) jobs.push(job);
  }
  jobs.sort((a, b) => b.id.localeCompare(a.id));
  return jobs;
}

export async function listJobsForCouncillor(councilSlug: string, councillorSlug: string): Promise<Job[]> {
  const all = await listJobs(councilSlug);
  return all.filter((j) => j.councillor_slug === councillorSlug);
}

export async function appendEvent(councilSlug: string, jobId: string, event: JobEvent): Promise<void> {
  await appendFile(join(jobDir(councilSlug, jobId), EVENTS_FILE), JSON.stringify(event) + '\n', 'utf8');
}

export async function readEvents(councilSlug: string, jobId: string): Promise<JobEvent[]> {
  const file = join(jobDir(councilSlug, jobId), EVENTS_FILE);
  if (!existsSync(file)) return [];
  const raw = await readFile(file, 'utf8');
  return raw
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as JobEvent);
}

export async function writeInput(councilSlug: string, jobId: string, body: string): Promise<void> {
  await writeFile(join(jobDir(councilSlug, jobId), INPUT_FILE), body, 'utf8');
}

export async function readInput(councilSlug: string, jobId: string): Promise<string> {
  const file = join(jobDir(councilSlug, jobId), INPUT_FILE);
  return existsSync(file) ? await readFile(file, 'utf8') : '';
}

export async function appendTranscript(councilSlug: string, jobId: string, text: string): Promise<void> {
  await appendFile(join(jobDir(councilSlug, jobId), TRANSCRIPT_FILE), text, 'utf8');
}

export async function readTranscript(councilSlug: string, jobId: string): Promise<string> {
  const file = join(jobDir(councilSlug, jobId), TRANSCRIPT_FILE);
  return existsSync(file) ? await readFile(file, 'utf8') : '';
}

export async function writeOutput(councilSlug: string, jobId: string, body: string): Promise<void> {
  await writeFile(join(jobDir(councilSlug, jobId), OUTPUT_FILE), body, 'utf8');
}

export async function readOutput(councilSlug: string, jobId: string): Promise<string> {
  const file = join(jobDir(councilSlug, jobId), OUTPUT_FILE);
  return existsSync(file) ? await readFile(file, 'utf8') : '';
}

const STATUS_EVENT: Record<JobStatus, JobEvent['type']> = {
  queued: 'note',
  running: 'started',
  succeeded: 'succeeded',
  failed: 'failed',
  cancelled: 'cancelled'
};

export async function setStatus(
  councilSlug: string,
  jobId: string,
  status: JobStatus,
  patch: Partial<Job> = {}
): Promise<Job> {
  const job = await readJob(councilSlug, jobId);
  const next: Job = { ...job, ...patch, status };
  await writeJob(councilSlug, next);
  await appendEvent(councilSlug, jobId, {
    at: new Date().toISOString(),
    type: STATUS_EVENT[status],
    message: patch.error ?? undefined
  });
  return next;
}

export async function currentJobForCouncillor(councilSlug: string, councillorSlug: string): Promise<Job | null> {
  const jobs = await listJobsForCouncillor(councilSlug, councillorSlug);
  return jobs.find((j) => j.status === 'running' || j.status === 'queued') ?? null;
}
