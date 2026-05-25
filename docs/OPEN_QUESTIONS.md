# Open questions

Live design questions not yet committed to. See [`SPECIFICATION.md`](../SPECIFICATION.md) for what's shipped and what's explicitly out-of-scope.

## Memory promotion (private → shared)

`<<JOB>>` proposals (Phase 1) shipped. `<<PROMOTE>>` / `<<MEMORY scope="shared">>` is deferred — pick after first real promote desire surfaces in dogfood. Candidates:

- **Option A — dedicated block.** `<<PROMOTE memory-slug="..." reason="...">>` references an existing private entry by slug. Approve → copy to shared, delete private row.
- **Option B — `scope` attribute on `<<MEMORY>>` (preferred).** `<<MEMORY title="..." scope="shared">>` lets a councillor flag *this very memory* as shared at creation time. Same-slug re-emission of an existing private entry with `scope="shared"` is treated as a promote.

Both flow through `proposals/memories/<...>.json` and a review UI. Option B is one fewer concept; Option A is more explicit for "promote that one over there."

## Memory consolidation / decay

- Sleep/dream pass where each councillor consolidates its own private memories.
- Same for shared memory (multi-councillor consolidation).
- Memory TTL / auto-archive.

## Review surface

User-facing synopsis of recent work and outstanding issues — what to surface on the home page beyond the current activity feed.

## Misc

- Dedupe of repeated `<<JOB>>` proposals on `(title, source_councillor)`?
- Jobs targeting the user (not a councillor)?
- Approval scope — always user, or designated "director" councillor auto-approves some classes?
