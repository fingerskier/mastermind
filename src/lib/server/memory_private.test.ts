import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { env } from 'node:process';

import { createCouncil } from './councils';
import { createCouncillor } from './councillors';
import {
  createPrivateNote,
  deletePrivateNote,
  listPrivateNotes,
  readPrivateNote,
  updatePrivateNote
} from './memory_private';

let tmpRoot: string;
let prevEnv: string | undefined;

beforeEach(async () => {
  prevEnv = env.LANDSRAAD_COUNCIL_ROOT;
  tmpRoot = mkdtempSync(join(tmpdir(), 'landsraad-mempriv-'));
  env.LANDSRAAD_COUNCIL_ROOT = tmpRoot;
  await createCouncil({ name: 'Mem Test' });
  await createCouncillor({ name: 'Alice', role: 'cto' });
});

afterEach(() => {
  rmSync(tmpRoot, { recursive: true, force: true });
  if (prevEnv === undefined) delete env.LANDSRAAD_COUNCIL_ROOT;
  else env.LANDSRAAD_COUNCIL_ROOT = prevEnv;
});

describe('memory_private', () => {
  it('starts empty', async () => {
    expect(await listPrivateNotes('alice')).toEqual([]);
  });

  it('creates and reads a private note', async () => {
    const n = await createPrivateNote('alice', { title: 'Lesson One', body: 'Body here.' });
    expect(n.slug).toBe('lesson-one');
    expect(n.councillor_slug).toBe('alice');
    expect(await readPrivateNote('alice', 'lesson-one')).toMatchObject({ slug: 'lesson-one' });
  });

  it('appends -2, -3 on slug collisions', async () => {
    const a = await createPrivateNote('alice', { title: 'Same Title', body: 'first' });
    const b = await createPrivateNote('alice', { title: 'Same Title', body: 'second' });
    const c = await createPrivateNote('alice', { title: 'Same Title', body: 'third' });
    expect(a.slug).toBe('same-title');
    expect(b.slug).toBe('same-title-2');
    expect(c.slug).toBe('same-title-3');
  });

  it('updates a note body', async () => {
    await createPrivateNote('alice', { title: 'N', body: 'v1' });
    const updated = await updatePrivateNote('alice', 'n', 'v2');
    expect(updated.body).toBe('v2');
  });

  it('deletes a note', async () => {
    await createPrivateNote('alice', { title: 'Doomed', body: '...' });
    await deletePrivateNote('alice', 'doomed');
    expect(await listPrivateNotes('alice')).toEqual([]);
  });

  it('isolates notes per councillor', async () => {
    await createCouncillor({ name: 'Bob', role: 'cfo' });
    await createPrivateNote('alice', { title: 'A Only', body: 'a' });
    expect(await listPrivateNotes('alice')).toHaveLength(1);
    expect(await listPrivateNotes('bob')).toEqual([]);
  });
});
