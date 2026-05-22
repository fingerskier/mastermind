import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Council } from '$lib/types';
import { councilDir, councilsRoot, slugify } from './paths';
import { listCouncillors } from './councillors';

const COUNCIL_FILE = 'council.json';

export interface NewCouncilInput {
  name: string;
  description?: string;
  template?: string | null;
}

export interface UpdateCouncilInput {
  name?: string;
  description?: string;
  template?: string | null;
}

export async function listCouncils(): Promise<Council[]> {
  const root = councilsRoot();
  if (!existsSync(root)) return [];
  const entries = await readdir(root, { withFileTypes: true });
  const councils: Council[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const council = await readCouncil(entry.name).catch(() => null);
    if (council) councils.push(council);
  }
  councils.sort((a, b) => a.name.localeCompare(b.name));
  return councils;
}

export async function readCouncil(slug: string): Promise<Council> {
  const file = join(councilDir(slug), COUNCIL_FILE);
  const raw = await readFile(file, 'utf8');
  const parsed = JSON.parse(raw) as Council;
  return { ...parsed, slug };
}

export async function createCouncil(input: NewCouncilInput): Promise<Council> {
  const slug = slugify(input.name);
  const dir = councilDir(slug);
  if (existsSync(dir)) throw new Error(`A council named "${input.name}" already exists.`);

  const council: Council = {
    slug,
    name: input.name.trim(),
    description: (input.description ?? '').trim(),
    template: input.template ?? null,
    created_at: new Date().toISOString()
  };

  await mkdir(join(dir, 'councillors'), { recursive: true });
  await writeFile(join(dir, COUNCIL_FILE), JSON.stringify(council, null, 2) + '\n', 'utf8');
  return council;
}

export async function updateCouncil(slug: string, input: UpdateCouncilInput): Promise<Council> {
  const current = await readCouncil(slug);
  const next: Council = {
    ...current,
    name: input.name?.trim() ?? current.name,
    description: input.description?.trim() ?? current.description,
    template: input.template === undefined ? current.template : input.template
  };
  await writeFile(join(councilDir(slug), COUNCIL_FILE), JSON.stringify(next, null, 2) + '\n', 'utf8');
  return next;
}

export async function deleteCouncil(slug: string): Promise<void> {
  const dir = councilDir(slug);
  if (!existsSync(dir)) return;
  await rm(dir, { recursive: true, force: true });
}

export async function readCouncilWithCouncillors(slug: string) {
  const council = await readCouncil(slug);
  const councillors = await listCouncillors(slug);
  return { ...council, councillors };
}
