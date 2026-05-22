# Landsraad — Specification

Status: v1 (council + councillor + jobs + memory + adapters + activity dashboard). High-level only. Implementation details live in `docs/` and in code.

## What it is

Landsraad is a local-first, single-directory **council chamber** for AI agents. A council is a group of agents working with a human director (you). The app is an `npx`-launchable Node.js + TypeScript application (SvelteKit) that lets the director create councils, configure councillors, **assign jobs to them, keep shared memory, and watch the council work**.

## Non-goals (still)

- No "Secretary" singleton agent. The director **is** the secretary.
- No multi-user, no auth, no remote hosting. One operator, one machine.
- No provider-native SDK code yet. v1 invokes adapters as **subprocesses** (CLI tools). SDK adapters land in a future spec.
- ~~No retrieval index, no embeddings.~~ Retrieval index landing in v2 (see `docs/embeddings.md`): per-council libsql + sqlite-vec, on-write hooks, `npm run reindex` for backfill. Memory still lives as plain markdown — the index is regenerable cache.
- No cron / recurring jobs. v1 jobs are one-shot.
- No remote provider permission/auth orchestration. If a CLI needs login, the user logs in once outside Landsraad.

## Target Users

### Solo Operator

A founder, investor, researcher, or independent professional who wants a small council of agents to help think, plan, research, and execute.

### Small Team

A team that wants repeatable AI-assisted workflows for operations, research, reporting, strategy, or project management, with one designated director and file sharing handled outside Landsraad.

### Technical Power User

A user comfortable editing markdown, JSON, and CSV files who wants a transparent local system instead of a black-box hosted agent product.

## Core Concepts

### Director

The human user. The director creates councils, configures councillors, writes jobs, reviews outputs, edits shared memory, and handles real-world execution. The director also performs all coordination work — there is no secretary agent.

### Council

A configured group of councillors plus the per-council state that supports them: jobs, shared memory, run artifacts. Each council lives in its own directory on disk; the director can have many councils.

### Councillor

A named council member with a role, persona (markdown), and an **adapter** that says how to actually invoke them. Councillors own domain work in their area of responsibility.

### Adapter

The bridge between a councillor and an actual model invocation. v1 supports two adapter kinds, identified by the councillor's `adapter` string:

| Adapter string | What it does |
|---|---|
| `mock:local` | Deterministic in-process stub. Echoes a structured response. Used for tests + offline demos + dogfooding without a real CLI installed. |
| `cli:claude` | Spawns `claude -p <prompt>` as a subprocess, captures stdout. |
| `cli:codex` | Spawns `codex exec <prompt>` as a subprocess, captures stdout. |
| *(empty)* | The councillor cannot be run. Jobs assigned to them stay queued until the adapter is set. |

CLI adapters inherit the user's environment (so auth set up outside Landsraad just works). They run with `cwd` set to the council directory so the CLI can read memory files relative to a known root.

A future SDK adapter family (`sdk:anthropic`, `sdk:openai`) will use the same `Adapter` interface and slot in without breaking the job runner.

### Job

A unit of work the director gives to one councillor. A job has a brief (free-form markdown prompt from the director), an assigned councillor, and a status:

- `queued` — created, not yet running.
- `running` — adapter has been invoked.
- `succeeded` — adapter completed normally.
- `failed` — adapter exited non-zero or threw.
- `cancelled` — director cancelled before/during the run.

Jobs are one-shot. To repeat a job, the director clones it. Jobs are scoped to one council.

### Memory

`<council>/memory/*.md` — shared markdown notes. Every job invocation passes the council's memory to the adapter as part of the prompt context. The director (and, later, councillors themselves) can create, edit, and delete memory notes. There is no embedding/retrieval layer in v1; the whole memory directory is included on every run. Keep it small.

### Council Template

A reusable, shareable definition of a council type — councillor roles, personas, default adapter expectations, and starter scaffolding. Templates must never contain user private data, operational history, business-specific facts, secrets, customer information, financial data, or other PII. v1 ships one built-in template: **Dogfood** (see below).

### Dogfood Council

A built-in council for testing Landsraad itself. The CLI command `npm run dogfood:init` (and the equivalent `landsraad dogfood-init` once installed) seeds `~/.landsraad/councils/dogfood` with two `mock:local` councillors, one shared memory note, and one sample job. This is the council the director uses to exercise the app without burning real-CLI tokens.

