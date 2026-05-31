# Landsraad — Specification

Status: v1 (council + councillor + jobs + shared & private memory + reflection + agent proposals + council templates + adapters + activity dashboard + schedules + meetings). High-level only. Implementation details live in `docs/` and in code.

---

## What it is

Landsraad is a local-first **council** of AI agents working toward a common goal.
A council is a group of agents working with a human director (you).
The app is an `npx`-launchable Node.js + TypeScript application (SvelteKit) that lets the director configure councillors, **assign jobs to them, keep shared memory, and watch the council work**.

**One council per working directory.** When you run `npx landsraad`, the current working directory **is** the council root — `council.json`, `councillors/`, `memory/`, `jobs/`, and `.index/` all sit at _cwd_.
Want more than one council?
Use more than one directory.

---

## TBD
- No provider-native SDK code yet.  v1 invokes adapters as **subprocesses** (CLI tools).  SDK adapters land in a future spec.
- No remote provider permission/auth orchestration. If a CLI needs login, the user logs in once outside Landsraad.

---

## Target Users

### Solo Operator

A founder, investor, researcher, or independent professional who wants a small council of agents to help think, plan, research, and execute.

### Small Team

A team that wants repeatable AI-assisted workflows for operations, research, reporting, strategy, or project management, with one designated director and file sharing handled outside Landsraad.

### Technical Power User

A user comfortable editing markdown, JSON, and CSV files who wants a transparent local system instead of a black-box hosted agent product.

---

## Core Concepts

### Director

The human user.
The director creates councils, configures councillors, writes jobs, reviews outputs, edits shared memory, and handles real-world execution.
The director also performs all coordination work — there is no secretary agent.

### Council

A configured group of councillors plus the state that supports them: jobs, shared memory, run artifacts. A council **is** a directory on disk. The Landsraad app, when launched, operates against the council at its current working directory.

### Councillor

