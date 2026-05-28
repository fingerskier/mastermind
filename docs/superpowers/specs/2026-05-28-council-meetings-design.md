# Council Meetings — Design

Status: spec / v0. Adds a new "council meeting" surface for multi-agent round-table deliberation with the director participating each round. References the canonical product spec at `SPECIFICATION.md`.

---

## Summary

A **meeting** is a multi-turn round-table where every attending councillor speaks in randomized order each round and the **director participates as a speaker each round**. The meeting runs until the director ends it, at which point a designated **chair** councillor writes a synthesis. The synthesis is scanned for `<<MEMORY>>` / `<<JOB>>` blocks via the existing reflection plumbing. Meeting artifacts (topic, per-turn transcript, rolling summary, synthesis) are embedded into the semantic memory index so future jobs can retrieve them.

---

## Design Decisions (from brainstorm)

| # | Decision | Source |
|---|---|---|
| 1 | Meeting produces both synthesis **and** memory/job proposals via the existing reflection plumbing | Q1=C |
| 2 | All councillors attend by default; director can exclude per meeting | Q2=D |
| 3 | Turn order = random reshuffle each round | Q3=A |
| 4 | Termination = director-stop (runs indefinitely until director ends) | Q4=C |
| 5 | Synthesis author = the chair, chosen by the director at meeting creation | Q5=A |
| 6 | `<<MEMORY>>` / `<<JOB>>` blocks parsed only from synthesis (not per-turn) | Q6=A |
| 7 | Meeting blocks: attending councillors cannot take other jobs while meeting is running | Q7=A |
| 8 | Per-turn context = topic + last K turns verbatim + chair-written rolling summary of earlier turns | Q8=C |
| 9 | Chair summary refresh = lazy (only when turns fall out of the K-window) | Q9=B |
| 10 | Storage = `meetings/<meeting-id>/` with transcript as the canonical record (no per-turn files) | Q10=A |
| 11 | Per-turn failure pauses the meeting; director resumes or ends now | Q11=B |
| 12 | **Director participates as a speaker each round** (revision) | post-design |
| 13 | **Meeting artifacts embedded into the memory index** (revision) | post-design |

---

## Architecture

### Module layout

```
src/lib/server/
  adapters/runAdapter.ts     # extracted from runner.ts — single adapter-spawn helper
  councillor-lock.ts          # extracted busy-slot lock; jobs runner + meetings runner share
  meetings.ts                 # CRUD + filesystem layout for meetings/
  meeting-runner.ts           # turn loop, summary, synthesis, pause/end, director gate
  runner.ts                   # now calls councillor-lock + runAdapter; behavior unchanged
```

### Shared primitives

**`src/lib/server/adapters/runAdapter.ts`** — pulled out of `runner.ts`:

```ts
interface RunAdapterOpts {
  adapter: string;
  prompt: string;
  cwd: string;
  timeoutMs: number;
  onStdout?: (chunk: string) => void;
  abortSignal?: AbortSignal;
}

interface RunAdapterResult {
  transcript: string;   // raw stdout
  output: string;       // trimmed/processed
  exitCode: number;
  durationMs: number;
}

runAdapter(opts: RunAdapterOpts): Promise<RunAdapterResult>
```

Existing `runner.ts` calls this; behavior unchanged (covered by `runner.test.ts`).

**`src/lib/server/councillor-lock.ts`** — in-process Map:

```ts
type LockHolder =
  | { kind: 'job'; id: string }
  | { kind: 'meeting'; id: string };

tryAcquire(slug: string, holder: LockHolder): boolean
release(slug: string, holder: LockHolder): void
current(slug: string): LockHolder | null
listHeldBy(holder: LockHolder): string[]
```

The existing job-runner busy-check moves into this. A meeting acquires the lock for **every attendee** at meeting-start and holds it until the meeting reaches `ended | cancelled | failed`. Jobs assigned to in-meeting councillors stay `queued` until release.

### Tick model

The existing scheduler tick (30s) also pokes `meetingRunner.advance(meetingId)` for `running` meetings. Plus event-driven advance: a turn finish immediately schedules the next turn (no 30s wait inside a single meeting). `advance()` is idempotent and a no-op when a turn is already in flight or the meeting is `awaiting_director | paused | ended | cancelled | failed`.

