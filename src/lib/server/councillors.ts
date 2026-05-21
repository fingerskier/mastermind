import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Councillor } from '$lib/types';
import { councilDir, councillorDir, slugify } from './paths';

const COUNCILLOR_FILE = 'councillor.json';
const PERSONA_FILE = 'persona.md';

export interface NewCouncillorInput {
  name: string;
  role: string;
  adapter?: string;
  persona?: string;
}

export interface UpdateCouncillorInput {
  name?: string;
  role?: string;
  adapter?: string;
  persona?: string;
}

interface CouncillorMeta {
  slug: string;
  name: string;
  role: string;
  adapter: string;
  created_at: string;
}

export async function listCouncillors(councilSlug: string): Promise<Councillor[]> {
  const dir = join(councilDir(councilSlug), 'councillors');
  if (!existsSync(dir)) return [];
  const entries = await readdir(dir, { withFileTypes: true });
  const councillors: Councillor[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const c = await readCouncillor(councilSlug, entry.name).catch(() => null);
    if (c) councillors.push(c);
  }
  councillors.sort((a, b) => a.name.localeCompare(b.name));
  return councillors;
}

export async function readCouncillor(councilSlug: string, slug: string): Promise<Councillor> {
  const dir = councillorDir(councilSlug, slug);
  const metaRaw = await readFile(join(dir, COUNCILLOR_FILE), 'utf8');
  const meta = JSON.parse(metaRaw) as CouncillorMeta;
  const persona = await readFile(join(dir, PERSONA_FILE), 'utf8').catch(() => '');
  return { ...meta, slug, persona };
}

export async function createCouncillor(councilSlug: string, input: NewCouncillorInput): Promise<Councillor> {
  const slug = slugify(input.name);
  const dir = councillorDir(councilSlug, slug);
  if (existsSync(dir)) throw new Error(`A councillor named "${input.name}" already exists.`);
  if (!existsSync(councilDir(councilSlug))) throw new Error(`Council "${councilSlug}" does not exist.`);

  const meta: CouncillorMeta = {
    slug,
    name: input.name.trim(),
    role: input.role.trim(),
    adapter: (input.adapter ?? '').trim(),
    created_at: new Date().toISOString()
  };
  const persona = input.persona ?? '';

  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, COUNCILLOR_FILE), JSON.stringify(meta, null, 2) + '\n', 'utf8');
  await writeFile(join(dir, PERSONA_FILE), persona, 'utf8');
  return { ...meta, persona };
}

export async function updateCouncillor(
  councilSlug: string,
  slug: string,
  input: UpdateCouncillorInput
): Promise<Councillor> {
  const current = await readCouncillor(councilSlug, slug);
  const meta: CouncillorMeta = {
    slug: current.slug,
    name: input.name?.trim() ?? current.name,
    role: input.role?.trim() ?? current.role,
    adapter: input.adapter?.trim() ?? current.adapter,
    created_at: current.created_at
  };
  const persona = input.persona ?? current.persona;
  const dir = councillorDir(councilSlug, slug);
  await writeFile(join(dir, COUNCILLOR_FILE), JSON.stringify(meta, null, 2) + '\n', 'utf8');
  await writeFile(join(dir, PERSONA_FILE), persona, 'utf8');
  return { ...meta, persona };
}

export async function deleteCouncillor(councilSlug: string, slug: string): Promise<void> {
  const dir = councillorDir(councilSlug, slug);
  if (!existsSync(dir)) return;
  await rm(dir, { recursive: true, force: true });
}
