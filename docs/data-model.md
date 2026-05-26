# Data model

Everything is on-disk under the **council root**, which is the Landsraad process's cwd (override with `LANDSRAAD_COUNCIL_ROOT`). One council per directory.

## Layout

```
<council-root>/
  council.json
  councillors/
    <councillor-slug>/
      councillor.json
      persona.md
      memory/
        <entry-slug>.md       # private per-councillor memory (reflection-created)
  memory/
    <note-slug>.md             # shared memory
  jobs/
    <job-id>/
      job.json
      input.md
      transcript.md
      output.md
      events.jsonl
  proposals/
    jobs/
      <timestamp>-<slug>.json  # <<JOB>> proposals
  schedules/
    <schedule-id>.json         # one declaration per file
    <schedule-id>.events.jsonl # fire / skip / error log
  .index/
    embeddings.db
```

Councillor, note, and private-memory entry slugs are derived from titles/names via the shared `slugify()` in `src/lib/server/paths.ts`: lowercased, non-alphanumerics collapsed to `-`, capped at 64 chars. Slugs never change after creation — renames update the JSON file's `name` but keep the slug stable. On slug collision during reflection or template install, a `-2`, `-3`, … suffix is appended.

## `council.json`

```json
{
  "slug": "c-suite",
  "name": "C-Suite",
  "description": "Run the business.",
  "template": "c-suite@0.1.0",
  "created_at": "2026-05-21T13:00:00.000Z"
}
```

- `slug` — directory name. Read-only after creation.
- `name` — display name. Editable.
- `description` — free text. Editable.
- `template` — `"<template.name>@<template.version>"` if the council was installed from a template; `null` otherwise.
- `created_at` — ISO 8601 timestamp.

## `councillor.json`

```json
{
  "slug": "cfo",
  "name": "CFO",
  "role": "Chief Financial Officer",
  "routing_hint": "budgets, cash runway, pricing, vendor contracts",
  "adapter": "cli:claude",
  "reflect": true,
  "created_at": "2026-05-21T13:01:00.000Z"
}
```

- `adapter` — free-form string. Conventions: `cli:<name>` (subprocess) or `sdk:<name>` (in-process API client). Empty string means "not configured yet."
- `routing_hint` — terse description used in the auto-generated council roster injected into each prompt. Lets other councillors route `<<JOB councillor="...">>` proposals correctly.
- `reflect` — opt-out flag for the post-job reflection pass. Default `true`. When `false`, the runner skips reflection entirely after this councillor's jobs succeed.

## `persona.md`

The councillor's persona — free-form markdown. The application treats it as opaque text; rendering is deferred to whichever adapter eventually consumes it. The first `# heading` line is treated as the title in indexed chunks.

## Shared memory: `memory/<note-slug>.md`

One markdown file per shared note. First `# heading` is the title; rest is the body. The director (and, later, councillors via promotion) creates/edits/deletes these via the UI.

## Private memory: `councillors/<slug>/memory/<entry-slug>.md`

One markdown file per private memory entry. Same format as shared notes. Created exclusively by reflection (`<<MEMORY>>` blocks parsed from a successful job's reflection output). Edit and delete via the UI; no manual-create form in v1.

## `jobs/<job-id>/job.json`

```json
{
  "id": "2026-05-22T14-30-00Z-q1-summary",
  "title": "Q1 summary",
  "brief": "...",
  "councillor_slug": "cfo",
  "status": "succeeded",
  "created_at": "...",
  "started_at": "...",
  "finished_at": "...",
  "exit_code": 0,
  "error": null,
  "memory_slugs": ["q1-fcf-watchlist", "vendor-renegotiation-window"],
  "reflection_error": null
}
```

- `memory_slugs` — slugs of private memory entries created by this job's reflection (omitted if none).
- `reflection_error` — short message if reflection itself failed (the job still counts as `succeeded`).

`events.jsonl` event types include `created`, `started`, `stdout`, `stderr`, `succeeded`, `failed`, `cancelled`, `note`, `reflected`, `reflection_failed`, and `proposed_job`.

## `proposals/jobs/<timestamp>-<slug>.json`

```json
{
  "id": "2026-05-25T15-16-17-796Z-followup-on-x",
  "kind": "job",
  "proposed_by": "analyst",
  "source_job_id": "2026-05-25T15-08-...",
  "title": "Followup on X",
  "brief": "...",
  "target_councillor": "pm",
  "priority": "normal",
  "status": "pending",
  "created_at": "2026-05-25T15:16:17.796Z"
}
```

`target_councillor` is `null` (unassigned), a councillor slug, or the literal `"all"` for a broadcast. `status` is `pending | approved | rejected`. Approved proposals add `decided_at`, `decided_by`, and `resulting_job_ids`. Rejected proposals add `decided_at`, `decided_by`, and an optional `reason`. Approved/rejected files stay on disk for audit; the review UI hides them from the pending view.

## `schedules/<schedule-id>.json`

```json
{
  "id": "2026-05-26T08-00-00Z-weekly-news",
  "title": "Weekly news",
  "brief": "...",
  "councillor_slug": "analyst",
  "kind": "recurring",
  "fire_at": null,
  "cron": "0 9 * * MON",
  "enabled": true,
  "next_fire_at": "2026-06-01T09:00:00.000Z",
  "last_fire_job_id": null,
  "fire_count": 0,
  "fired_at": null,
  "created_at": "2026-05-26T08:00:00.000Z"
}
```

- `kind` — `"once"` (a single fire at `fire_at`) or `"recurring"` (5-field `cron`, system local TZ).
- `enabled` — false suppresses firing and clears `next_fire_at`.
- `next_fire_at` — recomputed after each fire, on enable/edit, and at startup catch-up.
- `last_fire_job_id` / `fire_count` — bookkeeping for the most recent spawned job.
- `fired_at` — set when a `kind: "once"` schedule auto-disables on its fire.

Schedule IDs are `<UTC-timestamp>-<title-slug>` (mirrors job IDs). Side-channel: `<schedule-id>.events.jsonl` records `created | enabled | disabled | edited | fired | skipped_overlap | missed_fires | fire_error` lines as the schedule runs.

## Invariants

- One council per process. The Landsraad app runs against `cwd` (or `LANDSRAAD_COUNCIL_ROOT`).
- Slugs are unique within their namespace (`councillors/<slug>`, `memory/<slug>`, `councillors/<slug>/memory/<entry-slug>`).
- The app never writes outside the council root.
- Template install never touches `jobs/` run artifacts or `.index/`; sample jobs are queued only when `jobs/` is empty.
- Files are written atomically enough for this single-user case (JSON is replaced wholesale on every update); no file locking.
