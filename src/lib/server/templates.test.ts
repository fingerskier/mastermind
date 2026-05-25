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

  it('rejects councillor slug that does not match slugify(name)', () => {
    // createCouncillor derives slug from name; an explicit-but-divergent slug
    // would silently write to the wrong dir. Enforce the invariant up front.
    const bad = {
      ...validTemplate,
      councillors: [
        { slug: 'mismatched', name: 'Mocky', role: 'r', adapter: 'mock:local', persona: 'p' }
      ]
    };
    expect(() => parseTemplate(JSON.stringify(bad))).toThrow(/councillors\[0\]\.slug "mismatched"/);
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
