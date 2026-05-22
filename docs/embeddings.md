# Embeddings & Semantic Search

Status: spec / v0 (proposed). Implementation pending.

> Storage swap from the original sketch: `@libsql/client` JS does not expose `loadExtension`, so `sqlite-vec` cannot load against it. Switched to `better-sqlite3`, which is sqlite-vec's primary supported Node binding. Synchronous API is fine — the SvelteKit server is single-process and embed/search calls already block on the model.

## Goal

Let the director (and, later, councillors themselves) semantically search across a council's markdown surface — memory notes, job inputs/outputs, transcripts, councillor personas — without coupling Landsraad to a remote vector service. Local-first, file-first, one operator, one machine.

## Non-goals

- No global cross-council search in v0. Each council indexes itself.
- No re-ranking, no hybrid BM25+vector, no MMR diversity in v0.
- No automatic chunking of giant files in v0 — embed whole-doc; split later if a doc exceeds the model's input window.
- No embedding of raw `events.jsonl` or `job.json` — only human-readable markdown.

## Stack

| Concern | Choice | Why |
|---|---|---|
| Storage | `better-sqlite3` (file-mode) | Single-file SQLite, synchronous API, well-supported `loadExtension` for `sqlite-vec`. |
| Vector index | `sqlite-vec` extension | Same DB as metadata. Atomic writes. No parallel-array hack. |
| Embedder | `@xenova/transformers` running `Xenova/all-MiniLM-L6-v2` (384d) | In-process, no API key, ~25MB cached, ~100ms/chunk on CPU. |
| Trigger | On-write hooks + `npm run reindex -- <council>` | Stays current; reindex for backfill or model swap. |

A future SDK embedder (`sdk:openai`, `sdk:cohere`) will conform to the same `Embedder` interface and swap in without DB changes — but the vector column width is fixed at table creation, so swapping models requires a rebuild.

## Storage Model

Per-council DB at `<council>/.index/embeddings.db`.

Deleting a council removes its index for free. The directory `.index/` is git-ignored (the index is regenerable).

### Schema

```sql
CREATE TABLE chunks (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  kind         TEXT NOT NULL,        -- 'memory' | 'job_input' | 'job_output' | 'transcript' | 'persona'
  ref_id       TEXT NOT NULL,        -- memory slug, job id, councillor slug
  chunk_idx    INTEGER NOT NULL DEFAULT 0,
  text         TEXT NOT NULL,
  text_hash    TEXT NOT NULL,        -- sha256 of text; skip re-embed if unchanged
  gzip_density REAL NOT NULL,        -- gzipped_len / raw_len, 0..1; lower = more redundant/boilerplate
  token_count  INTEGER NOT NULL,     -- rough whitespace-token count
  councillor_slug TEXT,              -- non-null when kind in (job_*, persona)
  title        TEXT,                 -- first markdown heading or fallback
  source_path  TEXT NOT NULL,        -- absolute path, for reverse lookup
  source_mtime TEXT NOT NULL,        -- ISO; if file mtime is newer, re-embed
  embedded_at  TEXT NOT NULL,        -- ISO
  UNIQUE(kind, ref_id, chunk_idx)
);

CREATE INDEX chunks_kind_ref ON chunks(kind, ref_id);
CREATE INDEX chunks_councillor ON chunks(councillor_slug) WHERE councillor_slug IS NOT NULL;

CREATE VIRTUAL TABLE vec_chunks USING vec0(
  chunk_id INTEGER PRIMARY KEY,
  embedding FLOAT[384]
);
```

`chunks.id` and `vec_chunks.chunk_id` are kept in lockstep — insert into `chunks` first, then insert the embedding with the returned `id`. On delete, remove from both.

### Logical key

```
<kind>/<ref_id>#<chunk_idx>
```

Examples:

