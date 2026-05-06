# Dashboard Objects

Status: draft MVP contract.

Agents may return structured dashboard objects for user input and visual display. The dashboard validates objects before rendering them and falls back to readable JSON when validation fails.

## Common Fields

Every object has:

```json
{
  "type": "form",
  "id": "campaign-budget-window",
  "title": "Campaign Budget Window"
}
```

Required common fields:

- `type`
- `id`
- `title`

IDs must be unique within a run.

## Form

```json
{
  "type": "form",
  "id": "campaign-budget-window",
  "title": "Campaign Budget Window",
  "submitLabel": "Save",
  "fields": [
    {
      "id": "budget",
      "label": "Budget",
      "kind": "currency",
      "currency": "USD",
      "required": true
    }
  ]
}
```

MVP field kinds:

- `text`
- `textarea`
- `number`
- `currency`
- `date`
- `datetime`
- `boolean`
- `select`

## Table

```json
{
  "type": "table",
  "id": "risks",
  "title": "Risks",
  "columns": [
    { "id": "name", "label": "Name" },
    { "id": "severity", "label": "Severity" }
  ],
  "rows": [
    { "name": "Runway", "severity": "High" }
  ]
}
```

## Chart

```json
{
  "type": "chart",
  "id": "monthly-burn",
  "title": "Monthly Burn",
  "chartType": "line",
  "x": "month",
  "y": "burn",
  "data": [
    { "month": "2026-01", "burn": 42000 }
  ]
}
```

MVP chart types:

- `line`
- `bar`

## Status Card

```json
{
  "type": "status-card",
  "id": "job-status",
  "title": "Job Status",
  "status": "blocked",
  "summary": "Waiting for director input."
}
```

Allowed status values:

- `ok`
- `attention`
- `blocked`
- `failed`
- `done`

## MVP Boundaries

- Dashboard objects are display or input requests, not durable truth.
- Submitted form values must be recorded as director input before they affect jobs, memory, or decisions.
- Invalid objects should not fail the run; they should render as readable JSON with a validation warning.
