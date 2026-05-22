import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { env } from 'node:process';

import { createCouncil } from './councils';
import { createCouncillor } from './councillors';
import { createNote } from './memory';
import { createJob, readEvents, readJob, readOutput, readTranscript, readInput } from './jobs';
import { cancelJob, currentRuns, runJobNow } from './runner';
import { createMockAdapter } from './adapters';
import type { AdapterRunStreams } from './adapters';
import { listPrivateNotes } from './memory_private';

let tmpRoot: string;
let prevEnv: string | undefined;

beforeEach(async () => {
  prevEnv = env.LANDSRAAD_COUNCIL_ROOT;
  tmpRoot = mkdtempSync(join(tmpdir(), 'landsraad-runner-'));
  env.LANDSRAAD_COUNCIL_ROOT = tmpRoot;
  await createCouncil({ name: 'Run Test' });
  await createCouncillor({
    name: 'Mocky',
    role: 'tester',
    adapter: 'mock:local',
    persona: 'You are Mocky.'
  });
});

afterEach(() => {
  rmSync(tmpRoot, { recursive: true, force: true });
  if (prevEnv === undefined) delete env.LANDSRAAD_COUNCIL_ROOT;
  else env.LANDSRAAD_COUNCIL_ROOT = prevEnv;
});

