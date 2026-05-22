import { mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { councillorMemoryDir, slugify } from './paths';
import { indexDelete, indexUpsert } from './indexer';

const NOTE_EXT = '.md';

export interface PrivateNote {
  slug: string;
  councillor_slug: string;
  title: string;
  body: string;
  updated_at: string;
}

export interface UpsertPrivateNoteInput {
  title: string;
  body: string;
}

function noteFile(councillorSlug: string, slug: string): string {
  return join(councillorMemoryDir(councillorSlug), `${slug}${NOTE_EXT}`);
}

function titleFromBody(body: string, fallback: string): string {
  const firstLine = body.split('\n').find((l) => l.trim()) ?? '';
  const heading = firstLine.replace(/^#+\s*/, '').trim();
  return heading || fallback;
}

export async function listPrivateNotes(councillorSlug: string): Promise<PrivateNote[]> {
  const dir = councillorMemoryDir(councillorSlug);
  if (!existsSync(dir)) return [];
  const entries = await readdir(dir, { withFileTypes: true });
  const notes: PrivateNote[] = [];
  for (const e of entries) {
    if (!e.isFile() || !e.name.endsWith(NOTE_EXT)) continue;
    const slug = e.name.slice(0, -NOTE_EXT.length);
    const n = await readPrivateNote(councillorSlug, slug).catch(() => null);
    if (n) notes.push(n);
  }
  notes.sort((a, b) => a.slug.localeCompare(b.slug));
  return notes;
}

export async function readPrivateNote(councillorSlug: string, slug: string): Promise<PrivateNote> {
  const file = noteFile(councillorSlug, slug);
  const body = await readFile(file, 'utf8');
  const st = await stat(file);
  return {
    slug,
    councillor_slug: councillorSlug,
    title: titleFromBody(body, slug),
    body,
    updated_at: st.mtime.toISOString()
  };
}

function resolveAvailableSlug(councillorSlug: string, baseSlug: string): string {
  let candidate = baseSlug;
  let n = 2;
  while (existsSync(noteFile(councillorSlug, candidate))) {
    candidate = `${baseSlug}-${n}`;
    n++;
  }
  return candidate;
}

export async function createPrivateNote(
  councillorSlug: string,
  input: UpsertPrivateNoteInput
): Promise<PrivateNote> {
  const title = input.title.trim();
  if (!title) throw new Error('Private note title is required.');
  await mkdir(councillorMemoryDir(councillorSlug), { recursive: true });
  const baseSlug = slugify(title);
  const slug = resolveAvailableSlug(councillorSlug, baseSlug);
  const file = noteFile(councillorSlug, slug);
  const body = input.body.trimStart().startsWith('#')
    ? input.body
    : `# ${title}\n\n${input.body}`;
  await writeFile(file, body, 'utf8');
  const note = await readPrivateNote(councillorSlug, slug);
  await indexUpsert({
    kind: 'memory_private',
    ref_id: `${councillorSlug}/${slug}`,
    text: note.body,
    source_path: file,
    source_mtime: note.updated_at,
    title: note.title,
    councillor_slug: councillorSlug
  });
  return note;
}

export async function updatePrivateNote(
  councillorSlug: string,
  slug: string,
  body: string
): Promise<PrivateNote> {
  const file = noteFile(councillorSlug, slug);
  if (!existsSync(file)) throw new Error(`Private note "${slug}" does not exist.`);
  await writeFile(file, body, 'utf8');
  const note = await readPrivateNote(councillorSlug, slug);
  await indexUpsert({
    kind: 'memory_private',
    ref_id: `${councillorSlug}/${slug}`,
    text: note.body,
    source_path: file,
    source_mtime: note.updated_at,
    title: note.title,
    councillor_slug: councillorSlug
  });
  return note;
}

export async function deletePrivateNote(councillorSlug: string, slug: string): Promise<void> {
  const file = noteFile(councillorSlug, slug);
  if (!existsSync(file)) return;
  await rm(file, { force: true });
  indexDelete('memory_private', `${councillorSlug}/${slug}`);
}
