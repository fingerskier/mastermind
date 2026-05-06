# Memory Curation

Status: draft MVP contract.

Shared memory is curated durable context. Raw transcripts, agent notes, and run outputs are evidence, but they do not become shared memory automatically.

## Memory Update Proposal

Councillors propose shared-memory changes under `council/memory/_proposals/`.

```text
council/memory/_proposals/2026-05-02T150000Z-cto-platform-decision/
|-- proposal.json
|-- proposed-change.md
`-- rationale.md
```

`proposal.json`:

```json
{
  "version": 1,
  "id": "2026-05-02T150000Z-cto-platform-decision",
  "type": "memory-update",
  "status": "pending-director-approval",
  "proposedBy": "cto",
  "createdAt": "2026-05-02T15:00:00Z",
  "targetPaths": ["council/memory/facts.json"],
  "sourcePaths": ["council/jobs/platform-review/runs/2026-05-02T140000Z/output.md"],
  "summary": "Record the accepted platform decision."
}
```

Allowed statuses:

- `pending-director-approval`
- `approved`
- `rejected`
- `changes-requested`
- `merged`

## Conflict Report

Conflicts are recorded under `council/memory/_conflicts/`.

```json
{
  "version": 1,
  "id": "2026-05-02T160000Z-conflicting-runway",
  "status": "needs-director-routing",
  "detectedBy": "secretary",
  "createdAt": "2026-05-02T16:00:00Z",
  "claims": [
    {
      "path": "council/memory/facts.json",
      "claim": "Runway is 9 months.",
      "sourcePath": "council/jobs/finance/runs/2026-05-01T140000Z/output.md"
    },
    {
      "path": "council/projects/fundraise/notes.md",
      "claim": "Runway is 6 months.",
      "sourcePath": "council/inbox/runway-note.md"
    }
  ],
  "recommendedOwner": "cfo"
}
```

## Approval and Merge History

Approvals and merges are append-only JSONL records under `.landsraad/logs/memory.jsonl`.

```json
{
  "timestamp": "2026-05-02T16:30:00Z",
  "proposalId": "2026-05-02T150000Z-cto-platform-decision",
  "actor": "director",
  "action": "approved",
  "targetPaths": ["council/memory/facts.json"],
  "reason": "Matches accepted project decision."
}
```

MVP actions:

- `proposed`
- `approved`
- `rejected`
- `changes-requested`
- `merged`

## Secretary Role

The Secretary may identify stale memory, gaps, duplicates, and conflicts. It does not author shared-memory truth. It routes the issue to the director or affected councillor.

## MVP Boundaries

- Direct manual edits to memory files are allowed, because councils are plain files.
- High-impact or ambiguous shared-memory changes should go through proposals.
- Conflict reports are advisory until a director assigns ownership and approves a resolution.
- Vector and keyword indexes are derived from source files and are not authoritative memory.
