# Agent Invocation Contract

Status: draft MVP contract.

This contract defines what Landsraad gives an agent adapter and what the adapter must return. It is intentionally provider-neutral so CLI, SDK, API, and local-model adapters can share the same orchestration layer.

## Task Packet

Every invocation receives a task packet. Paths are relative to the council root unless explicitly marked absolute.

```json
{
  "version": 1,
  "council": {
    "root": ".",
    "name": "Example Council",
    "description": "A local AI council."
  },
  "run": {
    "runId": "2026-05-02T140000Z",
    "jobId": "weekly-financial-report",
    "runDir": "council/jobs/weekly-financial-report/runs/2026-05-02T140000Z"
  },
  "agent": {
    "id": "cfo",
    "name": "CFO",
    "personaPath": "council/agents/cfo/persona.md"
  },
  "request": {
    "directorRequest": "Summarize the current financial status.",
    "jobBriefPath": "council/jobs/weekly-financial-report/brief.md"
  },
  "context": {
    "requiredPaths": [],
    "seedPaths": ["council/memory/facts.json"],
    "retrievedPaths": []
  },
  "output": {
    "format": "markdown",
    "expectedPrimaryPath": "output.md",
    "artifactDir": "artifacts"
  },
  "permissions": {
    "allowedActions": [],
    "requiresApprovalFor": ["external-command", "file-write-outside-council", "destructive-action"]
  }
}
```

Required MVP fields:

- `version`
- `council.root`
- `run.runId`
- `run.runDir`
- `agent.id`
- `request.directorRequest`
- `output.format`
- `permissions.requiresApprovalFor`

## Adapter Result

Adapters return a structured result even when the underlying provider only produces text.

```json
{
  "version": 1,
  "status": "succeeded",
  "startedAt": "2026-05-02T14:00:00Z",
  "finishedAt": "2026-05-02T14:04:33Z",
  "transcriptPath": "transcript.md",
  "primaryOutputPath": "output.md",
  "artifactPaths": [],
  "requestedActions": [],
  "structuredObjects": [],
  "warnings": [],
  "errors": []
}
```

Allowed statuses:

- `succeeded`
- `failed`
- `timed-out`
- `canceled`
- `blocked`

## Failure Representation

Failures must be explicit and machine-readable.

```json
{
  "code": "adapter-exit-nonzero",
  "message": "The Codex process exited with code 1.",
  "detail": {
    "exitCode": 1
  },
  "retryable": false
}
```

MVP failure codes:

- `adapter-not-found`
- `adapter-launch-failed`
- `adapter-exit-nonzero`
- `adapter-timeout`
- `adapter-canceled`
- `provider-auth-failed`
- `invalid-task-packet`
- `invalid-adapter-result`
- `permission-denied`
- `output-missing`

## MVP Boundaries

- Agents may return plain markdown as the primary output.
- Structured dashboard objects are optional and validated separately.
- Memory updates and job proposals may be returned as requested actions, but they do not become durable truth until handled by Landsraad workflows.
- Raw transcripts are evidence, not curated memory.
