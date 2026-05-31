import { describe, expect, it } from 'vitest';
import {
  parseTemplate,
  TemplateParseError,
  TemplateValidationError,
  type CouncilTemplate
} from './templates';

const validTemplate: CouncilTemplate = {
  format_version: 1,
  name: 'Test Council',
  version: '0.1.0',
  council: { name: 'Test', description: 'desc' },
  councillors: [
    { name: 'Mocky', role: 'echo', adapter: 'mock:local', persona: 'You are Mocky.' }
  ],
  memory: [{ title: 'House Rules', body: '- be terse.\n' }],
  sample_jobs: [
    { title: 'Hello', brief: 'say hi', councillor_slug: 'mocky' }
  ]
};

describe('parseTemplate', () => {
  it('parses a valid template', () => {
    const t = parseTemplate(JSON.stringify(validTemplate));
    expect(t.name).toBe('Test Council');
    expect(t.councillors).toHaveLength(1);
  });

  it('rejects non-JSON input', () => {
    expect(() => parseTemplate('not json')).toThrow(TemplateParseError);
  });

  it('rejects unsupported format_version', () => {
    const bad = { ...validTemplate, format_version: 2 };
    expect(() => parseTemplate(JSON.stringify(bad))).toThrow(/format_version 2/);
  });

  it('reports missing required field with path', () => {
    const bad = { ...validTemplate, councillors: [{ name: 'X', adapter: 'mock:local', persona: '' }] };
    expect(() => parseTemplate(JSON.stringify(bad))).toThrow(/councillors\[0\]\.role/);
  });

  it('rejects sample_jobs referencing unknown councillor slug', () => {
    const bad = {
      ...validTemplate,
      sample_jobs: [{ title: 'X', brief: 'y', councillor_slug: 'ghost' }]
    };
    expect(() => parseTemplate(JSON.stringify(bad))).toThrow(/sample_jobs\[0\]\.councillor_slug "ghost"/);
  });

  it('accepts an explicit custom slug that differs from slugify(name)', () => {
    const good = {
      ...validTemplate,
      councillors: [
        { slug: 'mock', name: 'Mocky', role: 'r', adapter: 'mock:local', persona: 'p' }
      ],
      sample_jobs: [{ title: 'Hi', brief: 'b', councillor_slug: 'mock' }]
    };
    const t = parseTemplate(JSON.stringify(good));
    expect(t.councillors[0].slug).toBe('mock');
  });

  it('rejects a slug that is not in slug form (uppercase, spaces, etc.)', () => {
    const bad = {
      ...validTemplate,
      councillors: [
        { slug: 'Not A Slug', name: 'Mocky', role: 'r', adapter: 'mock:local', persona: 'p' }
      ]
    };
    expect(() => parseTemplate(JSON.stringify(bad))).toThrow(/councillors\[0\]\.slug "Not A Slug"/);
  });

  it('throws TemplateValidationError on missing top-level field', () => {
    const bad = { ...validTemplate, name: undefined };
    expect(() => parseTemplate(JSON.stringify(bad))).toThrow(TemplateValidationError);
  });
});

import { afterEach, beforeEach, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadTemplate, TemplateFetchError } from './templates';

describe('loadTemplate (path)', () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'lt-')); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  it('reads JSON from a local file path', async () => {
    const file = join(dir, 'x.json');
    writeFileSync(file, JSON.stringify(validTemplate), 'utf8');
    const t = await loadTemplate(file);
    expect(t.name).toBe('Test Council');
  });

  it('throws TemplateParseError on a non-JSON file', async () => {
    const file = join(dir, 'bad.json');
    writeFileSync(file, '<<<', 'utf8');
    await expect(loadTemplate(file)).rejects.toThrow(/Invalid JSON/);
  });
});

