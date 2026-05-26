# Scheduler — Design

**Status:** draft (this design pass; supersedes the `SPECIFICATION.md` "Out of Scope: Cron / recurring jobs / scheduler" stub).
**Date:** 2026-05-25
**Scope:** First implementation of one-shot and recurring job scheduling for a single council. Local-first, in-process, no external dependencies beyond `croner`.

---

## 1. Motivation

`SPECIFICATION.md` currently says jobs are one-shot and any scheduler is deferred. The director can already create jobs by hand; this spec adds the ability to declare *future* and *recurring* work, so a councillor can produce a Monday-morning briefing, a 15-minute health check, or a one-off reminder without the director re-clicking "create job."

The model assumes the Landsraad process is running when fires are due. Catch-up on startup is best-effort (single bookkeeping event, no replay).

## 2. Concepts

**Schedule** — a new first-class entity that declares *Job X should fire at time T (once) or per cron (recurring)*. Schedules spawn Jobs. Jobs stay one-shot and otherwise unchanged.

Two orthogonal lifecycles:

- *Schedule:* created → enabled/disabled → fires repeatedly (or once) → optionally edited/deleted.
- *Job:* spawned (or hand-created) → queued → running → succeeded/failed/cancelled. Identical to today.

## 3. Storage

```
<council-root>/
  schedules/
    <schedule-id>.json
    <schedule-id>.events.jsonl
```

`schedule-id` = `<UTC-timestamp>-<title-slug>` (mirrors job id convention), unique-per-create with `-2`, `-3` suffix on collision.

### `Schedule` JSON

```ts
interface Schedule {
  id: string;
  title: string;
  brief: string;                 // copied verbatim into each spawned job
  councillor_slug: string;
  kind: "once" | "recurring";
  fire_at: string | null;        // ISO UTC, required when kind="once"
  cron: string | null;           // 5-field cron, required when kind="recurring"
  enabled: boolean;
  next_fire_at: string | null;   // ISO UTC; null when disabled or kind="once" already fired
  last_fire_job_id: string | null;
  fire_count: number;
  fired_at: string | null;       // set when kind="once" fires
  created_at: string;
}
```

### `ScheduleEvent` JSONL

One line per event. Types:

- `created`
- `enabled` / `disabled`
- `edited`
- `fired` — `{ job_id }`
- `skipped_overlap` — `{ prior_job_id }`
- `missed_fires` — `{ count, from, to }` (logged once on startup per stale schedule)
- `fire_error` — `{ message }` (cron parse fail, councillor missing, etc.)

### Job change

`Job` adds one optional field:

```ts
spawned_by_schedule_id?: string | null;
```

Existing jobs without it stay valid.

## 4. Components

New `src/lib/server/` files:

| File | Responsibility |
|---|---|
| `schedules.ts` | CRUD: `createSchedule`, `readSchedule`, `listSchedules`, `writeSchedule`, `deleteSchedule`, `setEnabled`, `appendScheduleEvent`, `readScheduleEvents`. Pure disk + JSON. |
| `schedules.test.ts` | Round-trip, validation, slug collision, kind=once disable. |
| `cron.ts` | Thin wrapper over `croner`: `nextFire(cron, after)`, `previewNext(cron, n, after)`, `validateCron(s)`. Isolates the dep. |
| `cron.test.ts` | Parse errors, DST boundary, leap-year edge. |
| `scheduler.ts` | Tick loop: `startScheduler`, `stopScheduler`, `tickOnce(now)` (testable). Owns the `setInterval` handle and the `ticking` reentrancy guard. |
| `scheduler.test.ts` | Tick fires due schedule, skips overlap, advances next_fire, missed-fires catch-up, kind=once disable, bad-cron isolation. Injects clock + adapter override. |

Existing files touched:

- `src/lib/types.ts` — add `Schedule`, `ScheduleKind`, `ScheduleEvent`; add `spawned_by_schedule_id?: string | null` to `Job`.
- `src/lib/server/paths.ts` — add `schedulesDir()`, `scheduleFile(id)`, `scheduleEventsFile(id)`, `scheduleIdFor(title, now)`.
- `src/lib/server/jobs.ts` — `createJob` accepts optional `spawned_by_schedule_id`; stored on the persisted Job.
- `src/lib/server/runner.ts` — no change to runner internals; scheduler calls existing `createJob` + `startJobInBackground`.
- `src/hooks.server.ts` — call `startScheduler()` once at startup; install `process.on('SIGTERM'|'SIGINT', stopScheduler)`.