---

## Data model

### `meetings/<meeting-id>/meeting.json`

```ts
type MeetingStatus =
  | 'running'             // a councillor turn is in flight
  | 'awaiting_director'   // round begun; waiting for director's turn (or skip)
  | 'paused'              // a turn failed; director must resume or end
  | 'synthesizing'        // chair writing synthesis.md
  | 'ended'               // synthesis written, locks released
  | 'cancelled'           // director cancelled; no synthesis
  | 'failed';             // adapter failure during synthesis, or crashed during running

interface Meeting {
  id: string;                       // <UTC-ts>-<title-slug>
  title: string;
  chair_slug: string;               // must be one of attendees
  attendees: string[];              // councillor slugs (chair always included)
  status: MeetingStatus;
  window_k: number;                 // turns of verbatim context (default from config)
  started_at: string;
  ended_at?: string;
  current_round: number;            // 1-based
  remaining_this_round: string[];   // shuffled at round start; pop on each turn
  director_spoken_this_round: boolean;
  last_summarized_turn: number;     // index of last turn folded into summary.md
  total_turns: number;              // includes director turns and councillor turns
  pause_reason?: string;            // when status=paused, e.g. "turn_failed: leto-cli exit 1"
  memory_slugs?: string[];          // private memories created by chair on synthesis
  shared_memory_slugs?: string[];
  proposed_jobs?: string[];         // proposal filenames
}
```

### Files in `meetings/<meeting-id>/`

```
meeting.json
topic.md          # director's brief, immutable after creation
transcript.md     # append-only; one block per turn (director + councillors)
summary.md        # rolling chair summary of displaced turns; may be empty
synthesis.md      # written once on transition to `ended`
events.jsonl      # state transition + progress log
```

`transcript.md` block format:

```
## Turn 7 — leto-cli — 2026-05-28T14:32:11Z
<output>

## Turn 8 — director — 2026-05-28T14:33:05Z
<director's text>
```

Director turns use the literal speaker token `director`.

### Per-turn input assembly (in-memory)

Built fresh for each councillor turn (not persisted per-turn):

```
[persona]
[roster header]
[shared memory top-K]
[private memory top-K for speaker]
---
MEETING: <title>
TOPIC: <topic.md>

SUMMARY OF EARLIER TURNS:
<summary.md>      # empty until first overflow

RECENT TURNS:
<last window_k turns from transcript, verbatim>

YOU ARE: <speaker_slug>. Speak now.
```

Memory retrieval reuses the existing `MEMORY_TOPK_*` / `MEMORY_CHAR_BUDGET` config; the query is the topic + the last turn's text concatenated.

### Director-turn input

The director composes their message in the meeting detail UI; no adapter call. The submitted text is appended to `transcript.md` with speaker `director`. There is no input-assembly step for director turns.

---

## Lifecycle

### State diagram

```
       create
          │
          ▼
   awaiting_director ────► running ──┐
          ▲                   │       │ end-of-round
          │                   │       └──► awaiting_director
          │                   │
          │                   │ turn_failed
          │                   ▼
          │                paused ──── director "resume" ──► running
          │                   │
          │                   │ director "end now"
          │                   ▼
          │ director "end"                                  synthesizing ──► ended
          └──────────────────────────────────────────────────────│           │
                                                                 │           │
                                                                 │ failure   │
                                                                 ▼           │
                                                              failed         │
                                                                             │
   * Any state can transition to `cancelled` via director "cancel"            │
     (no synthesis, locks released).                                         │
```

### Transitions

- **create → awaiting_director**: director submits `/meetings/new`. Try to acquire the lock for every attendee. If any lock is held by a running job or another meeting, **fail creation** with the list of busy councillors; director retries when free. (No queueing of meetings.) Round 1 begins with `remaining_this_round = shuffle(attendees)` and `director_spoken_this_round = false`. Status set to `awaiting_director`.

