import type { ChunkKind, Embedder, IndexHandle } from './embeddings';
import { closeIndex, deleteByRef, openIndex, searchAsync, upsertChunkAsync } from './embeddings';
import type { SearchHit, SearchOptions } from './embeddings';

let _embedder: Embedder | null = null;
const handles = new Map<string, IndexHandle>();

export function setEmbedder(e: Embedder | null): void {
  for (const h of handles.values()) closeIndex(h);
  handles.clear();
  _embedder = e;
}

export function hasEmbedder(): boolean {
  return _embedder !== null;
}

export function closeAll(): void {
  for (const h of handles.values()) closeIndex(h);
  handles.clear();
}

function get(councilSlug: string): IndexHandle | null {
  if (!_embedder) return null;
  let h = handles.get(councilSlug);
  if (!h) {
    try {
      h = openIndex(councilSlug, _embedder);
    } catch (err) {
      console.warn(`[indexer] openIndex(${councilSlug}) failed:`, (err as Error).message);
      return null;
    }
    handles.set(councilSlug, h);
  }
  return h;
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

export async function indexUpsert(councilSlug: string, args: IndexUpsertArgs): Promise<void> {
  const h = get(councilSlug);
  if (!h) return;
  if (!args.text || !args.text.trim()) return;
  try {
    await upsertChunkAsync(h, args);
  } catch (err) {
    console.warn(`[indexer] upsert ${args.kind}/${args.ref_id} failed:`, (err as Error).message);
  }
}

export function indexDelete(councilSlug: string, kind: ChunkKind, ref_id: string): void {
  const h = get(councilSlug);
  if (!h) return;
  try {
    deleteByRef(h, kind, ref_id);
  } catch (err) {
    console.warn(`[indexer] delete ${kind}/${ref_id} failed:`, (err as Error).message);
  }
}

export async function indexSearch(
  councilSlug: string,
  query: string,
  opts?: SearchOptions
): Promise<SearchHit[]> {
  const h = get(councilSlug);
  if (!h) return [];
  try {
    return await searchAsync(h, query, opts);
  } catch (err) {
    console.warn(`[indexer] search "${query}" failed:`, (err as Error).message);
    return [];
  }
}