Single dependency added: `croner` (~14KB, zero-dep, TZ-aware, MIT).

## 5. Data flow

### Tick

```
scheduler.tickOnce(now):
  if ticking: return
  ticking = true
  try:
    schedules = listSchedules().filter(enabled && next_fire_at)
    for each s in schedules where s.next_fire_at <= now:
      prior = currentJobForCouncillor(s.councillor_slug)
      if prior && prior.status === "running":
        appendScheduleEvent(s.id, "skipped_overlap", { prior_job_id: prior.id })
        s.next_fire_at = computeNext(s, now)
        writeSchedule(s)
        continue
      try:
        job = await createJob(
          { title: s.title, brief: s.brief, councillor_slug: s.councillor_slug,
            spawned_by_schedule_id: s.id },
          now
        )
        startJobInBackground(job.id)
        s.last_fire_job_id = job.id
        s.fire_count += 1
        appendScheduleEvent(s.id, "fired", { job_id: job.id })
      catch err:
        appendScheduleEvent(s.id, "fire_error", { message: err.message })
        s.enabled = false
        s.next_fire_at = null
        writeSchedule(s)
        continue
      if s.kind === "once":
        s.enabled = false
        s.fired_at = now.toISOString()
        s.next_fire_at = null
      else:
        s.next_fire_at = computeNext(s, now)   // future from now, not from prior next_fire_at
      writeSchedule(s)
  finally:
    ticking = false
```

`computeNext(s, after)` = `croner.nextFire(s.cron, after)` for recurring; `null` for once.

**Crash semantics:** `next_fire_at` advances *after* spawning the job and writing `fired`. A crash mid-spawn means the slot is treated as missed on next start, never as a duplicate fire. (Chosen: prefer missed over duplicate.)

### Startup catch-up

```
scheduler.startScheduler():
  for each schedule with enabled && next_fire_at && next_fire_at < now:
    missed_to = next_fire_at
    s.next_fire_at = computeNext(s, now)   // for kind=once: null
    if s.kind === "once":
      s.enabled = false
      s.fired_at = null                    // never fired
    appendScheduleEvent(s.id, "missed_fires",
      { count: countSlotsBetween(s, missed_to, now), from: missed_to, to: s.next_fire_at })
    writeSchedule(s)
  interval = setInterval(tickOnce, 30_000)
```

No firing during catch-up — bookkeeping only. First real fires happen on the first tick after startup.

`countSlotsBetween` for kind=once is always `1`; for recurring it walks `nextFire` from `missed_to` until past `now`, capped at e.g. 1000 (to avoid pathological loops on `* * * * *` after a year-long outage; we record the cap in the message).

### Tick mechanism

`setInterval(tickOnce, 30_000)` started by `hooks.server.ts`. Single shared handle. Reentrancy guard (`ticking` boolean) prevents overlap if a tick takes longer than 30s. `stopScheduler` clears the interval and waits for the in-flight tick.

Resolution: 30s. Crons specifying sub-minute granularity (`* * * * *` etc.) work but only fire once per minute, with up to 30s of jitter. Documented limitation.

### Timezone

System local TZ, single global setting. Cron strings interpreted in `croner`'s default TZ (system). Storage of `fire_at` / `next_fire_at` is ISO UTC. UI renders local TZ with the abbreviation. Per-schedule TZ is a future addition; not needed for the one-director / one-machine model.

## 6. Error handling

| Failure | Handling |
|---|---|
| Invalid cron at create/edit | Server action rejects with form error before write. `validateCron()` runs on every save. |
| Invalid cron loaded from disk (hand-edited) | `tickOnce` catches per-schedule; appends `fire_error`; sets `enabled = false`, `next_fire_at = null`; continues. UI shows disabled + reason from last event. |
| Councillor deleted while referenced | `createJob` throws on tick (no councillor). Caught: `fire_error`, schedule disabled. |
| Adapter missing on councillor | Existing `runJobNow` path writes `failed` job + error. Schedule still records `fired` (the spawn succeeded). |
| Tick handler throws unexpectedly | Top-level try/catch in `tickOnce`; logs to stderr; interval keeps running. |
| Two ticks overlap | `ticking` boolean guard; second tick returns immediately. |
| Process killed mid-fire | Schedule advances `next_fire_at` only *after* spawn — partial failure = miss, not duplicate. |
| Clock jump (NTP, sleep/wake) | Next tick fires once (the just-past slot), then advances. Big jumps caught by startup catch-up. |
| Schedules dir missing | `listSchedules` returns `[]`; create-on-write via `mkdir({recursive:true})`. |

