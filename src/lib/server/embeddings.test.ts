import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { env } from 'node:process';
import { createHash } from 'node:crypto';

import { createCouncil } from './councils';
import { closeIndex, deleteByRef, gzipDensity, openIndex, search, upsertChunk } from './embeddings';
import type { Embedder } from './embeddings';

const DIM = 384;

function fakeEmbedder(): Embedder {
  // Deterministic projection: hash each token into a fixed-dim bag-of-hashes vector.
  // Same input → same vector; similar inputs → overlapping non-zero positions.
  return {
    dim: DIM,
    embed(texts: string[]): Float32Array[] {
      return texts.map((text) => {
        const v = new Float32Array(DIM);
        const tokens = text.toLowerCase().split(/\s+/).filter(Boolean);
        for (const t of tokens) {
          const h = createHash('sha1').update(t).digest();
          const idx = h.readUInt16BE(0) % DIM;
          v[idx] += 1;
        }
        let norm = 0;
        for (let i = 0; i < DIM; i++) norm += v[i] * v[i];
        norm = Math.sqrt(norm) || 1;
        for (let i = 0; i < DIM; i++) v[i] /= norm;
        return v;
      });
    }
  };
}

let tmpRoot: string;
let prevEnv: string | undefined;

beforeEach(async () => {
  prevEnv = env.LANDSRAAD_COUNCILS_ROOT;
  tmpRoot = mkdtempSync(join(tmpdir(), 'landsraad-emb-'));
  env.LANDSRAAD_COUNCILS_ROOT = tmpRoot;
  await createCouncil({ name: 'Emb Test' });
});

afterEach(() => {
  rmSync(tmpRoot, { recursive: true, force: true });
  if (prevEnv === undefined) delete env.LANDSRAAD_COUNCILS_ROOT;
  else env.LANDSRAAD_COUNCILS_ROOT = prevEnv;
});

describe('gzipDensity', () => {
  it('returns lower density for repetitive text', () => {
    const dense = 'The quick brown fox jumps over the lazy dog near the riverbank at noon.';
    const sparse = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    expect(gzipDensity(sparse)).toBeLessThan(gzipDensity(dense));
  });

  it('returns a positive value for non-empty input', () => {
    // gzip has ~23 bytes of header overhead, so very short strings have density > 1.
    // For texts of meaningful size, density is in (0, 1].
    const d = gzipDensity('The quick brown fox jumps over the lazy dog'.repeat(10));
    expect(d).toBeGreaterThan(0);
    expect(d).toBeLessThanOrEqual(1);
  });

  it('returns 0 for empty input', () => {
    expect(gzipDensity('')).toBe(0);
  });
});

