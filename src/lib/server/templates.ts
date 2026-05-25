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
  if (slug && slug !== slugify(slug)) {
    throw new TemplateValidationError(
      `${path}.slug ${JSON.stringify(slug)} is not a valid slug; expected ${JSON.stringify(slugify(slug))}.`
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

import { hasCouncil, createCouncil, updateCouncil, readCouncil } from './councils';
import { listCouncillors, createCouncillor, updateCouncillor, readCouncillor } from './councillors';
import { listNotes, createNote, updateNote, readNote } from './memory';
import { listJobs, createJob, readJob } from './jobs';

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

function provenance(t: CouncilTemplate): string {
  return `${t.name}@${t.version}`;
}

export async function applyTemplate(
  t: CouncilTemplate,
  opts: { confirmedOverwrite: boolean }
): Promise<ApplyPlan> {
  const plan = await planApply(t);
  const needsConfirm =
    plan.council.willOverwrite ||
    plan.councillors.overwrite.length > 0 ||
    plan.memory.overwrite.length > 0;
  if (needsConfirm && !opts.confirmedOverwrite) {
    throw new TemplateNeedsConfirmation(plan);
  }

  // 1. Council meta.
  if (plan.council.exists) {
    await updateCouncil({
      name: t.council.name,
      description: t.council.description ?? '',
      template: provenance(t)
    });
  } else {
    await createCouncil({
      name: t.council.name,
      description: t.council.description ?? '',
      template: provenance(t)
    });
  }

  // 2. Councillors (overwrite or create).
  const overwriteSet = new Set(plan.councillors.overwrite);
  for (const c of t.councillors) {
    const slug = derivedSlug(c);
    if (overwriteSet.has(slug)) {
      await updateCouncillor(slug, {
        name: c.name,
        role: c.role,
        routing_hint: c.routing_hint,
        adapter: c.adapter,
        persona: c.persona,
        reflect: c.reflect
      });
    } else {
      await createCouncillor({
        slug,
        name: c.name,
        role: c.role,
        routing_hint: c.routing_hint,
        adapter: c.adapter,
        persona: c.persona,
        reflect: c.reflect
      });
    }
  }

  // 3. Memory (overwrite or create).
  const memOverwriteSet = new Set(plan.memory.overwrite);
  for (const n of t.memory ?? []) {
    const slug = memoryNoteSlug(n);
    if (memOverwriteSet.has(slug)) {
      await updateNote(slug, n.body);
    } else {
      await createNote({ title: n.title, body: n.body });
    }
  }

  // 4. Sample jobs (only if jobs dir is empty per plan).
  if (!plan.sample_jobs.skipped_because_jobs_exist) {
    for (const j of t.sample_jobs ?? []) {
      await createJob({
        title: j.title,
        brief: j.brief,
        councillor_slug: j.councillor_slug
      });
    }
  }

  return plan;
}

// ---------- export selection ----------

export interface ExportSelection {
  council: {
    name: string;
    version: string;
    description?: string;
    author?: string;
    license?: string;
  };
  councillor_slugs: string[];
  memory_slugs: string[];
  sample_job_ids: string[];
}

export async function exportSelection(s: ExportSelection): Promise<CouncilTemplate> {
  const current = await readCouncil();

  const councillors: TemplateCouncillor[] = [];
  for (const slug of s.councillor_slugs) {
    const c = await readCouncillor(slug);
    councillors.push({
      slug: c.slug,
      name: c.name,
      role: c.role,
      routing_hint: c.routing_hint || undefined,
      adapter: c.adapter,
      persona: c.persona,
      reflect: c.reflect
    });
  }

  const memory: TemplateMemoryNote[] = [];
  for (const slug of s.memory_slugs) {
    const n = await readNote(slug);
    memory.push({ title: n.title, body: n.body });
  }

  const sample_jobs: TemplateSampleJob[] = [];
  for (const id of s.sample_job_ids) {
    const j = await readJob(id);
    if (j.status !== 'queued') continue; // never export run artifacts
    sample_jobs.push({
      title: j.title,
      brief: j.brief,
      councillor_slug: j.councillor_slug
    });
  }

  return {
    format_version: 1,
    name: s.council.name,
    version: s.council.version,
    description: s.council.description,
    author: s.council.author,
    license: s.council.license,
    council: {
      name: s.council.name,
      description: s.council.description ?? (current.description || undefined)
    },
    councillors,
    memory: memory.length ? memory : undefined,
    sample_jobs: sample_jobs.length ? sample_jobs : undefined
  };
}
