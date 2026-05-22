import { mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import type { Council } from '$lib/types';
import { councilDir, councilsRoot, slugify } from './paths';
import { listCouncillors } from './councillors';

const COUNCIL_FILE = 'council.json';

export interface NewCouncilInput {
  name: string;
  description?: string;
  template?: string | null;
  working_dir?: string | null;
}

export interface UpdateCouncilInput {
  name?: string;
  description?: string;
  template?: string | null;
  working_dir?: string | null;
}

async function validateWorkingDir(dir: string): Promise<void> {
  if (!isAbsolute(dir)) {
    throw new Error(`Working dir must be an absolute path, got "${dir}".`);
  }
  if (!existsSync(dir)) {
    throw new Error(`Working dir "${dir}" does not exist.`);
  }
  const st = await stat(dir);
  if (!st.isDirectory()) {
    throw new Error(`Working dir "${dir}" is not a directory.`);
  }
}

export function workingDirFor(council: Council): string {
  return council.working_dir && council.working_dir.trim()
    ? council.working_dir
    : councilDir(council.slug);
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
  const parsed = JSON.parse(raw) as Partial<Council>;
  return {
    slug,
    name: parsed.name ?? '',
    description: parsed.description ?? '',
    template: parsed.template ?? null,
    working_dir: parsed.working_dir ?? null,
    created_at: parsed.created_at ?? new Date(0).toISOString()
  };
}

export async function createCouncil(input: NewCouncilInput): Promise<Council> {
  const slug = slugify(input.name);
  const dir = councilDir(slug);
  if (existsSync(dir)) throw new Error(`A council named "${input.name}" already exists.`);

  const working_dir = input.working_dir?.trim() || null;
  if (working_dir) await validateWorkingDir(working_dir);

  const council: Council = {
    slug,
    name: input.name.trim(),
    description: (input.description ?? '').trim(),
    template: input.template ?? null,
    working_dir,
    created_at: new Date().toISOString()
  };

  await mkdir(join(dir, 'councillors'), { recursive: true });
  await writeFile(join(dir, COUNCIL_FILE), JSON.stringify(council, null, 2) + '\n', 'utf8');
  return council;
}

export async function updateCouncil(slug: string, input: UpdateCouncilInput): Promise<Council> {
  const current = await readCouncil(slug);

  let working_dir = current.working_dir;
  if (input.working_dir !== undefined) {
    const trimmed = input.working_dir?.trim() ?? '';
    if (trimmed) {
      await validateWorkingDir(trimmed);
      working_dir = trimmed;
    } else {
      working_dir = null;
    }
  }

  const next: Council = {
    ...current,
    name: input.name?.trim() ?? current.name,
    description: input.description?.trim() ?? current.description,
    template: input.template === undefined ? current.template : input.template,
    working_dir
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