describe('loadTemplate (URL)', () => {
  let originalFetch: typeof globalThis.fetch;
  beforeEach(() => { originalFetch = globalThis.fetch; });
  afterEach(() => { globalThis.fetch = originalFetch; });

  it('fetches and parses JSON over http', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(validTemplate), { status: 200 })
    );
    const t = await loadTemplate('https://example.com/x.json');
    expect(t.name).toBe('Test Council');
  });

  it('throws TemplateFetchError on non-2xx', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response('', { status: 404 }));
    await expect(loadTemplate('https://example.com/missing.json')).rejects.toThrow(
      TemplateFetchError
    );
  });

  it('throws TemplateFetchError when body exceeds 2 MB', async () => {
    // Stream a body larger than the cap.
    const tooBig = new ReadableStream({
      start(controller) {
        const chunk = new Uint8Array(1024 * 1024); // 1 MB
        controller.enqueue(chunk);
        controller.enqueue(chunk);
        controller.enqueue(chunk); // 3 MB total
        controller.close();
      }
    });
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(tooBig, { status: 200 }));
    await expect(loadTemplate('https://example.com/huge.json')).rejects.toThrow(/2 MB/);
  });

  it('passes an AbortSignal to fetch (timeout wiring)', async () => {
    const spy = vi.fn().mockResolvedValue(new Response(JSON.stringify(validTemplate)));
    globalThis.fetch = spy as unknown as typeof fetch;
    await loadTemplate('https://example.com/x.json');
    const init = (spy.mock.calls[0][1] ?? {}) as RequestInit;
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });
});

import { hasCouncil, createCouncil } from './councils';
import { createCouncillor } from './councillors';
import { createNote } from './memory';
import { createJob } from './jobs';
import { planApply } from './templates';

describe('planApply', () => {
  let tmpRoot: string;
  let prevEnv: string | undefined;

  beforeEach(() => {
    prevEnv = process.env.LANDSRAAD_COUNCIL_ROOT;
    tmpRoot = mkdtempSync(join(tmpdir(), 'pa-'));
    process.env.LANDSRAAD_COUNCIL_ROOT = tmpRoot;
  });
  afterEach(() => {
    rmSync(tmpRoot, { recursive: true, force: true });
    if (prevEnv === undefined) delete process.env.LANDSRAAD_COUNCIL_ROOT;
    else process.env.LANDSRAAD_COUNCIL_ROOT = prevEnv;
  });

  it('on empty cwd reports all adds, no overwrites', async () => {
    const plan = await planApply(validTemplate);
    expect(plan.council).toEqual({ exists: false, willOverwrite: false });
    expect(plan.councillors).toEqual({ add: ['mocky'], overwrite: [] });
    expect(plan.memory.add).toEqual(['house-rules']);
    expect(plan.memory.overwrite).toEqual([]);
    expect(plan.sample_jobs).toEqual({ add: 1, skipped_because_jobs_exist: false });
  });

  it('on existing council with same-slug councillor reports overwrite', async () => {
    await createCouncil({ name: 'Existing' });
    await createCouncillor({ name: 'Mocky', role: 'orig', adapter: 'mock:local', persona: 'orig' });
    const plan = await planApply(validTemplate);
    expect(plan.council).toEqual({ exists: true, willOverwrite: true });
    expect(plan.councillors.overwrite).toEqual(['mocky']);
    expect(plan.councillors.add).toEqual([]);
  });

  it('reports sample_jobs skipped when council has any jobs', async () => {
    await createCouncil({ name: 'Existing' });
    await createCouncillor({ name: 'Mocky', role: 'r', adapter: 'mock:local', persona: 'p' });
    await createJob({ title: 'pre-existing', brief: 'b', councillor_slug: 'mocky' });
    const plan = await planApply(validTemplate);
    expect(plan.sample_jobs).toEqual({ add: 0, skipped_because_jobs_exist: true });
  });

  it('reports memory overwrite for same-slug note', async () => {
    await createCouncil({ name: 'Existing' });
    await createNote({ title: 'House Rules', body: '- different\n' });
    const plan = await planApply(validTemplate);
    expect(plan.memory.overwrite).toEqual(['house-rules']);
    expect(plan.memory.add).toEqual([]);
  });
});

import { readCouncil, updateCouncil } from './councils';
import { readCouncillor, listCouncillors as listCs } from './councillors';
import { readNote, listNotes as listN } from './memory';
import { listJobs as listJ } from './jobs';
import { applyTemplate, TemplateNeedsConfirmation } from './templates';
import { exportSelection } from './templates';
import { writeCouncilEnv } from './env-file';
import { slugify } from './paths';