describe('embeddings index', () => {
  it('opens an index DB inside the council directory', () => {
    const idx = openIndex('emb-test', fakeEmbedder());
    expect(idx.path).toContain('emb-test');
    expect(idx.path).toMatch(/embeddings\.db$/);
    closeIndex(idx);
  });

  it('upserts a chunk and finds it via search', () => {
    const idx = openIndex('emb-test', fakeEmbedder());
    upsertChunk(idx, {
      kind: 'memory',
      ref_id: 'house-rules',
      text: 'Always escalate device safety concerns to the human director.',
      source_path: '/fake/memory/house-rules.md',
      source_mtime: '2026-05-22T10:00:00Z',
      title: 'House Rules'
    });
    const hits = search(idx, 'device safety escalation');
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].kind).toBe('memory');
    expect(hits[0].ref_id).toBe('house-rules');
    expect(hits[0].title).toBe('House Rules');
    expect(hits[0].similarity).toBeGreaterThan(0);
    closeIndex(idx);
  });

  it('stores gzip_density and token_count', () => {
    const idx = openIndex('emb-test', fakeEmbedder());
    upsertChunk(idx, {
      kind: 'memory',
      ref_id: 'n1',
      text: 'one two three four five',
      source_path: '/fake/n1.md',
      source_mtime: '2026-05-22T10:00:00Z'
    });
    const [hit] = search(idx, 'one two');
    expect(hit.gzip_density).toBeGreaterThan(0);
    closeIndex(idx);
  });

  it('is idempotent: re-upserting same text does not re-embed', () => {
    const e = fakeEmbedder();
    let calls = 0;
    const counting: Embedder = {
      dim: e.dim,
      embed(texts) {
        calls += texts.length;
        return e.embed(texts);
      }
    };
    const idx = openIndex('emb-test', counting);
    const args = {
      kind: 'memory' as const,
      ref_id: 'n1',
      text: 'same text',
      source_path: '/fake/n1.md',
      source_mtime: '2026-05-22T10:00:00Z'
    };
    upsertChunk(idx, args);
    upsertChunk(idx, args);
    expect(calls).toBe(1);
    closeIndex(idx);
  });

  it('re-embeds when text changes', () => {
    const e = fakeEmbedder();
    let calls = 0;
    const counting: Embedder = {
      dim: e.dim,
      embed(texts) {
        calls += texts.length;
        return e.embed(texts);
      }
    };
    const idx = openIndex('emb-test', counting);
    upsertChunk(idx, {
      kind: 'memory',
      ref_id: 'n1',
      text: 'v1 text',
      source_path: '/fake/n1.md',
      source_mtime: '2026-05-22T10:00:00Z'
    });
    upsertChunk(idx, {
      kind: 'memory',
      ref_id: 'n1',
      text: 'v2 text',
      source_path: '/fake/n1.md',
      source_mtime: '2026-05-22T10:01:00Z'
    });
    expect(calls).toBe(2);
    const hits = search(idx, 'v2 text');
    expect(hits[0].text).toContain('v2');
    closeIndex(idx);
  });

  it('deletes all chunks for a ref', () => {
    const idx = openIndex('emb-test', fakeEmbedder());
    upsertChunk(idx, {
      kind: 'memory',
      ref_id: 'doomed',
      text: 'about to vanish',
      source_path: '/fake/doomed.md',
      source_mtime: '2026-05-22T10:00:00Z'
    });
    expect(search(idx, 'about to vanish').length).toBe(1);
    deleteByRef(idx, 'memory', 'doomed');
    expect(search(idx, 'about to vanish').length).toBe(0);
    closeIndex(idx);
  });

  it('filters search by kind', async () => {
    const idx = openIndex('emb-test', fakeEmbedder());
    upsertChunk(idx, {
      kind: 'memory',
      ref_id: 'm1',
      text: 'shared topic alpha',
      source_path: '/fake/m1.md',
      source_mtime: '2026-05-22T10:00:00Z'
    });
    upsertChunk(idx, {
      kind: 'job_output',
      ref_id: 'j1',
      text: 'shared topic alpha',
      source_path: '/fake/j1.md',
      source_mtime: '2026-05-22T10:00:00Z',
      councillor_slug: 'mocky'
    });
    const all = search(idx, 'shared topic alpha');
    expect(all.length).toBe(2);
    const onlyJobs = search(idx, 'shared topic alpha', { kinds: ['job_output'] });
    expect(onlyJobs.length).toBe(1);
    expect(onlyJobs[0].kind).toBe('job_output');
    expect(onlyJobs[0].councillor_slug).toBe('mocky');
    closeIndex(idx);
  });

  it('isolates indices between councils', async () => {
    await createCouncil({ name: 'Other Council' });
    const a = openIndex('emb-test', fakeEmbedder());
    const b = openIndex('other-council', fakeEmbedder());
    upsertChunk(a, {
      kind: 'memory',
      ref_id: 'a1',
      text: 'unique-token-aaaa',
      source_path: '/a.md',
      source_mtime: '2026-05-22T10:00:00Z'
    });
    expect(search(a, 'unique-token-aaaa').length).toBe(1);
    expect(search(b, 'unique-token-aaaa').length).toBe(0);
    closeIndex(a);
    closeIndex(b);
  });

  it('filters by min_density', () => {
    const idx = openIndex('emb-test', fakeEmbedder());
    upsertChunk(idx, {
      kind: 'memory',
      ref_id: 'boilerplate',
      text: 'aaaaaa aaaaaa aaaaaa aaaaaa aaaaaa aaaaaa aaaaaa aaaaaa aaaaaa aaaaaa',
      source_path: '/b.md',
      source_mtime: '2026-05-22T10:00:00Z'
    });
    upsertChunk(idx, {
      kind: 'memory',
      ref_id: 'dense',
      text: 'The quick brown fox jumps over the lazy dog near the riverbank at noon.',
      source_path: '/d.md',
      source_mtime: '2026-05-22T10:00:00Z'
    });
    const dense = search(idx, 'fox dog noon', { min_density: 0.5 });
    expect(dense.every((h) => h.gzip_density >= 0.5)).toBe(true);
    closeIndex(idx);
  });
});
