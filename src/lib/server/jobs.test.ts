import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { env } from 'node:process';

import { createCouncil } from './councils';
import {
  appendTranscript,
  createJob,
  currentJobForCouncillor,
  listJobs,
  listJobsForCouncillor,
  readEvents,
  readJob,
  setStatus,
  writeInput,
  writeOutput
} from './jobs';

let tmpRoot: string;
let prevEnv: string | undefined;

beforeEach(async () => {
  prevEnv = env.LANDSRAAD_COUNCILS_ROOT;
  tmpRoot = mkdtempSync(join(tmpdir(), 'landsraad-jobs-'));
  env.LANDSRAAD_COUNCILS_ROOT = tmpRoot;
  await createCouncil({ name: 'Test Council' });
});

afterEach(() => {
  rmSync(tmpRoot, { recursive: true, force: true });
  if (prevEnv === undefined) delete env.LANDSRAAD_COUNCILS_ROOT;
  else env.LANDSRAAD_COUNCILS_ROOT = prevEnv;
});

describe('jobs', () => {
  it('creates a job in queued state with artifacts', async () => {
    const j = await createJob('test-council', {
      title: 'Q1 Summary',
      brief: 'Summarize Q1 financials.',
      councillor_slug: 'cfo'
    });
    expect(j.status).toBe('queued');
    expect(j.id).toMatch(/q1-summary$/);
    const read = await readJob('test-council', j.id);
    expect(read.title).toBe('Q1 Summary');
    const events = await readEvents('test-council', j.id);
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('created');
  });

  it('lists jobs newest first', async () => {
    const a = await createJob('test-council', { title: 'A', brief: 'a', councillor_slug: 'x' }, new Date('2026-01-01T00:00:00Z'));
    const b = await createJob('test-council', { title: 'B', brief: 'b', councillor_slug: 'x' }, new Date('2026-01-02T00:00:00Z'));
    const list = await listJobs('test-council');
    expect(list.map((j) => j.id)).toEqual([b.id, a.id]);
  });

  it('filters jobs by councillor', async () => {
    await createJob('test-council', { title: 'A', brief: 'a', councillor_slug: 'cfo' });
    await createJob('test-council', { title: 'B', brief: 'b', councillor_slug: 'cto' });
    const cfo = await listJobsForCouncillor('test-council', 'cfo');
    expect(cfo).toHaveLength(1);
  });

  it('tracks status transitions and appends events', async () => {
    const j = await createJob('test-council', { title: 'go', brief: 'g', councillor_slug: 'x' });
    await setStatus('test-council', j.id, 'running', { started_at: new Date().toISOString() });
    await setStatus('test-council', j.id, 'succeeded', { finished_at: new Date().toISOString(), exit_code: 0 });
    const events = await readEvents('test-council', j.id);
    expect(events.map((e) => e.type)).toEqual(['created', 'started', 'succeeded']);
    const final = await readJob('test-council', j.id);
    expect(final.status).toBe('succeeded');
    expect(final.exit_code).toBe(0);
  });

  it('persists input, transcript, output', async () => {
    const j = await createJob('test-council', { title: 'doc', brief: 'd', councillor_slug: 'x' });
    await writeInput('test-council', j.id, 'PROMPT');
    await appendTranscript('test-council', j.id, 'chunk-1\n');
    await appendTranscript('test-council', j.id, 'chunk-2\n');
    await writeOutput('test-council', j.id, 'FINAL');
    const { readInput, readTranscript, readOutput } = await import('./jobs');
    expect(await readInput('test-council', j.id)).toBe('PROMPT');
    expect(await readTranscript('test-council', j.id)).toBe('chunk-1\nchunk-2\n');
    expect(await readOutput('test-council', j.id)).toBe('FINAL');
  });

  it('reports current job for a councillor', async () => {
    const j = await createJob('test-council', { title: 'a', brief: 'a', councillor_slug: 'cfo' });
    expect((await currentJobForCouncillor('test-council', 'cfo'))?.id).toBe(j.id);
    await setStatus('test-council', j.id, 'succeeded');
    expect(await currentJobForCouncillor('test-council', 'cfo')).toBe(null);
  });

  it('rejects creating a job in a non-existent council', async () => {
    await expect(
      createJob('no-such', { title: 'x', brief: 'x', councillor_slug: 'x' })
    ).rejects.toThrow();
  });
});