describe('applyTemplate (empty cwd)', () => {
  let tmpRoot: string;
  let prevEnv: string | undefined;
  beforeEach(() => {
    prevEnv = process.env.LANDSRAAD_COUNCIL_ROOT;
    tmpRoot = mkdtempSync(join(tmpdir(), 'at-'));
    process.env.LANDSRAAD_COUNCIL_ROOT = tmpRoot;
  });
  afterEach(() => {
    rmSync(tmpRoot, { recursive: true, force: true });
    if (prevEnv === undefined) delete process.env.LANDSRAAD_COUNCIL_ROOT;
    else process.env.LANDSRAAD_COUNCIL_ROOT = prevEnv;
  });

  it('honors explicit custom slug when installing councillor', async () => {
    const tmpl: CouncilTemplate = {
      ...validTemplate,
      councillors: [
        { slug: 'mock', name: 'Mocky', role: 'echo', adapter: 'mock:local', persona: 'p' }
      ],
      memory: undefined,
      sample_jobs: [{ title: 'Hi', brief: 'b', councillor_slug: 'mock' }]
    };
    await applyTemplate(tmpl, { confirmedOverwrite: false });
    const cs = await listCs();
    expect(cs.map((c) => c.slug)).toEqual(['mock']);
    const jobs = await listJ();
    expect(jobs[0].councillor_slug).toBe('mock');
  });

  it('creates council, councillors, memory, sample jobs', async () => {
    await applyTemplate(validTemplate, { confirmedOverwrite: false });
    const council = await readCouncil();
    expect(council.name).toBe('Test');
    expect(council.template).toBe('Test Council@0.1.0');

    const cs = await listCs();
    expect(cs.map((c) => c.slug)).toEqual(['mocky']);
    expect(cs[0].persona).toBe('You are Mocky.');

    const notes = await listN();
    expect(notes.map((n) => n.slug)).toEqual(['house-rules']);

    const jobs = await listJ();
    expect(jobs).toHaveLength(1);
    expect(jobs[0].status).toBe('queued');
    expect(jobs[0].title).toBe('Hello');
    expect(jobs[0].councillor_slug).toBe('mocky');
  });
});

describe('applyTemplate (existing council, conflicts)', () => {
  let tmpRoot: string;
  let prevEnv: string | undefined;
  beforeEach(async () => {
    prevEnv = process.env.LANDSRAAD_COUNCIL_ROOT;
    tmpRoot = mkdtempSync(join(tmpdir(), 'at2-'));
    process.env.LANDSRAAD_COUNCIL_ROOT = tmpRoot;
    await createCouncil({ name: 'Existing', description: 'orig' });
    await createCouncillor({ name: 'Mocky', role: 'orig', adapter: 'mock:local', persona: 'orig' });
  });
  afterEach(() => {
    rmSync(tmpRoot, { recursive: true, force: true });
    if (prevEnv === undefined) delete process.env.LANDSRAAD_COUNCIL_ROOT;
    else process.env.LANDSRAAD_COUNCIL_ROOT = prevEnv;
  });

  it('throws TemplateNeedsConfirmation when not confirmed', async () => {
    await expect(
      applyTemplate(validTemplate, { confirmedOverwrite: false })
    ).rejects.toThrow(TemplateNeedsConfirmation);
  });

  it('replaces conflicting councillor persona when confirmed', async () => {
    await applyTemplate(validTemplate, { confirmedOverwrite: true });
    const c = await readCouncillor('mocky');
    expect(c.persona).toBe('You are Mocky.');
    expect(c.role).toBe('echo');
  });

  it('skips sample_jobs when jobs already exist', async () => {
    await createJob({ title: 'pre', brief: 'b', councillor_slug: 'mocky' });
    const before = (await listJ()).length;
    await applyTemplate(validTemplate, { confirmedOverwrite: true });
    const after = (await listJ()).length;
    expect(after).toBe(before);
  });

  it('never touches existing jobs/ run artifacts', async () => {
    const j = await createJob({ title: 'pre', brief: 'b', councillor_slug: 'mocky' });
    await applyTemplate(validTemplate, { confirmedOverwrite: true });
    const jobs = await listJ();
    expect(jobs.find((x) => x.id === j.id)).toBeDefined();
  });

  it('overwrites council meta to template values (slug follows new name)', async () => {
    // updateCouncil re-derives slug from name. Council slug is metadata only;
    // the council root is the cwd, so changing the slug is safe.
    await applyTemplate(validTemplate, { confirmedOverwrite: true });
    const c = await readCouncil();
    expect(c.name).toBe('Test');
    expect(c.slug).toBe('test');
    expect(c.description).toBe('desc');
    expect(c.template).toBe('Test Council@0.1.0');
  });
});

