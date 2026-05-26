# Landsraad

A local-first AI council chamber. Configure councillors, give them jobs, watch the council work.

> Status: **v1 — single-council, cwd-rooted.** See [`SPECIFICATION.md`](./SPECIFICATION.md) for the full scope and what's deliberately out of scope.

## What's here

- A SvelteKit + TypeScript app you run locally.
- **One council per directory.** When you run `npx landsraad`, the current working directory **is** the council — `council.json`, `councillors/`, `memory/`, `jobs/`, `.index/` all sit at cwd.
- No accounts, no cloud, no telemetry. You are the only user. You are also the secretary.

## Quickstart

Requires Node.js 20+.

```bash
mkdir my-council && cd my-council
npx landsraad
```

Open the URL it prints. The setup form creates `council.json` in the current directory.

### From the repo (development)

```bash
npm install
npm run dev   # runs against repo cwd; council files are gitignored
```

To target a specific directory:

```bash
LANDSRAAD_COUNCIL_ROOT=/path/to/council npm run dev
```

### Seed a dogfood council

```bash
npm run dogfood:init        # creates ./dogfood
cd dogfood && npx landsraad # or LANDSRAAD_COUNCIL_ROOT=./dogfood npm run dev
```

### Wipe the dev council

```bash
npm run reset               # same as `landsraad reset`, but uses repo source — no build/install needed
```

Honors `LANDSRAAD_COUNCIL_ROOT` (so `LANDSRAAD_COUNCIL_ROOT=./dogfood npm run reset` wipes the dogfood council).

## Configuration

| Env var | Default | Purpose |
|---|---|---|
| `LANDSRAAD_COUNCIL_ROOT` | `process.cwd()` | The directory Landsraad treats as the council root. |
| `PORT` | `10191` | Port the production server (`npx landsraad`) listens on. |

When you run `npx landsraad`, the server opens your default browser to the council URL once it's listening. Set `PORT` (or any prior `PORT` env value) to override.

## Tests

```bash
npm test
```

Vitest covers the filesystem layer (`src/lib/server/`).

## Project layout

```
bin/landsraad.js           # npx entry (runs the built server in cwd)
src/
  lib/
    server/                # filesystem-backed council layer (paths, councils, councillors, memory, jobs, runner, indexer)
    types.ts               # shared types
  routes/                  # SvelteKit pages — flat: /, /edit, /councillors/*, /memory/*, /jobs/*
scripts/
  dogfood-init.ts          # seed a council into ./dogfood (or a custom path)
  reindex.ts               # rebuild the semantic index for a council root
SPECIFICATION.md           # what the product is supposed to be
docs/                      # architecture + data model + embeddings notes
```

## License

See [`LICENSE`](./LICENSE).
