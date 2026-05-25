import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseTemplate } from './templates';

describe('example/tech-writing.template.json', () => {
  const path = join(process.cwd(), 'example', 'tech-writing.template.json');

  it('parses with parseTemplate', () => {
    const raw = readFileSync(path, 'utf8');
    const t = parseTemplate(raw);
    expect(t.format_version).toBe(1);
    expect(t.name).toBe('Tech Writing');
    expect(t.version).toBe('0.1.0');
    expect(t.council.name).toBe('Tech Writing');
  });

  it('has the expected councillor roster (slug + role + adapter)', () => {
    const raw = readFileSync(path, 'utf8');
    const t = parseTemplate(raw);

    expect(t.councillors).toHaveLength(5);

    const bySlug = Object.fromEntries(
      t.councillors.map((c) => [c.slug, c])
    );

    expect(Object.keys(bySlug).sort()).toEqual([
      'amanuensis',
      'editor',
      'factcheck',
      'reader',
      'researcher'
    ]);

    expect(bySlug.editor.role).toBe('Synthesizer');
    expect(bySlug.editor.adapter).toBe('cli:claude');

    expect(bySlug.amanuensis.role).toBe('Implementer');
    expect(bySlug.amanuensis.adapter).toBe('cli:claude');

    expect(bySlug.researcher.role).toBe('Implementer');
    expect(bySlug.researcher.adapter).toBe('cli:codex');

    expect(bySlug.factcheck.role).toBe('Critic');
    expect(bySlug.factcheck.adapter).toBe('cli:codex');

    expect(bySlug.reader.role).toBe('Evangelist');
    expect(bySlug.reader.adapter).toBe('cli:claude');
  });

  it('every councillor has the required persona/routing_hint/reflect fields', () => {
    const raw = readFileSync(path, 'utf8');
    const t = parseTemplate(raw);

    for (const c of t.councillors) {
      expect(typeof c.persona).toBe('string');
      expect(c.persona.length).toBeGreaterThan(200);
      expect(typeof c.routing_hint).toBe('string');
      expect((c.routing_hint ?? '').length).toBeGreaterThan(0);
      expect(c.reflect).toBe(true);
    }
  });
});
