# AGENTS.md

Notes for AI agents (and humans) working on this codebase.

## Repo layout

- `SPECIFICATION.md` — what the product is supposed to be. Read this first.
- `README.md` — how to run it.
- `docs/` — architecture, data model, future surfaces.
- `src/` — SvelteKit app.
- `bin/landsraad.js` — `npx landsraad` entrypoint (runs `build/index.js`).

## Development loop

1. **Update the spec first** if the task changes product behavior. `SPECIFICATION.md` is the source of truth.
2. **Red/green TDD.** Tests live next to code (`*.test.ts`). Run with `npm test`.
3. **Smoke test the UI** with `npm run dev` for anything user-facing. Type-check with `npm run check`.
4. **Update docs** (`README.md`, `docs/`) when behavior or layout changes.

## Constraints

- Node 20+, ES modules, TypeScript strict.
- All persistence goes through `src/lib/server/`. Routes never touch `node:fs` directly.
- `$lib/server/**` never gets shipped to the browser — keep secrets and filesystem code there.
- The app must not write outside `LANDSRAAD_COUNCILS_ROOT` (default `~/.landsraad/councils`).
- No secrets in tracked files. No telemetry.

## Out of scope (for now)

Agent execution, jobs, runs, scheduler, memory, retrieval, adapters. Do not add them as scope creep — they need their own spec pass.

## Git

- It is okay to commit directly to `main`.
- Use branches/worktrees for larger or experimental features.
- Don't push unless the user explicitly says to.
