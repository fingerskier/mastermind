# Agent Proposals — Design

**Date:** 2026-05-23
**Status:** Draft
**Extends:** `2026-05-22-councillor-memories-design.md` (reflection + `<<MEMORY>>` format)


## Motivation

Reflection already lets a councillor emit `<<MEMORY>>` blocks that the host
parses and applies. We want the same channel for two more agent-initiated
actions:

1. **Job proposals** — a councillor can suggest follow-up work, either for
   itself, for another councillor, or unassigned.
2. **Memory promotion** — a councillor can mark a private memory as worth
   sharing with the rest of the council.

Both arrive as **proposals**, not direct mutations: they land in a review
queue the user approves before anything is created or promoted. This keeps
the existing "agent output is trusted text, not trusted action" invariant
intact.


## Output channel

All agent → host signals use the same fenced-block envelope already in use for `<<MEMORY>>`.
Parsing is regex-tolerant of leading whitespace and trailing prose.
Any unrecognized block tag is ignored (forward-compat).

Blocks may appear in reflection output today; later, in any adapter response slot the host chooses to scan (job output, mid-job tool-style messages).


## `<<JOB>>` — job proposal

### Format

```
<<JOB title="short slug-friendly title" councillor="optional-slug" priority="normal">>
brief markdown — what the job should accomplish and why
<</JOB>>
```

Attributes:
- `title` (required) — slugified for the proposal record id.
- `councillor` (optional) — slug of the target councillor. Omit for
  "unassigned / user decides", or `councillor="all"` for a broadcast
  proposal (mirrors the existing "Create job for all" flow).
- `priority` (optional, default `normal`) — `low | normal | high`.
  Cosmetic in v1; surfaces in the review queue.

Body is the proposed brief, verbatim.

### Lifecycle

1. Reflection (or future scan points) parses `<<JOB>>` blocks alongside
   `<<MEMORY>>` blocks.
2. For each block, write a proposal file:
   `<council>/proposals/jobs/<timestamp>-<slug>.json` with shape:
   ```json
   {
     "kind": "job",
     "proposed_by": "<source-councillor-slug>",
     "source_job_id": "<jid>",
     "title": "...",
     "brief": "...",
     "target_councillor": "slug | null | \"all\"",
     "priority": "low|normal|high",
     "status": "pending",
     "created_at": "<iso>"
   }
   ```
3. Append event `{type: 'proposed_job', proposal_id, target_councillor}` to
   `events.jsonl` on the source job.
4. Review UI at `/proposals` lists pending items. Approve → create the job
   via the existing job-creation path (so all current validation and
   indexing applies). Reject → mark `status: "rejected"` with a reason.
5. Approved/rejected proposals stay on disk for audit; the UI hides them
   from the default pending view.

### Storage layout

```
<council>/
  proposals/
    jobs/
      2026-05-23T1701-pull-followup-on-X.json
    memories/
      ...
```

A flat dated/slugged filename keeps ordering trivial and prevents
collisions without needing a registry file.

### Failure modes

- **Self-loop** — a job's reflection proposes another job for the same
  councillor, that job's reflection proposes another, ad infinitum. The
  review-queue gate breaks the loop; no automated cap needed in v1.
- **Bad target slug** — proposal still stored; review UI flags unknown
  councillor slug and offers reassignment before approval.
