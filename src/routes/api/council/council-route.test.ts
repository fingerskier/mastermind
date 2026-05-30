import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GET } from './+server';
import { createCouncil } from '$lib/server/councils';
import { createCouncillor } from '$lib/server/councillors';

describe('GET /api/council', () => {
  beforeEach(async () => {
    process.env.LANDSRAAD_COUNCIL_ROOT = mkdtempSync(join(tmpdir(), 'landsraad-council-rt-'));
    const { _resetForTests } = await import('$lib/server/councillor-lock');
    _resetForTests();
    await createCouncil({ name: 'Engineering Council', description: '' });
    await createCouncillor({ name: 'Leto', role: 'duke', routing_hint: '', adapter: 'cli:claude', persona: '' });
  });

  it('returns slug, name and roster with busy reflecting the lock', async () => {
    const res = await GET({} as Parameters<typeof GET>[0]);
    const body = await res.json();
    expect(body.slug).toBe('engineering-council');
    expect(body.name).toBe('Engineering Council');
    expect(body.councillors).toEqual([
      { slug: 'leto', label: 'Leto', adapter: 'cli:claude', busy: false }
    ]);
  });

  it('marks a locked councillor busy', async () => {
    const { tryAcquire } = await import('$lib/server/councillor-lock');
    tryAcquire('leto', { kind: 'job', id: 'j1' });
    const res = await GET({} as Parameters<typeof GET>[0]);
    const body = await res.json();
    expect(body.councillors[0].busy).toBe(true);
  });
});
