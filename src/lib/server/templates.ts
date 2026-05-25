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
  try {
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
  } finally {
    try { reader.releaseLock(); } catch { /* lock already released by cancel */ }
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

import { hasCouncil } from './councils';
import { listCouncillors } from './councillors';
import { listNotes } from './memory';
import { listJobs } from './jobs';

function memoryNoteSlug(n: TemplateMemoryNote): string {
  return slugify(n.title);
}

export async function planApply(t: CouncilTemplate): Promise<ApplyPlan> {
  const exists = hasCouncil();
  const [councillors, notes, jobs] = exists
    ? await Promise.all([listCouncillors(), listNotes(), listJobs()])
    : [[], [], []];
  const existingCouncillorSlugs = new Set(councillors.map((c) => c.slug));
  const existingMemorySlugs = new Set(notes.map((n) => n.slug));
  const jobsCount = jobs.length;

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
