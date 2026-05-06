# Permissions

Status: draft MVP contract.

Landsraad permission state is council-scoped and project-local. Adapters may delegate enforcement to provider CLIs, but Landsraad remains responsible for canonical grants, run records, and audit logs.

## Grant Store

Persistent grants live at `.landsraad/permissions.json`.

```json
{
  "version": 1,
  "grants": [
    {
      "id": "grant-20260502-140000-001",
      "councilRoot": "C:/work/example-council",
      "adapterId": "codex",
      "agentId": "cfo",
      "actionKind": "external-command",
      "normalizedTarget": "npm test",
      "decision": "allow-always",
      "createdAt": "2026-05-02T14:00:00Z",
      "createdBy": "director",
      "reason": "Required by the configured test workflow."
    }
  ]
}
```

Persistent decisions:

- `allow-always`

Run-scoped decisions:

- `allow-this-run`
- `deny`
- `provider-managed` when the underlying provider owns the prompt and Landsraad can only record the visible event

Run-scoped decisions are recorded in the run and audit log, not persisted as durable grants.

## Action Kinds

MVP action kinds:

- `external-command`
- `file-write-outside-council`
- `network-access`
- `destructive-action`
- `provider-managed-permission`

## Audit Log

Permission audit records are append-only JSONL entries under `.landsraad/logs/permissions.jsonl`.

```json
{
  "timestamp": "2026-05-02T14:00:00Z",
  "runId": "2026-05-02T140000Z",
  "agentId": "cfo",
  "adapterId": "codex",
  "actionKind": "external-command",
  "normalizedTarget": "npm test",
  "decision": "allow-this-run",
  "decisionSource": "landsraad-prompt",
  "reason": "Director approved for the current run."
}
```

Decision sources:

- `landsraad-prompt`
- `landsraad-grant`
- `adapter-config`
- `provider-managed`

## Normalization

MVP normalization rules:

- Resolve council root to an absolute path before comparing scope.
- Match persistent grants against council root, adapter id, agent id, action kind, and normalized target.
- Store file targets as normalized absolute paths in audit records.
- Store portable grant targets as normalized command or path patterns when possible.
- Preserve the original requested command or target in the run transcript when available.

## Prompt Decisions

Approval prompts must support:

- `allow always`
- `allow this run`
- `deny`

`deny` blocks the current request and is recorded, but it does not create a persistent deny rule in the MVP.

## MVP Boundaries

- Landsraad does not need to intercept every provider-internal tool request for MVP.
- When a provider owns an internal prompt, Landsraad records `provider-managed-permission` if visible and preserves the transcript.
- Revocation may be manual editing of `.landsraad/permissions.json` in the MVP.
