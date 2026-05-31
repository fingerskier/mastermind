# 🏛️ Landsraad

A local-first AI council chamber. Configure councillors, give them jobs, watch the council work.

Everything runs **on your own computer**. No account. No cloud. No tracking. The council files live in a folder you pick.

---

## 🚀 Getting started (the simple version)

You don't need to be a programmer. Three steps.

### 1. Install Node.js

Landsraad runs on **Node.js** (a free program for running JavaScript apps).

- Go to **[nodejs.org](https://nodejs.org)**
- Download the **LTS** version (the big green button) for your computer
- Run the installer, click *Next* through the defaults, and finish

> 💡 You only ever do this once. Need version **20 or newer** — the LTS download is always fine.

### 2. Open a terminal

This is the text window where you type commands.

- **Windows:** press the Start button, type `PowerShell`, press Enter.
- **Mac:** press `⌘ + Space`, type `Terminal`, press Enter.

### 3. Make a folder and start the council

Copy these lines into the terminal, one at a time, pressing Enter after each:

```bash
mkdir my-council
cd my-council
npx landsraad
```

What just happened:

- `mkdir my-council` 📁 — makes a new folder called *my-council*. **This folder is your council.** Everything the council remembers lives inside it.
- `cd my-council` 🚶 — steps into that folder.
- `npx landsraad` ▶️ — downloads and starts Landsraad. The first run takes a minute; later runs are quick.

When it's ready it prints a web address (like `http://localhost:10191`) and opens your browser. Fill in the setup form and you're off. 🎉

### Coming back later

Want a new council? Make a new folder and run `npx landsraad` inside it. Want to return to an old one? Open a terminal, `cd` into that folder, and run `npx landsraad` again. **One folder = one council.**

To stop the council, click the terminal window and press `Ctrl + C`.

---

## What's here

- A SvelteKit + TypeScript app you run locally.
- **One council per directory.** When you run `npx landsraad`, the current working directory **is** the council — `council.json`, `councillors/`, `memory/`, `jobs/`, `.index/` all sit at cwd.
- No accounts, no cloud, no telemetry. You are the only user. You are also the secretary.

---

# 🛠️ Technical reference

Everything below is for developers, tinkerers, and tooling. The simple instructions above are all most people need.

## Quickstart

Requires Node.js 20+.

```bash
mkdir my-council && cd my-council
npx landsraad
```

Open the URL it prints. The setup form creates `council.json` in the current directory.

## Development

Clone the repo and run the dev server straight from the source — no build step, no `npx`:

```bash
git clone <repo> && cd landsraad
npm install
npm run dev
```

Open the URL it prints (Vite picks a port, usually `http://localhost:5173`).

**`npm run dev` turns the cloned repo into a throwaway test council.** Because a council root is just `process.cwd()`, the dev server treats the repo checkout itself as the council. The first time you create councillors, jobs, or run a meeting, the app scaffolds the council files **right in your clone**:

```
council.json      councillors/   memory/
jobs/             proposals/     meetings/      .index/
```

All of these are **gitignored** (see [`.gitignore`](./.gitignore)), so your local experimentation never shows up in `git status` and can't be committed by accident. Hack freely — it's a scratch council.

### Target a different council directory

```bash
LANDSRAAD_COUNCIL_ROOT=/path/to/council npm run dev
```

### Seed a richer dogfood council

```bash
npm run dogfood:init        # creates ./dogfood from templates/dogfood.template.json
cd dogfood && npx landsraad # or: LANDSRAAD_COUNCIL_ROOT=./dogfood npm run dev
```

### Wipe the test council

Scratch council got messy? Reset it:

```bash
npm run reset               # same as `landsraad reset`, uses repo source — no build/install needed
```

Honors `LANDSRAAD_COUNCIL_ROOT` (so `LANDSRAAD_COUNCIL_ROOT=./dogfood npm run reset` wipes the dogfood council instead of the repo-root one).

## Configuration

| Env var | Default | Purpose |
|---|---|---|
| `LANDSRAAD_COUNCIL_ROOT` | `process.cwd()` | The directory Landsraad treats as the council root. |
| `PORT` | `10191` | Starting port the production server (`npx landsraad`) listens on. If the port is already in use it scans up to 100 ports forward and binds the next free one — running multiple councils in parallel just works. |
| `LANDSRAAD_INSTANCES_FILE` | `~/.landsraad/instances.json` | Cross-instance registry. Each running `npx landsraad` writes its `{ pid, port, cwd, startedAt }` here on listen and removes it on shutdown; dead entries are pruned lazily on read. |

When you run `npx landsraad`, the server opens your default browser to the council URL once it's listening. Set `PORT` to override the starting port.

## Running instance registry

`GET /api/instances` returns the live set of running Landsraad processes on this machine:

```bash
curl http://localhost:10191/api/instances
# { "instances": [ { "pid": 12345, "port": 10191, "cwd": "...", "startedAt": "2026-..." }, ... ] }
```

The registry is shared via the file at `LANDSRAAD_INSTANCES_FILE`, so each instance sees the others. Crashed processes are pruned by PID liveness on every read.

### Cross-council meetings

Multiple councils running at once on the same machine can hold a **cross-council meeting**: when you create a meeting, the New Meeting page lists councillors from other running councils under "Remote councils". A remote attendee runs on its own council (its persona, memory, and adapter); your council orchestrates the meeting and owns the transcript. Summons are loopback-only — the server binds `127.0.0.1` and refuses cross-machine summon requests.

## API discovery

`GET /api/openapi.json` returns an OpenAPI 3.1 document describing the JSON `/api/*` surface — handy for tooling, codegen, or quick discovery:

```bash
curl http://localhost:10191/api/openapi.json | jq .paths
```

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