- **awaiting_director → running** (director speaks): director submits text or clicks "Skip this round". If text was submitted, append turn to `transcript.md` and `total_turns++`. Set `director_spoken_this_round = true`. Emit `director_turn` (text submitted) or `director_skipped` (skip). Status → `running`. Immediately advance. A skip does **not** create a `meeting_turn` index row.

- **running tick**:
  1. If `director_spoken_this_round === false` → status → `awaiting_director`, emit `awaiting_director`, return.
  2. If `remaining_this_round` is empty → start a new round: `current_round++`, `remaining_this_round = shuffle(attendees)`, `director_spoken_this_round = false`, emit `round_started`, then status → `awaiting_director` and return.
  3. Otherwise pop next speaker. Emit `turn_started`. Refresh summary if needed (see below). Assemble context. Spawn adapter via `runAdapter`.
  4. On exit 0: append to `transcript.md`, `total_turns++`, emit `turn_finished`, immediately call `advance()` again.
  5. On non-zero exit / throw / timeout: status → `paused`, `pause_reason` set, emit `turn_failed` + `paused`.

- **Summary refresh** (before context assembly for a councillor turn): if `total_turns - last_summarized_turn > window_k`, run a chair-summary adapter call covering the overflow range `[last_summarized_turn+1 .. total_turns - window_k]`. Chair prompt: prior `summary.md` + the displaced turn block; emit a replacement summary. Write `summary.md`. Update `last_summarized_turn`. Emit `summarized`. If the chair is the next speaker, the summary refresh still uses the chair adapter as a separate call (chair plays both roles).

- **End**: director clicks "End meeting" from `awaiting_director` / `running` / `paused`. Status → `synthesizing`. Chair adapter call: input = topic + final `summary.md` + the last `window_k` turns + "write the final synthesis; you may emit `<<MEMORY>>` / `<<JOB>>` blocks". Write `synthesis.md`. Parse blocks via the extracted reflection helper (see below). Status → `ended`. Release locks. Emit `synthesized` + `proposals_parsed`. Trigger index embedding for `synthesis.md`.

- **Cancel**: status → `cancelled`. If a turn adapter is mid-flight, abort via `AbortController` (SIGTERM → SIGKILL inside `runAdapter`, same path as job cancel). Release locks. No synthesis.

- **Server restart**: any `running | awaiting_director | synthesizing | paused` meeting on boot → flip to `failed` with `pause_reason="crashed_during=<status>"`. Locks reset on a fresh map. Same policy as orphaned `running` jobs.

---

## Reflection plumbing reuse

`src/lib/server/reflection.ts` already parses `<<MEMORY>>` / `<<JOB>>` blocks and applies them. Extract the parser-and-apply step into:

```ts
applyReflectionBlocks({
  text: string,
  sourceCouncilorSlug: string,
  sourceKind: 'job' | 'meeting',
  sourceId: string,
}): { memorySlugs: string[]; sharedMemorySlugs: string[]; proposalFiles: string[] }
```

Meeting synthesis calls it with `sourceKind: 'meeting'`, `sourceCouncilorSlug = chair_slug`, `sourceId = meeting.id`. Created memories carry `created_by: "meeting:<id>"`; proposals carry `source: { kind: "meeting", id: "<id>" }`.

The job-side reflection caller (`runner.ts` end-of-job hook) keeps working — it now passes `sourceKind: 'job'`.

Meetings do **not** trigger a separate reflection pass; the synthesis pass already does the proposal scan (Q6=A).

---

## Memory index integration

Meeting artifacts are embedded so future jobs can semantically retrieve from them.

### New chunk kinds (extends `docs/embeddings.md`)

| Kind | One chunk per | Logical key | `councillor_slug` | `title` |
|---|---|---|---|---|
| `meeting_topic` | meeting | `meeting_topic/<meeting-id>#0` | `null` | meeting title |
| `meeting_turn` | turn | `meeting_turn/<meeting-id>#<turn-idx>` | speaker slug (`null` for director turns) | `<meeting-title> · turn <n> · <speaker>` |
| `meeting_summary` | meeting (whole `summary.md`) | `meeting_summary/<meeting-id>#0` | `chair_slug` | `<meeting-title> · summary` |
| `meeting_synthesis` | meeting | `meeting_synthesis/<meeting-id>#0` | `chair_slug` | `<meeting-title> · synthesis` |

