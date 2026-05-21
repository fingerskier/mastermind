import { homedir } from 'node:os';
import { join } from 'node:path';
import { env } from 'node:process';

export function councilsRoot(): string {
  if (env.LANDSRAAD_COUNCILS_ROOT) return env.LANDSRAAD_COUNCILS_ROOT;
  return join(homedir(), '.landsraad', 'councils');
}

export function councilDir(slug: string): string {
  return join(councilsRoot(), slug);
}

export function councillorDir(councilSlug: string, councillorSlug: string): string {
  return join(councilDir(councilSlug), 'councillors', councillorSlug);
}

export function slugify(input: string): string {
  const slug = input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
  if (!slug) throw new Error('Name must contain at least one alphanumeric character.');
  return slug;
}
