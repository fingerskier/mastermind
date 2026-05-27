import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readInstances, writeInstance, removeInstance } from './registry.js';

let dir;
let file;
let prevEnv;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'landsraad-reg-'));
  file = join(dir, 'instances.json');
  prevEnv = process.env.LANDSRAAD_INSTANCES_FILE;
  process.env.LANDSRAAD_INSTANCES_FILE = file;
});

afterEach(() => {
  if (prevEnv === undefined) delete process.env.LANDSRAAD_INSTANCES_FILE;
  else process.env.LANDSRAAD_INSTANCES_FILE = prevEnv;
  rmSync(dir, { recursive: true, force: true });
});

describe('registry', () => {
  it('returns [] when file does not exist', async () => {
    expect(await readInstances()).toEqual([]);
  });

  it('writes and reads an entry', async () => {
    await writeInstance({ pid: process.pid, port: 10191, cwd: '/tmp/a', startedAt: '2026-05-27T00:00:00Z' });
    const list = await readInstances();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ pid: process.pid, port: 10191, cwd: '/tmp/a' });
  });

  it('upserts on duplicate pid (replaces entry)', async () => {
    await writeInstance({ pid: process.pid, port: 10191, cwd: '/tmp/a', startedAt: '2026-05-27T00:00:00Z' });
    await writeInstance({ pid: process.pid, port: 10192, cwd: '/tmp/b', startedAt: '2026-05-27T00:00:01Z' });
    const list = await readInstances();
    expect(list).toHaveLength(1);
    expect(list[0].port).toBe(10192);
    expect(list[0].cwd).toBe('/tmp/b');
  });

  it('removes an entry by pid', async () => {
    await writeInstance({ pid: process.pid, port: 10191, cwd: '/tmp/a', startedAt: '2026-05-27T00:00:00Z' });
    await removeInstance(process.pid);
    expect(await readInstances()).toEqual([]);
  });

  it('prunes entries whose pid is no longer alive', async () => {
    // Pick an unlikely-to-exist pid by scanning high range.
    let deadPid = 999999;
    for (; deadPid > 100000; deadPid--) {
      try {
        process.kill(deadPid, 0);
      } catch {
        break;
      }
    }
    await writeInstance({ pid: process.pid, port: 10191, cwd: '/tmp/a', startedAt: '2026-05-27T00:00:00Z' });
    await writeInstance({ pid: deadPid, port: 10192, cwd: '/tmp/b', startedAt: '2026-05-27T00:00:00Z' });
    const list = await readInstances();
    expect(list.map((e) => e.pid)).toEqual([process.pid]);
  });
});
