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
