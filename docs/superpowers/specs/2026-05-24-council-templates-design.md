# Council Templates — Design

**Date:** 2026-05-24
**Status:** Draft
**Related:** `SPECIFICATION.md` §Core Concepts (Council Template), `scripts/dogfood-init.ts` (to be removed)


## Motivation

`SPECIFICATION.md` defines "Council Template" as a reusable, shareable
definition of a council type, but the only existing implementation is the
imperative `scripts/dogfood-init.ts` seeder. There is no on-disk format,
no way to share a council with another director, and no way for a single
director to stand up the same council shape across multiple working
directories.

This spec adds first-class templates: a single-file JSON format, a
loader that accepts URLs and local paths, an installer with a
preview-then-confirm flow, an opt-in exporter, and a dispatcher on the
`landsraad` bin that exposes both operations.


## Goals

- Personal reuse: `landsraad init <source>` in any empty directory
  produces a working council.
- Sharing: a director can publish a template at any HTTP(S) URL and a
  teammate can install it without cloning anything.
- Round-trip: export a council into a template, install the template,
  end state matches the export selection.
- Safe by default: never destroys job run artifacts; never includes
  user data without an explicit author opt-in.
- Replaces `scripts/dogfood-init.ts` with `templates/dogfood.template.json`
  + the same installer code path (one seed mechanism, not two).


## Non-goals

- Git fetch (`git clone`) — out of scope; raw URL fetch covers the
  dominant sharing path without adding a git binary dependency.
- Authenticated fetches (private repos, gated URLs).
- A template registry or marketplace.
- Per-councillor private memory (`memory_private/`) in templates — these
  are runtime state, not shareable scaffolding.
- Rollback on partial-write failure.


## Template file format

Single JSON file, conventionally `*.template.json`. Hand-validated in
code (matches existing `councils.ts` / `councillors.ts` style; no new
schema-validator dependency).

```ts
// src/lib/server/templates.ts (schema portion)
export interface CouncilTemplate {
  format_version: 1;                    // bump on breaking change
  name: string;                         // human-readable template name
  version: string;                      // template's own version, e.g. "0.1.0"
  description?: string;
  author?: string;
  license?: string;                     // SPDX or free text
  council: {                            // suggestions; renameable on install
    name: string;
    description?: string;
  };
  councillors: Array<{
    slug?: string;                      // optional; derived from name if absent
    name: string;
    role: string;
    routing_hint?: string;
    adapter: string;                    // e.g. "mock:local"
    persona: string;                    // markdown body
    reflect?: boolean;
  }>;
  memory?: Array<{ title: string; body: string }>;     // seed shared notes
  sample_jobs?: Array<{                 // queued only; never run artifacts
    title: string;
    brief: string;
    councillor_slug: string;            // must match a councillors[].slug
  }>;
}
```

**Slug derivation.** Where slugs are absent in the template (councillors
without an explicit `slug`, every memory note since the schema carries
only `title`), apply derives the slug via the existing `slugify()` from
`src/lib/server/paths.ts`, matching how `councillors.ts` and `memory.ts`
already mint slugs from names/titles. Conflict detection uses the
derived slug.

**Provenance.** On install, the council's existing `template` field
(already defined on `Council` in `src/lib/types.ts`) is set to
`"<template.name>@<template.version>"` so the council remembers its
origin.

**PII rule.** Per `SPECIFICATION.md`, templates must never contain user
private data. The exporter enforces this through opt-in selection (see
Export), not auto-detection.


## Module layout

```
src/lib/server/templates.ts       # schema, loader, plan/apply, export, errors
src/lib/server/templates.test.ts  # unit tests
src/routes/import/+page.server.ts # form actions: preview, apply
src/routes/import/+page.svelte    # source input + plan/confirm UI
src/routes/export/+page.server.ts # selection form action, JSON download
src/routes/export/+page.svelte    # picker (councillors / memory / queued jobs)
scripts/template-install.ts       # CLI install (run via vite-node)
scripts/template-export.ts        # CLI export (run via vite-node)
bin/landsraad.js                  # dispatcher: init | export | (default → server)
templates/dogfood.template.json   # in-repo built-in (replaces dogfood-init.ts)
```

Old `scripts/dogfood-init.ts` is deleted; `npm run dogfood:init` becomes
a thin wrapper that runs `template-install` against the bundled JSON.


## Loader

```ts
export async function loadTemplate(source: string): Promise<CouncilTemplate>;
```

- `source` is a URL (`http(s)://...`) or a filesystem path
  (absolute or relative to `process.cwd()`).
- URL fetch: `fetch()` with a 10s `AbortController` timeout, follow up
  to 3 redirects, reject body larger than 2 MB (streamed), require 2xx.
