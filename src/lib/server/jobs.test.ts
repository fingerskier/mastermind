import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { env } from 'node:process';

import { createCouncil, deleteCouncilData } from './councils';
import {
  appendTranscript,
  createJob,
  currentJobForCouncillor,
  listJobs,
  listJobsForCouncillor,
  readEvents,
  readJob,
  readOutputSlug,
  rerunJob,
  setStatus,
  writeInput,
  writeOutput
} from './jobs';

let tmpRoot: string;
let prevEnv: string | undefined;

beforeEach(async () => {
  prevEnv = env.LANDSRAAD_COUNCIL_ROOT;
  tmpRoot = mkdtempSync(join(tmpdir(), 'landsraad-jobs-'));
  env.LANDSRAAD_COUNCIL_ROOT = tmpRoot;
  await createCouncil({ name: 'Test Council' });
});

afterEach(() => {
  rmSync(tmpRoot, { recursive: true, force: true });
  if (prevEnv === undefined) delete env.LANDSRAAD_COUNCIL_ROOT;
  else env.LANDSRAAD_COUNCIL_ROOT = prevEnv;
});

describe('jobs', () => {
  it('creates a job in queued state with artifacts', async () => {
    const j = await createJob({
      title: 'Q1 Summary',
      brief: 'Summarize Q1 financials.',
      councillor_slug: 'cfo'
    });
    expect(j.status).toBe('queued');
    expect(j.id).toMatch(/q1-summary$/);
    const read = await readJob(j.id);
    expect(read.title).toBe('Q1 Summary');
    const events = await readEvents(j.id);
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('created');
  });

  it('lists jobs newest first', async () => {
    const a = await createJob({ title: 'A', brief: 'a', councillor_slug: 'x' }, new Date('2026-01-01T00:00:00Z'));
    const b = await createJob({ title: 'B', brief: 'b', councillor_slug: 'x' }, new Date('2026-01-02T00:00:00Z'));
    const list = await listJobs();
    expect(list.map((j) => j.id)).toEqual([b.id, a.id]);
  });

  it('filters jobs by councillor', async () => {
    await createJob({ title: 'A', brief: 'a', councillor_slug: 'cfo' });
    await createJob({ title: 'B', brief: 'b', councillor_slug: 'cto' });
    const cfo = await listJobsForCouncillor('cfo');
    expect(cfo).toHaveLength(1);
  });

  it('tracks status transitions and appends events', async () => {
    const j = await createJob({ title: 'go', brief: 'g', councillor_slug: 'x' });
    await setStatus(j.id, 'running', { started_at: new Date().toISOString() });
    await setStatus(j.id, 'succeeded', { finished_at: new Date().toISOString(), exit_code: 0 });
    const events = await readEvents(j.id);
    expect(events.map((e) => e.type)).toEqual(['created', 'started', 'succeeded']);
    const final = await readJob(j.id);
    expect(final.status).toBe('succeeded');
    expect(final.exit_code).toBe(0);
  });

  it('persists input, transcript, output', async () => {
    const j = await createJob({ title: 'doc', brief: 'd', councillor_slug: 'x' });
    await writeInput(j.id, 'PROMPT');
    await appendTranscript(j.id, 'chunk-1\n');
    await appendTranscript(j.id, 'chunk-2\n');
    await writeOutput(j.id, 'FINAL');
    const { readInput, readTranscript, readOutput } = await import('./jobs');
    expect(await readInput(j.id)).toBe('PROMPT');
    expect(await readTranscript(j.id)).toBe('chunk-1\nchunk-2\n');
    expect(await readOutput(j.id)).toBe('FINAL');
  });

  it('reports current job for a councillor', async () => {
    const j = await createJob({ title: 'a', brief: 'a', councillor_slug: 'cfo' });
    expect((await currentJobForCouncillor('cfo'))?.id).toBe(j.id);
    await setStatus(j.id, 'succeeded');
    expect(await currentJobForCouncillor('cfo')).toBe(null);
  });

  it('rerunJob clones a finished job into a new queued job, leaving the original intact', async () => {
    const source = await createJob(
      { title: 'Forecast', brief: 'do the thing', councillor_slug: 'cfo' },
      new Date('2026-05-21T10:00:00Z')
    );
    await setStatus(source.id, 'failed', {
      finished_at: new Date().toISOString(),
      error: 'boom'
    });

    const clone = await rerunJob(source.id, new Date('2026-05-21T10:05:00Z'));

    expect(clone.id).not.toBe(source.id);
    expect(clone.status).toBe('queued');
    expect(clone.title).toBe(source.title);
    expect(clone.brief).toBe(source.brief);
    expect(clone.councillor_slug).toBe(source.councillor_slug);
    expect(clone.error).toBeNull();

    const original = await readJob(source.id);
    expect(original.status).toBe('failed');
    expect(original.error).toBe('boom');

    const cloneEvents = await readEvents(clone.id);
    expect(cloneEvents.map((e) => e.type)).toEqual(['created']);
  });

  it('readOutputSlug returns the first non-empty line, truncated', async () => {
    const j = await createJob({ title: 't', brief: 'b', councillor_slug: 'x' });

    expect(await readOutputSlug(j.id)).toBe('');

    await writeOutput(j.id, '\n\n   The answer is 42.\nfollow-up line\n');
    expect(await readOutputSlug(j.id)).toBe('The answer is 42.');

    const long = 'x'.repeat(200);
    await writeOutput(j.id, long);
    const slug = await readOutputSlug(j.id, 80);
    expect(slug.length).toBeLessThanOrEqual(81);
    expect(slug.endsWith('…')).toBe(true);
  });

  it('rejects creating a job when no council exists', async () => {
    await deleteCouncilData();
    await expect(
      createJob({ title: 'x', brief: 'x', councillor_slug: 'x' })
    ).rejects.toThrow();
  });

  it('createJob persists spawned_by_schedule_id when provided', async () => {
    const j = await createJob({
      title: 'Spawned',
      brief: 'auto',
      councillor_slug: 'cfo',
      spawned_by_schedule_id: 'some-schedule-id'
    });
    expect(j.spawned_by_schedule_id).toBe('some-schedule-id');
    const read = await readJob(j.id);
    expect(read.spawned_by_schedule_id).toBe('some-schedule-id');
  });

  it('createJob defaults spawned_by_schedule_id to null', async () => {
    const j = await createJob({
      title: 'Manual',
      brief: 'human',
      councillor_slug: 'cfo'
    });
    expect(j.spawned_by_schedule_id ?? null).toBeNull();
  });
});
