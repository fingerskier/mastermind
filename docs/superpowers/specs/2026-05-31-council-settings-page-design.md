# Council settings page — design

**Date:** 2026-05-31
**Status:** approved (brainstorming)

## Problem

Council-level operations are scattered across the home dashboard (`/`),
`/edit`, and `/settings`. Rename/template editing, councillor management,
env-var editing, export, and council deletion have no single home. The home
page mixes operational job activity with council administration.

Goal: consolidate council administration onto one `/council` page and make
home a pure activity view.

## Decisions (from brainstorming)

- New `/council` page **absorbs the `.env` editor** as a section. The
  standalone `/settings` route is **deleted entirely**.
- Councillor management moves **entirely off home**. Home becomes a pure
  job/activity view.
- Rename/template edited **inline** on `/council`. The `/edit` route is
  **deleted entirely**. Export stays its own page (`/export`), linked from
  `/council`.
- **Delete council** lives **only** in the `/council` danger section (removed
  from the home header).

## New route: `/council`

`src/routes/council/+page.svelte` + `+page.server.ts`. Titled "Council".
Returns 404 when `!hasCouncil()` (matches `/edit`, `/settings`).

### Sections

1. **Identity** — inline form: `name` (required, max 80), `description`
   (max 500), `template` (optional, max 80). Named action `?/identity` →
   `updateCouncil({ name, description, template })`. Logic moved verbatim
   from `/edit/+page.server.ts`. On success, stay on `/council` with a
   "Saved" indicator (no redirect — the page is the destination now).

2. **Councillors** — list each councillor (`name` · `role` · `adapter`).
   Per row: **Edit** link → `/councillors/[slug]/edit`; inline **Delete**
   button posting to `?/deleteCouncillor` (hidden `slug` field) →
   `deleteCouncillor(slug)`, with a `confirm()` guard. Header button
   **+ New councillor** → `/councillors/new`. Empty state: "No councillors
   yet."

3. **Environment** — the `.env` editor moved verbatim from `/settings`:
   `EnvVarRow` rows, `env-key-suggestions` datalist, add/remove row. Named
   action `?/env` → `writeCouncilEnv(pairs)`. Keep the "changes take effect
   after restart" note. Load seeds `pairs` from `readCouncilEnv()`.

4. **Tools / danger** — **Export…** link → `/export`. **Delete council**
   button posting to `?/deleteCouncil` → `deleteCouncilData()`, with the
   existing `confirm()` warning text. On success redirect to `/`.

### Server load

```ts
if (!hasCouncil()) error(404, 'No council in this directory');
return {
  council: await readCouncil(),          // name/description/template/councillors
  pairs: readCouncilEnv()
};
```

### Named actions

- `identity` — name/description/template; `fail(400, {...})` on validation/IO
  error echoing submitted values; success returns `{ identitySaved: true }`.
- `env` — key[]/value[] pairs → `writeCouncilEnv`; `fail` echoes `pairs`;
  success returns `{ envSaved: true, pairs }`.
- `deleteCouncillor` — `slug`; `deleteCouncillor(slug)`; `fail` on error;
  success returns `{ councillorDeleted: slug }`.
- `deleteCouncil` — `deleteCouncilData()`; `fail(500)` on error; success
  `redirect(303, '/')`.

(Per-action `form` discrimination uses distinct success/echo keys so the
three inline forms don't cross-render each other's state.)

## Home `/` changes

- Remove header **Edit** and **Delete** council controls and the
  `?/delete` action from `+page.server.ts`.
- Remove **+ New councillor** button from the Councillors section head.
- Add a **Council settings** link in the header → `/council`.
- Keep: kanban job columns, **+ Create job for all**, per-column **+** job,
  memory section, schedules/meetings lines. Column titles still link to
  `/councillors/[slug]` (operational detail, not management).

## Nav (`+layout.svelte`)

Replace the **Settings** menu entry with **Council** (→ `/council`). Keep
Meetings, Schedules, Install template, Export…, Help. The `Council`/`Export`
entries remain gated behind `page.data?.hasCouncil`.

## Deletions

- Delete `src/routes/edit/` (`+page.svelte`, `+page.server.ts`).
- Delete `src/routes/settings/+page.server.ts` and `+page.svelte`. **Move**
  `EnvVarRow.svelte` to `src/routes/council/EnvVarRow.svelte` (colocated with
  its only consumer, matching the current pattern). `$lib/env-suggestions` is
  already shared and stays put.
- Remove `?/delete` from `src/routes/+page.server.ts`.

## Back-link fixups

- `/councillors/new` and `/councillors/[slug]/edit` "← Back"/"Cancel" links
  currently point to `/`. Repoint to `/council` (they are reached from the
  council hub now).
- `/export` "Cancel" → `/council`.

## Testing (TDD, red→green)

New `src/routes/council/council-route.test.ts` exercising the load + four
actions against a temp council root (follow `settings-route.test.ts` and
`council-route.test.ts` patterns):

- load returns council + env pairs; 404 without a council.
- `identity` updates name/description/template; rejects empty name.
- `env` round-trips pairs via `writeCouncilEnv`/`readCouncilEnv`.
- `deleteCouncillor` removes a councillor.
- `deleteCouncil` wipes council data and redirects.

Delete `settings-route.test.ts` (route gone); remove any `/edit` test
coverage. Run `npm test` and `npm run check` green before commit.

## Out of scope

- Councillor create/edit forms themselves (unchanged routes).
- Reordering councillors.
- Any change to export/import file formats.
