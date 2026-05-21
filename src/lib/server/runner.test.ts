import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { env } from 'node:process';

import { createCouncil } from './councils';
import { createCouncillor } from './councillors';
import { createNote } from './memory';
import { createJob, readJob, readOutput, readTranscript, readInput } from './jobs';
import { cancelJob, currentRuns, runJobNow } from './runner';
import { createMockAdapter } from './adapters';

let tmpRoot: string;
let prevEnv: string | undefined;

beforeEach(async () => {
  prevEnv = env.LANDSRAAD_COUNCILS_ROOT;
  tmpRoot = mkdtempSync(join(tmpdir(), 'landsraad-runner-'));
  env.LANDSRAAD_COUNCILS_ROOT = tmpRoot;
  await createCouncil({ name: 'Run Test' });
  await createCouncillor('run-test', {
    name: 'Mocky',
    role: 'tester',
    adapter: 'mock:local',
    persona: 'You are Mocky.'
  });
});

afterEach(() => {
  rmSync(tmpRoot, { recursive: true, force: true });
  if (prevEnv === undefined) delete env.LANDSRAAD_COUNCILS_ROOT;
  else env.LANDSRAAD_COUNCILS_ROOT = prevEnv;
});

describe('runner', () => {
  it('runs a queued job to success with mock adapter', async () => {
    const j = await createJob('run-test', {
      title: 'Hello',
      brief: 'Say hi.',
      councillor_slug: 'mocky'
    });
    const final = await runJobNow('run-test', j.id);
    expect(final.status).toBe('succeeded');
    expect(final.exit_code).toBe(0);
    expect(final.started_at).not.toBeNull();
    expect(final.finished_at).not.toBeNull();
    const transcript = await readTranscript('run-test', j.id);
    expect(transcript).toContain('mock:local');
    const output = await readOutput('run-test', j.id);
    expect(output.length).toBeGreaterThan(0);
  });

  it('includes persona and memory in the assembled prompt', async () => {
    await createNote('run-test', { title: 'House Rules', body: 'Always reply in haiku.' });
    const j = await createJob('run-test', {
      title: 'Greet',
      brief: 'Say something nice.',
      councillor_slug: 'mocky'
    });
    await runJobNow('run-test', j.id);
    const input = await readInput('run-test', j.id);
    expect(input).toContain('# Persona');
    expect(input).toContain('You are Mocky.');
    expect(input).toContain('Shared council memory');
    expect(input).toContain('Always reply in haiku.');
    expect(input).toContain('# Task: Greet');
  });

  it('marks job failed when adapter reports nonzero exit', async () => {
    const j = await createJob('run-test', {
      title: 'Boom',
      brief: 'fail',
      councillor_slug: 'mocky'
    });
    const failing = createMockAdapter({ failWith: 'kaboom' });
    const adapterOverride = { id: failing.id, kind: 'mock' as const, run: failing.run };
    const final = await runJobNow('run-test', j.id, { adapterOverride });
    expect(final.status).toBe('failed');
    expect(final.exit_code).toBe(1);
    expect(final.error).toContain('kaboom');
  });

  it('refuses to run a non-queued job', async () => {
    const j = await createJob('run-test', { title: 'Once', brief: 'b', councillor_slug: 'mocky' });
    await runJobNow('run-test', j.id);
    await expect(runJobNow('run-test', j.id)).rejects.toThrow(/not queued/);
  });

  it('fails the job and throws when councillor has unknown adapter', async () => {
    await createCouncillor('run-test', { name: 'Ghost', role: 'x', adapter: 'no:such' });
    const j = await createJob('run-test', { title: 'X', brief: 'x', councillor_slug: 'ghost' });
    await expect(runJobNow('run-test', j.id)).rejects.toThrow(/Unknown adapter/);
    const final = await readJob('run-test', j.id);
    expect(final.status).toBe('failed');
  });

  it('cancels a running job via AbortController', async () => {
    const slow = createMockAdapter({ delayMs: 200 });
    const j = await createJob('run-test', { title: 'Slow', brief: 's', councillor_slug: 'mocky' });
    const adapterOverride = { id: slow.id, kind: 'mock' as const, run: slow.run };
    const p = runJobNow('run-test', j.id, { adapterOverride });
    // Give it a tick to register, then cancel
    await new Promise((r) => setTimeout(r, 20));
    await cancelJob('run-test', j.id);
    const final = await p;
    expect(['cancelled', 'failed']).toContain(final.status);
  });

  it('reports currentRuns while a job is in flight', async () => {
    const slow = createMockAdapter({ delayMs: 100 });
    const j = await createJob('run-test', { title: 'Hold', brief: 'h', councillor_slug: 'mocky' });
    const adapterOverride = { id: slow.id, kind: 'mock' as const, run: slow.run };
    const p = runJobNow('run-test', j.id, { adapterOverride });
    await new Promise((r) => setTimeout(r, 20));
    const runs = currentRuns();
    expect(runs.some((r) => r.jobId === j.id)).toBe(true);
    await p;
    expect(currentRuns().some((r) => r.jobId === j.id)).toBe(false);
  });
});
