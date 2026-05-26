import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import type { Council, CouncilWithCouncillors } from '$lib/types';
import { councilFile, councilRoot, councillorsRoot, slugify } from './paths';
import { listCouncillors } from './councillors';

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

export function hasCouncil(): boolean {
  return existsSync(councilFile());
}

export async function readCouncil(): Promise<Council> {
  const raw = await readFile(councilFile(), 'utf8');
  const parsed = JSON.parse(raw) as Partial<Council>;
  return {
    slug: parsed.slug ?? slugify(parsed.name ?? 'council'),
    name: parsed.name ?? 'Council',
    description: parsed.description ?? '',
    template: parsed.template ?? null,
    created_at: parsed.created_at ?? new Date(0).toISOString()
  };
}

export async function createCouncil(input: NewCouncilInput): Promise<Council> {
  if (existsSync(councilFile())) {
    throw new Error(`A council already exists in ${councilRoot()}.`);
  }
  const name = input.name.trim();
  if (!name) throw new Error('Council name is required.');

  const council: Council = {
    slug: slugify(name),
    name,
    description: (input.description ?? '').trim(),
    template: input.template ?? null,
    created_at: new Date().toISOString()
  };

  await mkdir(councillorsRoot(), { recursive: true });
  await writeFile(councilFile(), JSON.stringify(council, null, 2) + '\n', 'utf8');
  return council;
}

export async function updateCouncil(input: UpdateCouncilInput): Promise<Council> {
  const current = await readCouncil();
  const nextName = input.name?.trim() ?? current.name;
  const next: Council = {
    ...current,
    name: nextName,
    slug: slugify(nextName),
    description: input.description?.trim() ?? current.description,
    template: input.template === undefined ? current.template : input.template
  };
  await writeFile(councilFile(), JSON.stringify(next, null, 2) + '\n', 'utf8');
  return next;
}

export async function deleteCouncilData(): Promise<void> {
  const root = councilRoot();
  for (const sub of ['council.json', 'councillors', 'memory', 'jobs', '.index', 'proposals', 'schedules']) {
    await rm(`${root}/${sub}`, { recursive: true, force: true });
  }
}

export async function readCouncilWithCouncillors(): Promise<CouncilWithCouncillors> {
  const council = await readCouncil();
  const councillors = await listCouncillors();
  return { ...council, councillors };
}
