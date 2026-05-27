import { readFile, writeFile, mkdir, rename, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

export function instancesFile() {
  if (process.env.LANDSRAAD_INSTANCES_FILE) return process.env.LANDSRAAD_INSTANCES_FILE;
  return join(homedir(), '.landsraad', 'instances.json');
}

function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    // EPERM means the process exists but is owned by another user — still alive.
    return err && err.code === 'EPERM';
  }
}

async function readRaw() {
  const file = instancesFile();
  if (!existsSync(file)) return [];
  try {
    const text = await readFile(file, 'utf8');
    if (!text.trim()) return [];
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeRaw(entries) {
  const file = instancesFile();
  await mkdir(dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(entries, null, 2) + '\n', 'utf8');
  await rename(tmp, file);
}

export async function readInstances() {
  const entries = await readRaw();
  const live = entries.filter((e) => e && typeof e.pid === 'number' && isAlive(e.pid));
  if (live.length !== entries.length) {
    try {
      await writeRaw(live);
    } catch {
      // best-effort prune
    }
  }
  return live;
}

export async function writeInstance(entry) {
  const entries = await readRaw();
  const next = entries.filter((e) => e && e.pid !== entry.pid);
  next.push(entry);
  await writeRaw(next);
}

export async function removeInstance(pid) {
  const entries = await readRaw();
  const next = entries.filter((e) => e && e.pid !== pid);
  if (next.length === entries.length) return;
  if (next.length === 0) {
    const file = instancesFile();
    try {
      await unlink(file);
      return;
    } catch {
      // fallthrough to writeRaw
    }
  }
  await writeRaw(next);
}
