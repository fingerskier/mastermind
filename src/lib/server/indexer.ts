import type { ChunkKind, Embedder, IndexHandle } from './embeddings';
import { closeIndex, deleteByRef, openIndex, searchAsync, upsertChunkAsync } from './embeddings';
import type { SearchHit, SearchOptions } from './embeddings';

let _embedder: Embedder | null = null;
let _handle: IndexHandle | null = null;

export function setEmbedder(e: Embedder | null): void {
  if (_handle) {
    closeIndex(_handle);
    _handle = null;
  }
  _embedder = e;
}

export function hasEmbedder(): boolean {
  return _embedder !== null;
}

export function closeAll(): void {
  if (_handle) {
    closeIndex(_handle);
    _handle = null;
  }
}

function get(): IndexHandle | null {
  if (!_embedder) return null;
  if (_handle) return _handle;
  try {
    _handle = openIndex(_embedder);
  } catch (err) {
    console.warn(`[indexer] openIndex failed:`, (err as Error).message);
    return null;
  }
  return _handle;
}

export interface IndexUpsertArgs {
  kind: ChunkKind;
  ref_id: string;
  text: string;
  source_path: string;
  source_mtime: string;
  title?: string | null;
  councillor_slug?: string | null;
}

export async function indexUpsert(args: IndexUpsertArgs): Promise<void> {
  const h = get();
  if (!h) return;
  if (!args.text || !args.text.trim()) return;
  try {
    await upsertChunkAsync(h, args);
  } catch (err) {
    console.warn(`[indexer] upsert ${args.kind}/${args.ref_id} failed:`, (err as Error).message);
  }
}

export function indexDelete(kind: ChunkKind, ref_id: string): void {
  const h = get();
  if (!h) return;
  try {
    deleteByRef(h, kind, ref_id);
  } catch (err) {
    console.warn(`[indexer] delete ${kind}/${ref_id} failed:`, (err as Error).message);
  }
}

export async function indexSearch(query: string, opts?: SearchOptions): Promise<SearchHit[]> {
  const h = get();
  if (!h) return [];
  try {
    return await searchAsync(h, query, opts);
  } catch (err) {
    console.warn(`[indexer] search "${query}" failed:`, (err as Error).message);
    return [];
  }
}
