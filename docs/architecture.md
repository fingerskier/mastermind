# Architecture

## Process model

One process. SvelteKit (Node adapter) handles the HTTP server, server-side rendering, and form actions. There is no separate API service in v0 — server logic lives in `+page.server.ts` files and in `src/lib/server/`.

```
browser <--HTTP--> SvelteKit (Node)
                       |
                       v
                   filesystem
                   (process.cwd() — the council root)
```

## Why SvelteKit (full-stack)

A v0 with no agent execution is mostly forms + a filesystem CRUD layer. SvelteKit's form actions give us POST-with-validation-and-redirect out of the box, no API plumbing, no separate frontend build to wire up. When agent execution lands and we need long-running jobs, server-sent events, or scheduler endpoints, we can add them as `+server.ts` routes or as a separate worker process without changing the UI shell.

## Module boundaries

- `src/lib/server/paths.ts` — slug rules and on-disk path resolution. Single source of truth for "where does this go?". All paths derive from `councilRoot()` (= `cwd` or `LANDSRAAD_COUNCIL_ROOT`).
- `src/lib/server/councils.ts` — council CRUD (singular: `hasCouncil`, `readCouncil`, `createCouncil`, `updateCouncil`, `deleteCouncilData`).
- `src/lib/server/councillors.ts` — councillor CRUD (incl. `reflect` flag, `routing_hint`).
- `src/lib/server/memory.ts` — shared-note CRUD.
- `src/lib/server/memory_private.ts` — per-councillor private-memory CRUD + indexer integration (`kind: 'memory_private'`).
- `src/lib/server/jobs.ts` — job CRUD + artifact I/O.
- `src/lib/server/runner.ts` — in-process job scheduler; one running job per councillor. Also drives the post-success reflection pass and dispatches parsed blocks.
- `src/lib/server/reflection.ts` — reflection prompt builder + parser for `<<MEMORY>>` / `<<JOB>>` fenced blocks. Regex-tolerant of whitespace and trailing prose; unknown tags ignored.
- `src/lib/server/proposals.ts` — `<<JOB>>` proposal CRUD under `proposals/jobs/` and the approve/reject flow (approval routes through the normal job-creation path).
- `src/lib/server/roster.ts` — auto-generated council roster (`<slug> — <name> — <role> — <routing_hint>` lines) injected into every prompt.
- `src/lib/server/context.ts` — `assembleContextFor(councillor_slug, brief)` — top-K semantic retrieval (shared + private) with char budget + fallback.
- `src/lib/server/config.ts` — tuning constants (`MEMORY_TOPK_SHARED`, `MEMORY_TOPK_PRIVATE`, `MEMORY_CHAR_BUDGET`). No UI in v1.
- `src/lib/server/templates.ts` — council-template schema, loader (URL or path), `planApply` / `applyTemplate` (preview-then-confirm), `exportSelection`, named errors.
- `src/lib/server/adapters/` — adapter implementations (`mock:local`, `cli:claude`, `cli:codex`).
- `src/lib/server/indexer.ts` + `embeddings.ts` — semantic index over markdown surfaces.
- `src/lib/server/open_editor.ts` — "edit persona in default editor" helper.
- `src/lib/types.ts` — types shared between server and client.
- `src/routes/**` — UI pages + form actions. Pages should not import from `node:fs` or `node:path` directly; they go through `$lib/server`.
- `bin/landsraad.js` — npx entry. Dispatches `init` / `export` subcommands to `scripts/template-install.ts` / `scripts/template-export.ts`; otherwise starts the server.
- `scripts/template-install.ts`, `scripts/template-export.ts`, `scripts/reindex.ts` — CLI surface (run via `vite-node`).

The `server` subdirectory matters: SvelteKit refuses to ship anything under `$lib/server` to the browser.

## State

All state lives on disk. The server reads and writes synchronously to user input — no caching layer. Filesystem-as-database is fine here because:

- A single human director generates a tiny number of writes.
- The data is meant to be human-readable and version-controllable.
- Restarting the server is a no-op; there's no in-memory state to lose.

## Prompt assembly pipeline

`runner.buildPrompt(job)` calls `assembleContextFor(councillor_slug, brief)` which produces, in order:

1. Persona (from `councillors/<slug>/persona.md`).
2. Council roster — auto-generated; one line per councillor.
3. Shared council memory — top-K semantic hits, ranked by cosine similarity to the brief.
4. Private memory for this councillor — top-K hits, scoped by `councillor_slug`.
5. The brief itself.

Section headers are always emitted, even when a section is empty, so the model sees a stable shape. A global character budget (`MEMORY_CHAR_BUDGET`) evicts the lowest-scoring memory entries until total length fits. If the index is empty or embedding fails, assembly falls back to "all shared notes verbatim" so a freshly-installed council still works.

After a job transitions to `succeeded` and `reflect: true`, the runner makes one extra adapter call with the reflection prompt, parses any `<<MEMORY>>` and `<<JOB>>` blocks, writes private memory entries (indexed under `memory_private`), and persists `<<JOB>>` blocks as pending proposals. Reflection failure is non-fatal.

## Future surfaces (not built yet)

When the next phase lands, expect to add:

- SDK adapters (`sdk:anthropic`, `sdk:openai`) — same `Adapter` interface, no runner changes.
- Memory promotion (private → shared) — design candidates documented in `SPECIFICATION.md` and `docs/OPEN_QUESTIONS.md`.
- Sleep/dream consolidation pass over memories.
- `src/routes/api/runs/...` — SSE endpoints for live run feedback (today the UI polls).
- A separate worker process for long-running schedulers / cron.