`source_path` for all four points at the meeting directory (transcript / summary / synthesis files).

### Embed triggers (on-write hooks)

| Source | Hook | Action |
|---|---|---|
| `createMeeting` | After `meeting.json` write | Upsert `meeting_topic/<id>#0` from `topic.md`. |
| `director_turn` | After `transcript.md` append | Upsert `meeting_turn/<id>#<turn-idx>` with the director's text; `councillor_slug = null`. |
| `turn_finished` (councillor speaker) | After `transcript.md` append | Upsert `meeting_turn/<id>#<turn-idx>` with the turn body; `councillor_slug = speaker`. |
| `summarized` | After `summary.md` rewrite | Upsert `meeting_summary/<id>#0` (overwrite). |
| `synthesized` | After `synthesis.md` write | Upsert `meeting_synthesis/<id>#0`. |
| `deleteMeeting` (future; not in v0) | Before `rm` | Delete `meeting_*/<id>#*`. |

### Retrieval

The default top-K shared retrieval already includes any indexed chunk by similarity; meeting chunks compete on similarity alongside memory notes. No kind filter changes are needed for v0. Future work: a `kinds: ['memory', 'meeting_synthesis']` filter for "retrieve only canonical knowledge."

### `npm run reindex`

Extend the walker to include `<council>/meetings/*/topic.md`, `summary.md`, `synthesis.md`, and to chunk `transcript.md` into per-turn entries by `## Turn N — <speaker> — <ts>` heading. Idempotent.

---

## Config

Add to `src/lib/server/config.ts`:

```ts
MEETING_WINDOW_K_DEFAULT: number    // env: LANDSRAAD_MEETING_WINDOW_K, default 4
MEETING_TURN_TIMEOUT_MS: number     // env: LANDSRAAD_MEETING_TURN_TIMEOUT_MS, default 300_000 (5 min)
MEETING_SUMMARY_TIMEOUT_MS: number  // env: LANDSRAAD_MEETING_SUMMARY_TIMEOUT_MS, default 300_000
```

A per-turn or per-summary adapter call exceeding the timeout = same as a non-zero exit → meeting pauses with `pause_reason="turn_timeout"`.

---

## UI surfaces

### Routes

| Route | Purpose |
|---|---|
| `/meetings` | List meetings (running / paused / awaiting_director on top, then ended). Per-row: title, status badge, attendee count, round, total_turns, started_at. |
| `/meetings/new` | Form: title, topic (textarea → `topic.md`), chair (select from councillors), attendees (checkbox list — all checked by default, chair always checked and disabled), `window_k` (number, default from config). |
| `/meetings/[id]` | Live view. Auto-refresh while not in a terminal state. |

### Meeting detail layout

```
Header: title · status badge · chair · attendees · round X · turn Y

Pause-reason banner (when paused)

Director input panel (when status = awaiting_director):
  [textarea]   [Speak]   [Skip this round]

Actions (status-dependent):
  awaiting_director → [End meeting]  [Cancel]
  running           → [End meeting]  [Cancel]
  paused            → [Resume] [End now] [Cancel]
  synthesizing      → (no actions; waiting on chair)
  ended             → (no actions)
  cancelled         → (no actions)
  failed            → (no actions)

Section: Topic
  topic.md rendered

Section: Synthesis  (only when ended)
  synthesis.md rendered
  Created memories: <links to memory entries>
  Proposed jobs:    <links to /proposals>

Section: Rolling summary  (collapsible; only if summary.md non-empty)
  summary.md rendered

Section: Transcript
  newest turn at top; each turn = speaker chip + timestamp + body
  while running: "Next: <speaker_slug>" placeholder
  while awaiting_director: "Waiting for director" placeholder
```

### Home (`/`)
- Add a **Meetings** card next to the existing activity card. Shows count of non-terminal meetings + a link to `/meetings`.
- A councillor card on `/` and `/councillors/[c-slug]` shows an "in meeting: `<title>`" pill when their lock is held by a meeting (so director sees why jobs queue).

