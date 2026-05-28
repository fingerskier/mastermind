# Memory promotion (private → shared) — design

Status: spec
Date: 2026-05-28

## Goal

Let a councillor flag a memory entry for promotion from its private memory to council-wide shared memory at emission time, via a `scope` attribute on the existing `<<MEMORY>>` block. Promotion always passes through user approval (a *memory proposal*). A self-healing sweep makes the pipeline crash-resilient: if anything between the reflection emission and the proposal write is interrupted, the next reflection on that councillor recreates the missing proposal from the on-disk marker.

This closes the deferred design entry in `docs/OPEN_QUESTIONS.md` ("Option B — `scope` attribute on `<<MEMORY>>`") and supersedes spec #2625 (purge of `scope="shared"` from templates) — instead of purging, we make the attribute real.

## Block format

```
<<MEMORY title="..." scope="shared">>
body markdown
<</MEMORY>>
```

- `scope` is optional. Allowed values: `"private"` (default) and `"shared"`.
- Unknown values fall back to `"private"` (forward-compat, same as other attrs).
- All other parsing rules unchanged.

## Parser

`src/lib/server/reflection.ts`:

- `ParsedMemoryBlock` gains `scope: 'private' | 'shared'`.
- New `ATTR_SCOPE_RE = /scope="([^"]*)"/`.
- Default to `'private'`; explicit `"shared"` → `'shared'`; anything else → `'private'`.

`parseMemoryBlocks` keeps its current shape (title-required, body-required, regex-tolerant of unknown attrs).

## Runner reflection processing

`src/lib/server/runner.ts` — for each parsed block:

### `scope = 'private'` (current behavior)

Call `createPrivateNote(councillor.slug, { title, body })`. No change.

### `scope = 'shared'`

1. `targetSlug = slugify(title)`.
2. **Resolve private:**
   - If `<councillor>/memory/<targetSlug>.md` does not exist → create it via `createPrivateNote` (use the returned slug, which will be `targetSlug` since we just checked).
   - If it already exists → reuse `targetSlug`; do not write a second private note. (Matches the `OPEN_QUESTIONS.md` "same-slug re-emission is a promote" rule.)
3. **Check existing sidecar** at `<councillor>/memory/<targetSlug>.promote.json`:
   - `status='pending'` → idempotent; do nothing more for this block.
   - `status='approved'` → already promoted; remove the orphan sidecar (the shared note already exists). Nothing to do.
   - `status='rejected'` → user previously rejected; respect that — do not create a new proposal. Idle.
   - No sidecar → proceed to step 4.
4. **Write sidecar first** with `proposal_id: null`, `status: 'pending'`. This is the crash-recovery anchor.
5. **Create memory proposal** under `<root>/proposals/memory/<id>.json`.
6. **Patch sidecar** with the created `proposal_id`.

Order matters: sidecar before proposal means a crash between 4 and 5 leaves an orphan that the sweep can detect and recover.

### Sidecar shape

`<councillor>/memory/<slug>.promote.json`:

```json
{
  "requested_at": "2026-05-28T12:34:56.789Z",
  "requested_by_job_id": "<job-id>",
  "proposal_id": "<id>" ,
  "status": "pending"
}
```

`proposal_id` is `null` between sidecar write and proposal write.

## Memory proposals

New module `src/lib/server/memory_proposals.ts` mirrors `src/lib/server/proposals.ts`:

```ts
export interface MemoryProposal {
  id: string;
  kind: 'memory';
  proposed_by: string;          // councillor slug
  source_job_id: string;
  source_private_slug: string;  // private note slug on that councillor
  title: string;
  body: string;                 // snapshot at proposal time (read from private)
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
  decided_at?: string;
  decided_by?: 'user';
  reason?: string;
  resulting_shared_slug?: string;
}
```

Functions (parallel to job proposals): `createMemoryProposal`, `readMemoryProposal`, `listMemoryProposals({ status })`, `setMemoryProposalDecision`, `listMemoryProposalsForSourceJob`, `listMemoryProposalsForCouncillor`.

Storage path: `<root>/proposals/memory/<id>.json`. `<id>` base = `<timestamp>-<councillor>-<slug>` (mirrors job proposal id shape).

New path helper `memoryProposalsDir()` in `src/lib/server/paths.ts`.

`$lib/types` gains `MemoryProposal` + `MemoryProposalStatus`.

## Sweep

New module `src/lib/server/promotion_sweep.ts`:

```ts
export async function sweepCouncillorPromotions(councillorSlug: string): Promise<{ recreated: number }>;
```

- Lists `<councillor>/memory/*.promote.json`.
- For each sidecar with `status === 'pending'`:
  - If `proposal_id` is `null`, **or** `readMemoryProposal(proposal_id)` rejects (file missing) → create a fresh proposal using the private note's *current* body and title, patch the sidecar's `proposal_id`.
  - Otherwise leave alone.
- Sidecars in `status='approved'` or `'rejected'` are ignored.
- Returns a count for logging.
- Idempotent.

Called at the end of `processReflection(...)` in the runner, **after** the per-block loop, for the councillor whose reflection just succeeded. This means each councillor self-heals on its next successful reflection pass.

Failure inside the sweep appends a `reflection_failed` event (with sweep-specific message) but does not fail the job.

## Approval / rejection UI

### Approve

Server action on `/proposals` (and the per-councillor + per-job surfaces):

