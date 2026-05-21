# Data model

Everything is on-disk under the councils root (default `~/.landsraad/councils/`, override with `LANDSRAAD_COUNCILS_ROOT`).

## Layout

```
<councils-root>/
  <council-slug>/
    council.json
    councillors/
      <councillor-slug>/
        councillor.json
        persona.md
```

Slugs are derived from display names: lowercased, non-alphanumerics collapsed to `-`, capped at 64 chars. They never change after creation — renames update `name` in the JSON file but keep the slug stable.

## `council.json`

```json
{
  "slug": "c-suite",
  "name": "C-Suite",
  "description": "Run the business.",
  "template": "c-suite",
  "created_at": "2026-05-21T13:00:00.000Z"
}
```

- `slug` — directory name. Read-only after creation.
- `name` — display name. Editable.
- `description` — free text. Editable.
- `template` — optional string identifying the starter template used. Currently free-form; no template registry yet.
- `created_at` — ISO 8601 timestamp.

## `councillor.json`

```json
{
  "slug": "cfo",
  "name": "CFO",
  "role": "Chief Financial Officer",
  "adapter": "cli:claude",
  "created_at": "2026-05-21T13:01:00.000Z"
}
```

- `adapter` — free-form string for v0. Conventions we expect to settle on: `cli:<name>` (subprocess) or `sdk:<name>` (in-process API client). Empty string means "not configured yet."

## `persona.md`

The councillor's persona — free-form markdown. The application treats it as opaque text; rendering is deferred to whichever adapter eventually consumes it.

## Invariants

- A councillor only exists inside a council; deleting a council deletes its councillors with it.
- Slugs are unique within their parent scope (council slugs across the councils root, councillor slugs within their council).
- The app never writes outside the councils root.
- Files are written atomically enough for this single-user case (JSON is replaced wholesale on every update); no file locking.
