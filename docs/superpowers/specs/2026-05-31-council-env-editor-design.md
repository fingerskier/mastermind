# Per-council `.env` editor

Date: 2026-05-31
Status: approved design (pre-implementation)

## Problem

Adapters are CLI subprocesses that inherit the server's environment (spec §Adapter).
Some adapters need API keys in env (`cli:aider` → `OPENAI_API_KEY`/`ANTHROPIC_API_KEY`;
`cli:warp` → `WARP_API_KEY`), and any adapter may want env-driven overrides
(model, base URL, token). Today the only way to set these is in the shell that
launched Landsraad. We want to manage them from inside the app, per council.

## Decision summary

- A council's environment lives in a **`.env` file at the council root** (`<councilRoot>/.env`).
- The app **loads that file into `process.env` at startup**. Spawned adapter CLIs
  inherit it. **Changes take effect on restart** — no live reload, no per-spawn injection.
- A new **`/settings`** screen edits the file as **structured key/value rows with
  masked values**.
- The `.env` is **inherently excluded** from the semantic index and export bundle
  (both are allow-list / push-based, neither walks the council root). We add
  **regression tests** to lock that in, plus a **`.gitignore`** entry.

Explicitly **out of scope**: shared `../.env` (parent of root), per-spawn env
injection, live reload without restart, SDK adapters.

## Architecture

### `src/lib/server/env-file.ts` (new)

```ts
export interface EnvPair { key: string; value: string }
```

- `readCouncilEnv(): EnvPair[]`
  - Read `councilEnvFile()`. Missing file → `[]`.
  - Tolerant parse, **preserving row order**:
    - Skip blank lines and lines whose first non-space char is `#`.
    - Split on the **first** `=`. Trim the key. Value is the remainder.
    - Strip one layer of matching surrounding quotes (`"…"` or `'…'`) from the value.
    - Skip lines with an empty/invalid key.
- `writeCouncilEnv(pairs: EnvPair[]): Promise<void>`
  - Drop rows where both key and value are empty.
  - Validate each remaining key against `/^[A-Za-z_][A-Za-z0-9_]*$/`; throw a named
    error on the first invalid key.
  - Reject any value containing a newline (`\n`/`\r`) with a named error.
  - Serialize as `KEY=value\n`. Quote the value (`"…"`) if it contains whitespace,
    `#`, or a quote char; escape embedded `"`.
  - Write to `councilEnvFile()` (inside the council root — allowed).
  - Then call `ensureCouncilGitignore()`.
- `ensureCouncilGitignore(): Promise<void>`
  - Ensure `<councilRoot>/.gitignore` contains a line exactly `.env`. Create the
    file if absent; append with a leading newline if needed; no-op if already present.
- `loadCouncilEnvIntoProcess(): void`
  - `readCouncilEnv()` then set each pair into `process.env`. **Council `.env` is
    authoritative** — it overwrites any inherited value for the same key (the user
    sets these specifically to drive the tools). No-op if the file is missing or
    parse yields nothing. Never throws; log and continue on error.

### `src/lib/server/paths.ts`

Add:
```ts
export function councilEnvFile(): string {
  return join(councilRoot(), '.env');
}
```

### `src/hooks.server.ts`

Call `loadCouncilEnvIntoProcess()` at module top, **before** the scheduler starts
and before any adapter can spawn, so child processes see the keys. Guard with a
try/catch that logs and continues (consistent with the embedder/scheduler blocks).

### `/settings` route

- `src/routes/settings/+page.server.ts`
  - `load`: `error(404, 'No council in this directory')` if `!hasCouncil()`;
    else `{ pairs: readCouncilEnv() }`.
  - `actions.default`: read parallel form arrays `key` (`key`) and `value` (`value`),
    zip into pairs, `await writeCouncilEnv(pairs)`. On a validation error return
    `fail(400, { pairs, error })` echoing the submitted pairs. On success return
    `{ saved: true, pairs: readCouncilEnv() }` (stay on the page).
- `src/routes/settings/+page.svelte`
  - Heading "Settings"; back-link to `/`.
  - Persistent note: **"Changes take effect after restarting Landsraad."**
  - One row per pair: `<input name="key">` + value `<input name="value" type="password">`
    with a per-row reveal toggle (button flips the input `type` between `password`
    and `text`). Add-row and remove-row buttons (client-side row state). Save button.
  - Show `form.error` if present; show a "Saved" confirmation when `form.saved`.
  - Reuse the existing `.form` / `.btn` styles from `/edit`.

## Data flow

1. User edits rows on `/settings`, clicks Save.
2. Action validates + writes `<councilRoot>/.env`, ensures `.gitignore`.
3. User restarts Landsraad.
4. `hooks.server.ts` → `loadCouncilEnvIntoProcess()` populates `process.env`.
5. A job runs → runner spawns the adapter CLI, which inherits `process.env`,
   including the council's keys.

## Leak guards

The council root holds files that are indexed / exported / served. `.env` must
never reach those channels. Audit findings (2026-05-31):

- **Indexer** (`indexer.ts`) is **push-based**: callers invoke `indexUpsert({kind,
  ref_id, text})`. It never walks the filesystem, so `.env` is never indexed.
- **Export** (`templates.ts` `exportSelection`) builds a `CouncilTemplate` from
  explicit domain objects (`readCouncil`, `listCouncillors`, `listNotes`,
  `listJobs`). It is an allow-list; it does not `readdir` the council root.
- **No route** lists arbitrary council-root files; peers expose only
  `council.json` + roster via `/api/council`.
- Confirmed: no `readdir(councilRoot())` anywhere in `src/`.

Therefore guarding reduces to:
1. **Regression test** — create a council, write a `.env` with a secret, run
   `exportSelection` over everything; assert the resulting template contains no
   secret value and that `.env` is not read into any field.
2. **Regression test / assertion** — the indexer exposes no path that ingests
   `.env` (documented; covered by the push-based design).
3. **`.gitignore`** — `ensureCouncilGitignore()` on every save.

## Testing (red/green)

- `src/lib/server/env-file.test.ts`
  - parse: blanks, `#` comments, quoted values, first-`=` split, missing file → `[]`,
    order preserved.
  - write→read roundtrip; quoting of spaced values.
  - key validation rejects `bad key`, `1abc`, empty; named error.
  - value with newline rejected.
  - `ensureCouncilGitignore` creates/appends/no-ops correctly.
  - `loadCouncilEnvIntoProcess` sets vars and **overrides** an existing inherited value.
- `src/routes/settings/settings-route.test.ts`
  - `load` 404 without a council; returns pairs with a council.
  - action writes the file from form arrays.
  - bad key → `fail(400)` with error echoed.
- export regression in the templates test suite (per Leak guards #1).

## Files touched

- new: `src/lib/server/env-file.ts`, `src/lib/server/env-file.test.ts`
- new: `src/routes/settings/+page.server.ts`, `+page.svelte`,
  `src/routes/settings/settings-route.test.ts`
- edit: `src/lib/server/paths.ts`, `src/hooks.server.ts`
- edit: templates test (export regression)
- docs: `SPECIFICATION.md` (env file + `/settings`), `README.md` if user-facing nav changes

## Spec update

`SPECIFICATION.md` gains a short subsection under Adapter/Surfaces: a council may
carry a root `.env` whose keys are loaded into the server environment at startup
and inherited by adapter subprocesses; edited at `/settings`; never indexed,
exported, or served.