- **Cross-councillor awareness** — see [Roster injection](#roster-injection)
  below. If `target_councillor` is still set to a non-existent slug
  (typo, stale persona), treat as "unassigned" with a warning chip in
  the review UI.

## Roster injection

To make `<<JOB councillor="...">>` routing land on real slugs, the
prompt-assembly step injects a terse roster of all current councillors.

- Source: `listCouncillors()` (already exists, reads `councillor.json` per
  councillor dir).
- Format: one line per councillor — `<slug> — <name> — <role>`.
- Inject as a new section in `assembleContextFor` between the persona and
  the shared/private memory sections:
  ```
  # Council roster
  <slug> — <name> — <role>
  ...
  ```
- Self entry is included (no special-case filtering).
- Empty council (only one councillor) still emits the header so the format
  is stable.

Auto-generated, not hand-maintained — avoids drift against
`councillor.json`. If the terse `role` field proves too thin for routing
in dogfood, add a `routing_hint` field to `councillor.json` rather than a
parallel `COUNCILLORS.md`.

## `<<PROMOTE>>` — memory promotion (stub)

This section is a **stub** pending a design decision (see "Open: collapse
into `<<MEMORY>>`" below). Two candidate forms:

### Option A — dedicated block

```
<<PROMOTE memory-slug="my-private-note-slug" reason="why this generalizes">>
optional revised body (if omitted, current private body is used)
<</PROMOTE>>
```

- References an existing private entry by its slug.
- Lands as a proposal at `<council>/proposals/memories/<...>.json` with
  shape `{kind: "promotion", source_slug, councillor_slug, reason,
  revised_body?}`.
- Approve → copy/move to shared memory dir, reindex as `kind: 'memory'`,
  delete the private row.

### Option B — collapse into `<<MEMORY>>` with a `scope` attribute (preferred)

```
<<MEMORY title="..." scope="shared">>
body
<</MEMORY>>
```

- Reflection already emits `<<MEMORY>>`. Adding `scope="private" | "shared"`
  (default `"private"`) lets a councillor flag *this very memory* as
  intended for the shared pool at creation time.
- For pre-existing private entries that should now be shared, the
  councillor re-emits the block with `scope="shared"` and the host treats
  same-slug as a promote rather than a new write.
- Avoids a second block type and a separate proposal file family.

**Tradeoff:** Option B is one fewer concept but couples promotion to a
re-emission of the memory. Option A is more explicit for "promote that
one over there." Option B is the working preference; revisit after first
real promote desire surfaces in dogfood.

### Lifecycle (either option)

1. Parsed during reflection.
2. Proposal file written under `<council>/proposals/memories/`.
3. Review UI shows side-by-side: current private body vs. proposed shared
   body, councillor of origin, reason.
4. Approve → write/move under `<council>/memory/`, reindex with
   `kind: 'memory'`, delete private file + row.
5. Reject → mark `rejected` with reason.

## Reflection prompt update

The reflection prompt (`src/lib/server/reflection.ts`) gains a section
describing the new block types and when to use them. Quality-over-quantity
guidance stays. Example additions:

```
You may also emit zero or more of these blocks:

<<JOB title="..." councillor="optional-slug">>
brief markdown
<</JOB>>

(Use only when a clear, scoped follow-up is warranted — not for vague
"could explore X" hand-waves.)

<<MEMORY title="..." scope="shared">>
body
<</MEMORY>>

(Use scope="shared" only when this insight is council-wide, not personal
voice/style.)
```

## UI surface

### `/proposals`

- Tabs: Jobs (N) · Memory promotions (M).
- Each row: title, source job link, proposing councillor, target, age.
- Actions: Approve / Edit + approve / Reject (with optional reason).

### Counter on home

- A small badge by the council name showing pending proposal count.

### Job detail

- "Proposals emitted" subsection (mirroring "Memories created"): one row
  per proposal block parsed from this job's reflection, with status chip
  and link to `/proposals`.

## Non-goals (v1)

- Auto-approval / trust tiers per councillor.
- Mid-job proposals (only reflection-time scanning for now).
- Cross-council proposal sharing.
- Rich diffing on memory promotion (plain text bodies are short enough).
- Hand-curated `COUNCILLORS.md` — roster is auto-generated from
  `councillor.json` (see [Roster injection](#roster-injection)).

## Testing

- Parser: each block type alone, mixed blocks, unknown attributes,
  malformed blocks ignored, unknown tag ignored.
- Proposal write: file shape, event appended, slug collision suffixing.
- Approval flow: approving a job proposal creates a job via the same path
  as the UI; approving a memory promotion writes to shared, deletes
  private, reindexes correctly.
- Rejection: status flips, event recorded, no side effects.
- End-to-end (mock adapter): job → reflection emits `<<JOB>>` and
  `<<MEMORY scope="shared">>` → proposals appear in `/proposals` →
  approve both → new job runs, shared memory entry visible to other
  councillors.

## Open questions

- **Option A vs. B for promotion** (above). Decision deferred until first
  real promote desire surfaces.
- **Approval scope** — is the user always the approver, or does a
  designated "director" councillor get to auto-approve some classes? v1:
  user only.
- **Rate-limit / dedupe** — if the same `<<JOB>>` title is proposed
  repeatedly across reflections, dedupe on `(title, source_councillor)`?
  Probably yes; deferred.
- **JSON inside fences** — current bodies are markdown. If proposals grow
  structured payloads (nested fields, tags), allow a `<<JOB>>{json}<</JOB>>`
  variant alongside the markdown form. Out of scope for v1.