A named council member with a role, persona (markdown), and an **adapter** that says how to actually invoke them. Councillors own domain work in their area of responsibility. A councillor also carries a free-form `routing_hint` string used by the auto-generated council roster (see [Roster](#roster)) so other councillors can route follow-up jobs to them.

### Adapter

The bridge between a councillor and an actual model invocation. v1 supports two adapter kinds, identified by the councillor's `adapter` string:

| Adapter string | What it does |
|---|---|
| `mock:local` | Deterministic in-process stub. Echoes a structured response. Used for tests + offline demos + dogfooding without a real CLI installed. |
| `cli:claude` | Spawns `claude -p <prompt>` as a subprocess, captures stdout. |
| `cli:codex` | Spawns `codex exec <prompt>` as a subprocess, captures stdout. |
| `cli:gemini` | Spawns `gemini` (Gemini CLI) in headless mode, pipes the prompt via stdin, captures stdout. |
| `cli:qwen` | Spawns `qwen` (Qwen Code, a Gemini CLI fork) in headless mode, pipes the prompt via stdin, captures stdout. |
| `cli:aider` | Spawns `aider --message <prompt> --yes` (Aider) for one headless turn, captures stdout. |
| `cli:grok` | Spawns `grok --prompt <prompt>` (xAI Grok CLI) in headless mode, captures stdout. |
| *(empty)* | The councillor cannot be run. Jobs assigned to them stay queued until the adapter is set. |

CLI adapters inherit the user's environment (so auth set up outside Landsraad just works). They run with `cwd` set to the council directory so the CLI can read memory files relative to a known root.

Some CLIs need a one-time interactive run before they work headlessly: **Codex**, **Gemini**, and **Qwen** establish trust/auth per working directory, so run them once from the council folder first. **Grok** is brand-new official xAI tooling with no stable npm package yet (see <https://x.ai/cli>). **Aider** needs a model API key env var, treats the council folder as a git repo, and may auto-commit edits. The help page surfaces these as per-adapter "Heads up" notes.

> **Not an adapter:** [VibeCLI](https://github.com/andrewmd/vibecli) is a one-line installer/launcher for other agents (Claude, Codex, Gemini, Qwen, …), not an agent that takes a prompt and streams a response, so it does not fit the `Adapter` contract. Use it to install the CLIs above, then pick the matching adapter.

A future SDK adapter family (`sdk:anthropic`, `sdk:openai`) will use the same `Adapter` interface and slot in without breaking the job runner.

### Job

A unit of work the director gives to one councillor. A job has a brief (free-form markdown prompt from the director), an assigned councillor, and a status:

- `queued` — created, not yet running.
- `running` — adapter has been invoked.
- `succeeded` — adapter completed normally.
- `failed` — adapter exited non-zero or threw.
- `cancelled` — director cancelled before/during the run.

Jobs are one-shot. To repeat a job, the director clones it. Jobs are scoped to one council.

### Schedule

A declaration that a job should be created at a future time (`kind: "once"`) or on a cron expression (`kind: "recurring"`). Schedules spawn jobs on the in-process tick loop (30s resolution) and otherwise leave the job lifecycle unchanged. Cron expressions are 5-field, interpreted in the system local TZ. Schedules with `enabled: false` do not fire. On `kind: "once"` fire, the schedule auto-disables and records `fired_at` + `last_fire_job_id`.

If the app was down at a fire time, startup logs a single `missed_fires` event per stale schedule and advances `next_fire_at` to the next future occurrence — no replay. If a recurring fire is due but the prior spawned job is still `running` on the same councillor, the fire is skipped (`skipped_overlap` event) and `next_fire_at` advances.

### Memory

Two tiers, both markdown on disk:

- **Shared council memory** — `<council>/memory/*.md`. Visible to every councillor.
- **Private per-councillor memory** — `<council>/councillors/<slug>/memory/*.md`. Visible only to that councillor at prompt-assembly time. Created exclusively by reflection (see below); edit and delete via the UI.

Prompt assembly is top-K semantic retrieval against the sqlite-vec index — `MEMORY_TOPK_SHARED` shared hits + `MEMORY_TOPK_PRIVATE` private hits, capped by `MEMORY_CHAR_BUDGET` total characters (see `src/lib/server/config.ts`). If the index is empty or embedding fails, assembly falls back to "all shared notes verbatim." See [`docs/embeddings.md`](docs/embeddings.md) for chunk kinds and storage.

### Reflection

After a job transitions to `succeeded`, the runner makes one extra adapter call to the same councillor with a fixed reflection prompt (`src/lib/server/reflection.ts`). The prompt includes the job's `transcript.md` + `output.md` and asks for zero or more agent → host blocks (see [Agent Proposals](#agent-proposals)). Reflection is opt-out per councillor (`councillor.json` `reflect: boolean`, default `true`). Failed/cancelled jobs skip reflection. Reflection failure is non-fatal; it appends a `reflection_failed` event and leaves the job `succeeded`.

### Agent Proposals

Reflection (and, eventually, any adapter response slot the host chooses to scan) parses fenced blocks of the form:

```
<<MEMORY title="...">>
body markdown
<</MEMORY>>

<<JOB title="..." councillor="optional-slug" priority="normal">>
brief markdown
<</JOB>>
```

- **`<<MEMORY>>`** — applied directly. Defaults to the councillor's private memory dir (indexed under `memory_private`). `scope="shared"` writes to the council-wide `memory/` dir instead (indexed under `memory`). Title collisions in either scope get a `-2`, `-3` suffix. The block parser is regex-tolerant of leading whitespace and trailing prose; unrecognized tags are ignored (forward-compat). Cleanup/dedupe of repeated shared writes is a deferred follow-up.
- **`<<JOB>>`** — lands as a *proposal*, not a direct mutation. The host writes `<council>/proposals/jobs/<timestamp>-<slug>.json` with `status: "pending"` and appends a `proposed_job` event to the source job. The director reviews at `/proposals` and approves (creating the job via the normal job-creation path) or rejects. Unknown `councillor` slugs are flagged in the review UI for reassignment before approval. The review-queue gate is the only loop-breaker; no automated cap in v1.

### Roster

A terse auto-generated roster of every councillor — one line per councillor of the form `<slug> — <name> — <role> — <routing_hint>` — is injected into each prompt between the persona and the memory sections. Source: `listCouncillors()`. Self is included; the header is emitted even for a one-councillor council so the format stays stable. This is what makes `<<JOB councillor="other-slug">>` land on real slugs.

### Council Template

A reusable, shareable definition of a council type — councillor roles, personas, default adapter expectations, and starter scaffolding. Single JSON file (`*.template.json`); see [`src/lib/server/templates.ts`](src/lib/server/templates.ts) for the schema. Templates must never contain user private data, operational history, business-specific facts, secrets, customer information, financial data, or other PII — the exporter enforces this through opt-in selection (councillors checked by default; memory and queued jobs unchecked).

- **Install** — `npx landsraad init <source>` (URL or local path) or the `/import` route. Loader fetches with a 10s timeout, ≤2MB, ≤3 redirects. Preview-then-confirm: `planApply` returns adds/overwrites/skips; `applyTemplate` requires `confirmedOverwrite: true` if any overwrite is planned (otherwise throws `TemplateNeedsConfirmation`). Sample jobs are queued only when the council's `jobs/` directory is empty (so templates never pollute history). Run artifacts and `.index/` are never touched. The installed council's `template` field is set to `"<template.name>@<template.version>"` for provenance.
- **Export** — `npx landsraad export <out.json>` or the `/export` route. Picker selects councillors / memory notes / queued jobs. Job artifacts (`input.md`, `transcript.md`, `output.md`, `events.jsonl`) are never exported.

`templates/dogfood.template.json` is the in-repo built-in (replaces the previous imperative `scripts/dogfood-init.ts` seeder).

### Meeting

A multi-turn round-table among councillors with the director participating each round. The director picks a chair, a topic, and attendees. Each round the director speaks first (or skips), then attending councillors speak in randomized order. When the director ends the meeting, the chair writes a synthesis that is scanned for `<<MEMORY>>` / `<<JOB>>` blocks via the existing reflection plumbing. Topic, per-turn transcript, rolling summary, and synthesis are embedded into the memory index so future jobs can retrieve them. While running, the meeting holds the busy-slot for every attendee; jobs assigned to in-meeting councillors stay `queued` until the meeting ends.

A meeting may include **remote attendees** — councillors belonging to other councils running on the same machine. When a remote attendee's turn comes up, the host summons it over a loopback-only HTTP API (`POST /api/meeting/turn`); the peer runs that councillor with its own persona, memory, adapter, and cwd, and returns the turn text. The host owns the transcript, chair, synthesis, and reflection; the peer only logs participation. Discovery uses the running-instance registry (`/api/instances` → `/api/council` → `/api/peers`). Servers bind `127.0.0.1` and the summon endpoint rejects non-loopback callers, so cross-machine summons are refused.

#### Cross-council API endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/council` | Returns `{ slug, name, councillors: [{slug, label, adapter, busy}] }` — this council's identity and live roster. |
| `GET` | `/api/peers` | Returns `{ peers: Peer[] }` where each `Peer = {council_slug, name, cwd, port, councillors: [{slug, label, adapter, busy}]}`. Discovered via the instance registry; self excluded; unreachable instances dropped. |
| `POST` | `/api/meeting/turn` | **Loopback-only** (non-loopback callers receive 403). Body `{ meeting_id, host_council, councillor_slug, context: {title, topic, summary, recent_turns, speaker_instruction} }`. Runs one councillor turn locally and returns `{ ok:true, text, duration_ms }` or `{ ok:false, exit_code, detail }`. Returns 409 if the councillor is busy, 400 on bad/oversized/path-traversal identifiers, 404 if the councillor doesn't exist. |

### Dogfood Council

A built-in council for testing Landsraad itself. The CLI command `npm run dogfood:init [path]` seeds the target directory (default `./dogfood`) with two `mock:local` councillors, one shared memory note, and one sample job. From there, `cd dogfood && npx landsraad` (or `LANDSRAAD_COUNCIL_ROOT=./dogfood npm run dev` from the repo) operates against it. This is what the director uses to exercise the app without burning real-CLI tokens.

## v1 Functionality

1. **Launch the app.** `npx landsraad` from the council directory (or `npm run dev` from the repo for development).
2. **Create or edit the council.** If `council.json` is missing, `/` shows a setup form with a blank-create option *and* an "Install from template" option. Otherwise it's the council home.
3. **Manage councillors.** CRUD on a councillor's name, role, routing_hint, persona, adapter string, and `reflect` opt-out flag.
4. **Manage shared memory.** CRUD on `*.md` notes under `memory/`.
5. **Create and run jobs.** Pick a councillor, write a brief, submit. The runner picks up queued jobs and invokes the councillor's adapter. Status updates land on disk; the UI polls for live updates while a job is running.
6. **Reflection.** Successful jobs trigger one extra adapter call that may emit `<<MEMORY>>` (applied directly to private memory; `scope="shared"` routes to council-wide memory instead) and `<<JOB>>` blocks (proposals).
7. **Review proposals.** `/proposals` lists pending `<<JOB>>` proposals with approve / reject actions; approval routes through the same job-creation path as the UI.
8. **Activity view.** The council page shows each councillor's recent jobs with status badges and timestamps.
9. **Per-job artifacts.** Each run leaves `input.md` (the assembled prompt), `transcript.md` (raw adapter output), `output.md` (final response or summary), `events.jsonl` (state transitions), and `job.json` (metadata, including `memory_slugs` and `shared_memory_slugs` for reflection-created entries).
10. **Install / export templates.** `npx landsraad init <source>` and `npx landsraad export <out.json>` (or `/import` and `/export` in the UI). `npm run dogfood:init` installs `templates/dogfood.template.json` into `./dogfood`.
11. **Schedules.** Declare future or recurring work via `/schedules` (or "Save as schedule" on `/jobs/new`). The in-process scheduler ticks every 30s, spawning jobs on the configured councillor.
12. **Meetings.** Convene a round-table at `/meetings/new`. Director participates each round; councillors speak in random order; chair writes a synthesis on end that is parsed for `<<MEMORY>>` / `<<JOB>>` blocks. Topic, transcript, summary, and synthesis are embedded into the memory index.

## Storage Model

The council root is the current working directory of the Landsraad process. Override with `LANDSRAAD_COUNCIL_ROOT=<path>` for tests or to point a dev server at a non-cwd council.

```
<council-root>/                  # = process.cwd() (or LANDSRAAD_COUNCIL_ROOT)
  council.json                   # slug, name, description, template, created_at
  councillors/
    <councillor-slug>/
      councillor.json            # slug, name, role, routing_hint, adapter, reflect, created_at
      persona.md
      memory/                    # private per-councillor memory
        <entry-slug>.md
  memory/
    <note-slug>.md               # shared notes
  jobs/
    <job-id>/                    # job-id is timestamped + slugged
      job.json                   # id, title, councillor_slug, status, *_at, exit_code?, memory_slugs?, shared_memory_slugs?
      input.md                   # assembled prompt sent to the adapter
      transcript.md              # raw stdout (and stderr) from the adapter
      output.md                  # final response (often === transcript.md, possibly trimmed)
      events.jsonl               # one line per state transition or progress event
  proposals/
    jobs/
      <timestamp>-<slug>.json    # <<JOB>> proposals; status pending|approved|rejected
  schedules/
    <schedule-id>.json           # one declaration per file
    <schedule-id>.events.jsonl   # fire / skip / error log
  meetings/
    <meeting-id>/                # meeting-id is timestamped + slugged
      meeting.json               # id, title, chair_slug, attendees, status, window_k, *_at, memory_slugs?, shared_memory_slugs?, proposed_jobs?
      topic.md                   # director's brief for the round-table
      transcript.md              # per-turn blocks appended as the meeting progresses
      summary.md                 # chair-written rolling summary of displaced turns
      synthesis.md               # chair-written closing synthesis (scanned for <<MEMORY>>/<<JOB>>)
      events.jsonl               # one line per state transition or turn event
  .index/
    embeddings.db                # sqlite-vec index; regenerable
```

Job IDs are `<UTC-timestamp>-<title-slug>` (e.g. `2026-05-22T14-30-00Z-q1-summary`) — sortable, human-readable, unique enough for one-director scale.

The app never writes outside the council root. It never writes secrets to disk. Subprocess environment is inherited unchanged.

## Runner semantics (v1)

- One in-process scheduler inside the SvelteKit server. No separate worker process.
- At most one running job per councillor. Multiple councillors in the same council can run in parallel.
- Newly created jobs trigger a pickup tick. Crashed/orphaned `running` jobs at server start are not auto-resumed; they are flipped to `failed` with a note (no resume in v1).
- The runner spawns the adapter with `cwd` = the council directory and `env` = the SvelteKit server's env. stdout/stderr stream into `transcript.md`. On exit, the runner writes `output.md`, sets status, appends a final event.
- Cancellation: form action sends SIGTERM. After a short grace window, SIGKILL.

## UI Surfaces (v1)

| Route | Purpose |
|---|---|
| `/` | Setup form (no `council.json`, blank-create or install-template) or council home (metadata · councillors · activity · jobs · memory · pending-proposal badge) |
| `/edit` | Edit council |
| `/councillors/new` | Add councillor |
| `/councillors/[c-slug]` | View councillor + their jobs + private memory |
| `/councillors/[c-slug]/edit` | Edit councillor |
| `/councillors/[c-slug]/memory/[note]` | View / edit private memory entry |
| `/memory/new` | Add shared memory note |
| `/memory/[note]` | View / edit shared memory note |
| `/jobs/new` | Create job |
| `/jobs/[jid]` | Job detail: brief, transcript, output, status, reflection-created memories, emitted proposals. Auto-refreshes while `running`. |
| `/proposals` | Pending `<<JOB>>` proposals — approve / reject |
| `/import` | Install a council template (URL, local path, or file upload) — preview then confirm |
| `/export` | Export the current council to a `*.template.json` |
| `/schedules` | List schedules; enable / disable; delete |
| `/schedules/new` | Create a schedule |
| `/schedules/[id]` | Schedule detail: definition, next-N fires, recent events, spawned job links |
| `/schedules/[id]/edit` | Edit a schedule |
| `/meetings` | List meetings with status + round + turn count |
| `/meetings/new` | Convene a meeting: title, topic, chair, attendees, window_k |
| `/meetings/[id]` | Meeting detail: live transcript, director speak/skip, end / cancel / resume |

A persistent header links back to `/`; the council home is the working surface.

## Out of Scope (will be specified later)

- SDK adapters (`sdk:anthropic`, `sdk:openai`, …)
- Per-schedule TZ; sub-minute resolution
- Schedule proposals from reflection (`<<SCHEDULE …>>`)
- Schedule export/import in council templates
- Projects (a layer above jobs that group related work)
- Memory TTL / decay / consolidation (sleep/dream)
- Promote-existing-private → shared (only emission-time `scope="shared"` ships); auto-approval / per-councillor trust tiers; mid-job proposals; cross-council proposal sharing
- Per-councillor reflection-prompt overrides
- Memory-budget UI; per-job opt-out of memory inclusion
- Authenticated template fetch, template registry / marketplace, single-action "publish to gist"
- Permissions / audit log for risky tool use
- Multi-user, auth, remote hosting

## Open Questions

- How big is too big for memory before retrieval starts dropping signal? Tune `MEMORY_TOPK_*` and `MEMORY_CHAR_BUDGET` empirically; expose UI if needed.
- How should we surface CLI auth failures (e.g., `claude` returns "not logged in") so the director knows what to fix?
- Should reflection ever run on `failed` or `cancelled` jobs (e.g., to capture "what went wrong" memories)?
- Dedupe of repeated `<<JOB>>` proposals on the same `(title, source_councillor)`?

These are flagged here so they aren't lost.
