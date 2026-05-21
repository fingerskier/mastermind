import { mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { MemoryNote } from '$lib/types';
import { councilDir, memoryDir, slugify } from './paths';

const NOTE_EXT = '.md';

export interface UpsertNoteInput {
  title: string;
  body: string;
}

function noteFile(councilSlug: string, slug: string): string {
  return join(memoryDir(councilSlug), `${slug}${NOTE_EXT}`);
}

function titleFromBody(body: string, fallback: string): string {
  const firstLine = body.split('\n').find((l) => l.trim()) ?? '';
  const heading = firstLine.replace(/^#+\s*/, '').trim();
  return heading || fallback;
}

export async function listNotes(councilSlug: string): Promise<MemoryNote[]> {
  const dir = memoryDir(councilSlug);
  if (!existsSync(dir)) return [];
  const entries = await readdir(dir, { withFileTypes: true });
  const notes: MemoryNote[] = [];
  for (const e of entries) {
    if (!e.isFile() || !e.name.endsWith(NOTE_EXT)) continue;
    const slug = e.name.slice(0, -NOTE_EXT.length);
    const n = await readNote(councilSlug, slug).catch(() => null);
    if (n) notes.push(n);
  }
  notes.sort((a, b) => a.slug.localeCompare(b.slug));
  return notes;
}

export async function readNote(councilSlug: string, slug: string): Promise<MemoryNote> {
  const file = noteFile(councilSlug, slug);
  const body = await readFile(file, 'utf8');
  const st = await stat(file);
  return {
    slug,
    title: titleFromBody(body, slug),
    body,
    updated_at: st.mtime.toISOString()
  };
}

export async function createNote(councilSlug: string, input: UpsertNoteInput): Promise<MemoryNote> {
  if (!existsSync(councilDir(councilSlug))) throw new Error(`Council "${councilSlug}" does not exist.`);
  const title = input.title.trim();
  if (!title) throw new Error('Note title is required.');
  const slug = slugify(title);
  const file = noteFile(councilSlug, slug);
  if (existsSync(file)) throw new Error(`A memory note named "${title}" already exists.`);
  await mkdir(memoryDir(councilSlug), { recursive: true });
  const body = input.body.trimStart().startsWith('#')
    ? input.body
    : `# ${title}\n\n${input.body}`;
  await writeFile(file, body, 'utf8');
  return readNote(councilSlug, slug);
}

export async function updateNote(
  councilSlug: string,
  slug: string,
  body: string
): Promise<MemoryNote> {
  const file = noteFile(councilSlug, slug);
  if (!existsSync(file)) throw new Error(`Memory note "${slug}" does not exist.`);
  await writeFile(file, body, 'utf8');
  return readNote(councilSlug, slug);
}

export async function deleteNote(councilSlug: string, slug: string): Promise<void> {
  const file = noteFile(councilSlug, slug);
  if (!existsSync(file)) return;
  await rm(file, { force: true });
}

export async function assembleMemoryContext(councilSlug: string): Promise<string> {
  const notes = await listNotes(councilSlug);
  if (notes.length === 0) return '';
  const sections = notes.map((n) => `### ${n.title} (${n.slug})\n\n${n.body.trim()}`);
  return ['# Shared council memory', ...sections].join('\n\n');
}
