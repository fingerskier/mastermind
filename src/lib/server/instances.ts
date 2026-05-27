import { readFile, writeFile, mkdir, rename, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

export interface Instance {
  pid: number;
  port: number | null;
  cwd: string;
  startedAt: string;
}

export function instancesFile(): string {
  if (process.env.LANDSRAAD_INSTANCES_FILE) return process.env.LANDSRAAD_INSTANCES_FILE;
  return join(homedir(), '.landsraad', 'instances.json');
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    return code === 'EPERM';
  }
}

async function readRaw(): Promise<Instance[]> {
  const file = instancesFile();
  if (!existsSync(file)) return [];
  try {
    const text = await readFile(file, 'utf8');
    if (!text.trim()) return [];
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? (parsed as Instance[]) : [];
  } catch {
    return [];
  }
}

async function writeRaw(entries: Instance[]): Promise<void> {
  const file = instancesFile();
  await mkdir(dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(entries, null, 2) + '\n', 'utf8');
  await rename(tmp, file);
}

export async function readInstances(): Promise<Instance[]> {
  const entries = await readRaw();
  const live = entries.filter((e) => e && typeof e.pid === 'number' && isAlive(e.pid));
  if (live.length !== entries.length) {
    try {
      if (live.length === 0) {
        try {
          await unlink(instancesFile());
        } catch {
          // ignore
        }
      } else {
        await writeRaw(live);
      }
    } catch {
      // best-effort prune
    }
  }
  return live;
}