## v1 Functionality

1. **Launch the app.** `npm run dev` from the repo (eventually `npx landsraad`).
2. **Manage councils.** Create, view, edit, delete. List on `/`.
3. **Manage councillors.** Inside a council. Same CRUD, plus the adapter string.
4. **Manage shared memory.** Inside a council. CRUD on `*.md` notes.
5. **Create and run jobs.** Inside a council: pick a councillor, write a brief, submit. The runner picks up queued jobs and invokes the councillor's adapter. Status updates land on disk; the UI polls for live updates while a job is running.
6. **Activity view.** The council page shows each councillor's current job (or "idle"), plus a list of recent jobs with status badges and timestamps.
7. **Per-job artifacts.** Each run leaves `input.md` (the assembled prompt), `transcript.md` (raw adapter output), `output.md` (final response or summary), `events.jsonl` (state transitions), and `job.json` (metadata).
8. **Seed a dogfood council.** `npm run dogfood:init`.

## Storage Model

```
<councils-root>/
  <council-slug>/
    council.json
    councillors/
      <councillor-slug>/
        councillor.json          # name, role, adapter, created_at
        persona.md
    memory/
      <note-slug>.md             # shared notes
    jobs/
      <job-id>/                  # job-id is timestamped + slugged
        job.json                 # id, title, brief_path, councillor_slug, status, *_at fields, exit_code?
        input.md                 # assembled prompt sent to the adapter
        transcript.md            # raw stdout (and stderr) from the adapter
        output.md                # final response (often === transcript.md, possibly trimmed)
        events.jsonl             # one line per state transition or progress event
```

Job IDs are `<UTC-timestamp>-<title-slug>` (e.g. `2026-05-21T14-30-00Z-q1-summary`) — sortable, human-readable, unique enough for one-director scale.

The app never writes outside `<councils-root>`. It never writes secrets to disk. Subprocess environment is inherited unchanged.

## Runner semantics (v1)

- One in-process scheduler inside the SvelteKit server. No separate worker process.
- At most one running job per councillor. Multiple councillors in the same council can run in parallel.
- Newly created jobs trigger a pickup tick. Crashed/orphaned `running` jobs at server start are not auto-resumed; they are flipped to `failed` with a note (no resume in v1).
- The runner spawns the adapter with `cwd` = the council directory and `env` = the SvelteKit server's env. stdout/stderr stream into `transcript.md`. On exit, the runner writes `output.md`, sets status, appends a final event.
- Cancellation: form action sends SIGTERM. After a short grace window, SIGKILL.

## UI Surfaces (v1)

| Route | Purpose |
|---|---|
| `/` | Council list |
| `/councils/new` | Create council |
| `/councils/[slug]` | Council home: metadata · councillors · activity · jobs · memory |
| `/councils/[slug]/edit` | Edit council |
| `/councils/[slug]/councillors/new` | Add councillor |
| `/councils/[slug]/councillors/[c-slug]` | View councillor + their jobs |
| `/councils/[slug]/councillors/[c-slug]/edit` | Edit councillor |
| `/councils/[slug]/memory/new` | Add memory note |
| `/councils/[slug]/memory/[note]` | View / edit memory note |
| `/councils/[slug]/jobs/new` | Create job |
| `/councils/[slug]/jobs/[jid]` | Job detail: brief, transcript, output, status. Auto-refreshes while `running`. |

A persistent header links back to `/`; the council page is the working surface.

## Out of Scope (will be specified later)

- SDK adapters (`sdk:anthropic`, `sdk:openai`, …)
- Cron / recurring jobs / scheduler
- Projects (a layer above jobs that group related work)
- Per-councillor private memory
- Retrieval index over memory
- Permissions / audit log for risky tool use
- Templates marketplace, multi-user, auth, remote hosting

## Open Questions

- Should memory inclusion be opt-in per job (a checkbox at submit) rather than always-on? Cheap to flip later.
- How big is too big for memory before we need retrieval? Probably the first time a memory directory exceeds the adapter's context budget.
- How should we surface CLI auth failures (e.g., `claude` returns "not logged in") so the director knows what to fix?

These are flagged here so they aren't lost.
