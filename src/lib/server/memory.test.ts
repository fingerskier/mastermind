import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { env } from 'node:process';

import { createCouncil } from './councils';
import { assembleMemoryContext, createNote, deleteNote, listNotes, readNote, updateNote } from './memory';

let tmpRoot: string;
let prevEnv: string | undefined;

beforeEach(async () => {
  prevEnv = env.LANDSRAAD_COUNCILS_ROOT;
  tmpRoot = mkdtempSync(join(tmpdir(), 'landsraad-mem-'));
  env.LANDSRAAD_COUNCILS_ROOT = tmpRoot;
  await createCouncil({ name: 'Mem Test' });
});

afterEach(() => {
  rmSync(tmpRoot, { recursive: true, force: true });
  if (prevEnv === undefined) delete env.LANDSRAAD_COUNCILS_ROOT;
  else env.LANDSRAAD_COUNCILS_ROOT = prevEnv;
});

describe('memory', () => {
  it('starts empty', async () => {
    expect(await listNotes('mem-test')).toEqual([]);
    expect(await assembleMemoryContext('mem-test')).toBe('');
  });

  it('creates and reads a note', async () => {
    const n = await createNote('mem-test', { title: 'Cash on Hand', body: '# Cash on Hand\n\n$1.2M as of today.' });
    expect(n.slug).toBe('cash-on-hand');
    expect(n.title).toBe('Cash on Hand');
    expect(await readNote('mem-test', 'cash-on-hand')).toMatchObject({ slug: 'cash-on-hand' });
  });

  it('updates note body', async () => {
    await createNote('mem-test', { title: 'Note', body: 'v1' });
    const updated = await updateNote('mem-test', 'note', 'v2');
    expect(updated.body).toBe('v2');
  });

  it('deletes a note', async () => {
    await createNote('mem-test', { title: 'Doomed', body: '...' });
    await deleteNote('mem-test', 'doomed');
    expect(await listNotes('mem-test')).toEqual([]);
  });

  it('rejects duplicate titles', async () => {
    await createNote('mem-test', { title: 'X', body: '' });
    await expect(createNote('mem-test', { title: 'X', body: '' })).rejects.toThrow(/already exists/);
  });

  it('assembles context with all notes', async () => {
    await createNote('mem-test', { title: 'Alpha', body: 'a body' });
    await createNote('mem-test', { title: 'Beta', body: 'b body' });
    const ctx = await assembleMemoryContext('mem-test');
    expect(ctx).toContain('# Shared council memory');
    expect(ctx).toContain('Alpha');
    expect(ctx).toContain('a body');
    expect(ctx).toContain('Beta');
  });
});
