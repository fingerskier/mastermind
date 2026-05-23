import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { env } from 'node:process';

import { createCouncil } from './councils';
import { createCouncillor } from './councillors';
import { createNote } from './memory';
import { createPrivateNote } from './memory_private';
import { setEmbedder } from './indexer';
import { assembleContextFor } from './context';

let tmpRoot: string;
let prevEnv: string | undefined;

beforeEach(async () => {
  prevEnv = env.LANDSRAAD_COUNCIL_ROOT;
  tmpRoot = mkdtempSync(join(tmpdir(), 'landsraad-ctx-'));
  env.LANDSRAAD_COUNCIL_ROOT = tmpRoot;
  await createCouncil({ name: 'Ctx Test' });
  await createCouncillor({ name: 'Alice', role: 'cto' });
  setEmbedder(null); // no embedder → fallback path
});

afterEach(() => {
  rmSync(tmpRoot, { recursive: true, force: true });
  if (prevEnv === undefined) delete env.LANDSRAAD_COUNCIL_ROOT;
  else env.LANDSRAAD_COUNCIL_ROOT = prevEnv;
});

describe('assembleContextFor (no embedder fallback)', () => {
  it('returns only the roster when no memories exist', async () => {
    const ctx = await assembleContextFor('alice', 'any brief');
    expect(ctx).toContain('# Council roster');
    expect(ctx).toContain('alice — Alice — cto');
    expect(ctx).not.toContain('# Shared council memory');
    expect(ctx).not.toContain('# Your memory');
  });

  it('includes shared memory verbatim in fallback', async () => {
    await createNote({ title: 'Shared One', body: 'shared body' });
    const ctx = await assembleContextFor('alice', 'any brief');
    expect(ctx).toContain('# Shared council memory');
    expect(ctx).toContain('Shared One');
    expect(ctx).toContain('shared body');
  });

  it('does not leak another councillors private memory in fallback', async () => {
    await createCouncillor({ name: 'Bob', role: 'cfo' });
    await createPrivateNote('bob', { title: 'Bobs Secret', body: 'do not show' });
    const ctx = await assembleContextFor('alice', 'any brief');
    expect(ctx).not.toContain('Bobs Secret');
    expect(ctx).not.toContain('do not show');
  });

  it('includes councillors own private memory section in fallback', async () => {
    await createPrivateNote('alice', { title: 'Alice Note', body: 'private body' });
    const ctx = await assembleContextFor('alice', 'any brief');
    expect(ctx).toContain('# Your memory');
    expect(ctx).toContain('Alice Note');
    expect(ctx).toContain('private body');
  });
});

describe('assembleContextFor — roster injection', () => {
  it('prepends roster section above memory sections', async () => {
    await createCouncillor({ name: 'Bob', role: 'cfo' });
    await createNote({ title: 'Shared One', body: 'shared body' });
    await createPrivateNote('alice', { title: 'Alice Note', body: 'private body' });
    const ctx = await assembleContextFor('alice', 'any brief');
    const rosterIdx = ctx.indexOf('# Council roster');
    const sharedIdx = ctx.indexOf('# Shared council memory');
    const privIdx = ctx.indexOf('# Your memory');
    expect(rosterIdx).toBeGreaterThanOrEqual(0);
    expect(rosterIdx).toBeLessThan(sharedIdx);
    expect(rosterIdx).toBeLessThan(privIdx);
  });

  it('roster lists every councillor (including self)', async () => {
    await createCouncillor({ name: 'Bob', role: 'cfo' });
    const ctx = await assembleContextFor('alice', 'any brief');
    expect(ctx).toContain('alice — Alice — cto');
    expect(ctx).toContain('bob — Bob — cfo');
  });
});