## 7. UI surfaces

| Route | Purpose |
|---|---|
| `/schedules` | Table: Title · Councillor · Kind · Cron / Fire-at · Next fire (local TZ) · Enabled toggle · Last job link |
| `/schedules/new` | Form: title, brief (textarea), councillor (select), kind radio, cron-or-fire_at, enabled. Submits via SvelteKit form action; `validateCron` runs server-side. Returns next-3-fires preview on success. |
| `/schedules/[id]` | Detail: spec, next-3-fires preview, history (last 20 events with linked job ids), enable/disable + delete actions |
| `/schedules/[id]/edit` | Edit form (mirrors councillor edit pattern) |
| `/jobs/new` | +"Save as schedule" disclosure: kind toggle reveals cron-or-fire_at + enabled. That branch calls `createSchedule` instead of `createJob`. |
| `/jobs/[jid]` | Existing page; when `spawned_by_schedule_id` is set, show a "From schedule: …" link. |
| `/` (council home) | Activity card gets a line: `Schedules: <N> active · next fires <relative time>` (or "no active schedules"). |

Persistent header gets a `Schedules` link alongside existing nav.

## 8. Testing

Red/green TDD. Tests next to code. `npm test`.

**`cron.test.ts`**
- `validateCron` accepts `"0 9 * * MON"`, rejects `"bogus"`, rejects 6-field.
- `nextFire(cron, after)` returns correct UTC ISO across DST spring-forward (Denver, 2am→3am Mar 8 2026).
- `previewNext("*/15 * * * *", 3, after)` returns three consecutive 15-min slots.

**`schedules.test.ts`**
- Round-trip create/read/write/delete; slug collision suffixes `-2`, `-3`.
- `createSchedule` validates cron when kind=recurring; requires `fire_at` when kind=once.
- `setEnabled(id, false)` clears `next_fire_at`; `setEnabled(id, true)` recomputes from now.
- Refuses to create if `councillor_slug` doesn't resolve.

**`scheduler.test.ts`** — uses injected `now` + adapter-override + `tickOnce`:
- Fires due recurring schedule → spawns job with `spawned_by_schedule_id`, advances `next_fire_at`.
- Skip-overlap: prior job `running` → no spawn, `skipped_overlap` event, `next_fire_at` advances anyway.
- Kind=once fires → `enabled=false`, `fired_at` set, `next_fire_at=null`, `fire_count=1`.
- Catch-up at startup: schedule with `next_fire_at` 2 days in past → `missed_fires` event, no spawn, `next_fire_at` set to future.
- Bad cron in stored schedule → `fire_error` event, schedule disabled, loop continues with siblings.
- Reentrancy guard: second `tickOnce` while one in flight returns immediately.
- Spawned job links back via `spawned_by_schedule_id` and is queryable.

**Manual smoke (in acceptance):**
- `npm run dev` against `./dogfood`; create a `*/1 * * * *` schedule on a `mock:local` councillor; observe one new job per minute on `/`.
- Stop dev server, wait 3 min, restart → exactly one `missed_fires` event, zero stray jobs.

**Not tested:**
- The `setInterval` itself (verify `startScheduler` stores a handle and `stopScheduler` clears it).
- `croner` internals.

## 9. Out of scope (for this spec)

- Per-schedule TZ.
- Catch-up that fires once on missed (per-schedule `catch_up: bool` flag — easy follow-up).
- Multiple pending fires per schedule (queue with cap).
- Sub-minute resolution.
- Template export/import for schedules.
- Authentication on the tick endpoint (there is none — single-process scheduler).
- Pausing the whole scheduler globally (per-schedule `enabled` is enough for v1).

## 10. Open questions

- Should `/schedules` be linked from `/jobs/[jid]` only when the job was spawned by one, or always?
- When the director edits a schedule's cron, should `next_fire_at` be recomputed from now (current plan) or preserved if still valid? Current plan = always recompute on save.
- Should `/proposals` schedule proposals be allowed (a councillor reflects `<<SCHEDULE …>>`)? Defer until first request.
