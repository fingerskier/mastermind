import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseTemplate } from './templates';

describe('example/engineering.template.json', () => {
  const path = join(process.cwd(), 'example', 'engineering.template.json');

  it('parses with parseTemplate', () => {
    const raw = readFileSync(path, 'utf8');
    const t = parseTemplate(raw);
    expect(t.format_version).toBe(1);
    expect(t.name).toBe('Engineering');
    expect(t.version).toBe('0.1.0');
    expect(t.council.name).toBe('Engineering');
  });

  it('has the expected councillor roster (slug + role + adapter)', () => {
    const raw = readFileSync(path, 'utf8');
    const t = parseTemplate(raw);

    expect(t.councillors).toHaveLength(5);

    const bySlug = Object.fromEntries(
      t.councillors.map((c) => [c.slug, c])
    );

    expect(Object.keys(bySlug).sort()).toEqual([
      'architect',
      'ee',
      'mech',
      'qa',
      'sweng'
    ]);

    expect(bySlug.architect.role).toBe('Synthesizer');
    expect(bySlug.architect.adapter).toBe('cli:claude');

    expect(bySlug.sweng.role).toBe('Implementer');
    expect(bySlug.sweng.adapter).toBe('cli:codex');

    expect(bySlug.ee.role).toBe('Implementer');
    expect(bySlug.ee.adapter).toBe('cli:codex');

    expect(bySlug.mech.role).toBe('Implementer');
    expect(bySlug.mech.adapter).toBe('cli:claude');

    expect(bySlug.qa.role).toBe('Critic');
    expect(bySlug.qa.adapter).toBe('cli:codex');
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
