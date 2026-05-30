# Cross-Council Meetings — Design

Status: spec / v0. Extends [council meetings](./2026-05-28-council-meetings-design.md) so a meeting hosted by one council can summon councillors that live in **other running councils** (separate directories, separate `npx landsraad` processes) on the same machine. Cross-council meetings were explicitly deferred as out-of-scope in the single-council meeting spec; this is that follow-up pass. References the canonical product spec at `SPECIFICATION.md`.

---

## Summary

A council ("host A") runs a meeting exactly as today — director participates each round, a host councillor chairs, the chair writes the synthesis, reflection blocks land in A. The new capability: some attendees are **remote** — councillors belonging to another running council ("peer B"). When a remote attendee's turn comes up, the host **summons** it over HTTP: B runs its *own* councillor (B's persona, B's memory, B's adapter, in B's cwd) and returns the turn text, which the host appends to its transcript. This is true federation — each council remains the source of truth for its own agents. The host's `/api/instances` registry is the discovery primitive.

---

## Design decisions (from brainstorm, 2026-05-30)

| # | Decision | Source |
|---|---|---|
| 1 | **Remote-executed (RPC).** The peer runs its own councillor's adapter with its own persona + memory + cwd and returns the turn text. The host orchestrates and owns the transcript. | Q1 |
| 2 | **Conscript + per-turn remote lock.** Host summons a peer councillor directly; the peer acquires that councillor's busy-slot for the turn. Busy → refused (409). No human-at-peer approval. | Q2 |
| 3 | **Loopback, no auth.** Servers bind `127.0.0.1`; any local instance may summon; no tokens. LAN/cross-machine is out of scope. | Q3 |
| 4 | **Host directs, host chairs.** The human at host A is the sole director (participates each round, ends the meeting). The chair is a host-A councillor. Remote councillors are speak-only. Synthesis + `<<MEMORY>>` / `<<JOB>>` reflection run on A and land in A. | Q4 |
| 5 | **Peer logs participation.** B appends a lightweight audit record each time one of its councillors is summoned. No embedding; the meeting record itself lives only on A. | Q5 |
| 6 | **Per-turn lock on peer.** B locks the councillor only for the duration of one turn (acquire on summon, release on return). Between turns the councillor is free. No cross-process lease; a host crash leaks zero locks. | Q6 |

Judgment calls made during design presentation and approved:

- **(a)** Ports are ephemeral (change across restarts; the registry stores the live port). Remote attendees are keyed on **`cwd`** (durable); the host re-resolves the current port by matching `cwd` in the live registry at each summon.
- **(b)** `HOST=0.0.0.0` remains *possible* (for users who view the UI from another device), but `/api/meeting/turn` hard-rejects non-loopback callers — so the process-spawning summon endpoint is never network-reachable.

---

## Architecture

### Module layout

```
src/lib/server/
  peers.ts                  # discover peer councils via instances + GET /api/council; resolve port by cwd
  meeting-remote.ts         # summonRemoteTurn(): POST /api/meeting/turn, error mapping
  meetings.ts               # AttendeeRef model + back-compat reader (existing file, extended)
  meeting-runner.ts         # takeTurn() branches local vs remote (existing file, extended)
src/routes/api/
  council/+server.ts        # GET: this council's identity + roster (every instance exposes it)
  peers/+server.ts          # GET: host-side aggregated peer list (instances ⨯ /api/council)
  meeting/turn/+server.ts   # POST: run one councillor turn for a summoning host (peer side)
bin/landsraad.js            # bind HOST=127.0.0.1 (existing file, extended)
```

The host/peer split is **role, not code** — every instance ships all endpoints. An instance is a "host" while it runs a meeting and a "peer" when another instance summons one of its councillors. Both at once is fine.

### Two new server modules

**`src/lib/server/peers.ts`** — discovery + addressing:

```ts
interface PeerCouncillor { slug: string; label: string; adapter: string; busy: boolean }
interface Peer {
  council_slug: string;
  name: string;
  cwd: string;
  port: number;
  councillors: PeerCouncillor[];
}

// Reads instances, fetches each peer's /api/council over 127.0.0.1:<port>.
// Excludes this instance (match by cwd). Unreachable instances are dropped.
listPeers(opts: { selfCwd: string }): Promise<Peer[]>

// Durable address → live port. Matches cwd in the live registry.
// Returns null when the peer is no longer running.
resolvePeerPort(cwd: string): Promise<number | null>
```

