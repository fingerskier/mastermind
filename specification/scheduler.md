# Scheduler

Status: Phase 2 MVP contract.

The Landsraad-managed scheduler runs recurring jobs from a single explicit council root. It is an internal cron-compatible loop for users who do not want to wire operating-system cron themselves. External cron remains supported by invoking the normal job runner:

```text
landsraad --council <path> job run <job-id>
```

## CLI

```text
landsraad --council <path> scheduler start
landsraad --council <path> scheduler start --adapter local
landsraad --council <path> scheduler start --once --adapter local
```

`scheduler start` requires `--council <path>`. Scheduled execution must not infer the council root from the current working directory because scheduler processes are commonly launched by shells, terminals, services, or external cron from unrelated directories.

`--once` performs one registration and due-job pass, then exits. It is intended for smoke tests, service health checks, and dogfood evaluation. Without `--once`, the scheduler keeps running until interrupted.

## Job Registration

The scheduler reads jobs from `council/jobs/*/job.json`. A job is registered when:

- `type` is `recurring`.
- `schedule.type` is `cron`.
- `schedule.expression` is a five-field cron expression.

The implementation uses the established `cron-parser` npm package for expression parsing and next-run calculations. Six-field expressions are rejected for the MVP because the durable contract is five-field cron:

```text
minute hour day-of-month month day-of-week
```

`schedule.timezone` may be `local` or an IANA timezone name. `local` uses the host scheduler process timezone.

## State

Scheduler state lives in:

```text
.landsraad/scheduler.json
```

The state file records:

- Registered recurring jobs and their source `job.json` paths.
- Cron expression and timezone.
- Registration and update timestamps.
- Last scheduled occurrence handled by Landsraad.
- Last run id and last run timestamp.
- Next run timestamp.
- Run and failure counts.
- Validation errors for invalid schedules.

The scheduler catches up at most one missed occurrence per job on each pass: the latest scheduled occurrence that is due and has not already been handled. It does not replay every missed interval after downtime.

## Events

Scheduler audit events are appended to:

```text
.landsraad/logs/scheduler.jsonl
```

Each scheduled run also receives a scheduler dispatch event in its run-local `events.jsonl`, and `run.json` records the scheduler trigger metadata. This lets a director distinguish a scheduler-created run from a manual CLI run without changing the underlying job execution path.

MVP scheduler event kinds:

- `scheduler-started`
- `scheduler-registered`
- `scheduler-dispatched`
- `scheduler-completed`
- `scheduler-error`
- `scheduler-stopped`

## Execution Path

Scheduled jobs execute through the same internal `runJob` path used by:

```text
landsraad --council <path> job run <job-id>
```

The scheduler may pass an adapter override such as `--adapter local`, but it does not create a separate execution implementation.
