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
  prevEnv = env.LANDSRAAD_COUNCIL_ROOT;
  tmpRoot = mkdtempSync(join(tmpdir(), 'landsraad-mem-'));
  env.LANDSRAAD_COUNCIL_ROOT = tmpRoot;
  await createCouncil({ name: 'Mem Test' });
});

afterEach(() => {
  rmSync(tmpRoot, { recursive: true, force: true });
  if (prevEnv === undefined) delete env.LANDSRAAD_COUNCIL_ROOT;
  else env.LANDSRAAD_COUNCIL_ROOT = prevEnv;
});

describe('memory', () => {
  it('starts empty', async () => {
    expect(await listNotes()).toEqual([]);
    expect(await assembleMemoryContext()).toBe('');
  });

  it('creates and reads a note', async () => {
    const n = await createNote({ title: 'Cash on Hand', body: '# Cash on Hand\n\n$1.2M as of today.' });
    expect(n.slug).toBe('cash-on-hand');
    expect(n.title).toBe('Cash on Hand');
    expect(await readNote('cash-on-hand')).toMatchObject({ slug: 'cash-on-hand' });
  });

  it('updates note body', async () => {
    await createNote({ title: 'Note', body: 'v1' });
    const updated = await updateNote('note', 'v2');
    expect(updated.body).toBe('v2');
  });

  it('deletes a note', async () => {
    await createNote({ title: 'Doomed', body: '...' });
    await deleteNote('doomed');
    expect(await listNotes()).toEqual([]);
  });

  it('rejects duplicate titles', async () => {
    await createNote({ title: 'X', body: '' });
    await expect(createNote({ title: 'X', body: '' })).rejects.toThrow(/already exists/);
  });

  it('assembles context with all notes', async () => {
    await createNote({ title: 'Alpha', body: 'a body' });
    await createNote({ title: 'Beta', body: 'b body' });
    const ctx = await assembleMemoryContext();
    expect(ctx).toContain('# Shared council memory');
    expect(ctx).toContain('Alpha');
    expect(ctx).toContain('a body');
    expect(ctx).toContain('Beta');
  });

  it('createSharedNoteAutoSuffix writes a new note when slug is free', async () => {
    const { createSharedNoteAutoSuffix } = await import('./memory');
    const n = await createSharedNoteAutoSuffix({ title: 'House Rules', body: 'be kind' });
    expect(n.slug).toBe('house-rules');
    expect((await readNote('house-rules')).body).toContain('be kind');
  });

  it('createSharedNoteAutoSuffix suffixes on slug collision', async () => {
    const { createSharedNoteAutoSuffix } = await import('./memory');
    await createSharedNoteAutoSuffix({ title: 'Dup', body: 'first' });
    const second = await createSharedNoteAutoSuffix({ title: 'Dup', body: 'second' });
    expect(second.slug).toBe('dup-2');
    const third = await createSharedNoteAutoSuffix({ title: 'Dup', body: 'third' });
    expect(third.slug).toBe('dup-3');
  });

  it('createSharedNoteAutoSuffix prepends "# title" when body has no leading header', async () => {
    const { createSharedNoteAutoSuffix } = await import('./memory');
    const n = await createSharedNoteAutoSuffix({ title: 'Naked', body: 'plain body' });
    expect(n.body.startsWith('# Naked')).toBe(true);
    expect(n.body).toContain('plain body');
  });

  it('createNote (strict) still throws on collision — unchanged', async () => {
    await createNote({ title: 'Strict', body: 'first' });
    await expect(createNote({ title: 'Strict', body: 'second' })).rejects.toThrow(/already exists/);
  });
});
