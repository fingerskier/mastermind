import { join } from 'node:path';
import { cwd, env } from 'node:process';

export function councilRoot(): string {
  return env.LANDSRAAD_COUNCIL_ROOT || cwd();
}

export function pkgRoot(): string {
  return env.LANDSRAAD_PKG_ROOT || cwd();
}

export function bundledTemplatesDir(): string {
  return join(pkgRoot(), 'example');
}

export function councilFile(): string {
  return join(councilRoot(), 'council.json');
}

export function councillorsRoot(): string {
  return join(councilRoot(), 'councillors');
}

export function councillorDir(councillorSlug: string): string {
  return join(councillorsRoot(), councillorSlug);
}

export function councillorMemoryDir(councillorSlug: string): string {
  return join(councillorDir(councillorSlug), 'memory');
}

export function memoryDir(): string {
  return join(councilRoot(), 'memory');
}

export function jobsDir(): string {
  return join(councilRoot(), 'jobs');
}

export function jobDir(jobId: string): string {
  return join(jobsDir(), jobId);
}

export function indexDirPath(): string {
  return join(councilRoot(), '.index');
}

export function indexDbPath(): string {
  return join(indexDirPath(), 'embeddings.db');
}

export function slugify(input: string): string {
  const slug = input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
  if (!slug) throw new Error('Name must contain at least one alphanumeric character.');
  return slug;
}

export function jobIdFor(title: string, now: Date = new Date()): string {
  const ts = now.toISOString().replace(/[:.]/g, '-');
  const titleSlug = slugify(title);
  return `${ts}-${titleSlug}`;
}

export function proposalsDir(): string {
  return join(councilRoot(), 'proposals');
}

export function jobProposalsDir(): string {
  return join(proposalsDir(), 'jobs');
}

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