| Logical key | Source file |
|---|---|
| `memory/house-rules#0` | `<council>/memory/house-rules.md` |
| `job_input/2026-05-22T14-30-00Z-q1-summary#0` | `<council>/jobs/.../input.md` |
| `job_output/2026-05-22T14-30-00Z-q1-summary#0` | `<council>/jobs/.../output.md` |
| `transcript/2026-05-22T14-30-00Z-q1-summary#0` | `<council>/jobs/.../transcript.md` |
| `persona/mocky#0` | `<council>/councillors/mocky/persona.md` |

The council slug is implicit: each council owns its own DB. If we ever flip to a global index, prepend the council slug as another column — no logical-key rewrite.

### `gzip_density`

`zlib.gzipSync(text).length / Buffer.byteLength(text, 'utf8')`.

- Lower (≈ 0.20) → highly redundant / boilerplate / templated text. Often a job_input header that was assembled from memory.
- Higher (≈ 0.55+) → information-dense prose.

Useful for filtering search results (down-rank near-boilerplate hits) and for debugging adapter behavior (a transcript with density 0.18 is probably stuck in a loop).

## Embed Triggers

### On-write hooks

| Source | Hook | Action |
|---|---|---|
| `createNote` / `updateNote` | After `writeFile` | Upsert `memory/<slug>#0`. |
| `deleteNote` | Before `rm` | Delete `memory/<slug>#*`. |
| `writeInput` | After `writeFile` | Upsert `job_input/<job-id>#0`. |
| `writeOutput` | After `writeFile` | Upsert `job_output/<job-id>#0`. Also embed transcript if non-empty: `transcript/<job-id>#0`. |
| `setStatus('succeeded' \| 'failed' \| 'cancelled')` | After write | Re-embed output (transcript may have grown since `writeInput`). |
| Councillor `persona.md` write | After `writeFile` | Upsert `persona/<slug>#0`. |
| Councillor delete | Before `rm` | Delete `persona/<slug>#*` and any related `job_*` rows for that councillor (TBD — see Open Questions). |

Hooks are best-effort: an embedding failure logs but does not abort the user-facing write. The reindex CLI is the source of truth.

### `npm run reindex`

```
npm run reindex -- <council-slug>
```

Walks the council's `memory/`, `councillors/*/persona.md`, and `jobs/*/{input,output,transcript}.md`. For each file:

1. Compute `text_hash`. If a chunk row exists with the same hash, skip.
2. Otherwise embed, upsert chunk + vector, update `source_mtime`.

Orphaned rows (source file deleted) are removed. Idempotent; safe to re-run.

## Search API

```ts
interface SearchHit {
  kind: ChunkKind;
  ref_id: string;
  chunk_idx: number;
  title: string | null;
  text: string;          // snippet, first ~400 chars
  source_path: string;
  similarity: number;    // cosine, 0..1, higher is better
  gzip_density: number;
  councillor_slug: string | null;
}

interface SearchOptions {
  k?: number;            // default 10
  kinds?: ChunkKind[];   // filter
  councillor_slug?: string;
  min_density?: number;  // skip boilerplate
}

search(councilSlug: string, query: string, opts?: SearchOptions): Promise<SearchHit[]>
```

Cosine similarity via `vec_chunks MATCH` (sqlite-vec syntax). Post-filter on `kinds` / `councillor_slug` / `min_density` happens in SQL.

## Failure Modes

- **No `sqlite-vec` extension available** — search returns empty + logs a one-time warning. Index writes are no-ops. The app degrades cleanly to file-only.
- **Embedder model not yet downloaded** — first embed call blocks ~10s downloading. On-write hooks tolerate this; the user-facing write is unaffected.
- **DB corruption** — `npm run reindex` rebuilds from files. The index is never authoritative.

## Open Questions

- Embed councillor-deleted job rows? Right now those rows go stale. Cheap to leave; cheap to garbage-collect on `reindex`. Punt to v1 of this feature.
- Chunking long transcripts. v0 embeds whole doc, even if it overflows the model's 512-token window (the model will truncate). When this hurts, add sentence-level chunking with overlap. Specify when seen.
- Should the search UI live at `/councils/[slug]/search` or as a sidebar on the council home? Punt until we have something to search.