**`src/lib/server/meeting-remote.ts`** — the summon client:

```ts
interface RemoteTurnInput {
  cwd: string;                 // durable peer key; port re-resolved here
  councillor_slug: string;
  meeting_id: string;
  host_council: string;
  context: MeetingContextDTO;  // title, topic, summary, recent_turns[], speaker_instruction
}
type RemoteTurnResult =
  | { ok: true; text: string; duration_ms: number }
  | { ok: false; reason: 'unreachable' | 'busy' | 'turn_failed'; detail: string };

summonRemoteTurn(input: RemoteTurnInput): Promise<RemoteTurnResult>
```

`summonRemoteTurn` re-resolves the port (`unreachable` if gone), POSTs `/api/meeting/turn`, maps HTTP 409 → `busy`, connection error/timeout → `unreachable`, `{ok:false}` body → `turn_failed`.

---

## API surface

### `GET /api/council` (every instance)

Identity + roster for discovery. No secrets.

```jsonc
{
  "slug": "engineering-council",
  "name": "Engineering Council",
  "version": "2026.5.29",
  "councillors": [
    { "slug": "leto", "label": "Leto", "adapter": "cli:claude", "busy": false }
  ]
}
```

`busy` reflects the councillor-lock at request time (advisory only — the authoritative check happens at summon under the lock).

### `GET /api/peers` (host-side aggregation)

Server-side: `listPeers({ selfCwd })`. Returns `{ peers: Peer[] }`. Used by `/meetings/new` to populate the remote-attendee picker. Best-effort: peers that fail to respond within a short timeout are omitted.

### `POST /api/meeting/turn` (peer side — the summon)

Request:

```jsonc
{
  "meeting_id": "2026-05-30T...-cross-team-sync",
  "host_council": "engineering-council",
  "councillor_slug": "leto",
  "context": {
    "title": "Cross-team sync",
    "topic": "<topic.md>",
    "summary": "<rolling summary, may be empty>",
    "recent_turns": ["## Turn 7 — ...", "..."],
    "speaker_instruction": "YOU ARE: leto. Speak now."
  }
}
```

Handler:

1. **Loopback gate.** If `event.getClientAddress()` is not loopback → `403`. (Defense in depth; the bind is loopback too.)
2. Resolve `councillor_slug` locally. Unknown slug → `404`.
3. `tryAcquire(slug, { kind: 'remote-meeting', id: meeting_id, host: host_council })`. Held → `409 { error: "busy", holder }`.
4. Assemble the prompt **locally** (peer is source of truth for its own agent):
   ```
   [persona for slug]
   [roster header]
   [shared memory top-K]
   [private memory top-K for slug]
   ---
   MEETING: <context.title>
   TOPIC: <context.topic>
   SUMMARY OF EARLIER TURNS: <context.summary>
   RECENT TURNS: <context.recent_turns joined>
   <context.speaker_instruction>
   ```
   Memory query = `context.topic + last recent_turn` (same retrieval config as local turns: `MEMORY_TOPK_*`, `MEMORY_CHAR_BUDGET`).
5. Run the councillor's adapter via the existing `runAdapter`, `cwd = this council root`, timeout = `MEETING_TURN_TIMEOUT_MS`.
6. Append the participation audit record (see below). Release the lock (always, in `finally`).
7. Respond `200 { ok: true, text, duration_ms }` on exit 0, else `200 { ok: false, exit_code, detail }`.

The host **never** sees or assembles B's persona/memory — only the shared meeting context crosses the wire.

---

## Data model

### `meetings/<meeting-id>/meeting.json` — attendee shape

`attendees` becomes a typed list:

```ts
type AttendeeRef =
  | { kind: 'local';  slug: string }
  | { kind: 'remote'; council_slug: string; councillor_slug: string; cwd: string; label: string };

interface Meeting {
  // ...existing fields unchanged...
  attendees: AttendeeRef[];
  chair_slug: string;                 // must be a local attendee (Q4)
  remaining_this_round: AttendeeRef[]; // shuffled refs (was string[])
}
```

**Back-compat:** `meetings.ts`'s reader coerces a legacy `attendees: string[]` into `{ kind:'local', slug }[]` so existing single-council meetings still load. `remaining_this_round` gets the same coercion.

