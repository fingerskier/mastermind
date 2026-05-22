import Database from 'better-sqlite3';
import * as sqliteVec from 'sqlite-vec';
import { mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';

import { indexDbPath, indexDirPath } from './paths';

export type ChunkKind = 'memory' | 'job_input' | 'job_output' | 'transcript' | 'persona';

export interface Embedder {
  dim: number;
  embed(texts: string[]): Float32Array[] | Promise<Float32Array[]>;
}

export interface UpsertChunkInput {
  kind: ChunkKind;
  ref_id: string;
  chunk_idx?: number;
  text: string;
  source_path: string;
  source_mtime: string;
  title?: string | null;
  councillor_slug?: string | null;
}

export interface SearchOptions {
  k?: number;
  kinds?: ChunkKind[];
  councillor_slug?: string;
  min_density?: number;
}

export interface SearchHit {
  kind: ChunkKind;
  ref_id: string;
  chunk_idx: number;
  title: string | null;
  text: string;
  source_path: string;
  similarity: number;
  gzip_density: number;
  councillor_slug: string | null;
}

export interface IndexHandle {
  path: string;
  db: Database.Database;
  embedder: Embedder;
  dim: number;
}

export function gzipDensity(text: string): number {
  if (!text) return 0;
  const raw = Buffer.byteLength(text, 'utf8');
  if (raw === 0) return 0;
  return gzipSync(text).length / raw;
}

function tokenCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

function sha256Hex(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

function vecLiteral(v: Float32Array): Buffer {
  return Buffer.from(v.buffer, v.byteOffset, v.byteLength);
}

export function openIndex(embedder: Embedder): IndexHandle {
  mkdirSync(indexDirPath(), { recursive: true });
  const path = indexDbPath();
  const db = new Database(path);
  sqliteVec.load(db);

  db.exec(`
    CREATE TABLE IF NOT EXISTS chunks (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      kind            TEXT NOT NULL,
      ref_id          TEXT NOT NULL,
      chunk_idx       INTEGER NOT NULL DEFAULT 0,
      text            TEXT NOT NULL,
      text_hash       TEXT NOT NULL,
      gzip_density    REAL NOT NULL,
      token_count     INTEGER NOT NULL,
      councillor_slug TEXT,
      title           TEXT,
      source_path     TEXT NOT NULL,
      source_mtime    TEXT NOT NULL,
      embedded_at     TEXT NOT NULL,
      UNIQUE(kind, ref_id, chunk_idx)
    );
    CREATE INDEX IF NOT EXISTS chunks_kind_ref ON chunks(kind, ref_id);
  `);

  db.exec(
    `CREATE VIRTUAL TABLE IF NOT EXISTS vec_chunks USING vec0(
       chunk_id INTEGER PRIMARY KEY,
       embedding FLOAT[${embedder.dim}]
     );`
  );

  return { path, db, embedder, dim: embedder.dim };
}

export function closeIndex(h: IndexHandle): void {
  h.db.close();
}

export function upsertChunk(h: IndexHandle, input: UpsertChunkInput): void {
  const chunk_idx = input.chunk_idx ?? 0;
  const text_hash = sha256Hex(input.text);

  const existing = h.db
    .prepare<[string, string, number]>(
      'SELECT id, text_hash FROM chunks WHERE kind = ? AND ref_id = ? AND chunk_idx = ?'
    )
    .get(input.kind, input.ref_id, chunk_idx) as { id: number; text_hash: string } | undefined;

  if (existing && existing.text_hash === text_hash) {
    h.db
      .prepare('UPDATE chunks SET source_mtime = ? WHERE id = ?')
      .run(input.source_mtime, existing.id);
    return;
  }

  const result = h.embedder.embed([input.text]);
  if (result instanceof Promise) {
    throw new Error('upsertChunk requires a synchronous embedder; use upsertChunkAsync for async');
  }
  const [vec] = result;
  if (!vec || vec.length !== h.dim) {
    throw new Error(`Embedder returned ${vec?.length} dims, expected ${h.dim}`);
  }
  writeChunk(h, input, chunk_idx, text_hash, vec, existing?.id);
}

export async function upsertChunkAsync(h: IndexHandle, input: UpsertChunkInput): Promise<void> {
  const chunk_idx = input.chunk_idx ?? 0;
  const text_hash = sha256Hex(input.text);

  const existing = h.db
    .prepare<[string, string, number]>(
      'SELECT id, text_hash FROM chunks WHERE kind = ? AND ref_id = ? AND chunk_idx = ?'
    )
    .get(input.kind, input.ref_id, chunk_idx) as { id: number; text_hash: string } | undefined;

  if (existing && existing.text_hash === text_hash) {
    h.db
      .prepare('UPDATE chunks SET source_mtime = ? WHERE id = ?')
      .run(input.source_mtime, existing.id);
    return;
  }

  const [vec] = await h.embedder.embed([input.text]);
  if (!vec || vec.length !== h.dim) {
    throw new Error(`Embedder returned ${vec?.length} dims, expected ${h.dim}`);
  }
  writeChunk(h, input, chunk_idx, text_hash, vec, existing?.id);
}

function writeChunk(
  h: IndexHandle,
  input: UpsertChunkInput,
  chunk_idx: number,
  text_hash: string,
  vec: Float32Array,
  existingId: number | undefined
): void {
  const density = gzipDensity(input.text);
  const tokens = tokenCount(input.text);
  const embeddedAt = new Date().toISOString();
  const tx = h.db.transaction(() => {
    let chunkId: number;
    if (existingId) {
      h.db
        .prepare(
          `UPDATE chunks
           SET text = ?, text_hash = ?, gzip_density = ?, token_count = ?,
               councillor_slug = ?, title = ?, source_path = ?, source_mtime = ?, embedded_at = ?
           WHERE id = ?`
        )
        .run(
          input.text,
          text_hash,
          density,
          tokens,
          input.councillor_slug ?? null,
          input.title ?? null,
          input.source_path,
          input.source_mtime,
          embeddedAt,
          existingId
        );
      chunkId = existingId;
      h.db.prepare('DELETE FROM vec_chunks WHERE chunk_id = ?').run(BigInt(chunkId));
    } else {
      const info = h.db
        .prepare(
          `INSERT INTO chunks
            (kind, ref_id, chunk_idx, text, text_hash, gzip_density, token_count,
             councillor_slug, title, source_path, source_mtime, embedded_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          input.kind,
          input.ref_id,
          chunk_idx,
          input.text,
          text_hash,
          density,
          tokens,
          input.councillor_slug ?? null,
          input.title ?? null,
          input.source_path,
          input.source_mtime,
          embeddedAt
        );
      chunkId = Number(info.lastInsertRowid);
    }
    h.db
      .prepare('INSERT INTO vec_chunks(chunk_id, embedding) VALUES (?, ?)')
      .run(BigInt(chunkId), vecLiteral(vec));
  });
  tx();
}

export function deleteByRef(h: IndexHandle, kind: ChunkKind, ref_id: string): void {
  const rows = h.db
    .prepare('SELECT id FROM chunks WHERE kind = ? AND ref_id = ?')
    .all(kind, ref_id) as { id: number }[];
  const tx = h.db.transaction(() => {
    const delVec = h.db.prepare('DELETE FROM vec_chunks WHERE chunk_id = ?');
    for (const r of rows) delVec.run(BigInt(r.id));
    h.db.prepare('DELETE FROM chunks WHERE kind = ? AND ref_id = ?').run(kind, ref_id);
  });
  tx();
}

export function search(h: IndexHandle, query: string, opts: SearchOptions = {}): SearchHit[] {
  const k = opts.k ?? 10;
  const embedResult = h.embedder.embed([query]);
  if (embedResult instanceof Promise) {
    throw new Error('search requires a synchronous embedder; use searchAsync for async');
  }
  const [qvec] = embedResult;
  return runSearch(h, qvec, k, opts);
}

export async function searchAsync(
  h: IndexHandle,
  query: string,
  opts: SearchOptions = {}
): Promise<SearchHit[]> {
  const k = opts.k ?? 10;
  const [qvec] = await h.embedder.embed([query]);
  return runSearch(h, qvec, k, opts);
}

function runSearch(
  h: IndexHandle,
  qvec: Float32Array,
  k: number,
  opts: SearchOptions
): SearchHit[] {
  const where: string[] = [];
  const params: unknown[] = [vecLiteral(qvec), k * 4];
  if (opts.kinds && opts.kinds.length) {
    where.push(`c.kind IN (${opts.kinds.map(() => '?').join(',')})`);
    params.push(...opts.kinds);
  }
  if (opts.councillor_slug) {
    where.push('c.councillor_slug = ?');
    params.push(opts.councillor_slug);
  }
  if (typeof opts.min_density === 'number') {
    where.push('c.gzip_density >= ?');
    params.push(opts.min_density);
  }
  const filter = where.length ? ` AND ${where.join(' AND ')}` : '';

  const sql = `
    SELECT c.kind, c.ref_id, c.chunk_idx, c.title, c.text, c.source_path,
           c.gzip_density, c.councillor_slug, v.distance
    FROM vec_chunks v
    JOIN chunks c ON c.id = v.chunk_id
    WHERE v.embedding MATCH ?
      AND k = ?
      ${filter}
    ORDER BY v.distance ASC
    LIMIT ${k}
  `;

  const rows = h.db.prepare(sql).all(...params) as Array<{
    kind: ChunkKind;
    ref_id: string;
    chunk_idx: number;
    title: string | null;
    text: string;
    source_path: string;
    gzip_density: number;
    councillor_slug: string | null;
    distance: number;
  }>;

  return rows.map((r) => ({
    kind: r.kind,
    ref_id: r.ref_id,
    chunk_idx: r.chunk_idx,
    title: r.title,
    text: r.text,
    source_path: r.source_path,
    similarity: 1 - r.distance / 2,
    gzip_density: r.gzip_density,
    councillor_slug: r.councillor_slug
  }));
}