- Path read: `readFile(source, 'utf8')`.
- Parse JSON, then run the schema validator.

Failures throw the named errors below.


## Plan / Apply

Apply is split into a pure `planApply` and a mutating `applyTemplate`
so both UI and CLI can show the same preview before committing.

```ts
export interface ApplyPlan {
  council: { exists: boolean; willOverwrite: boolean };
  councillors: { add: string[]; overwrite: string[] };          // slugs
  memory:      { add: string[]; overwrite: string[] };          // slugs
  sample_jobs: { add: number; skipped_because_jobs_exist: boolean };
}

export async function planApply(t: CouncilTemplate): Promise<ApplyPlan>;

export async function applyTemplate(
  t: CouncilTemplate,
  opts: { confirmedOverwrite: boolean }
): Promise<ApplyPlan>;
```

**Conflict semantics (per-entity overwrite):**

- Council meta: create if missing; on existing council, `council.json`
  is rewritten only if `confirmedOverwrite` is true. Council `slug` is
  preserved if council already exists (rename is a separate flow).
- Councillor with same slug → `councillor.json` + `persona.md` are
  replaced. Other councillors are untouched.
- Memory note with same slug → body replaced.
- `sample_jobs` are queued **only when the council's `jobs/` directory
  is empty**. If any prior jobs exist (queued, running, or finished),
  sample_jobs are skipped entirely so templates never pollute history.
  `ApplyPlan.sample_jobs.skipped_because_jobs_exist` reflects this.
- `jobs/` run artifacts are **never** touched.
- `.index/` is not touched; the existing reindexer picks up new
  memory notes on its next tick.

**Confirmation gate.** If `planApply()` reports any of:
council overwrite, non-empty `councillors.overwrite`, or non-empty
`memory.overwrite` — then `applyTemplate` requires
`confirmedOverwrite: true`. Otherwise it throws
`TemplateNeedsConfirmation` carrying the plan, and the caller (UI or
CLI) is expected to surface it and call again with the flag set.
Empty-council installs need no confirmation.

**No transaction.** Writes are sequential; mid-apply failure leaves
partial state visible. Consistent with the rest of the app (jobs/memory
writes are also non-transactional). Documented as a known limitation.


## Export

```ts
export interface ExportSelection {
  council: { name: string; version: string; description?: string;
             author?: string; license?: string };
  councillor_slugs: string[];
  memory_slugs: string[];
  sample_job_ids: string[];   // queued jobs only; others are not selectable
}

export async function exportSelection(s: ExportSelection): Promise<CouncilTemplate>;
```

Defaults presented in the UI / CLI picker: **councillors all checked,
memory none, jobs none**. The caller must supply the template-level
metadata (`name`, `version`, etc.) since these aren't derivable from
council state.

Job artifacts (`input.md`, `transcript.md`, `output.md`,
`events.jsonl`) are never exported; only the queued job's `title`,
`brief`, and `councillor_slug` end up in `sample_jobs[]`.


## Errors

```ts
export class TemplateFetchError       extends Error {}
export class TemplateParseError       extends Error {}
export class TemplateValidationError  extends Error {}
export class TemplateNeedsConfirmation extends Error {
  constructor(public plan: ApplyPlan) {
    super('Confirmation required for overwrite');
  }
}
```

- `TemplateFetchError`: network failure, timeout, non-2xx, body > 2 MB.
  Message includes URL + reason.
- `TemplateParseError`: JSON parse failed. Message includes parser
  error location.
- `TemplateValidationError`: schema mismatch. Message names the offending
  field path, e.g.
  `'sample_jobs[1].councillor_slug "x" does not match any councillor'`,
  or `'Unsupported format_version 2; expected 1.'`.

UI catches each → renders message into the page; `NeedsConfirmation`
specifically swaps the form for a plan + Confirm button.

CLI catches each → prints to stderr, exits 1.


## UI surfaces

| Route | When | Behavior |
|---|---|---|
| `/` (setup, no `council.json`) | always | New panel "Install from template" beside the blank-create form. Inputs: URL textbox **or** file upload. Submit → POST `/import?action=preview`. |
| `/import` | linked from setup form and from council home | `+page.server.ts` actions `preview` (loads + plans) and `apply` (commits). Re-renders with the `ApplyPlan` summary and a Confirm button. On success → `redirect('/')`. |
| `/export` | linked from council home | `+page.svelte` shows checkboxes for each councillor / memory note / queued job (defaults per above), plus required fields for template name and version. Submit streams JSON with `Content-Disposition: attachment; filename="<slug>.template.json"`. |
| `/` (council exists, layout) | always | Header gets two small links: "Install template" → `/import`, "Export…" → `/export`. Added in `+layout.svelte`. |

