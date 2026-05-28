# Memory promotion (private → shared) — design

Status: spec
Date: 2026-05-28

## Goal

Let a councillor write directly to council-wide shared memory at emission time, via a `scope` attribute on the existing `<<MEMORY>>` block.
`scope="shared"` writes straight to the shared `memory/` directory; `scope="private"` (default) keeps the current per-councillor behavior.
No proposal layer, no review queue, no sidecar.
Councillors are trusted; an introspective cleanup/dedupe job is a separate slice later.

This closes the deferred design entry in `docs/OPEN_QUESTIONS.md` ("Option B — `scope` attribute on `<<MEMORY>>`") and supersedes spec #2625 (purge of `scope="shared"` from templates) — instead of purging, we make the attribute real.

## Block format

```
<<MEMORY title="..." scope="shared">>
body markdown
<</MEMORY>>
```

- `scope` is optional.  Allowed values: `"private"` (default) and `"shared"`.
- Unknown values fall back to `"private"` (forward-compat, same as other attrs).
- All other parsing rules unchanged.

## Parser

`src/lib/server/reflection.ts`:
- `ParsedMemoryBlock` gains `scope: 'private' | 'shared'`.
- New `ATTR_SCOPE_RE = /scope="([^"]*)"/`.
- Default to `'private'`; explicit `"shared"` → `'shared'`; anything else → `'private'`.

`parseMemoryBlocks` keeps its current shape (title-required, body-required, regex-tolerant of unknown attrs).

## Runner reflection processing

`src/lib/server/runner.ts` — for each parsed block:

- `scope === 'private'` (current behavior): `createPrivateNote(councillor.slug, { title, body })`.
- `scope === 'shared'`: `createSharedNoteAutoSuffix({ title, body })` (new helper in `memory.ts`, see below).

A failed write on a single block appends a `reflection_failed` event for that block (current behavior) and continues with the rest. Successful slugs are recorded on the job for the UI.

### Job record

`src/lib/types.ts`:

- `Job` gains `shared_memory_slugs?: string[]` (parallel to existing `memory_slugs`).
- Runner populates it after the per-block loop; UI surfaces it separately ("Shared memory updated" with links to `/memory/<slug>`).

## Shared memory writer

`src/lib/server/memory.ts` — `createNote` keeps its current strict-collision behavior (used by the UI's "new shared note" form, where users see the error and fix the title). Add:

```ts
export async function createSharedNoteAutoSuffix(input: UpsertNoteInput): Promise<MemoryNote>;
```

Semantics, mirroring `createPrivateNote`:
- Slugify title.
- If `<slug>.md` already exists in `memory/`, suffix with `-2`, `-3`, … until free.
- Write the body (prepending `# <title>\n\n` if no leading `#`).
- Index via `indexUpsert({ kind: 'memory', ... })`.
- Return the note.

This isolates the suffix policy in one place so the UI's strict behavior stays intact.

## Storage layout

No new directories. Reflection writes land in the existing tree:

```
<council-root>/
  councillors/<slug>/memory/<note-slug>.md     # scope="private" (default)
  memory/<note-slug>.md                        # scope="shared"
```

## Spec / doc updates

- `SPECIFICATION.md`:
  - § Agent Proposals: document the `scope` attribute and that `scope="shared"` writes directly to shared memory.
  - § Out of Scope: remove "Memory promotion (private → shared)" line — now shipped.
- `docs/OPEN_QUESTIONS.md`: remove the "Memory promotion (private → shared)" entry.
- `docs/architecture.md`, `docs/data-model.md`: note the `scope` attribute behavior.
- Spec #2625 (Reqall): mark resolved with reference to this spec — instead of purging `scope="shared"` from bundled personas, we implement it.

## Testing

- `src/lib/server/reflection.test.ts`:
  - `parseMemoryBlocks` returns `scope: 'private'` when attr absent.
  - returns `scope: 'shared'` when `scope="shared"`.
  - returns `scope: 'private'` for unknown values (e.g. `scope="team"`).
  - title-required behavior unchanged.
- `src/lib/server/memory.test.ts` (new or extend existing):
  - `createSharedNoteAutoSuffix` writes a new note when slug is free.
  - On collision, suffixes `-2`, `-3`, …; both notes are independently indexed.
  - Body without leading `#` gets a `# <title>` header (matches `createPrivateNote`).
  - `createNote` (strict) still throws on collision — unchanged.
- `src/lib/server/runner.test.ts` (extend existing reflection tests):
  - `<<MEMORY scope="shared">>` block produces a shared note (not a private one).
  - The job's `shared_memory_slugs` lists the resulting slug.
  - Mixed blocks (one private, one shared) produce one of each, recorded in the right field.
  - Unknown `scope` value falls back to private (no shared note written).

## Risks / non-goals

- **No review surface.** Anything the councillor writes lands. If a councillor goes off-rails, the user edits or deletes the shared note by hand. We may add an introspective cleanup pass (sleep/dream-style dedupe across shared) as a separate slice.
- **No "promote existing private" affordance.** This slice only covers emission-time writes. A user who wants to promote a hand-written or previously-private note moves the file (or copies content via the UI) themselves.
- **Same-slug re-emission across runs** creates `-2`, `-3` suffixed shared notes. Cleanup is the deferred dedupe pass.
- **Cross-councillor concerns.** Any councillor can write to shared. There is no per-councillor scope or namespace within shared.

## Ordering & rollout

Single PR, in test-first order:
1. Parser change (+ tests).
2. `createSharedNoteAutoSuffix` (+ tests).
3. Runner integration + `shared_memory_slugs` (+ tests).
4. UI surface on `/jobs/[jid]` — "Shared memory updated" list mirroring the existing "Memories created" section.
5. Doc updates (`SPECIFICATION.md`, `OPEN_QUESTIONS.md`, `architecture.md`, `data-model.md`).
6. Smoke test against dogfood council with `mock:local`.

No migration needed.
