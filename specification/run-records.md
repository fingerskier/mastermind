# Run Records

Status: draft MVP contract.

A run record is the durable evidence for one job execution. It must be inspectable as plain files and portable with the council directory.

## Directory Layout

```text
council/jobs/<job-id>/runs/<run-id>/
|-- run.json
|-- input.md
|-- transcript.md
|-- output.md
|-- review.md
|-- events.jsonl
`-- artifacts/
```

MVP required files:

- `run.json`
- `input.md`
- `transcript.md`

`output.md` is required for successful runs. Failed runs may omit it if no useful output was produced.

## Run JSON

```json
{
  "version": 1,
  "runId": "2026-05-02T140000Z",
  "jobId": "weekly-financial-report",
  "status": "succeeded",
  "assignedAgents": ["cfo"],
  "adapter": {
    "type": "cli",
    "id": "codex",
    "invocations": [
      {
        "agentId": "cfo",
        "preset": "codex",
        "command": "codex",
        "args": ["exec"],
        "status": "succeeded"
      }
    ]
  },
  "startedAt": "2026-05-02T14:00:00Z",
  "finishedAt": "2026-05-02T14:04:33Z",
  "inputs": ["input.md"],
  "transcript": "transcript.md",
  "outputs": ["output.md"],
  "artifacts": [],
  "requestedActions": [],
  "permissionEvents": [
    {
      "timestamp": "2026-05-02T14:00:00Z",
      "runId": "2026-05-02T140000Z",
      "jobId": "weekly-financial-report",
      "agentId": "cfo",
      "adapterId": "codex",
      "actionKind": "external-command",
      "normalizedTarget": "codex exec",
      "decision": "allow-this-run",
      "decisionSource": "director-command"
    }
  ],
  "errors": [],
  "trigger": {
    "type": "scheduler",
    "scheduledFor": "2026-05-02T14:00:00.000Z",
    "expression": "0 9 * * 5",
    "timezone": "local",
    "dispatchedAt": "2026-05-02T14:00:03Z"
  }
}
```

`adapter.invocations` is used when a job runs more than one assigned councillor in a single run directory. For a single-agent run, it still contains one invocation so the run records the actual command, arguments, and per-agent adapter status.

Allowed statuses:

- `queued`
- `running`
- `succeeded`
- `blocked`
- `failed`
- `timed-out`
- `canceled`

## Events JSONL

`events.jsonl` records structured events when available. It supplements the transcript and does not replace it.

```json
{"timestamp":"2026-05-02T14:00:03Z","kind":"process-started","message":"Started codex exec."}
```

MVP event kinds:

- `process-started`
- `stdout`
- `stderr`
- `permission-requested`
- `permission-decided`
- `provider-managed-permission`
- `artifact-created`
- `process-exited`
- `error`
- `scheduler-dispatched`
- `scheduler-completed`

`trigger` is optional. Manual CLI runs omit it. Scheduler-created runs record `trigger.type: "scheduler"` and the cron occurrence that caused the run.

## Error Shape

```json
{
  "code": "adapter-timeout",
  "message": "The adapter exceeded its timeout.",
  "retryable": true
}
```

## Review

`review.md` records director feedback, acceptance, rejection, or requested follow-up. It is optional until a run enters review.

## MVP Boundaries

- Run directories are append-oriented. Do not silently rewrite completed transcripts.
- If a correction is needed, create a new run or append review notes.
- Raw transcripts do not become curated memory automatically.
