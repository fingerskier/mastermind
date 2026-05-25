import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { env } from 'node:process';

import {
  createCouncil,
  deleteCouncilData,
  hasCouncil,
  readCouncilWithCouncillors,
  updateCouncil
} from './councils';
import { createCouncillor, deleteCouncillor, readCouncillor, updateCouncillor } from './councillors';

let tmpRoot: string;
let prevEnv: string | undefined;

beforeEach(() => {
  prevEnv = env.LANDSRAAD_COUNCIL_ROOT;
  tmpRoot = mkdtempSync(join(tmpdir(), 'landsraad-test-'));
  env.LANDSRAAD_COUNCIL_ROOT = tmpRoot;
});

afterEach(() => {
  rmSync(tmpRoot, { recursive: true, force: true });
  if (prevEnv === undefined) delete env.LANDSRAAD_COUNCIL_ROOT;
  else env.LANDSRAAD_COUNCIL_ROOT = prevEnv;
});

describe('council', () => {
  it('reports no council when none exists', () => {
    expect(hasCouncil()).toBe(false);
  });

  it('creates and reads the council', async () => {
    const created = await createCouncil({ name: 'C-Suite', description: 'Run the biz', template: 'c-suite' });
    expect(created.slug).toBe('c-suite');
    expect(created.name).toBe('C-Suite');
    expect(hasCouncil()).toBe(true);

    const full = await readCouncilWithCouncillors();
    expect(full.councillors).toEqual([]);
  });

  it('rejects creating a second council in the same directory', async () => {
    await createCouncil({ name: 'Hedge Fund' });
    await expect(createCouncil({ name: 'Hedge Fund' })).rejects.toThrow(/already exists/);
  });

  it('updates the council', async () => {
    await createCouncil({ name: 'Strat', description: 'old' });
    const next = await updateCouncil({ description: 'new', template: 'research' });
    expect(next.description).toBe('new');
    expect(next.template).toBe('research');
  });

  it('deletes council data', async () => {
    await createCouncil({ name: 'Temp' });
    await deleteCouncilData();
    expect(hasCouncil()).toBe(false);
  });

  it('wipes every standard council subdir on reset', async () => {
    const { writeFile, mkdir } = await import('node:fs/promises');
    const { existsSync } = await import('node:fs');
    await createCouncil({ name: 'ToWipe' });
    const subs = ['councillors', 'memory', 'jobs', '.index', 'proposals'];
    for (const s of subs) {
      await mkdir(join(tmpRoot, s), { recursive: true });
      await writeFile(join(tmpRoot, s, 'sentinel.txt'), 'x', 'utf8');
    }
    await deleteCouncilData();
    for (const s of subs) {
      expect(existsSync(join(tmpRoot, s))).toBe(false);
    }
    expect(hasCouncil()).toBe(false);
  });
});

describe('councillors', () => {
  beforeEach(async () => {
    await createCouncil({ name: 'C-Suite' });
  });

  it('creates and reads a councillor with persona', async () => {
    const c = await createCouncillor({
      name: 'CFO',
      role: 'Chief Financial Officer',
      adapter: 'cli:claude',
      persona: '# CFO\nFocus on cashflow.'
    });
    expect(c.slug).toBe('cfo');
    const read = await readCouncillor('cfo');
    expect(read.persona).toContain('Focus on cashflow');
    expect(read.role).toBe('Chief Financial Officer');
    expect(read.adapter).toBe('cli:claude');
  });

  it('lists councillors via council read', async () => {
    await createCouncillor({ name: 'CFO', role: 'finance' });
    await createCouncillor({ name: 'CTO', role: 'tech' });
    const full = await readCouncilWithCouncillors();
    expect(full.councillors.map((c) => c.slug).sort()).toEqual(['cfo', 'cto']);
  });

  it('updates a councillor persona without losing metadata', async () => {
    await createCouncillor({ name: 'CFO', role: 'finance', persona: 'v1' });
    const updated = await updateCouncillor('cfo', { persona: 'v2' });
    expect(updated.persona).toBe('v2');
    expect(updated.role).toBe('finance');
  });

  it('deletes a councillor', async () => {
    await createCouncillor({ name: 'CFO', role: 'finance' });
    await deleteCouncillor('cfo');
    const full = await readCouncilWithCouncillors();
    expect(full.councillors).toEqual([]);
  });

  it('rejects creating a councillor when no council exists', async () => {
    await deleteCouncilData();
    await expect(createCouncillor({ name: 'X', role: 'y' })).rejects.toThrow();
  });
});
