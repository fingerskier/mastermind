# Landsraad

A local-first AI council chamber. Create councils, configure councillors, and (eventually) put them to work.

> Status: **v0 — management surface only.** Agent execution, jobs, memory, and adapters are not implemented yet. See [`SPECIFICATION.md`](./SPECIFICATION.md) for the full scope and what's deliberately out of scope.

## What's here

- A SvelteKit + TypeScript app you run locally.
- Filesystem persistence — every council is a directory under `~/.landsraad/councils/` (configurable).
- No accounts, no cloud, no telemetry. You are the only user. You are also the secretary.

## Quickstart

Requires Node.js 20+.

```bash
npm install
npm run dev
```

Open the URL it prints (usually <http://localhost:5173>).

### Production-ish run

```bash
npm install
npm run build
npm start
```

### `npx landsraad`

Once published, `npx landsraad` will start the production server. For now the bin script (`bin/landsraad.js`) only works after `npm run build`.

## Configuration

| Env var | Default | Purpose |
|---|---|---|
| `LANDSRAAD_COUNCILS_ROOT` | `~/.landsraad/councils` | Where councils are stored on disk. |

## Tests

```bash
npm test
```

Vitest covers the filesystem layer (`src/lib/server/`).

## Project layout

```
bin/landsraad.js           # npx entry (runs the built server)
src/
  lib/
    server/                # filesystem-backed councils + councillors
    types.ts               # shared types
  routes/                  # SvelteKit pages
SPECIFICATION.md           # what the product is supposed to be
docs/                      # architecture + data model notes
```

## License

See [`LICENSE`](./LICENSE).