1. Load proposal; must be `status='pending'`.
2. Create the shared note via `createNote({ title, body: proposal.body })`. Title collision → user-visible error (`A shared note named "<title>" already exists`). User must reject or rename.
3. `setMemoryProposalDecision(id, { status: 'approved', resulting_shared_slug })`.
4. `deletePrivateNote(proposed_by, source_private_slug)` — shared replaces private per design decision.
5. Delete sidecar `<councillor>/memory/<slug>.promote.json`.

### Reject

1. `setMemoryProposalDecision(id, { status: 'rejected', reason })`.
2. Update sidecar to `status: 'rejected'`, clear `proposal_id`. The sidecar persists to suppress future re-emission of the same slug.
3. Private note stays untouched.

A "Clear promotion mark" admin action (delete the rejected sidecar) is *not* in scope for this slice — if the user wants to re-allow promotion, they can delete the sidecar by hand, or we add a UI affordance later.

## UI surfaces

### `/proposals`

Add tabbed nav: **Jobs** (existing default) and **Memory** (new). Status filter (`pending` | `approved` | `rejected` | `all`) applies to whichever tab is active.

Memory tab card:

- Title, source councillor (with link), source job (with link), priority chip not applicable.
- Body preview in a `pre.brief` block.
- Pending status → approve + reject inline forms.
- Approved status → link to `resulting_shared_slug` (`/memory/<slug>`).
- Rejected status → reason text if present.

### `/jobs/[jid]`

Add a "Memory promotions" section under "Suggested jobs" listing memory proposals where `source_job_id === jid`. Inline approve/reject for pending ones.

### `/councillors/[c_slug]`

Add a "Pending memory promotions" section under "Suggested jobs" listing memory proposals where `proposed_by === c_slug` and `status === 'pending'`.

### Council home (`/`)

Existing "pending-proposal badge" (per `SPECIFICATION.md` line 201) starts counting memory proposals too. Implementation: add `listMemoryProposals({ status: 'pending' })` count to the existing badge total.

## Storage layout change

```
<council-root>/
  councillors/<slug>/memory/
    <note-slug>.md
    <note-slug>.promote.json     # NEW — promotion sidecar (when applicable)
  proposals/
    jobs/                        # unchanged
    memory/                      # NEW
      <id>.json
```

Update the storage diagram in `SPECIFICATION.md` (§ Storage Model) and `docs/data-model.md`.

## Spec / doc updates

- `SPECIFICATION.md`:
  - § Agent Proposals: document the new `scope` attribute and the memory-proposal flow.
  - § Out of Scope: remove "Memory promotion (private → shared)" line — now shipped.
  - § UI Surfaces: note that `/proposals` shows both Jobs and Memory tabs.
- `docs/OPEN_QUESTIONS.md`: remove the "Memory promotion (private → shared)" entry.
- `docs/architecture.md`, `docs/data-model.md`: add `proposals/memory/`, sidecar shape, and the sweep.
- Spec #2625 (Reqall): mark resolved with reference to this spec — instead of purging `scope="shared"` from bundled personas, we implement it. (No personas need edits; the existing emissions are now meaningful.)

## Testing

- `src/lib/server/reflection.test.ts`:
  - `parseMemoryBlocks` returns `scope: 'private'` when attr absent.
  - returns `scope: 'shared'` when `scope="shared"`.
  - returns `scope: 'private'` for unknown values (e.g. `scope="team"`).
  - title-required behavior unchanged.
- `src/lib/server/memory_proposals.test.ts` (new):
  - create / read / list / decision round-trip; id collision suffixes; status filter.
- `src/lib/server/promotion_sweep.test.ts` (new):
  - sidecar with null `proposal_id` → sweep creates proposal, patches sidecar.
  - sidecar with `proposal_id` pointing at missing file → sweep recreates.
  - sidecar with live proposal → sweep no-ops.
  - sidecar in `approved` / `rejected` → sweep skips.
  - idempotent across two consecutive calls.
- `src/lib/server/runner.test.ts` (extend existing reflection tests):
  - `<<MEMORY scope="shared">>` block produces private note + sidecar + proposal in correct order (verify sidecar timestamps precede proposal).
  - Second emission of same shared block while sidecar is `pending` does not create a second proposal.
  - Emission with slug matching an existing private note doesn't create a second private.
  - Emission with sidecar already in `rejected` status does not create a new proposal.
- UI smoke (manual): create a job, force a shared emission via `mock:local`, approve through `/proposals`, verify shared note exists and private + sidecar are gone.

## Risks / non-goals

- **Retrieval duplication**: not a risk after this change because approval deletes the private note. During the window between emission and approval, the private and the eventual shared note overlap by content — acceptable.
- **Bulk approve**: out of scope. One proposal at a time.
- **Editing a proposal's body before approval**: out of scope; user can reject and let the councillor re-emit (or edit the source private note then accept).
- **Promotion of a private note that the user wrote by hand** (not from a `<<MEMORY scope="shared">>` block): out of scope. If needed later, a manual "Propose for promotion" button on the private memory page can write a sidecar.
- **Cross-councillor promotion** (one councillor promoting another's private): not supported; the source private always belongs to the proposing councillor.

## Ordering & rollout

Single PR, in test-first order:

1. Parser change (+ tests).
2. Memory proposal module (+ tests).
3. Sidecar writer + promotion sweep (+ tests).
4. Runner integration.
5. UI: `/proposals` tabs, per-job + per-councillor sections.
6. Doc updates (`SPECIFICATION.md`, `OPEN_QUESTIONS.md`, `architecture.md`, `data-model.md`).
7. Smoke test against dogfood council with `mock:local`.

No migration needed — no existing proposals or sidecars on disk; new files only.