describe('runner', () => {
  it('runs a queued job to success with mock adapter', async () => {
    const j = await createJob({
      title: 'Hello',
      brief: 'Say hi.',
      councillor_slug: 'mocky'
    });
    const final = await runJobNow(j.id);
    expect(final.status).toBe('succeeded');
    expect(final.exit_code).toBe(0);
    expect(final.started_at).not.toBeNull();
    expect(final.finished_at).not.toBeNull();
    const transcript = await readTranscript(j.id);
    expect(transcript).toContain('mock:local');
    const output = await readOutput(j.id);
    expect(output.length).toBeGreaterThan(0);
  });

  it('includes persona and memory in the assembled prompt', async () => {
    await createNote({ title: 'House Rules', body: 'Always reply in haiku.' });
    const j = await createJob({
      title: 'Greet',
      brief: 'Say something nice.',
      councillor_slug: 'mocky'
    });
    await runJobNow(j.id);
    const input = await readInput(j.id);
    expect(input).toContain('# Persona');
    expect(input).toContain('You are Mocky.');
    expect(input).toContain('Shared council memory');
    expect(input).toContain('Always reply in haiku.');
    expect(input).toContain('# Task: Greet');
  });

  it('marks job failed when adapter reports nonzero exit', async () => {
    const j = await createJob({
      title: 'Boom',
      brief: 'fail',
      councillor_slug: 'mocky'
    });
    const failing = createMockAdapter({ failWith: 'kaboom' });
    const adapterOverride = { id: failing.id, kind: 'mock' as const, run: failing.run };
    const final = await runJobNow(j.id, { adapterOverride });
    expect(final.status).toBe('failed');
    expect(final.exit_code).toBe(1);
    expect(final.error).toContain('kaboom');
  });

  it('refuses to run a non-queued job', async () => {
    const j = await createJob({ title: 'Once', brief: 'b', councillor_slug: 'mocky' });
    await runJobNow(j.id);
    await expect(runJobNow(j.id)).rejects.toThrow(/not queued/);
  });

  it('fails the job and throws when councillor has unknown adapter', async () => {
    await createCouncillor({ name: 'Ghost', role: 'x', adapter: 'no:such' });
    const j = await createJob({ title: 'X', brief: 'x', councillor_slug: 'ghost' });
    await expect(runJobNow(j.id)).rejects.toThrow(/Unknown adapter/);
    const final = await readJob(j.id);
    expect(final.status).toBe('failed');
  });

  it('cancels a running job via AbortController', async () => {
    const slow = createMockAdapter({ delayMs: 200 });
    const j = await createJob({ title: 'Slow', brief: 's', councillor_slug: 'mocky' });
    const adapterOverride = { id: slow.id, kind: 'mock' as const, run: slow.run };
    const p = runJobNow(j.id, { adapterOverride });
    await new Promise((r) => setTimeout(r, 20));
    await cancelJob(j.id);
    const final = await p;
    expect(['cancelled', 'failed']).toContain(final.status);
  });

  it('reports currentRuns while a job is in flight', async () => {
    const slow = createMockAdapter({ delayMs: 100 });
    const j = await createJob({ title: 'Hold', brief: 'h', councillor_slug: 'mocky' });
    const adapterOverride = { id: slow.id, kind: 'mock' as const, run: slow.run };
    const p = runJobNow(j.id, { adapterOverride });
    await new Promise((r) => setTimeout(r, 20));
    const runs = currentRuns();
    expect(runs.some((r) => r.jobId === j.id)).toBe(true);
    await p;
    expect(currentRuns().some((r) => r.jobId === j.id)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Reflection tests
// ---------------------------------------------------------------------------

function makeReflectionAdapter(reflectionOutput: string) {
  let call = 0;
  const run = (_args: { prompt: string; cwd: string; signal?: AbortSignal }): AdapterRunStreams => {
    call++;
    const stdout = call === 1 ? 'job output body' : reflectionOutput;
    async function* chunks() {
      yield { stream: 'stdout' as const, text: stdout };
    }
    return {
      chunks: chunks(),
      result: Promise.resolve({ exit_code: 0, stdout, stderr: '' })
    };
  };
  return { id: 'mock:reflect', kind: 'mock' as const, run };
}

function makeFailingAdapter() {
  const run = (_args: { prompt: string; cwd: string; signal?: AbortSignal }): AdapterRunStreams => {
    async function* chunks() {
      yield { stream: 'stderr' as const, text: 'boom' };
    }
    return {
      chunks: chunks(),
      result: Promise.resolve({ exit_code: 1, stdout: '', stderr: 'boom' })
    };
  };
  return { id: 'mock:bad', kind: 'mock' as const, run };
}

describe('runner reflection', () => {
  let tmpRoot: string;
  let prevEnv: string | undefined;

  beforeEach(async () => {
    prevEnv = env.LANDSRAAD_COUNCIL_ROOT;
    tmpRoot = mkdtempSync(join(tmpdir(), 'landsraad-reflect-'));
    env.LANDSRAAD_COUNCIL_ROOT = tmpRoot;
    await createCouncil({ name: 'Reflect Test' });
    await createCouncillor({ name: 'Alice', role: 'cto' });
  });

  afterEach(() => {
    rmSync(tmpRoot, { recursive: true, force: true });
    if (prevEnv === undefined) delete env.LANDSRAAD_COUNCIL_ROOT;
    else env.LANDSRAAD_COUNCIL_ROOT = prevEnv;
  });

  it('writes private memories from reflection output on success', async () => {
    const reflection = '<<MEMORY title="Lesson From Run">>\nAlways check exit code first.\n<</MEMORY>>';
    const adapterOverride = makeReflectionAdapter(reflection);
    const job = await createJob({ title: 'Probe', brief: 'do thing', councillor_slug: 'alice' });
    await runJobNow(job.id, { adapterOverride });
    const finished = await readJob(job.id);
    expect(finished.status).toBe('succeeded');
    expect(finished.memory_slugs).toEqual(['lesson-from-run']);
    const notes = await listPrivateNotes('alice');
    expect(notes.map((n) => n.slug)).toEqual(['lesson-from-run']);
    const events = await readEvents(job.id);
    expect(events.some((e) => e.type === 'reflected')).toBe(true);
  });

  it('skips reflection when councillor.reflect=false', async () => {
    const { updateCouncillor } = await import('./councillors');
    await updateCouncillor('alice', { reflect: false });
    const reflection = '<<MEMORY title="Skip Me">>\nbody\n<</MEMORY>>';
    const adapterOverride = makeReflectionAdapter(reflection);
    const job = await createJob({ title: 'P', brief: 'b', councillor_slug: 'alice' });
    await runJobNow(job.id, { adapterOverride });
    expect(await listPrivateNotes('alice')).toEqual([]);
  });

  it('keeps job succeeded with zero memories when reflection output has no blocks', async () => {
    const adapterOverride = makeReflectionAdapter('no memory blocks here, just plain text');
    const job = await createJob({ title: 'P2', brief: 'b2', councillor_slug: 'alice' });
    await runJobNow(job.id, { adapterOverride });
    const finished = await readJob(job.id);
    expect(finished.status).toBe('succeeded');
    expect(finished.memory_slugs ?? []).toEqual([]);
    expect(await listPrivateNotes('alice')).toEqual([]);
  });

  it('does not reflect on failed jobs', async () => {
    const adapterOverride = makeFailingAdapter();
    const job = await createJob({ title: 'Bad', brief: 'b', councillor_slug: 'alice' });
    await runJobNow(job.id, { adapterOverride });
    const finished = await readJob(job.id);
    expect(finished.status).toBe('failed');
    expect(await listPrivateNotes('alice')).toEqual([]);
  });
});

describe('runner reflection — next job sees prior memory', () => {
  it('private memory from job 1 appears in job 2 prompt assembly', async () => {
    const prevEnv = env.LANDSRAAD_COUNCIL_ROOT;
    const tmpRoot = mkdtempSync(join(tmpdir(), 'landsraad-e2e-'));
    env.LANDSRAAD_COUNCIL_ROOT = tmpRoot;
    try {
      await createCouncil({ name: 'E2E' });
      await createCouncillor({ name: 'Alice', role: 'cto' });

      const reflection = '<<MEMORY title="Cash flow rule">>\nAlways verify against the ledger.\n<</MEMORY>>';
      const adapter = makeReflectionAdapter(reflection);
      const job1 = await createJob({ title: 'Audit', brief: 'investigate cash', councillor_slug: 'alice' });
      await runJobNow(job1.id, { adapterOverride: adapter });

      const { assembleContextFor } = await import('./context');
      const ctx = await assembleContextFor('alice', 'follow up on cash');
      expect(ctx).toContain('# Your memory');
      expect(ctx).toContain('Cash flow rule');
      expect(ctx).toContain('Always verify against the ledger.');
    } finally {
      rmSync(tmpRoot, { recursive: true, force: true });
      if (prevEnv === undefined) delete env.LANDSRAAD_COUNCIL_ROOT;
      else env.LANDSRAAD_COUNCIL_ROOT = prevEnv;
    }
  });
});
