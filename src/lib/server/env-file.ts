import { readFileSync, existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { env } from 'node:process';
import { councilEnvFile, councilRoot } from './paths';

export interface EnvPair {
  key: string;
  value: string;
}

const KEY_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** Strip one layer of matching surrounding quotes from a value. */
function unquote(value: string): string {
  if (value.length >= 2) {
    const first = value[0];
    const last = value[value.length - 1];
    if (first === '"' && last === '"') {
      return value.slice(1, -1).replace(/\\"/g, '"');
    }
    if (first === "'" && last === "'") {
      return value.slice(1, -1);
    }
  }
  return value;
}

/**
 * Read `<councilRoot>/.env` into ordered key/value pairs. Missing file → [].
 * Tolerant parse: skips blanks and `#` comments, splits on the first `=`,
 * trims the key, strips one layer of surrounding quotes, drops invalid keys.
 */
export function readCouncilEnv(): EnvPair[] {
  const file = councilEnvFile();
  if (!existsSync(file)) return [];
  const raw = readFileSync(file, 'utf8');
  const pairs: EnvPair[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trimStart();
    if (trimmed === '' || trimmed.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    if (!key) continue;
    const value = unquote(line.slice(eq + 1).trim());
    pairs.push({ key, value });
  }
  return pairs;
}

/** Serialize one pair's value, quoting when it contains whitespace, `#`, or a quote. */
function serializeValue(value: string): string {
  if (/[\s#"']/.test(value)) {
    return `"${value.replace(/"/g, '\\"')}"`;
  }
  return value;
}

/**
 * Write key/value pairs to `<councilRoot>/.env`, then ensure `.gitignore`
 * excludes `.env`. Drops fully-empty rows; rejects invalid keys and values
 * containing a newline with named errors.
 */
export async function writeCouncilEnv(pairs: EnvPair[]): Promise<void> {
  const kept = pairs.filter((p) => p.key.trim() !== '' || p.value !== '');
  for (const p of kept) {
    const key = p.key.trim();
    if (!KEY_RE.test(key)) {
      throw new Error(`Invalid env key: "${p.key}". Keys must match [A-Za-z_][A-Za-z0-9_]*.`);
    }
    if (/[\r\n]/.test(p.value)) {
      throw new Error(`Env value for "${key}" must not contain a newline.`);
    }
  }
  const body = kept.map((p) => `${p.key.trim()}=${serializeValue(p.value)}`).join('\n');
  await writeFile(councilEnvFile(), body ? body + '\n' : '', 'utf8');
  await ensureCouncilGitignore();
}

/** Ensure `<councilRoot>/.gitignore` contains a line exactly `.env`. */
export async function ensureCouncilGitignore(): Promise<void> {
  const file = join(councilRoot(), '.gitignore');
  let current = '';
  if (existsSync(file)) current = await readFile(file, 'utf8');
  const hasEnv = current.split(/\r?\n/).some((l) => l.trim() === '.env');
  if (hasEnv) return;
  let next: string;
  if (current === '') next = '.env\n';
  else if (current.endsWith('\n')) next = current + '.env\n';
  else next = current + '\n.env\n';
  await writeFile(file, next, 'utf8');
}

/**
 * Load the council `.env` into `process.env`. The council file is
 * authoritative — it overwrites inherited values for the same key. No-op when
 * missing; never throws (logs and continues).
 */
export function loadCouncilEnvIntoProcess(): void {
  try {
    for (const { key, value } of readCouncilEnv()) {
      env[key] = value;
    }
  } catch (err) {
    console.warn('[landsraad] failed to load council .env:', (err as Error).message);
  }
}