Preview-then-confirm shape (UI):

```
[ paste URL / choose file ]  → preview
  ┌─ Plan ─────────────────────────────────────┐
  │ + 2 councillors (Mocky, Polly)             │
  │ ~ 1 councillor (Architect)  ← overwrites   │
  │ + 1 memory note (House Rules)              │
  │ Sample jobs: skipped (3 existing jobs)     │
  └────────────────────────────────────────────┘
  [Cancel]  [Confirm install]
```


## CLI

End-user surface is `npx landsraad`. `bin/landsraad.js` is extended to
dispatch on `argv[2]`:

```
npx landsraad                              # start server (current behavior)
npx landsraad init <source>                # install into cwd
npx landsraad init <source> --yes          # skip confirmation
npx landsraad init <source> --target <dir> # install into <dir> instead of cwd
npx landsraad export <out.json>            # interactive picker
npx landsraad export <out.json> --all      # councillors + memory + queued jobs
npx landsraad export <out.json> --councillors-only
```

`<source>` resolves per Loader: `http(s)://...` → fetch; anything else
→ filesystem path.

**Dispatcher.** `bin/landsraad.js`:
- `argv[2] === 'init'`  → spawn `vite-node scripts/template-install.ts -- ...rest`
- `argv[2] === 'export'` → spawn `vite-node scripts/template-export.ts -- ...rest`
- otherwise → existing server-start path.

Spawned scripts inherit `cwd` (or `--target`) and env, so they hit the
same `LANDSRAAD_COUNCIL_ROOT` semantics as the server.

**Interactive confirm (CLI install).** After preview, prints the same
plan as the UI then `Proceed? [y/N]` via `readline`. `--yes` skips.

**`npm run` aliases** (dev convenience):

- `dogfood:init` → `vite-node scripts/template-install.ts templates/dogfood.template.json --target ./dogfood --yes`
- `template:install` / `template:export` → pass-through

The old imperative `scripts/dogfood-init.ts` is removed in the same
change.


## Tests

All vitest; per-test tmp dir via `LANDSRAAD_COUNCIL_ROOT` matches the
existing `councils.test.ts` pattern.

**Unit — validator + loader:**

- Valid template parses & round-trips.
- Missing required field → `TemplateValidationError` with field path
  in message.
- `format_version: 2` → rejected with the version in the message.
- `sample_jobs[i].councillor_slug` unknown → rejected.
- Local-path source: `loadTemplate('./fixtures/x.json')` works.
- HTTP source: mock `global.fetch` (vitest spy) — returns body and
  asserts the 10s `AbortController` is wired; body cap rejects > 2 MB
  (simulated via streamed read).

**Unit — plan/apply, empty council:**

- `planApply(t)` on empty cwd: all `add` lists populated, no overwrites.
- `applyTemplate(t, {confirmedOverwrite: false})` on empty cwd:
  creates `council.json` with `template: "<name>@<ver>"`,
  councillors, memory notes, queued sample_jobs.
- Sample jobs land with `status: 'queued'`.

**Unit — plan/apply, existing council with conflicts:**

- Existing councillor with same slug → plan reports overwrite;
  `applyTemplate(t, {confirmedOverwrite: false})` throws
  `TemplateNeedsConfirmation` carrying the plan.
- `applyTemplate(t, {confirmedOverwrite: true})` → councillor
  `persona.md` is replaced; non-conflicting councillors preserved.
- Existing non-empty `jobs/` → `sample_jobs` skipped;
  `plan.sample_jobs.skipped_because_jobs_exist === true`.
- Existing `jobs/` run artifacts untouched after apply (assert by
  snapshotting `jobs/` before and after).

**Unit — export:**

- `exportSelection({councillors: ['mocky'], memory: [], jobs: []})`
  produces a schema-valid template; queued-jobs filter respected.
- Empty `councillors[]` is allowed by the validator (warning is a UI
  concern).
- Round-trip: export → load → apply into fresh cwd → council state
  matches the export selection.

**Integration:**

- Replace the existing dogfood e2e (if any) to use
  `templates/dogfood.template.json` via `template-install`.
- New e2e: install template → verify sample_jobs queued → re-install
  same template into same dir → plan reports zero changes → no
  confirmation needed.

Coverage target: every branch in `planApply` and `applyTemplate` is hit.


## Open issues (deferred)

- Authenticated fetch / private repo support.
- Built-in registry of templates (more than just Dogfood).
- Single-action "publish to gist" export shortcut.
- Auto-detection of likely PII on export (currently author opt-in only).
