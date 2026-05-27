import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { env } from 'node:process';
import { readInstances } from './instances';

let dir: string;
let file: string;
let prev: string | undefined;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'landsraad-inst-'));
  file = join(dir, 'instances.json');
  prev = env.LANDSRAAD_INSTANCES_FILE;
  env.LANDSRAAD_INSTANCES_FILE = file;
});

afterEach(() => {
  if (prev === undefined) delete env.LANDSRAAD_INSTANCES_FILE;
  else env.LANDSRAAD_INSTANCES_FILE = prev;
  rmSync(dir, { recursive: true, force: true });
});

describe('readInstances', () => {
  it('returns [] when file is missing', async () => {
    expect(await readInstances()).toEqual([]);
  });

  it('returns [] when file is empty', async () => {
    writeFileSync(file, '', 'utf8');
    expect(await readInstances()).toEqual([]);
  });

  it('returns [] when file is malformed', async () => {
    writeFileSync(file, 'not-json{', 'utf8');
    expect(await readInstances()).toEqual([]);
  });

  it('returns entries for live pids', async () => {
    const entry = { pid: process.pid, port: 10191, cwd: '/tmp/a', startedAt: '2026-05-27T00:00:00Z' };
    writeFileSync(file, JSON.stringify([entry]), 'utf8');
    const list = await readInstances();
    expect(list).toHaveLength(1);
    expect(list[0].pid).toBe(process.pid);
  });

  it('prunes entries whose pid is dead', async () => {
    let deadPid = 999999;
    for (; deadPid > 100000; deadPid--) {
      try {
        process.kill(deadPid, 0);
      } catch {
        break;
      }
    }
    const live = { pid: process.pid, port: 10191, cwd: '/tmp/a', startedAt: '2026-05-27T00:00:00Z' };
    const dead = { pid: deadPid, port: 10192, cwd: '/tmp/b', startedAt: '2026-05-27T00:00:00Z' };
    writeFileSync(file, JSON.stringify([live, dead]), 'utf8');
    const list = await readInstances();
    expect(list.map((e) => e.pid)).toEqual([process.pid]);
  });
});
