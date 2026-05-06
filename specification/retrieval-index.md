# Retrieval Index

Status: draft MVP contract.

Landsraad maintains a rebuildable retrieval index over council files so agents can find relevant context by keyword and semantic similarity. The pattern follows Underrow: watch files, chunk text, embed chunks, persist metadata and vectors, and expose search to agents and the dashboard.

## Storage

Derived retrieval state lives under `.landsraad/index/retrieval/`.

```text
.landsraad/index/retrieval/
|-- metadata.json
|-- vectors.json
|-- manifest.json
`-- faiss.index
```

`faiss.index` is optional. Implementations may use direct vector search when FAISS is unavailable.

The index is derived state and may be deleted and rebuilt from source council files.

## Indexed Content

MVP indexes UTF-8 text files under the council root.

Included by default:

- markdown
- JSON
- CSV
- plain text
- common source-code and config formats

Excluded by default:

- `.git/`
- `node_modules/`
- build output
- `.landsraad/`
- `.env` and `.env.*`
- provider-local settings such as `.claude/` and `.codex/`
- lock files and generated package archives

File paths in results are relative to the council root.

## Chunk Metadata

```json
{
  "id": "council/memory/facts.md:0:sha256...",
  "filePath": "council/memory/facts.md",
  "chunkIndex": 0,
  "text": "Relevant chunk text...",
  "density": 0.72,
  "mtime": "2026-05-02T14:00:00.000Z",
  "size": 1234,
  "contentHash": "sha256...",
  "chunkHash": "sha256..."
}
```

Chunk ids are derived from path, content hash, and chunk index so re-indexing is stable and stale chunks can be removed.

## Search API

```json
{
  "query": "runway burn",
  "limit": 10,
  "mode": "hybrid"
}
```

MVP modes:

- `hybrid`: combine vector and keyword scores.
- `vector`: vector score only.
- `keyword`: keyword score only.

Search result:

```json
{
  "score": 0.91,
  "vectorScore": 0.88,
  "keywordScore": 1,
  "filePath": "council/memory/facts.md",
  "chunkIndex": 0,
  "text": "Relevant chunk text...",
  "density": 0.72
}
```

## Agent Access

MVP agent access is through Landsraad-controlled retrieval:

- pre-run retrieval can inject top chunks into the task packet
- `landsraad memory search <query> --json` exposes a CLI path for adapter use
- the dashboard API can expose the same retrieval service

Provider-specific tools or MCP bridges may be added later.

## MVP Boundaries

- The default embedder may be a local hashed n-gram embedder to avoid model downloads.
- Real embedding models are an implementation detail behind an `Embedder` interface.
- FAISS is optional; direct vector search is acceptable for small councils.
- Retrieval results are evidence, not curated memory.