The speaker token used in `transcript.md` headings, locks, and embeddings:
- local → `<slug>` (unchanged)
- remote → `<council_slug>:<councillor_slug>`

No remote locks are pre-acquired at create time (the per-turn model can't reserve). Create-time runs a best-effort reachability + slug-exists probe per remote attendee and warns if a peer is currently down, but does **not** block creation on it.

### Peer participation log

Each summon appends one line to `<peer-council-root>/meetings-incoming.jsonl`:

```jsonc
{ "ts": "2026-05-30T...", "host_council": "engineering-council",
  "meeting_id": "2026-05-30T...-cross-team-sync",
  "councillor_slug": "leto", "duration_ms": 8123, "exit_code": 0 }
```

Write-only audit trail (Q5). No embedding. Surfaced (optional for v1) as a "summoned N times" line on the peer's councillor page.

---

## Host turn loop integration

`meeting-runner.ts` factors the per-turn work into `takeTurn(meeting, speaker: AttendeeRef)`:

- `kind:'local'` → existing path: assemble local context, `runAdapter`, return `{ text, duration_ms }`.
- `kind:'remote'` → build `MeetingContextDTO` (title, topic, current `summary.md`, last `window_k` turns verbatim, speaker instruction) and call `summonRemoteTurn`. Map the result:
  - `ok:true` → `{ text, duration_ms }`, flows into the same `transcript.md` append + `turn_finished` + embedding path.
  - `ok:false` → throw a typed turn error so the existing **turn-failure → `paused`** transition fires, with `pause_reason` = `remote_unreachable:<council>` / `remote_busy:<council>:<slug>` / `remote_turn_failed:<council>:<slug>`.

Everything else — rounds, randomized order, director gate, summary refresh, chair synthesis, reflection parsing, `<<MEMORY>>`/`<<JOB>>` application — is **unchanged** and entirely local to the host. Resume retries the **same** speaker (existing behavior), which re-summons the remote.

---

## Failure handling

| Failure | Detection | Result |
|---|---|---|
| Peer instance down | `resolvePeerPort(cwd)` returns null, or connection refused | meeting `paused`, `pause_reason="remote_unreachable:<council>"` |
| Peer councillor busy (local job/meeting) | HTTP `409` from summon | `paused`, `pause_reason="remote_busy:<council>:<slug>"` |
| Peer adapter non-zero exit / timeout | `{ ok:false }` body | `paused`, `pause_reason="remote_turn_failed:<council>:<slug>"` |
| Host crashes mid-meeting | — | Peer leaks **zero** locks (per-turn). Host's meeting flips to `failed` on host restart (existing orphan policy). |
| Peer crashes mid-turn | summon connection drops | treated as `unreachable` → `paused` |

Director recovery is the existing `paused` UX: **Resume** (retry same speaker) or **End now** (synthesize from partial transcript) or **Cancel**.

---

## Security

The summon endpoint spawns an agent process with no human approval, so its reachability *is* the security boundary (Q3).

1. **Bind loopback.** `bin/landsraad.js` spawns `build/index.js` with `HOST=127.0.0.1` (adapter-node honors `HOST`). The existing "Listening on …" → browser-open rewrite already normalizes to `localhost`.
2. **Loopback caller gate.** `/api/meeting/turn` rejects any request whose `event.getClientAddress()` is not a loopback address (`127.0.0.0/8`, `::1`) with `403`. This holds even if a user deliberately sets `HOST=0.0.0.0` to view the UI from another device — the UI is reachable, but cross-machine summons (the only RCE vector) are refused.
3. No tokens, no auth headers. All summoning instances are same-machine, same-user (the registry lives in the user's home dir). Documented as the trust model.

`/api/council` and `/api/peers` are read-only identity/roster; they may be served on any bind but contain no secrets.

---

## Config

Reuses meeting config. Adds:

```ts
PEER_DISCOVERY_TIMEOUT_MS: number   // env: LANDSRAAD_PEER_DISCOVERY_TIMEOUT_MS, default 2_000
                                    // per-peer timeout for GET /api/council during discovery
```

Remote turns reuse `MEETING_TURN_TIMEOUT_MS` (the host applies it to the whole summon round-trip; the peer applies the same to its local adapter run).

---

## UI surfaces (host only)

### `/meetings/new`
The attendee picker gains a **Remote councils** section populated from `GET /api/peers`:
- Grouped by council (`name` + `cwd` shown so same-slug councils disambiguate).
- Each remote councillor is a checkbox; `busy` ones are shown disabled with a "busy" note (advisory).
- Chair `<select>` lists **local** councillors only (Q4).
- If no peers are running, the section shows "No other councils are running."

### `/meetings/[id]`
- Remote speakers render as `<council> › <slug>` chips with a distinct style (e.g. a "remote" badge).
- The pause banner surfaces remote failure reasons verbatim.
- No new actions — the director controls (Speak/Skip/End/Cancel/Resume) are unchanged.

### Home (`/`)
No change required for v1 (the existing Meetings card already counts non-terminal meetings).

---

## Memory index integration

Remote turns embed into the **host's** index using the existing `meeting_turn` chunk kind:
- `councillor_slug = null` (the speaker is not a local councillor).
- speaker token (`<council>:<slug>`) carried in the chunk `title`, e.g. `<meeting-title> · turn <n> · engineering-council:leto`.

No new chunk kinds, no reindex-walker changes beyond what single-council meetings already cover (it already chunks `transcript.md` by `## Turn N — <speaker> — <ts>` headings; remote speaker tokens parse the same way).

---

## Testing strategy (red/green TDD)

- `peers.test.ts` — `listPeers` parses instances ⨯ `/api/council`, excludes self by cwd, drops unreachable; `resolvePeerPort` returns the live port for a cwd and null when absent.
- `meeting-remote.test.ts` — `summonRemoteTurn`: success; HTTP 409 → `busy`; connection error / missing port → `unreachable`; `{ok:false}` body → `turn_failed`; timeout → `unreachable`.
- `api/council` route test — returns slug/name/roster with `busy` reflecting a held lock.
- `api/meeting/turn` route test (peer side, against `mock:local`):
  - non-loopback client → `403`
  - unknown slug → `404`
  - lock acquired then released (free again after the call); concurrent second summon → `409`
  - adapter runs in this council's cwd; participation log line appended with `exit_code`
  - adapter non-zero exit → `{ ok:false, exit_code }`
- `meeting-runner` cross-council tests (host side, peer stubbed):
  - a remote attendee's turn is summoned and appended to the transcript in round order
  - remote `unreachable` / `busy` / `turn_failed` → meeting `paused` with the right `pause_reason`; **resume** re-summons the same speaker
  - mixed local + remote round completes; synthesis + reflection run locally and land on the host
- `meetings.ts` back-compat test — legacy `attendees: string[]` meeting.json loads as all-local `AttendeeRef[]`.
- Route tests for `/meetings/new` (remote picker renders peers; chair stays local-only) and `/meetings/[id]` (remote speaker chip + remote pause reason render).

---

## Spec updates

`SPECIFICATION.md`:
- The **Meeting** concept section gains a paragraph: a meeting may include remote attendees from other running councils on the same machine; the host summons them over a loopback-only API and they run with their own persona/memory/cwd; the host owns the transcript, chair, synthesis, and reflection.
- The Adapter/API section notes the three new endpoints (`/api/council`, `/api/peers`, `/api/meeting/turn`) and the loopback trust model.
- `docs/architecture.md` adds `peers.ts`, `meeting-remote.ts`, and the new routes.
- `docs/data-model.md` documents the `AttendeeRef` shape, the back-compat coercion, and `meetings-incoming.jsonl`.

---

## Out of scope (deferred)

- **Cross-machine / LAN councils** — needs token auth and a cross-machine registry (currently same-machine only). Likely its own spec.
- Remote chair, remote/peer director, multi-director.
- Peer embedding meeting outcomes into its own index (Q5 chose log-only).
- Leased / whole-meeting remote locks (Q6 chose per-turn).
- Mid-meeting attendee changes; invite/consent UI (Q2 chose conscript).
- Scheduling cross-council meetings; exporting them in council templates.
- A read UI over `meetings-incoming.jsonl` beyond the optional councillor-page count.

## Open questions (deferred)

- Should the host snapshot a remote attendee's adapter/label at create time for display when the peer is offline, or always show "(offline)" with just the slug?
- When a peer is unreachable at create time, should the director be allowed to create anyway (current: yes, warn-only) or be blocked until it's up?
