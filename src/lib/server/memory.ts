import { mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { MemoryNote } from '$lib/types';
import { memoryDir, slugify } from './paths';
import { hasCouncil } from './councils';
import { indexDelete, indexUpsert } from './indexer';

const NOTE_EXT = '.md';

export interface UpsertNoteInput {
  title: string;
  body: string;
}

function noteFile(slug: string): string {
  return join(memoryDir(), `${slug}${NOTE_EXT}`);
}

function titleFromBody(body: string, fallback: string): string {
  const firstLine = body.split('\n').find((l) => l.trim()) ?? '';
  const heading = firstLine.replace(/^#+\s*/, '').trim();
  return heading || fallback;
}

export async function listNotes(): Promise<MemoryNote[]> {
  const dir = memoryDir();
  if (!existsSync(dir)) return [];
  const entries = await readdir(dir, { withFileTypes: true });
  const notes: MemoryNote[] = [];
  for (const e of entries) {
    if (!e.isFile() || !e.name.endsWith(NOTE_EXT)) continue;
    const slug = e.name.slice(0, -NOTE_EXT.length);
    const n = await readNote(slug).catch(() => null);
    if (n) notes.push(n);
  }
  notes.sort((a, b) => a.slug.localeCompare(b.slug));
  return notes;
}

export async function readNote(slug: string): Promise<MemoryNote> {
  const file = noteFile(slug);
  const body = await readFile(file, 'utf8');
  const st = await stat(file);
  return {
    slug,
    title: titleFromBody(body, slug),
    body,
    updated_at: st.mtime.toISOString()
  };
}

function resolveAvailableSlug(baseSlug: string): string {
  let candidate = baseSlug;
  let n = 2;
  while (existsSync(noteFile(candidate))) {
    candidate = `${baseSlug}-${n}`;
    n++;
  }
  return candidate;
}

export async function createSharedNoteAutoSuffix(input: UpsertNoteInput): Promise<MemoryNote> {
  if (!hasCouncil()) throw new Error('No council exists in the current directory.');
  const title = input.title.trim();
  if (!title) throw new Error('Note title is required.');
  await mkdir(memoryDir(), { recursive: true });
  const baseSlug = slugify(title);
  const slug = resolveAvailableSlug(baseSlug);
  const file = noteFile(slug);
  const body = input.body.trimStart().startsWith('#')
    ? input.body
    : `# ${title}\n\n${input.body}`;
  await writeFile(file, body, 'utf8');
  const note = await readNote(slug);
  await indexUpsert({
    kind: 'memory',
    ref_id: slug,
    text: note.body,
    source_path: file,
    source_mtime: note.updated_at,
    title: note.title
  });
  return note;
}

export async function createNote(input: UpsertNoteInput): Promise<MemoryNote> {
  if (!hasCouncil()) throw new Error('No council exists in the current directory.');
  const title = input.title.trim();
  if (!title) throw new Error('Note title is required.');
  const slug = slugify(title);
  const file = noteFile(slug);
  if (existsSync(file)) throw new Error(`A memory note named "${title}" already exists.`);
  await mkdir(memoryDir(), { recursive: true });
  const body = input.body.trimStart().startsWith('#')
    ? input.body
    : `# ${title}\n\n${input.body}`;
  await writeFile(file, body, 'utf8');
  const note = await readNote(slug);
  await indexUpsert({
    kind: 'memory',
    ref_id: slug,
    text: note.body,
    source_path: file,
    source_mtime: note.updated_at,
    title: note.title
  });
  return note;
}

export async function updateNote(slug: string, body: string): Promise<MemoryNote> {
  const file = noteFile(slug);
  if (!existsSync(file)) throw new Error(`Memory note "${slug}" does not exist.`);
  await writeFile(file, body, 'utf8');
  const note = await readNote(slug);
  await indexUpsert({
    kind: 'memory',
    ref_id: slug,
    text: note.body,
    source_path: file,
    source_mtime: note.updated_at,
    title: note.title
  });
  return note;
}

export async function deleteNote(slug: string): Promise<void> {
  const file = noteFile(slug);
  if (!existsSync(file)) return;
  await rm(file, { force: true });
  indexDelete('memory', slug);
}

export async function assembleMemoryContext(): Promise<string> {
  const notes = await listNotes();
  if (notes.length === 0) return '';
  const sections = notes.map((n) => `### ${n.title} (${n.slug})\n\n${n.body.trim()}`);
  return ['# Shared council memory', ...sections].join('\n\n');
}
