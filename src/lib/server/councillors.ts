import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Councillor } from '$lib/types';
import { councillorDir, councillorsRoot, slugify } from './paths';
import { hasCouncil } from './councils';
import { indexDelete, indexUpsert } from './indexer';

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

export async function listCouncillors(): Promise<Councillor[]> {
  const dir = councillorsRoot();
  if (!existsSync(dir)) return [];
  const entries = await readdir(dir, { withFileTypes: true });
  const councillors: Councillor[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const c = await readCouncillor(entry.name).catch(() => null);
    if (c) councillors.push(c);
  }
  councillors.sort((a, b) => a.name.localeCompare(b.name));
  return councillors;
}

export async function readCouncillor(slug: string): Promise<Councillor> {
  const dir = councillorDir(slug);
  const metaRaw = await readFile(join(dir, COUNCILLOR_FILE), 'utf8');
  const meta = JSON.parse(metaRaw) as CouncillorMeta;
  const persona = await readFile(join(dir, PERSONA_FILE), 'utf8').catch(() => '');
  return { ...meta, slug, persona };
}

export async function createCouncillor(input: NewCouncillorInput): Promise<Councillor> {
  if (!hasCouncil()) throw new Error('No council exists in the current directory.');
  const slug = slugify(input.name);
  const dir = councillorDir(slug);
  if (existsSync(dir)) throw new Error(`A councillor named "${input.name}" already exists.`);

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
  if (persona.trim()) {
    await indexUpsert({
      kind: 'persona',
      ref_id: slug,
      text: persona,
      source_path: join(dir, PERSONA_FILE),
      source_mtime: meta.created_at,
      title: meta.name,
      councillor_slug: slug
    });
  }
  return { ...meta, persona };
}

export async function updateCouncillor(
  slug: string,
  input: UpdateCouncillorInput
): Promise<Councillor> {
  const current = await readCouncillor(slug);
  const meta: CouncillorMeta = {
    slug: current.slug,
    name: input.name?.trim() ?? current.name,
    role: input.role?.trim() ?? current.role,
    adapter: input.adapter?.trim() ?? current.adapter,
    created_at: current.created_at
  };
  const persona = input.persona ?? current.persona;
  const dir = councillorDir(slug);
  await writeFile(join(dir, COUNCILLOR_FILE), JSON.stringify(meta, null, 2) + '\n', 'utf8');
  await writeFile(join(dir, PERSONA_FILE), persona, 'utf8');
  if (persona.trim()) {
    await indexUpsert({
      kind: 'persona',
      ref_id: slug,
      text: persona,
      source_path: join(dir, PERSONA_FILE),
      source_mtime: new Date().toISOString(),
      title: meta.name,
      councillor_slug: slug
    });
  } else {
    indexDelete('persona', slug);
  }
  return { ...meta, persona };
}

export async function deleteCouncillor(slug: string): Promise<void> {
  const dir = councillorDir(slug);
  if (!existsSync(dir)) return;
  await rm(dir, { recursive: true, force: true });
  indexDelete('persona', slug);
}