### Persistent header
- Add `Meetings` link between `Jobs` and `Memory`.

---

## Testing strategy (red/green TDD)

- `councillor-lock.test.ts` — acquire / release / holder-mismatch / `listHeldBy`.
- `adapters/runAdapter.test.ts` — covers the extracted helper against `mock:local`; existing `runner.test.ts` keeps passing unchanged.
- `meetings.test.ts` — CRUD + filesystem layout + status persistence.
- `meeting-runner.test.ts` — uses `mock:local`:
  - happy path: 2 attendees + director, 2 rounds, director speaks each round, end → `synthesis.md` written, `transcript.md` ordered correctly
  - director skip: director clicks skip → round proceeds without a director block; `director_spoken_this_round = true` still set
  - lock conflict on create: creation fails when a councillor is mid-job
  - summary trigger: with `window_k=2`, after turn 3 (counting director turns) a `summarized` event fires and `summary.md` is non-empty
  - per-turn failure: `mock:local` configured to exit non-zero → status `paused`, `pause_reason` set; `resume` retries the **same** speaker (not the next)
  - end during paused: `synthesis.md` written from the partial transcript
  - cancel mid-turn: abort path triggers; locks released
  - random-each-round: stub RNG; assert `remaining_this_round` reshuffles at round boundary
  - synthesis emits `<<MEMORY scope="shared">>` → ends up in council `memory/`; emits `<<JOB>>` → lands in `proposals/jobs/`
  - end before any director turn (round 1 still awaiting): synthesis runs over topic + empty transcript; no crash
- `meeting-server-restart.test.ts` — orphaned non-terminal meeting on boot flips to `failed` and releases locks.
- `meeting-index.test.ts` — turn_finished hook upserts `meeting_turn` row; synthesis hook upserts `meeting_synthesis`; reindex walks `meetings/` correctly.
- Route tests for `/meetings/new` (create + lock-conflict failure) and `/meetings/[id]` (director-speak, skip, end, cancel, resume actions).

---

## Spec updates

This design adds a new section to `SPECIFICATION.md` under Core Concepts (between **Roster** and **Council Template**):

> ### Meeting
> A multi-turn round-table among councillors with the director participating each round. The director picks a chair, a topic, and attendees. Each round the director speaks first (or skips), then attending councillors speak in randomized order. When the director ends the meeting, the chair writes a synthesis that is scanned for `<<MEMORY>>` / `<<JOB>>` blocks via the existing reflection plumbing. Topic, per-turn transcript, rolling summary, and synthesis are embedded into the memory index so future jobs can retrieve them. While running, the meeting holds the busy-slot for every attendee; jobs assigned to in-meeting councillors stay `queued` until the meeting ends.

`SPECIFICATION.md` storage section gains `meetings/<meeting-id>/...`. UI Surfaces table gains the three new routes. v1 Functionality list gains a "Meetings" item.

---

## Out of scope (deferred)

- Convergence detection / declining-quality auto-end.
- Mid-meeting director-issued reassignment of chair or attendee changes.
- Per-meeting persona overrides ("be terse").
- Meeting templates (recurring agendas).
- Cross-council meetings.
- SDK-adapter-specific streaming / concurrency.
- Memory budget tuning specifically for meeting context (uses existing `MEMORY_TOPK_*`, `MEMORY_CHAR_BUDGET`).
- Search UI over past meetings (general index search UI is its own deferred surface).
- Schedules that fire meetings instead of jobs.
- Export of meetings in council templates.
- Per-turn `<<MEMORY>>` / `<<JOB>>` parsing (Q6=A locks this to synthesis-only).
- Promotion of synthesis to a shared memory note automatically (only `<<MEMORY>>` blocks land in memory).

## Open questions (deferred)

- Should meeting chunks be filterable in the default top-K retrieval (e.g., cap meeting hits to 1 per query so a chatty meeting doesn't crowd memory)?
- Should the chair's summary call honor `MEMORY_TOPK_*` retrieval, or is topic + summary + displaced turns enough?
- Director-turn embedding: speaker is `director`, no `councillor_slug`. Is that the right authorial attribution? (Currently: `null` slug, title `· director`.)
