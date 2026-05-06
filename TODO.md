# TODO

Next phases after the CLI MVP vertical slice.

## Phase 1: Local Dashboard

- [x] Add `landsraad dashboard` and `landsraad --council <path> dashboard`.
- [x] Start a local Fastify API scoped to one council root.
- [x] Serve a bundled Vite/React UI from the CLI.
- [x] Add API endpoints for council config, Secretary, agents, jobs, projects, memory, runs, and retrieval search.
- [x] Add run detail view showing `input.md`, `transcript.md`, `output.md`, `events.jsonl`, and `run.json`.
- [x] Add structured dashboard object validation and fallback JSON rendering for forms, tables, charts, and status cards.
- [x] Add Playwright evaluation against a dogfood council dashboard.

Done when the dogfood council can be opened locally and used to inspect agents, jobs, runs, memory, and the latest MVP run output.

## Phase 2: Scheduler Execution Loop

- [x] Add scheduler state management under `.landsraad/scheduler.json`.
- [x] Use an established cron parser/scheduler package for five-field cron expressions.
- [x] Add CLI commands to start the scheduler for an explicit council root.
- [x] Register recurring jobs from `council/jobs/*/job.json`.
- [x] Execute due jobs through the same internal `runJob` path used by `landsraad job run`.
- [x] Record scheduler events in `.landsraad/logs/` and each run directory.
- [x] Keep external cron usage supported through `landsraad --council <path> job run <job-id>`.

Done when a recurring dogfood job runs from the scheduler with durable run artifacts and no ambiguity about council root.

## Phase 3: Provider Preset Hardening

- [x] Implement first-class CLI presets in order: Claude, Codex, Gemini.
- [x] Keep the generic command adapter available for unsupported CLIs.
- [x] Normalize preset config for command, args, stdin behavior, working directory, timeout, and output capture.
- [x] Detect missing executables and provider auth/setup failures with explicit adapter error codes.
- [x] Preserve provider transcripts and record provider-managed permission events when visible.
- [x] Map Landsraad permission decisions into adapter behavior without treating provider-local files as canonical state.
- [x] Add fixture-style tests for adapter command resolution and failure handling.
- [x] Add dogfood smoke commands for at least one real provider preset, with `--adapter local` retained for offline tests.

Done when the same configured job can run through `local` and at least one real provider preset while producing comparable run records.
