import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { env } from 'node:process';

import { createCouncil, deleteCouncil, listCouncils, readCouncilWithCouncillors, updateCouncil } from './councils';
import { createCouncillor, deleteCouncillor, readCouncillor, updateCouncillor } from './councillors';

let tmpRoot: string;
let prevEnv: string | undefined;

beforeEach(() => {
  prevEnv = env.LANDSRAAD_COUNCILS_ROOT;
  tmpRoot = mkdtempSync(join(tmpdir(), 'landsraad-test-'));
  env.LANDSRAAD_COUNCILS_ROOT = tmpRoot;
});

afterEach(() => {
  rmSync(tmpRoot, { recursive: true, force: true });
  if (prevEnv === undefined) delete env.LANDSRAAD_COUNCILS_ROOT;
  else env.LANDSRAAD_COUNCILS_ROOT = prevEnv;
});

describe('councils', () => {
  it('lists empty when nothing exists', async () => {
    expect(await listCouncils()).toEqual([]);
  });

  it('creates, reads, and lists a council', async () => {
    const created = await createCouncil({ name: 'C-Suite', description: 'Run the biz', template: 'c-suite' });
    expect(created.slug).toBe('c-suite');
    expect(created.name).toBe('C-Suite');

    const list = await listCouncils();
    expect(list).toHaveLength(1);
    expect(list[0].slug).toBe('c-suite');

    const full = await readCouncilWithCouncillors('c-suite');
    expect(full.councillors).toEqual([]);
  });

  it('rejects duplicate council names', async () => {
    await createCouncil({ name: 'Hedge Fund' });
    await expect(createCouncil({ name: 'Hedge Fund' })).rejects.toThrow(/already exists/);
  });

  it('updates a council', async () => {
    await createCouncil({ name: 'Strat', description: 'old' });
    const next = await updateCouncil('strat', { description: 'new', template: 'research' });
    expect(next.description).toBe('new');
    expect(next.template).toBe('research');
  });

  it('deletes a council', async () => {
    await createCouncil({ name: 'Temp' });
    await deleteCouncil('temp');
    expect(await listCouncils()).toEqual([]);
  });
});

describe('councillors', () => {
  beforeEach(async () => {
    await createCouncil({ name: 'C-Suite' });
  });

  it('creates and reads a councillor with persona', async () => {
    const c = await createCouncillor('c-suite', {
      name: 'CFO',
      role: 'Chief Financial Officer',
      adapter: 'cli:claude',
      persona: '# CFO\nFocus on cashflow.'
    });
    expect(c.slug).toBe('cfo');
    const read = await readCouncillor('c-suite', 'cfo');
    expect(read.persona).toContain('Focus on cashflow');
    expect(read.role).toBe('Chief Financial Officer');
    expect(read.adapter).toBe('cli:claude');
  });

  it('lists councillors via council read', async () => {
    await createCouncillor('c-suite', { name: 'CFO', role: 'finance' });
    await createCouncillor('c-suite', { name: 'CTO', role: 'tech' });
    const full = await readCouncilWithCouncillors('c-suite');
    expect(full.councillors.map((c) => c.slug).sort()).toEqual(['cfo', 'cto']);
  });

  it('updates a councillor persona without losing metadata', async () => {
    await createCouncillor('c-suite', { name: 'CFO', role: 'finance', persona: 'v1' });
    const updated = await updateCouncillor('c-suite', 'cfo', { persona: 'v2' });
    expect(updated.persona).toBe('v2');
    expect(updated.role).toBe('finance');
  });

  it('deletes a councillor', async () => {
    await createCouncillor('c-suite', { name: 'CFO', role: 'finance' });
    await deleteCouncillor('c-suite', 'cfo');
    const full = await readCouncilWithCouncillors('c-suite');
    expect(full.councillors).toEqual([]);
  });

  it('rejects creating a councillor in a non-existent council', async () => {
    await expect(createCouncillor('nope', { name: 'X', role: 'y' })).rejects.toThrow();
  });
});
