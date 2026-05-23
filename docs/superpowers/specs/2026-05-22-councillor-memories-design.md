# Councillor Memories — Design

**Date:** 2026-05-22
**Status:** Approved (design), pending implementation plan
**Supersedes/extends:** Reqall #2540 (v1 — adapter + jobs + runner + memory + per-councillor columns). Adds private memory; today's shared memory continues unchanged in shape.

## Goals

Memories should give councillors:

1. **Continuity across jobs** — a councillor remembers prior decisions and conclusions so follow-up jobs don't restart from zero.
2. **Cross-councillor knowledge** — what one councillor learns can be promoted into the shared pool (manual in v1).
3. **Persona/style consolidation** — a councillor's voice, preferences, and heuristics sharpen over time.
4. **World/project facts** — stable references (people, systems, conventions) live in shared memory.

## Scope

Two-tier model:

- **Shared council memory** — already exists. One markdown file per note under `<council>/memory/`. Visible to every councillor.
- **Private per-councillor memory** — new. One markdown file per entry under `<council>/councillors/<slug>/memory/`. Visible only to that councillor at prompt-assembly time.

A councillor's prompt is assembled from: persona → shared memory (top-K) → private memory (top-K) → brief.


## Architecture

### Storage layout

```
<council>/
  memory/                       # shared (today)
    <slug>.md
  councillors/
    <slug>/
      councillor.json           # already exists; gains `reflect: boolean`
      memory/                   # new
        <slug>.md
```

Each `.md` file is one memory entry: first `# heading` line is the title, rest is body.

### Index

The existing sqlite-vec index already supports a `kind` column and a `councillor_slug` column on indexed rows (used today for `job_input`, `job_output`, `transcript`). Add a new kind:

- `kind: 'memory_private'`, `councillor_slug: <slug>` — one row per private memory entry.

`kind: 'memory'` (shared) is unchanged.

### Reflection (memory creation)

After a job transitions to `succeeded`, the runner triggers one extra adapter call to the same councillor:

- **Adapter:** same adapter the job ran on (mock / claude / codex).
- **Prompt:** a fixed reflection prompt (lives in `src/lib/server/reflection.ts`) that includes `transcript.md` + `output.md` and asks for zero or more memory entries in this strict fenced format:

  ```
  <<MEMORY title="short slug-friendly title">>
  body markdown here, including *why* this is worth remembering
  <</MEMORY>>
  ```

  Zero entries (response containing no MEMORY blocks) is a valid answer.
- **Output handling:**
  - Parse blocks from the reflection output.
  - For each block: `slug = slugify(title)`. If a file at that slug already exists in the councillor's private memory dir, append `-2`, `-3`, etc.
  - Write `<council>/councillors/<slug>/memory/<entry-slug>.md` (front-matter optional; first `# Title` line + body is sufficient).
  - Call `indexUpsert({kind: 'memory_private', ref_id: <entry-slug>, councillor_slug, text, source_path, source_mtime, title})`.
  - Append event `{type: 'reflected', count: N, memory_slugs: [...]}` to `events.jsonl`.
- **Failure:** reflection failure is non-fatal to the job. Append event `{type: 'reflection_failed', message}` and continue. The job remains `succeeded`.
- **Opt-out:** `councillor.json` gains `reflect: boolean` (default `true`). When `false`, the runner skips the reflection pass entirely.
- **Skipped statuses:** no reflection for `failed` or `cancelled` jobs in v1.

### Retrieval (memory consumption)

Replace `assembleMemoryContext()` with `assembleContextFor(councillor_slug, brief): Promise<string>`:

1. Embed the brief using the existing embedder.
2. Query top-K shared memories (`kind: 'memory'`), K = `MEMORY_TOPK_SHARED` (default 8).
3. Query top-K private memories filtered by `councillor_slug` (`kind: 'memory_private'`), K = `MEMORY_TOPK_PRIVATE` (default 8).
4. Order each set by similarity descending.
5. Apply a global character budget `MEMORY_CHAR_BUDGET` (default 12000). Drop lowest-scoring entries until total ≤ budget.
6. Concatenate into the prompt as two sections:
   ```
   # Shared council memory
   ### <title> (<slug>)
   <body>
   ...

   # Your memory
   ### <title> (<slug>)
   <body>
   ...
   ```
7. Always emit both section headers, even when a section is empty (so the model knows where memory would go).

Constants live in `src/lib/server/config.ts` (new file) — no UI tuning in v1.

Fallback: if the index is empty or embedding fails, fall back to today's "all shared notes verbatim" assembly. Single-council dogfood continues to work.

### Prompt assembly integration

The runner currently calls `assembleMemoryContext()` once per job before invoking the adapter. Replace that call site with `assembleContextFor(councillor_slug, brief)`. No other callers exist today.

## UI surface

### Home (`/`)

- Shared memory panel — unchanged content. Each entry shown with a small `shared` chip for clarity once private memories exist elsewhere.

### Councillor detail (`/councillors/<slug>`)

- New "Memory" section listing that councillor's private entries (title, source-job link if known, updated_at).
- Each entry links to a view/edit page reusing the existing `/memory/[note]` patterns, scoped to the councillor.
- Delete and edit work like shared notes.

### Job detail (`/jobs/<jid>`)

- If the job spawned reflection entries, show a "Memories created" subsection with link per entry.
- If reflection failed, show a one-line error.

### Routes (new)

- `/councillors/<slug>/memory/<note>` — view/edit single private entry.
- No new-note form in v1 — private entries are created exclusively by reflection. (Manual creation is a follow-up.)

## Curation

- Shared notes: same as today (create / edit / delete via UI).
- Private notes: edit / delete only. Reflection is the only creator.
- No "promote private → shared" action in v1. Workaround: read the private entry, copy text, create a new shared note, delete the private one.

## Non-goals (v1)

- Promote-to-shared action.
- Memory TTL / decay / auto-archive.
- Reflection on failed/cancelled jobs.
- Per-councillor reflection-prompt overrides.
- A `search_memory` tool exposed to the councillor at runtime (retrieval stays prompt-stuffed).
- Memory-budget UI.
- Embedding-model swap (sqlite-vec stays).
- Backfill of reflection for pre-existing succeeded jobs.

## Testing

- Unit:
  - Reflection parser: blocks/no blocks/malformed blocks/title collisions.
  - `assembleContextFor`: empty index fallback, K caps, char budget eviction, ordering, councillor scoping (private of councillor A not visible to B).
  - Runner: reflection runs on success, skipped on fail/cancel, opt-out flag honored, failure is non-fatal.
- Integration: mock-adapter end-to-end — submit job → succeeds → reflection produces 1+ entry → next job for same councillor shows that entry in its prompt assembly.
- Browser smoke: home, councillor detail, job detail with reflected entries visible.

## Risks / open questions

- **Reflection prompt quality** — getting useful zero-vs-N decisions and consistent block format depends on a well-tuned prompt. Plan to iterate on it after dogfood usage.
- **Cost** — one extra adapter call per successful job. Acceptable for v1; opt-out exists.
- **Index drift** — files on disk and index rows can diverge if the index is wiped. The existing reindex CLI (`scripts/reindex.ts`) covers shared memory; extend it to walk councillor private dirs too.

## Out-of-scope follow-ups captured

- Per-councillor column "+" button on the home page (create job pre-assigned to that councillor) and renaming the section-head "+ New job" to "+ Create job for all".  Pure UI tweak — not blocked by this design; can land independently.
- Reindex CLI extension: the spec notes the existing reindex script needs to walk
  per-councillor memory dirs too — small follow-up.
