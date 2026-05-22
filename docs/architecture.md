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
- `src/lib/server/councillors.ts` — councillor CRUD.
- `src/lib/server/memory.ts` — shared-note CRUD.
- `src/lib/server/jobs.ts` — job CRUD + artifact I/O.
- `src/lib/server/runner.ts` — in-process job scheduler; one running job per councillor.
- `src/lib/server/indexer.ts` + `embeddings.ts` — semantic index over markdown surfaces.
- `src/lib/types.ts` — types shared between server and client.
- `src/routes/**` — UI pages + form actions. Pages should not import from `node:fs` or `node:path` directly; they go through `$lib/server`.

The `server` subdirectory matters: SvelteKit refuses to ship anything under `$lib/server` to the browser.

## State

All state lives on disk. The server reads and writes synchronously to user input — no caching layer. Filesystem-as-database is fine here because:

- A single human director generates a tiny number of writes.
- The data is meant to be human-readable and version-controllable.
- Restarting the server is a no-op; there's no in-memory state to lose.

## Future surfaces (not built yet)

When the next phase lands, expect to add:

- `src/lib/server/adapters/` — CLI and SDK adapters for actually invoking councillors.
- `src/lib/server/jobs.ts` — job definitions, runs, transcripts.
- `src/routes/api/runs/...` — SSE endpoints for live run feedback.
- A worker process (or background tasks within the SvelteKit server) for the scheduler.

None of these exist yet. The current shape is intentionally narrow so they can land without forcing a rewrite.