describe('exportSelection', () => {
  let tmpRoot: string;
  let prevEnv: string | undefined;
  beforeEach(async () => {
    prevEnv = process.env.LANDSRAAD_COUNCIL_ROOT;
    tmpRoot = mkdtempSync(join(tmpdir(), 'ex-'));
    process.env.LANDSRAAD_COUNCIL_ROOT = tmpRoot;
    await createCouncil({ name: 'Source' });
    await createCouncillor({ name: 'Mocky', role: 'r', adapter: 'mock:local', persona: 'p' });
    await createCouncillor({ name: 'Polly', role: 'r2', adapter: 'mock:local', persona: 'p2' });
    await createNote({ title: 'House Rules', body: '- rule\n' });
    await createJob({ title: 'Sample', brief: 'do thing', councillor_slug: 'mocky' });
  });
  afterEach(() => {
    rmSync(tmpRoot, { recursive: true, force: true });
    if (prevEnv === undefined) delete process.env.LANDSRAAD_COUNCIL_ROOT;
    else process.env.LANDSRAAD_COUNCIL_ROOT = prevEnv;
  });

  it('exports selected councillors, no memory, no jobs', async () => {
    const t = await exportSelection({
      council: { name: 'Exported', version: '0.1.0' },
      councillor_slugs: ['mocky'],
      memory_slugs: [],
      sample_job_ids: []
    });
    expect(t.name).toBe('Exported');
    expect(t.councillors.map((c) => c.slug ?? slugify(c.name))).toEqual(['mocky']);
    expect(t.memory ?? []).toEqual([]);
    expect(t.sample_jobs ?? []).toEqual([]);
  });

  it('includes only queued sample jobs that are selected', async () => {
    const jobs = await listJ();
    const sampleId = jobs[0].id;
    const t = await exportSelection({
      council: { name: 'Exported', version: '0.1.0' },
      councillor_slugs: ['mocky'],
      memory_slugs: [],
      sample_job_ids: [sampleId]
    });
    expect(t.sample_jobs).toHaveLength(1);
    expect(t.sample_jobs?.[0].title).toBe('Sample');
    expect(t.sample_jobs?.[0].councillor_slug).toBe('mocky');
  });

  it('round-trip: export -> load -> apply into fresh cwd', async () => {
    const exported = await exportSelection({
      council: { name: 'RT', version: '0.1.0', description: 'rt' },
      councillor_slugs: ['mocky', 'polly'],
      memory_slugs: ['house-rules'],
      sample_job_ids: []
    });
    const json = JSON.stringify(exported);

    // Switch to a fresh cwd.
    const freshRoot = mkdtempSync(join(tmpdir(), 'ex-fresh-'));
    process.env.LANDSRAAD_COUNCIL_ROOT = freshRoot;
    try {
      const reparsed = parseTemplate(json);
      await applyTemplate(reparsed, { confirmedOverwrite: false });
      expect((await readCouncil()).name).toBe('RT');
      expect((await listCs()).map((c) => c.slug).sort()).toEqual(['mocky', 'polly']);
      expect((await listN()).map((n) => n.slug)).toEqual(['house-rules']);
    } finally {
      rmSync(freshRoot, { recursive: true, force: true });
    }
  });

  it('never leaks a council .env secret into the export bundle', async () => {
    const SECRET = 'sk-super-secret-do-not-leak';
    await writeCouncilEnv([{ key: 'OPENAI_API_KEY', value: SECRET }]);
    const exported = await exportSelection({
      council: { name: 'Exported', version: '0.1.0' },
      councillor_slugs: ['mocky', 'polly'],
      memory_slugs: ['house-rules'],
      sample_job_ids: []
    });
    expect(JSON.stringify(exported)).not.toContain(SECRET);
    expect(JSON.stringify(exported)).not.toContain('OPENAI_API_KEY');
  });
});
