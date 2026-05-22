import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { env } from 'node:process';
import { createHash } from 'node:crypto';

import { createCouncil } from './councils';
import { createCouncillor, deleteCouncillor, updateCouncillor } from './councillors';
import { createNote, deleteNote, updateNote } from './memory';
import { createJob, writeInput, writeOutput, appendTranscript } from './jobs';
import type { Embedder } from './embeddings';
import { closeAll, indexSearch, setEmbedder } from './indexer';

const DIM = 384;

function fakeEmbedder(): Embedder {
  return {
    dim: DIM,
    embed(texts) {
      return texts.map((text) => {
        const v = new Float32Array(DIM);
        const tokens = text.toLowerCase().split(/\s+/).filter(Boolean);
        for (const t of tokens) {
          const h = createHash('sha1').update(t).digest();
          v[h.readUInt16BE(0) % DIM] += 1;
        }
        let n = 0;
        for (let i = 0; i < DIM; i++) n += v[i] * v[i];
        n = Math.sqrt(n) || 1;
        for (let i = 0; i < DIM; i++) v[i] /= n;
        return v;
      });
    }
  };
}

let tmpRoot: string;
let prevEnv: string | undefined;

beforeEach(async () => {
  prevEnv = env.LANDSRAAD_COUNCILS_ROOT;
  tmpRoot = mkdtempSync(join(tmpdir(), 'landsraad-hooks-'));
  env.LANDSRAAD_COUNCILS_ROOT = tmpRoot;
  setEmbedder(fakeEmbedder());
  await createCouncil({ name: 'Hooks Test' });
});

afterEach(() => {
  closeAll();
  setEmbedder(null);
  rmSync(tmpRoot, { recursive: true, force: true });
  if (prevEnv === undefined) delete env.LANDSRAAD_COUNCILS_ROOT;
  else env.LANDSRAAD_COUNCILS_ROOT = prevEnv;
});

describe('indexer write-hooks', () => {
  it('indexes a memory note on create', async () => {
    await createNote('hooks-test', {
      title: 'Capital Allocation',
      body: 'Reserve 30% runway. Avoid speculative venture bets.'
    });
    const hits = await indexSearch('hooks-test', 'runway reserve');
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].kind).toBe('memory');
    expect(hits[0].ref_id).toBe('capital-allocation');
  });

  it('re-indexes on update', async () => {
    await createNote('hooks-test', { title: 'Doc', body: 'first draft about pancakes' });
    await updateNote('hooks-test', 'doc', '# Doc\n\nsecond draft about waffles');
    const hits = await indexSearch('hooks-test', 'waffles');
    expect(hits[0]?.text).toContain('waffles');
    expect(hits[0]?.text).not.toContain('pancakes');
  });

  it('removes from index on delete', async () => {
    await createNote('hooks-test', { title: 'Doomed', body: 'unique-tk delete-me-soon' });
    expect((await indexSearch('hooks-test', 'unique-tk delete-me-soon')).length).toBe(1);
    await deleteNote('hooks-test', 'doomed');
    expect(await indexSearch('hooks-test', 'unique-tk delete-me-soon')).toEqual([]);
  });

  it('indexes job input and output', async () => {
    await createCouncillor('hooks-test', { name: 'Mocky', role: 'tester', adapter: 'mock:local' });
    const job = await createJob('hooks-test', {
      title: 'Test Job',
      brief: 'do the thing',
      councillor_slug: 'mocky'
    });
    await writeInput('hooks-test', job.id, 'Please analyze quarterly revenue trends.');
    await appendTranscript('hooks-test', job.id, 'Adapter said: Q3 revenue is up 12%.');
    await writeOutput('hooks-test', job.id, 'Final: Q3 revenue up 12% YoY, driven by enterprise.');

    const out = await indexSearch('hooks-test', 'quarterly revenue enterprise');
    expect(out.length).toBeGreaterThan(0);
    const kinds = new Set(out.map((h) => h.kind));
    expect(kinds.has('job_input') || kinds.has('job_output') || kinds.has('transcript')).toBe(true);
    const outHit = out.find((h) => h.kind === 'job_output');
    expect(outHit?.councillor_slug).toBe('mocky');
    expect(outHit?.title).toBe('Test Job');
  });

  it('indexes councillor persona on create and removes on delete', async () => {
    await createCouncillor('hooks-test', {
      name: 'Polly',
      role: 'oracle',
      adapter: 'mock:local',
      persona: 'I am Polly, a uniquely-tokened oracle for risk forecasts.'
    });
    const hits = await indexSearch('hooks-test', 'uniquely-tokened oracle risk forecasts');
    expect(hits[0]?.kind).toBe('persona');
    expect(hits[0]?.councillor_slug).toBe('polly');

    await deleteCouncillor('hooks-test', 'polly');
    expect(await indexSearch('hooks-test', 'uniquely-tokened oracle risk forecasts')).toEqual([]);
  });

  it('updates persona index on update', async () => {
    await createCouncillor('hooks-test', {
      name: 'Mutable',
      role: 'changeling',
      adapter: 'mock:local',
      persona: 'before-shape tokens-alpha'
    });
    await updateCouncillor('hooks-test', 'mutable', { persona: 'after-shape tokens-beta' });
    const hits = await indexSearch('hooks-test', 'after-shape tokens-beta');
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].text).toContain('after-shape');
    expect(hits[0].text).not.toContain('before-shape');
  });
});
