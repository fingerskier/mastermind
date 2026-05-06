# landsraad
AI Council Chamber

## Features

Landsraad is a system for hosting AI agent councils to work with.
A couple example use cases include:
- C-suite business operations
- Hedge fund management
- Research and development

A council will consist of a group of agents, each with their own unique role and expertise, working together to achieve a common goal.
The human agent acts as director- giving guidance, feedback and IRL hands & feet.

An agent has two components:
- A platform, which could be an API/SDK or a local CLI tool
- A persona which defines the agent's role and focii

In the case of a business C-suite you may have a CFO, CTO, CMO, etc.
In the case of a hedge fund you may have a macro strategist, a quant researcher, a risk manager, etc.

Notable examples with similar architectures:
- Paperclip AI ~ agent council for running a business
- TauricResearch ~ agent counci for running a hedge fund

The council itself consists of:
- A group of agents
- A shared memory
- Jobs that need doing

A job is some task performed by an agent with a particular role.
Some jobs may be generic and/or recurring: e.g. some business operations like financial reporting, or some hedge fund operations like risk management.
Some jobs may be ad hoc.

The user creates a council by defining the agents and jobs.
Several pre-canned councils are provided for common use cases, and users can customize as needed.
User will create projects which will worked on by the council

The underlying structure is
- all info contained in a single directory;  user will run `npx landsraad` in that directory to instantiate the council
- shared memory is a slough of markdown, json and/or csv files in that directory
  - there are directories for each job and each agent and can be directories for notable projects or information
- agents have access to those files

A main dashboard will show the status of agents and give the user insights and ways to interact with the council.

## Architecture
- Node.js package with a `landsraad` CLI.
- Local dashboard stack:
  - Vite/React UI
  - Fastify local API
  - REST for commands
  - SSE for live run, permission, scheduler, and index events
- Regular directory/file structure for shared memory; prefer plain text formats like markdown, json and csv
- Rebuildable retrieval index for council files:
  - file watcher and explicit sync
  - chunked text metadata
  - local hashed n-gram embeddings for offline MVP search
  - direct vector search fallback
  - optional FAISS backend later

## Current CLI

From `application/`:

```bash
node bin/landsraad.js --council ../my-council init --template business-operations
node bin/landsraad.js --council ../my-council agent list
node bin/landsraad.js --council ../my-council job list
node bin/landsraad.js --council ../my-council job run weekly-financial-report --adapter local
node bin/landsraad.js --council ../my-council job run weekly-financial-report --adapter codex
node bin/landsraad.js --council ../my-council job proposal list
node bin/landsraad.js --council ../my-council job proposal approve <proposal-id>
node bin/landsraad.js --council ../my-council scheduler start --adapter local
node bin/landsraad.js --council ../my-council scheduler start --once --adapter local --json
node bin/landsraad.js --council ../.dogfood-council memory index sync
node bin/landsraad.js --council ../.dogfood-council memory search "MVP vertical slice" --json
node bin/landsraad.js --council ../.dogfood-council dashboard
```

The retrieval index is derived state stored under `.landsraad/index/retrieval/` in the target council.

`--adapter local` runs the packaged deterministic CLI adapter. It is useful for smoke tests and dogfood runs because it exercises the real job-run path, writes `input.md`, `transcript.md`, `output.md`, `events.jsonl`, `run.json`, and appends permission audit entries without requiring a provider login.

Provider presets are available with `--adapter claude`, `--adapter codex`, and `--adapter gemini`. The configured agent adapter may also use `"preset": "generic"` with an explicit `command` and `args` for unsupported CLIs. Landsraad records the adapter launch permission decision in the run and `.landsraad/logs/permissions.jsonl`; provider-native permission prompts remain provider-managed but visible prompt text is preserved in `transcript.md` and mirrored as `provider-managed-permission` events when detected.

## Scheduler

Recurring jobs use five-field cron expressions in `council/jobs/<job-id>/job.json`:

```json
{
  "type": "recurring",
  "schedule": {
    "type": "cron",
    "expression": "0 9 * * 5",
    "timezone": "local"
  }
}
```

Start the Landsraad-managed scheduler with an explicit council root:

```bash
node bin/landsraad.js --council ../my-council scheduler start
```

The scheduler registers recurring jobs in `.landsraad/scheduler.json`, appends scheduler audit events to `.landsraad/logs/scheduler.jsonl`, and executes due jobs through the same internal path as `job run`. Scheduled runs include `trigger.type: "scheduler"` in `run.json` plus scheduler dispatch and completion events in the run-local `events.jsonl`.

For smoke tests and external service checks, run one pass and exit:

```bash
node bin/landsraad.js --council ../my-council scheduler start --once --adapter local --json
```

Users who prefer OS-level cron can keep calling:

```bash
node bin/landsraad.js --council ../my-council job run <job-id>
```

## Local Dashboard

From `application/`, run the built dashboard against the dogfood council:

```bash
npm run build
npm start
```

For hot reload development, start the Fastify API and Vite UI together:

```bash
npm run dev
```

`npm run dev` serves the UI at `http://127.0.0.1:5173` and proxies `/api` to the dashboard server at `http://127.0.0.1:4173`. Set `LANDSRAAD_COUNCIL`, `LANDSRAAD_DASHBOARD_PORT`, or `LANDSRAAD_UI_PORT` to override the local defaults.

The CLI prints a local URL. The Fastify API serves `/api/overview`, `/api/agents`, `/api/jobs`, `/api/projects`, `/api/memory`, `/api/runs`, `/api/runs/:jobId/:runId`, and `/api/retrieval/search`. The run detail view shows `input.md`, `transcript.md`, `output.md`, `events.jsonl`, and `run.json`.
