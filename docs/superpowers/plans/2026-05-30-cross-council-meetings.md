# Cross-Council Meetings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a meeting hosted by one council summon councillors that live in *other running councils* on the same machine; each peer runs its own councillor (its persona, memory, adapter, cwd) over a loopback-only HTTP RPC, and the host owns the transcript, chair, synthesis, and reflection.

**Architecture:** Every `npx landsraad` instance exposes three new endpoints — `GET /api/council` (identity + roster), `GET /api/peers` (host-side aggregation of other instances), and `POST /api/meeting/turn` (peer-side: run one councillor turn for a summoning host). The host's meeting loop resolves each round's speaker to either a local councillor (existing path) or a remote attendee (summon over HTTP). Discovery rides the existing `~/.landsraad/instances.json` registry; remote attendees are keyed on the durable `cwd` and the live port is re-resolved per summon. The summon endpoint spawns an agent with no auth, so its reachability is the security boundary: servers bind `127.0.0.1` and the endpoint hard-rejects non-loopback callers.

**Tech Stack:** SvelteKit (adapter-node), TypeScript strict, ES modules, Node 20+, Vitest. Source spec: `docs/superpowers/specs/2026-05-30-cross-council-meetings-design.md`.

---

## Planning-time refinement of the spec's data model (READ FIRST)

The spec models attendees as a union `AttendeeRef = {kind:'local',slug} | {kind:'remote',...}` stored in `Meeting.attendees: AttendeeRef[]`. Implementing that literally would change the on-disk shape of *every* meeting and break the existing test suite (`meetings.test.ts:47` asserts `remaining_this_round` is `string[]`; the `/meetings/[id]` UI does `m.attendees.join(', ')` and treats `remaining_this_round[0]` as a string label).

To satisfy the spec's **intent** (local + remote attendees, a stable "speaker token" used in `transcript.md` headings + locks + embeddings, and legacy meetings still load) while keeping the existing on-disk format and the whole test suite green, this plan uses a **split representation**:

- `Meeting.attendees: string[]` — **local** councillor slugs (unchanged). Chair ∈ `attendees`.
- `Meeting.remote_attendees?: RemoteAttendee[]` — new, optional, defaults to `[]`.
- `Meeting.remaining_this_round: string[]` — now holds **speaker tokens**: a bare local slug, or a remote token `"<council_slug>:<councillor_slug>"`.

The conceptual `AttendeeRef` still exists as a *runtime* discriminator derived from these two fields (a token containing `:` is remote). Local councillor slugs never contain `:` (see `slugify` in `paths.ts`, which strips everything but `[a-z0-9-]`), so the `:` test is unambiguous.

This is the single most important consistency decision in the plan — every task below assumes this representation.

---

## File Structure

**New files:**
- `src/lib/server/peers.ts` — discover peer councils, resolve a peer's live port by cwd.
- `src/lib/server/peers.test.ts`
- `src/lib/server/meeting-remote.ts` — `summonRemoteTurn()` summon client + `MeetingContextDTO`.
- `src/lib/server/meeting-remote.test.ts`
- `src/lib/server/meeting-prompt.ts` — pure prompt composer shared by the peer turn handler.
- `src/lib/server/participation.ts` — `meetings-incoming.jsonl` append/read.
- `src/lib/server/participation.test.ts`
- `src/lib/server/net.ts` — `isLoopbackAddress()`.
- `src/lib/server/net.test.ts`
- `src/routes/api/council/+server.ts` + `src/routes/api/council/council-route.test.ts`
- `src/routes/api/peers/+server.ts` + `src/routes/api/peers/peers-route.test.ts`
- `src/routes/api/meeting/turn/+server.ts` + `src/routes/api/meeting/turn/turn-route.test.ts`

**Modified files:**
- `src/lib/server/config.ts` — add `PEER_DISCOVERY_TIMEOUT_MS`.
- `src/lib/server/councillor-lock.ts` — extend `LockHolder` with `'remote-meeting'`.
- `src/lib/types.ts` — `RemoteAttendee`, `Meeting.remote_attendees`.
- `src/lib/server/meetings.ts` — `NewMeetingInput.remote_attendees`, `createMeeting` builds remote tokens, back-compat reader, `appendTranscriptBlock` remote `councillor_slug=null`.
- `src/lib/server/meeting-runner.ts` — `startMeeting` validates remotes + locks only locals; `advance` branches local vs remote.
- `src/routes/meetings/new/+page.server.ts` + `+page.svelte` — remote picker + parse remote attendees.
- `src/routes/meetings/[id]/+page.server.ts` + `+page.svelte` — remote chips + offline indicator.
- `bin/landsraad.js` — default `HOST=127.0.0.1`.
- `SPECIFICATION.md`, `docs/architecture.md`, `docs/data-model.md`, `README.md`, `src/routes/api/openapi.json/+server.ts`.

**Suggested commit order:** Tasks 1–8 are peer-side / leaf modules (independent, each shippable). Task 9 is the data-model change. Task 10 wires the host loop. Tasks 11–14 are entrypoint, UI, and docs.

---

### Task 1: `isLoopbackAddress` helper

**Files:**
- Create: `src/lib/server/net.ts`
- Test: `src/lib/server/net.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/server/net.test.ts
import { describe, it, expect } from 'vitest';
import { isLoopbackAddress } from './net';

describe('isLoopbackAddress', () => {
  it('accepts IPv4 loopback', () => {
    expect(isLoopbackAddress('127.0.0.1')).toBe(true);
    expect(isLoopbackAddress('127.5.6.7')).toBe(true);
  });
  it('accepts IPv6 loopback and mapped form', () => {
    expect(isLoopbackAddress('::1')).toBe(true);
    expect(isLoopbackAddress('::ffff:127.0.0.1')).toBe(true);
  });
  it('rejects non-loopback', () => {
    expect(isLoopbackAddress('192.168.1.10')).toBe(false);
    expect(isLoopbackAddress('10.0.0.5')).toBe(false);
    expect(isLoopbackAddress('')).toBe(false);
    expect(isLoopbackAddress('example.com')).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/server/net.test.ts`
Expected: FAIL — `Failed to resolve import './net'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/server/net.ts

/** True for IPv4 127.0.0.0/8, IPv6 ::1, and IPv4-mapped loopback. */
export function isLoopbackAddress(addr: string): boolean {
  if (!addr) return false;
  if (addr === '::1') return true;
  const mapped = addr.startsWith('::ffff:') ? addr.slice(7) : addr;
  return /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(mapped);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/server/net.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/net.ts src/lib/server/net.test.ts
git commit -m "feat(server): isLoopbackAddress helper for cross-council gate"
```

---

### Task 2: `config.ts` — peer discovery timeout

**Files:**
- Modify: `src/lib/server/config.ts`

- [ ] **Step 1: Add the constant** (no separate test — it's a constant; `peers.test.ts` exercises it indirectly)

Append after the existing `MEETING_SUMMARY_TIMEOUT_MS` line in `src/lib/server/config.ts`:

```ts
export const PEER_DISCOVERY_TIMEOUT_MS = envInt('LANDSRAAD_PEER_DISCOVERY_TIMEOUT_MS', 2_000);
```

- [ ] **Step 2: Type-check**

Run: `npm run check`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/server/config.ts
git commit -m "feat(config): PEER_DISCOVERY_TIMEOUT_MS for cross-council discovery"
```

---

### Task 3: `GET /api/council` — identity + roster

**Files:**
- Create: `src/routes/api/council/+server.ts`
- Test: `src/routes/api/council/council-route.test.ts`

The `busy` flag reflects the in-memory councillor-lock via `current(slug)` from `councillor-lock.ts`.

- [ ] **Step 1: Write the failing test**

```ts
// src/routes/api/council/council-route.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GET } from './+server';
import { createCouncil } from '$lib/server/councils';
import { createCouncillor } from '$lib/server/councillors';

describe('GET /api/council', () => {
  beforeEach(async () => {
    process.env.LANDSRAAD_COUNCIL_ROOT = mkdtempSync(join(tmpdir(), 'landsraad-council-rt-'));
    const { _resetForTests } = await import('$lib/server/councillor-lock');
    _resetForTests();
    await createCouncil({ name: 'Engineering Council', description: '' });
    await createCouncillor({ name: 'Leto', role: 'duke', routing_hint: '', adapter: 'cli:claude', persona: '' });
  });

  it('returns slug, name and roster with busy reflecting the lock', async () => {
    const res = await GET({} as Parameters<typeof GET>[0]);
    const body = await res.json();
    expect(body.slug).toBe('engineering-council');
    expect(body.name).toBe('Engineering Council');
    expect(body.councillors).toEqual([
      { slug: 'leto', label: 'Leto', adapter: 'cli:claude', busy: false }
    ]);
  });

  it('marks a locked councillor busy', async () => {
    const { tryAcquire } = await import('$lib/server/councillor-lock');
    tryAcquire('leto', { kind: 'job', id: 'j1' });
    const res = await GET({} as Parameters<typeof GET>[0]);
    const body = await res.json();
    expect(body.councillors[0].busy).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/routes/api/council/council-route.test.ts`
Expected: FAIL — cannot resolve `./+server`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/routes/api/council/+server.ts
import { json } from '@sveltejs/kit';
import { readCouncil } from '$lib/server/councils';
import { listCouncillors } from '$lib/server/councillors';
import { current } from '$lib/server/councillor-lock';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
  const council = await readCouncil();
  const councillors = (await listCouncillors()).map((c) => ({
    slug: c.slug,
    label: c.name,
    adapter: c.adapter,
    busy: current(c.slug) !== null
  }));
  return json({ slug: council.slug, name: council.name, councillors });
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/routes/api/council/council-route.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/routes/api/council
git commit -m "feat(api): GET /api/council identity + roster endpoint"
```

---

### Task 4: `peers.ts` — discovery + port resolution

**Files:**
- Create: `src/lib/server/peers.ts`
- Test: `src/lib/server/peers.test.ts`

`listPeers` reads the instance registry, fetches each peer's `/api/council`, excludes self by `cwd`, and drops unreachable instances. `resolvePeerPort` re-resolves a durable `cwd` to its current live port. Both accept injected dependencies so tests need no live server.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/server/peers.test.ts
import { describe, it, expect } from 'vitest';
import { listPeers, resolvePeerPort } from './peers';
import type { Instance } from './instances';

const inst = (cwd: string, port: number): Instance => ({
  pid: 1, port, cwd, startedAt: '2026-05-30T00:00:00Z'
});

describe('listPeers', () => {
  it('aggregates instances ⨯ /api/council, excludes self, drops unreachable', async () => {
    const instances: Instance[] = [
      inst('/me', 10191),     // self — excluded
      inst('/peerA', 10192),  // reachable
      inst('/peerB', 10193)   // unreachable
    ];
    const fetchImpl = (async (url: string) => {
      if (url.includes('10192')) {
        return new Response(
          JSON.stringify({
            slug: 'a-council',
            name: 'A Council',
            councillors: [{ slug: 'leto', label: 'Leto', adapter: 'cli:claude', busy: false }]
          }),
          { status: 200 }
        );
      }
      throw new Error('connection refused');
    }) as unknown as typeof fetch;

    const peers = await listPeers({ selfCwd: '/me', instances, fetchImpl });
    expect(peers).toHaveLength(1);
    expect(peers[0]).toMatchObject({
      council_slug: 'a-council',
      name: 'A Council',
      cwd: '/peerA',
      port: 10192
    });
    expect(peers[0].councillors[0].slug).toBe('leto');
  });

  it('drops instances with a null port', async () => {
    const instances: Instance[] = [{ pid: 2, port: null, cwd: '/x', startedAt: 'x' }];
    const fetchImpl = (async () => { throw new Error('should not fetch'); }) as unknown as typeof fetch;
    expect(await listPeers({ selfCwd: '/me', instances, fetchImpl })).toEqual([]);
  });
});

describe('resolvePeerPort', () => {
  it('returns the live port for a cwd', async () => {
    const instances: Instance[] = [inst('/peerA', 10192)];
    expect(await resolvePeerPort('/peerA', instances)).toBe(10192);
  });
  it('returns null when the cwd is no longer running', async () => {
    expect(await resolvePeerPort('/gone', [])).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/server/peers.test.ts`
Expected: FAIL — cannot resolve `./peers`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/server/peers.ts
import { readInstances, type Instance } from './instances';
import { PEER_DISCOVERY_TIMEOUT_MS } from './config';

export interface PeerCouncillor {
  slug: string;
  label: string;
  adapter: string;
  busy: boolean;
}

export interface Peer {
  council_slug: string;
  name: string;
  cwd: string;
  port: number;
  councillors: PeerCouncillor[];
}

interface ListPeersOpts {
  selfCwd: string;
  /** Override for tests. Defaults to the live registry. */
  instances?: Instance[];
  /** Override for tests. Defaults to global fetch. */
  fetchImpl?: typeof fetch;
}

async function fetchCouncil(
  port: number,
  fetchImpl: typeof fetch
): Promise<{ slug: string; name: string; councillors: PeerCouncillor[] } | null> {
  try {
    const res = await fetchImpl(`http://127.0.0.1:${port}/api/council`, {
      signal: AbortSignal.timeout(PEER_DISCOVERY_TIMEOUT_MS)
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { slug: string; name: string; councillors: PeerCouncillor[] };
    if (!body || typeof body.slug !== 'string') return null;
    return body;
  } catch {
    return null;
  }
}

export async function listPeers(opts: ListPeersOpts): Promise<Peer[]> {
  const instances = opts.instances ?? (await readInstances());
  const fetchImpl = opts.fetchImpl ?? fetch;
  const others = instances.filter((i) => i.cwd !== opts.selfCwd && typeof i.port === 'number');
  const results = await Promise.all(
    others.map(async (i) => {
      const council = await fetchCouncil(i.port as number, fetchImpl);
      if (!council) return null;
      return {
        council_slug: council.slug,
        name: council.name,
        cwd: i.cwd,
        port: i.port as number,
        councillors: council.councillors ?? []
      } satisfies Peer;
    })
  );
  return results.filter((p): p is Peer => p !== null);
}

/** Durable cwd → live port. null when the peer is no longer running. */
export async function resolvePeerPort(cwd: string, instances?: Instance[]): Promise<number | null> {
  const list = instances ?? (await readInstances());
  const hit = list.find((i) => i.cwd === cwd && typeof i.port === 'number');
  return hit ? (hit.port as number) : null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/server/peers.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/peers.ts src/lib/server/peers.test.ts
git commit -m "feat(server): peers.ts — discover peer councils + resolve live port by cwd"
```

---

### Task 5: `GET /api/peers` — host-side aggregation

**Files:**
- Create: `src/routes/api/peers/+server.ts`
- Test: `src/routes/api/peers/peers-route.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/routes/api/peers/peers-route.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('$lib/server/peers', () => ({
  listPeers: vi.fn(async () => [
    { council_slug: 'a', name: 'A', cwd: '/a', port: 10192, councillors: [] }
  ])
}));

describe('GET /api/peers', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns the aggregated peer list', async () => {
    const { GET } = await import('./+server');
    const res = await GET({} as Parameters<typeof GET>[0]);
    const body = await res.json();
    expect(body.peers).toHaveLength(1);
    expect(body.peers[0].council_slug).toBe('a');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/routes/api/peers/peers-route.test.ts`
Expected: FAIL — cannot resolve `./+server`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/routes/api/peers/+server.ts
import { json } from '@sveltejs/kit';
import { listPeers } from '$lib/server/peers';
import { councilRoot } from '$lib/server/paths';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
  const peers = await listPeers({ selfCwd: councilRoot() });
  return json({ peers });
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/routes/api/peers/peers-route.test.ts`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add src/routes/api/peers
git commit -m "feat(api): GET /api/peers host-side discovery aggregation"
```

---

### Task 6: `councillor-lock.ts` — `remote-meeting` holder kind

**Files:**
- Modify: `src/lib/server/councillor-lock.ts`
- Test: `src/lib/server/councillor-lock.test.ts` (create if absent; otherwise append)

The peer holds a councillor's slot for one remote turn with a distinct holder kind so audit/debug output can tell it apart from a local meeting or job. Equality stays keyed on `kind`+`id` only.

- [ ] **Step 1: Write the failing test**

Create `src/lib/server/councillor-lock.test.ts` (if it already exists, append the `describe` block):

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { tryAcquire, release, current, _resetForTests } from './councillor-lock';

describe('councillor-lock remote-meeting holder', () => {
  beforeEach(() => _resetForTests());

  it('acquires and releases a remote-meeting hold', () => {
    const holder = { kind: 'remote-meeting' as const, id: 'm1', host: 'eng-council' };
    expect(tryAcquire('leto', holder)).toBe(true);
    expect(tryAcquire('leto', { kind: 'meeting', id: 'm2' })).toBe(false); // busy
    expect(current('leto')).toEqual(holder);
    release('leto', { kind: 'remote-meeting', id: 'm1', host: 'eng-council' });
    expect(current('leto')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/server/councillor-lock.test.ts`
Expected: FAIL — `tryAcquire` rejects the `'remote-meeting'` holder type (TypeScript) / compile error.

- [ ] **Step 3: Write minimal implementation**

In `src/lib/server/councillor-lock.ts`, extend the union:

```ts
export type LockHolder =
  | { kind: 'job'; id: string }
  | { kind: 'meeting'; id: string }
  | { kind: 'remote-meeting'; id: string; host: string };
```

`eq()` already compares only `kind` and `id`, so no other change is needed.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/server/councillor-lock.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/councillor-lock.ts src/lib/server/councillor-lock.test.ts
git commit -m "feat(lock): remote-meeting holder kind for cross-council turns"
```

---

### Task 7: `participation.ts` — peer audit log

**Files:**
- Modify: `src/lib/server/paths.ts` (add `meetingsIncomingFile`)
- Create: `src/lib/server/participation.ts`
- Test: `src/lib/server/participation.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/server/participation.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { appendIncomingParticipation, readIncomingParticipation } from './participation';

describe('participation log', () => {
  beforeEach(() => {
    process.env.LANDSRAAD_COUNCIL_ROOT = mkdtempSync(join(tmpdir(), 'landsraad-part-'));
  });

  it('appends and reads back records', async () => {
    await appendIncomingParticipation({
      ts: '2026-05-30T00:00:00Z', host_council: 'eng', meeting_id: 'm1',
      councillor_slug: 'leto', duration_ms: 1234, exit_code: 0
    });
    await appendIncomingParticipation({
      ts: '2026-05-30T00:01:00Z', host_council: 'eng', meeting_id: 'm1',
      councillor_slug: 'leto', duration_ms: 50, exit_code: 1
    });
    const rows = await readIncomingParticipation();
    expect(rows).toHaveLength(2);
    expect(rows[0].councillor_slug).toBe('leto');
    expect(rows[1].exit_code).toBe(1);
  });

  it('returns [] when the log is missing', async () => {
    expect(await readIncomingParticipation()).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/server/participation.test.ts`
Expected: FAIL — cannot resolve `./participation`.

- [ ] **Step 3a: Add the path helper**

Append to `src/lib/server/paths.ts` (after `meetingIdFor`):

```ts
export function meetingsIncomingFile(): string {
  return join(councilRoot(), 'meetings-incoming.jsonl');
}
```

- [ ] **Step 3b: Write the module**

```ts
// src/lib/server/participation.ts
import { appendFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { meetingsIncomingFile } from './paths';

export interface IncomingParticipation {
  ts: string;
  host_council: string;
  meeting_id: string;
  councillor_slug: string;
  duration_ms: number;
  exit_code: number;
}

/** Append one summon audit record to <council-root>/meetings-incoming.jsonl. */
export async function appendIncomingParticipation(rec: IncomingParticipation): Promise<void> {
  await appendFile(meetingsIncomingFile(), JSON.stringify(rec) + '\n', 'utf8');
}

export async function readIncomingParticipation(): Promise<IncomingParticipation[]> {
  const file = meetingsIncomingFile();
  if (!existsSync(file)) return [];
  const raw = await readFile(file, 'utf8');
  return raw
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as IncomingParticipation);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/server/participation.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/paths.ts src/lib/server/participation.ts src/lib/server/participation.test.ts
git commit -m "feat(server): meetings-incoming.jsonl peer participation log"
```

---

### Task 8: `meeting-prompt.ts` — shared turn-prompt composer

**Files:**
- Create: `src/lib/server/meeting-prompt.ts`
- Test: `src/lib/server/meeting-prompt.test.ts`

The peer turn handler (Task 9b) must assemble a turn prompt from a context DTO plus its own persona/memory. Factor a pure composer so the format lives in one place. It mirrors the structure of `meeting-runner.ts`'s `buildTurnPrompt` (persona → memory → meeting block) but takes already-resolved strings instead of reading from a meeting on disk.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/server/meeting-prompt.test.ts
import { describe, it, expect } from 'vitest';
import { composeRemoteTurnPrompt } from './meeting-prompt';

describe('composeRemoteTurnPrompt', () => {
  it('orders persona, memory, then the meeting block', () => {
    const out = composeRemoteTurnPrompt({
      persona: 'You are Leto.',
      memCtx: '# Shared council memory\n\n### note\n\nbody',
      title: 'Sync',
      topic: 'What next?',
      summary: 'Earlier we discussed X.',
      recentTurns: ['## Turn 3 — director — t\n\nhi'],
      speakerInstruction: 'You are leto. Speak now.'
    });
    expect(out.indexOf('You are Leto.')).toBeLessThan(out.indexOf('Shared council memory'));
    expect(out.indexOf('Shared council memory')).toBeLessThan(out.indexOf('# Meeting: Sync'));
    expect(out).toContain('## Summary of earlier turns');
    expect(out).toContain('Earlier we discussed X.');
    expect(out).toContain('## Topic');
    expect(out).toContain('You are leto. Speak now.');
  });

  it('omits empty persona, memory, and summary sections', () => {
    const out = composeRemoteTurnPrompt({
      persona: '',
      memCtx: '',
      title: 'Sync',
      topic: '',
      summary: '',
      recentTurns: [],
      speakerInstruction: 'You are leto. Speak now.'
    });
    expect(out).not.toContain('# Persona');
    expect(out).not.toContain('## Summary of earlier turns');
    expect(out).toContain('(no topic)');
    expect(out).toContain('(no turns yet)');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/server/meeting-prompt.test.ts`
Expected: FAIL — cannot resolve `./meeting-prompt`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/server/meeting-prompt.ts

export interface ComposeTurnPromptParts {
  persona: string;
  memCtx: string;
  title: string;
  topic: string;
  summary: string;
  recentTurns: string[];
  speakerInstruction: string;
}

/** Build a meeting turn prompt from resolved parts. Mirrors meeting-runner.buildTurnPrompt. */
export function composeRemoteTurnPrompt(parts: ComposeTurnPromptParts): string {
  const sections: string[] = [];
  if (parts.persona.trim()) sections.push(`# Persona\n\n${parts.persona.trim()}`);
  if (parts.memCtx.trim()) sections.push(parts.memCtx);
  const recent = parts.recentTurns.join('\n\n');
  sections.push(
    [
      `# Meeting: ${parts.title}`,
      '',
      `## Topic`,
      '',
      parts.topic.trim() || '(no topic)',
      '',
      parts.summary.trim() ? `## Summary of earlier turns\n\n${parts.summary.trim()}\n` : '',
      `## Recent turns`,
      '',
      recent.trim() || '(no turns yet)',
      '',
      parts.speakerInstruction
    ].join('\n')
  );
  return sections.join('\n\n') + '\n';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/server/meeting-prompt.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/meeting-prompt.ts src/lib/server/meeting-prompt.test.ts
git commit -m "feat(server): composeRemoteTurnPrompt shared turn-prompt composer"
```

---

### Task 9: `meeting-remote.ts` — the summon client

**Files:**
- Create: `src/lib/server/meeting-remote.ts`
- Test: `src/lib/server/meeting-remote.test.ts`

`summonRemoteTurn` re-resolves the port (gone → `unreachable`), POSTs `/api/meeting/turn`, and maps results: HTTP 409 → `busy`, network error / timeout / null port → `unreachable`, `{ok:false}` body → `turn_failed`, `{ok:true}` body → success. Dependencies are injectable for tests.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/server/meeting-remote.test.ts
import { describe, it, expect } from 'vitest';
import { summonRemoteTurn, type MeetingContextDTO } from './meeting-remote';

const ctx: MeetingContextDTO = {
  title: 'Sync', topic: 't', summary: '', recent_turns: [], speaker_instruction: 'You are leto. Speak now.'
};
const base = {
  cwd: '/peerA', councillor_slug: 'leto', meeting_id: 'm1', host_council: 'eng', context: ctx
};

describe('summonRemoteTurn', () => {
  it('returns ok with text on a 200 {ok:true} body', async () => {
    const r = await summonRemoteTurn(base, {
      resolvePort: async () => 10192,
      fetchImpl: (async () =>
        new Response(JSON.stringify({ ok: true, text: 'hello', duration_ms: 12 }), { status: 200 })) as unknown as typeof fetch
    });
    expect(r).toEqual({ ok: true, text: 'hello', duration_ms: 12 });
  });

  it('maps a missing port to unreachable', async () => {
    const r = await summonRemoteTurn(base, { resolvePort: async () => null, fetchImpl: (async () => { throw new Error('x'); }) as unknown as typeof fetch });
    expect(r).toMatchObject({ ok: false, reason: 'unreachable' });
  });

  it('maps a connection error to unreachable', async () => {
    const r = await summonRemoteTurn(base, {
      resolvePort: async () => 10192,
      fetchImpl: (async () => { throw new Error('ECONNREFUSED'); }) as unknown as typeof fetch
    });
    expect(r).toMatchObject({ ok: false, reason: 'unreachable' });
  });

  it('maps HTTP 409 to busy', async () => {
    const r = await summonRemoteTurn(base, {
      resolvePort: async () => 10192,
      fetchImpl: (async () => new Response(JSON.stringify({ error: 'busy' }), { status: 409 })) as unknown as typeof fetch
    });
    expect(r).toMatchObject({ ok: false, reason: 'busy' });
  });

  it('maps a {ok:false} body to turn_failed', async () => {
    const r = await summonRemoteTurn(base, {
      resolvePort: async () => 10192,
      fetchImpl: (async () =>
        new Response(JSON.stringify({ ok: false, exit_code: 2, detail: 'boom' }), { status: 200 })) as unknown as typeof fetch
    });
    expect(r).toMatchObject({ ok: false, reason: 'turn_failed', detail: 'boom' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/server/meeting-remote.test.ts`
Expected: FAIL — cannot resolve `./meeting-remote`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/server/meeting-remote.ts
import { resolvePeerPort } from './peers';
import { MEETING_TURN_TIMEOUT_MS } from './config';

export interface MeetingContextDTO {
  title: string;
  topic: string;
  summary: string;
  recent_turns: string[];
  speaker_instruction: string;
}

export interface RemoteTurnInput {
  cwd: string; // durable peer key; port re-resolved here
  councillor_slug: string;
  meeting_id: string;
  host_council: string;
  context: MeetingContextDTO;
  signal?: AbortSignal;
}

export type RemoteTurnResult =
  | { ok: true; text: string; duration_ms: number }
  | { ok: false; reason: 'unreachable' | 'busy' | 'turn_failed'; detail: string };

interface SummonDeps {
  resolvePort?: (cwd: string) => Promise<number | null>;
  fetchImpl?: typeof fetch;
}

export async function summonRemoteTurn(
  input: RemoteTurnInput,
  deps: SummonDeps = {}
): Promise<RemoteTurnResult> {
  const resolvePort = deps.resolvePort ?? resolvePeerPort;
  const fetchImpl = deps.fetchImpl ?? fetch;

  const port = await resolvePort(input.cwd);
  if (port === null) {
    return { ok: false, reason: 'unreachable', detail: `no live instance at ${input.cwd}` };
  }

  let res: Response;
  try {
    res = await fetchImpl(`http://127.0.0.1:${port}/api/meeting/turn`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        meeting_id: input.meeting_id,
        host_council: input.host_council,
        councillor_slug: input.councillor_slug,
        context: input.context
      }),
      signal: input.signal ?? AbortSignal.timeout(MEETING_TURN_TIMEOUT_MS)
    });
  } catch (err) {
    return { ok: false, reason: 'unreachable', detail: err instanceof Error ? err.message : String(err) };
  }

  if (res.status === 409) {
    return { ok: false, reason: 'busy', detail: `councillor ${input.councillor_slug} busy on peer` };
  }
  if (!res.ok) {
    return { ok: false, reason: 'turn_failed', detail: `peer returned HTTP ${res.status}` };
  }

  const body = (await res.json().catch(() => null)) as
    | { ok: true; text: string; duration_ms: number }
    | { ok: false; exit_code?: number; detail?: string }
    | null;

  if (!body) return { ok: false, reason: 'turn_failed', detail: 'unparseable peer response' };
  if (body.ok) return { ok: true, text: body.text, duration_ms: body.duration_ms };
  return { ok: false, reason: 'turn_failed', detail: body.detail ?? `exit ${body.exit_code ?? '?'}` };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/server/meeting-remote.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/meeting-remote.ts src/lib/server/meeting-remote.test.ts
git commit -m "feat(server): summonRemoteTurn cross-council summon client"
```

---

### Task 10: `POST /api/meeting/turn` — peer-side summon handler

**Files:**
- Create: `src/routes/api/meeting/turn/+server.ts`
- Test: `src/routes/api/meeting/turn/turn-route.test.ts`

Handler steps: loopback gate (403) → resolve councillor (404) → `tryAcquire` remote-meeting hold (409 if busy) → assemble prompt locally (persona + memory via `assembleContextFor` + `composeRemoteTurnPrompt`) → run adapter in this council's cwd → append participation record → release lock in `finally` → respond `{ok:true,...}` on exit 0, else `{ok:false, exit_code, detail}`.

- [ ] **Step 1: Write the failing test**

```ts
// src/routes/api/meeting/turn/turn-route.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { POST } from './+server';
import { createCouncil } from '$lib/server/councils';
import { createCouncillor } from '$lib/server/councillors';
import { readIncomingParticipation } from '$lib/server/participation';

type Ev = Parameters<typeof POST>[0];

function event(body: unknown, addr = '127.0.0.1'): Ev {
  return {
    request: new Request('http://127.0.0.1/api/meeting/turn', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body)
    }),
    getClientAddress: () => addr
  } as unknown as Ev;
}

const ctx = { title: 'Sync', topic: 't', summary: '', recent_turns: [], speaker_instruction: 'You are leto. Speak now.' };

describe('POST /api/meeting/turn', () => {
  beforeEach(async () => {
    process.env.LANDSRAAD_COUNCIL_ROOT = mkdtempSync(join(tmpdir(), 'landsraad-turn-'));
    const { _resetForTests } = await import('$lib/server/councillor-lock');
    _resetForTests();
    await createCouncil({ name: 'A', description: '' });
    await createCouncillor({ name: 'Leto', role: 'duke', routing_hint: '', adapter: 'mock:local', persona: 'You are Leto.' });
  });

  it('rejects a non-loopback caller with 403', async () => {
    const res = await POST(event({ meeting_id: 'm1', host_council: 'eng', councillor_slug: 'leto', context: ctx }, '10.0.0.9'));
    expect(res.status).toBe(403);
  });

  it('returns 404 for an unknown councillor', async () => {
    const res = await POST(event({ meeting_id: 'm1', host_council: 'eng', councillor_slug: 'ghost', context: ctx }));
    expect(res.status).toBe(404);
  });

  it('runs the adapter, logs participation, and frees the lock', async () => {
    const { current } = await import('$lib/server/councillor-lock');
    const res = await POST(event({ meeting_id: 'm1', host_council: 'eng', councillor_slug: 'leto', context: ctx }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(typeof body.text).toBe('string');
    expect(current('leto')).toBeNull(); // released
    const rows = await readIncomingParticipation();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ host_council: 'eng', councillor_slug: 'leto', exit_code: 0 });
  });

  it('returns 409 when the councillor is already held', async () => {
    const { tryAcquire } = await import('$lib/server/councillor-lock');
    tryAcquire('leto', { kind: 'job', id: 'j1' });
    const res = await POST(event({ meeting_id: 'm1', host_council: 'eng', councillor_slug: 'leto', context: ctx }));
    expect(res.status).toBe(409);
  });
});
```

> Note: the test relies on `mock:local` producing exit 0 with some text. If the mock adapter requires a non-empty prompt or specific shape, the prompt assembled here (persona + meeting block) satisfies it — `mock:local` echoes input.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/routes/api/meeting/turn/turn-route.test.ts`
Expected: FAIL — cannot resolve `./+server`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/routes/api/meeting/turn/+server.ts
import { json } from '@sveltejs/kit';
import { isLoopbackAddress } from '$lib/server/net';
import { readCouncillor } from '$lib/server/councillors';
import { tryAcquire, release } from '$lib/server/councillor-lock';
import { resolveAdapter } from '$lib/server/adapters';
import { runAdapter } from '$lib/server/adapters/runAdapter';
import { assembleContextFor } from '$lib/server/context';
import { composeRemoteTurnPrompt } from '$lib/server/meeting-prompt';
import { appendIncomingParticipation } from '$lib/server/participation';
import { councilRoot } from '$lib/server/paths';
import { MEETING_TURN_TIMEOUT_MS } from '$lib/server/config';
import type { MeetingContextDTO } from '$lib/server/meeting-remote';
import type { RequestHandler } from './$types';

interface TurnRequest {
  meeting_id: string;
  host_council: string;
  councillor_slug: string;
  context: MeetingContextDTO;
}

export const POST: RequestHandler = async ({ request, getClientAddress }) => {
  if (!isLoopbackAddress(getClientAddress())) {
    return json({ error: 'forbidden: non-loopback caller' }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as TurnRequest | null;
  if (!body || !body.councillor_slug || !body.context) {
    return json({ error: 'bad request' }, { status: 400 });
  }

  const councillor = await readCouncillor(body.councillor_slug).catch(() => null);
  if (!councillor) {
    return json({ error: `unknown councillor "${body.councillor_slug}"` }, { status: 404 });
  }

  const holder = { kind: 'remote-meeting' as const, id: body.meeting_id, host: body.host_council };
  if (!tryAcquire(body.councillor_slug, holder)) {
    return json({ error: 'busy' }, { status: 409 });
  }

  try {
    const adapter = resolveAdapter(councillor.adapter);
    if (!adapter) {
      return json({ ok: false, exit_code: -1, detail: `unknown adapter "${councillor.adapter}"` }, { status: 200 });
    }

    const ctx = body.context;
    const memQuery = `${ctx.title}\n${ctx.topic}\n${ctx.recent_turns.at(-1) ?? ''}`;
    const memCtx = await assembleContextFor(body.councillor_slug, memQuery);
    const prompt = composeRemoteTurnPrompt({
      persona: councillor.persona,
      memCtx,
      title: ctx.title,
      topic: ctx.topic,
      summary: ctx.summary,
      recentTurns: ctx.recent_turns,
      speakerInstruction: ctx.speaker_instruction
    });

    const result = await runAdapter({
      adapter,
      prompt,
      cwd: councilRoot(),
      timeoutMs: MEETING_TURN_TIMEOUT_MS
    });

    await appendIncomingParticipation({
      ts: new Date().toISOString(),
      host_council: body.host_council,
      meeting_id: body.meeting_id,
      councillor_slug: body.councillor_slug,
      duration_ms: result.durationMs,
      exit_code: result.exit_code
    });

    if (result.exit_code !== 0) {
      return json(
        { ok: false, exit_code: result.exit_code, detail: result.timedOut ? 'turn_timeout' : `exit ${result.exit_code}` },
        { status: 200 }
      );
    }
    return json({ ok: true, text: result.output, duration_ms: result.durationMs }, { status: 200 });
  } finally {
    release(body.councillor_slug, holder);
  }
};
```

> **Verified result shape** (`src/lib/server/adapters/runAdapter.ts`): `RunAdapterResult = { transcript: string; output: string; exit_code: number; durationMs: number; timedOut: boolean; aborted: boolean }`. The turn text is `result.output`; elapsed is `result.durationMs` (camelCase — note this differs from the wire/DTO field `duration_ms`).

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/routes/api/meeting/turn/turn-route.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/routes/api/meeting/turn
git commit -m "feat(api): POST /api/meeting/turn loopback-gated peer summon handler"
```

---

### Task 11: Data model — `RemoteAttendee` + `meetings.ts`

**Files:**
- Modify: `src/lib/types.ts:134-152` (the `Meeting` interface) + add `RemoteAttendee`
- Modify: `src/lib/server/meetings.ts` (`NewMeetingInput`, `createMeeting`, reader, `appendTranscriptBlock`)
- Test: `src/lib/server/meetings.test.ts` (append two tests)

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/server/meetings.test.ts` (inside the existing top-level describe or as a new one — match the file's structure; it uses `createMeeting` with a council + `leto`/`mocky` councillors already created in `beforeEach`):

```ts
import { remoteToken } from './meetings';

describe('createMeeting with remote attendees', () => {
  it('stores remote_attendees and seeds remaining_this_round with tokens', async () => {
    const m = await createMeeting({
      title: 'X', topic: 't', chair_slug: 'leto', attendees: ['leto'], window_k: 2,
      remote_attendees: [{ council_slug: 'ops', councillor_slug: 'gurney', cwd: '/ops', label: 'Gurney' }]
    });
    expect(m.attendees).toEqual(['leto']);
    expect(m.remote_attendees).toEqual([
      { council_slug: 'ops', councillor_slug: 'gurney', cwd: '/ops', label: 'Gurney' }
    ]);
    expect(m.remaining_this_round.sort()).toEqual(['leto', 'ops:gurney']);
  });

  it('back-compat: a meeting.json with no remote_attendees loads with []', async () => {
    const m = await createMeeting({ title: 'Y', topic: 't', chair_slug: 'leto', attendees: ['leto'], window_k: 2 });
    const reloaded = await readMeeting(m.id);
    expect(reloaded.remote_attendees).toEqual([]);
  });
});

describe('remoteToken', () => {
  it('joins council and councillor with a colon', () => {
    expect(remoteToken({ council_slug: 'ops', councillor_slug: 'gurney', cwd: '/x', label: 'G' })).toBe('ops:gurney');
  });
});
```

The existing test at line 47 (`expect(m.remaining_this_round.sort()).toEqual(['leto', 'mocky'])`) must STILL pass — verify the split representation keeps it green (it does: with no remotes, tokens are bare slugs).

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/server/meetings.test.ts`
Expected: FAIL — `remote_attendees` not on `NewMeetingInput`; `remoteToken` not exported.

- [ ] **Step 3a: Extend types**

In `src/lib/types.ts`, add above the `Meeting` interface:

```ts
export interface RemoteAttendee {
  council_slug: string;
  councillor_slug: string;
  cwd: string;
  label: string;
}
```

Add one field to `Meeting` (after `attendees: string[];`):

```ts
  remote_attendees?: RemoteAttendee[];
```

- [ ] **Step 3b: Extend `meetings.ts`**

Add the import and helper near the top of `src/lib/server/meetings.ts` (after the existing imports):

```ts
import type { RemoteAttendee } from '$lib/types';

export function remoteToken(r: RemoteAttendee): string {
  return `${r.council_slug}:${r.councillor_slug}`;
}
```

Extend `NewMeetingInput`:

```ts
export interface NewMeetingInput {
  title: string;
  topic: string;
  chair_slug: string;
  attendees: string[];
  remote_attendees?: RemoteAttendee[];
  window_k: number;
}
```

In `createMeeting`, after the existing local-attendee validation loop, build the token list and store remotes. Replace the `meeting` object construction so that:

```ts
  const remotes = input.remote_attendees ?? [];
  const allTokens = [...input.attendees, ...remotes.map(remoteToken)];

  const meeting: Meeting = {
    id,
    title: input.title.trim(),
    chair_slug: input.chair_slug,
    attendees: input.attendees.slice(),
    remote_attendees: remotes,
    status: 'awaiting_director',
    window_k: input.window_k,
    started_at: now.toISOString(),
    ended_at: null,
    current_round: 1,
    remaining_this_round: shuffle(allTokens, rng),
    director_spoken_this_round: false,
    last_summarized_turn: 0,
    total_turns: 0
  };
```

(Chair must remain a local attendee — the existing check `if (!input.attendees.includes(input.chair_slug))` already enforces this, since `attendees` is locals-only. Good.)

Make the reader back-compat. Replace `readMeeting`:

```ts
export async function readMeeting(id: string): Promise<Meeting> {
  const raw = await readFile(join(meetingDir(id), MEETING_FILE), 'utf8');
  const m = JSON.parse(raw) as Meeting;
  if (!m.remote_attendees) m.remote_attendees = [];
  return m;
}
```

Make remote turns embed with `councillor_slug: null`. In `appendTranscriptBlock`, change the final `councillor_slug` line:

```ts
    councillor_slug: block.speaker === 'director' || block.speaker.includes(':') ? null : block.speaker
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/server/meetings.test.ts`
Expected: PASS — new tests pass AND the pre-existing line-47 test still passes.

Then run the full meeting suite to confirm nothing regressed:

Run: `npm test -- src/lib/server/meeting-indexing.test.ts src/lib/server/meeting-runner.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/types.ts src/lib/server/meetings.ts src/lib/server/meetings.test.ts
git commit -m "feat(meetings): RemoteAttendee model + token-based remaining_this_round (back-compat)"
```

---

### Task 12: Host loop — `meeting-runner.ts` local/remote branch

**Files:**
- Modify: `src/lib/server/meeting-runner.ts` (`startMeeting`, `releaseMeetingLocks`, `advance`)
- Test: `src/lib/server/meeting-runner-remote.test.ts` (new)

`startMeeting` must (a) validate that every remote attendee resolves to a live instance at create time (unreachable → throw, treated as unavailable per the spec), and (b) lock only LOCAL attendees. `advance` resolves the popped token: bare slug → existing local path; `council:slug` token → summon path. Remote failures map to `paused` with the documented `pause_reason`. Resume retries the same token (existing unshift behavior).

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/server/meeting-runner-remote.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Mock the summon client and port resolution so no live peer is needed.
const summonMock = vi.fn();
vi.mock('./meeting-remote', () => ({ summonRemoteTurn: (...args: unknown[]) => summonMock(...args) }));
vi.mock('./peers', async (orig) => {
  const actual = (await orig()) as object;
  return { ...actual, resolvePeerPort: vi.fn(async () => 10192) };
});

import { startMeeting, directorSpeak, resumeMeeting } from './meeting-runner';
import { readMeeting, readTranscript } from './meetings';
import { createCouncil } from './councils';
import { createCouncillor } from './councillors';

const remote = { council_slug: 'ops', councillor_slug: 'gurney', cwd: '/ops', label: 'Gurney' };

describe('cross-council meeting turns', () => {
  beforeEach(async () => {
    process.env.LANDSRAAD_COUNCIL_ROOT = mkdtempSync(join(tmpdir(), 'landsraad-mrr-'));
    const { _resetForTests } = await import('./councillor-lock');
    _resetForTests();
    summonMock.mockReset();
    await createCouncil({ name: 'Eng', description: '' });
    await createCouncillor({ name: 'Leto', role: 'duke', routing_hint: '', adapter: 'mock:local', persona: '' });
  });

  it('summons a remote attendee and appends its turn to the transcript', async () => {
    summonMock.mockResolvedValue({ ok: true, text: 'remote says hi', duration_ms: 5 });
    const m = await startMeeting({
      title: 'S', topic: 't', chair_slug: 'leto', attendees: ['leto'], window_k: 2, remote_attendees: [remote]
    });
    await directorSpeak(m.id, 'kickoff');
    const tx = await readTranscript(m.id);
    expect(summonMock).toHaveBeenCalled();
    expect(tx).toContain('ops:gurney');
    expect(tx).toContain('remote says hi');
    const fresh = await readMeeting(m.id);
    expect(fresh.status).not.toBe('paused');
  });

  it('pauses with remote_unreachable when the peer is gone', async () => {
    summonMock.mockResolvedValue({ ok: false, reason: 'unreachable', detail: 'gone' });
    const m = await startMeeting({
      title: 'S', topic: 't', chair_slug: 'leto', attendees: ['leto'], window_k: 2, remote_attendees: [remote]
    });
    await directorSpeak(m.id, 'kickoff');
    const fresh = await readMeeting(m.id);
    expect(fresh.status).toBe('paused');
    expect(fresh.pause_reason).toBe('remote_unreachable:ops');
    expect(fresh.remaining_this_round).toContain('ops:gurney'); // re-queued for resume
  });

  it('pauses with remote_busy on a 409 and remote_turn_failed on a failed turn', async () => {
    summonMock.mockResolvedValue({ ok: false, reason: 'busy', detail: 'busy' });
    const m = await startMeeting({
      title: 'S', topic: 't', chair_slug: 'leto', attendees: ['leto'], window_k: 2, remote_attendees: [remote]
    });
    await directorSpeak(m.id, 'kickoff');
    expect((await readMeeting(m.id)).pause_reason).toBe('remote_busy:ops:gurney');

    summonMock.mockResolvedValue({ ok: false, reason: 'turn_failed', detail: 'boom' });
    await resumeMeeting(m.id);
    expect((await readMeeting(m.id)).pause_reason).toBe('remote_turn_failed:ops:gurney');
  });
});
```

> If a remote attendee is unreachable *at create time*, `startMeeting` throws. The tests above mock `resolvePeerPort` to return a live port, so creation succeeds; the failure is injected at summon time via `summonMock`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/server/meeting-runner-remote.test.ts`
Expected: FAIL — the remote branch doesn't exist yet (summon never called; token treated as a local slug → `readCouncillor('ops:gurney')` throws or wrong behavior).

- [ ] **Step 3: Edit `meeting-runner.ts`**

Add imports at the top:

```ts
import { summonRemoteTurn } from './meeting-remote';
import { resolvePeerPort } from './peers';
import { remoteToken } from './meetings';
import type { RemoteAttendee } from '$lib/types';
```

Replace `startMeeting` so it validates remotes and locks only locals:

```ts
export async function startMeeting(input: NewMeetingInput, now: Date = new Date()): Promise<Meeting> {
  // Pre-flight: every LOCAL attendee must be free. Use a probe holder we immediately release.
  const probe = { kind: 'meeting' as const, id: 'PROBE' };
  const busy: string[] = [];
  for (const slug of input.attendees) {
    if (!tryAcquire(slug, probe)) busy.push(slug);
  }
  for (const slug of input.attendees) releaseLock(slug, probe);
  if (busy.length > 0) {
    throw new Error(`Cannot start meeting: councillor(s) busy: ${busy.join(', ')}`);
  }

  // Remote attendees must resolve to a live instance at create time (unreachable = unavailable).
  for (const r of input.remote_attendees ?? []) {
    const port = await resolvePeerPort(r.cwd);
    if (port === null) {
      throw new Error(`Cannot start meeting: remote council at ${r.cwd} (${r.label}) is not running.`);
    }
  }

  const meeting = await createMeeting(input, now);
  for (const slug of meeting.attendees) {
    tryAcquire(slug, { kind: 'meeting', id: meeting.id });
  }
  return meeting;
}
```

`releaseMeetingLocks` already iterates `meeting.attendees` (locals only) — no change needed.

Add a helper to find a remote attendee by token, above `advance`:

```ts
function findRemote(m: Meeting, token: string): RemoteAttendee | undefined {
  return (m.remote_attendees ?? []).find((r) => remoteToken(r) === token);
}
```

Now rework the speaker dispatch in `advance`. Replace everything from `const speakerSlug = m.remaining_this_round.shift()!;` through the end of the `try { ... } finally { ... }` block with:

```ts
  const token = m.remaining_this_round.shift()!;
  await writeMeeting(m);
  await appendMeetingEvent(id, { at: new Date().toISOString(), type: 'turn_started', speaker: token });

  await refreshSummaryIfNeeded(id);

  const remote = findRemote(m, token);

  if (remote) {
    // ----- Remote turn: summon the peer -----
    const controller = new AbortController();
    inFlight.set(id, controller);
    try {
      const after = await readMeeting(id);
      const topic = await readTopic(id);
      const summary = await readSummary(id);
      const transcript = await readTx(id);
      const recent = lastKTurns(transcript, after.window_k).map(
        (t) => `## Turn ${t.turnIndex} — ${t.speaker} — ${t.at}\n\n${t.body}`
      );
      const result = await summonRemoteTurn({
        cwd: remote.cwd,
        councillor_slug: remote.councillor_slug,
        meeting_id: id,
        host_council: after.chair_slug, // host identity is informational; chair council is fine
        context: {
          title: after.title,
          topic,
          summary,
          recent_turns: recent,
          speaker_instruction: `You are ${remote.councillor_slug}. Speak now.`
        },
        signal: controller.signal
      });

      if (controller.signal.aborted) return;

      if (!result.ok) {
        const reasonMap = {
          unreachable: `remote_unreachable:${remote.council_slug}`,
          busy: `remote_busy:${remote.council_slug}:${remote.councillor_slug}`,
          turn_failed: `remote_turn_failed:${remote.council_slug}:${remote.councillor_slug}`
        } as const;
        const cur = await readMeeting(id);
        cur.status = 'paused';
        cur.pause_reason = reasonMap[result.reason];
        cur.remaining_this_round.unshift(token); // resume retries the same remote speaker
        await writeMeeting(cur);
        await appendMeetingEvent(id, { at: new Date().toISOString(), type: 'turn_failed', speaker: token, message: cur.pause_reason });
        await appendMeetingEvent(id, { at: new Date().toISOString(), type: 'paused', message: cur.pause_reason });
        return;
      }

      const cur = await readMeeting(id);
      cur.total_turns += 1;
      await appendTranscriptBlock(id, {
        turnIndex: cur.total_turns,
        speaker: token,
        at: new Date().toISOString(),
        body: result.text
      });
      await writeMeeting(cur);
      await appendMeetingEvent(id, { at: new Date().toISOString(), type: 'turn_finished', speaker: token, turn_index: cur.total_turns });
    } finally {
      inFlight.delete(id);
    }

    await advance(id);
    return;
  }

  // ----- Local turn (existing path) -----
  const speakerSlug = token;
  const councillor = await readCouncillor(speakerSlug);
  const adapter = resolveAdapter(councillor.adapter);
  if (!adapter) {
    const cur = await readMeeting(id);
    cur.status = 'paused';
    cur.pause_reason = `turn_failed: unknown adapter "${councillor.adapter}" for ${speakerSlug}`;
    await writeMeeting(cur);
    await appendMeetingEvent(id, { at: new Date().toISOString(), type: 'turn_failed', speaker: speakerSlug, message: cur.pause_reason });
    await appendMeetingEvent(id, { at: new Date().toISOString(), type: 'paused', message: cur.pause_reason });
    return;
  }

  const controller = new AbortController();
  inFlight.set(id, controller);
  try {
    const prompt = await buildTurnPrompt(id, speakerSlug);
    const result = await runAdapter({
      adapter,
      prompt,
      cwd: councilRoot(),
      timeoutMs: MEETING_TURN_TIMEOUT_MS,
      abortSignal: controller.signal
    });

    if (controller.signal.aborted) return;

    if (result.exit_code !== 0) {
      const cur = await readMeeting(id);
      cur.status = 'paused';
      cur.pause_reason = result.timedOut ? 'turn_timeout' : `turn_failed: exit ${result.exit_code}`;
      cur.remaining_this_round.unshift(speakerSlug);
      await writeMeeting(cur);
      await appendMeetingEvent(id, { at: new Date().toISOString(), type: 'turn_failed', speaker: speakerSlug, message: cur.pause_reason });
      await appendMeetingEvent(id, { at: new Date().toISOString(), type: 'paused', message: cur.pause_reason });
      return;
    }

    const cur = await readMeeting(id);
    cur.total_turns += 1;
    await appendTranscriptBlock(id, {
      turnIndex: cur.total_turns,
      speaker: speakerSlug,
      at: new Date().toISOString(),
      body: result.output
    });
    await writeMeeting(cur);
    await appendMeetingEvent(id, { at: new Date().toISOString(), type: 'turn_finished', speaker: speakerSlug, turn_index: cur.total_turns });
  } finally {
    inFlight.delete(id);
  }

  await advance(id);
```

> The round-reshuffle block earlier in `advance` already uses `m.attendees.slice()`. Change it to include remote tokens so remotes participate every round. Replace `const next = m.attendees.slice();` with:
>
> ```ts
>     const next = [...m.attendees, ...(m.remote_attendees ?? []).map(remoteToken)];
> ```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/server/meeting-runner-remote.test.ts`
Expected: PASS (3 tests).

Then confirm no regression in the existing runner suite:

Run: `npm test -- src/lib/server/meeting-runner.test.ts src/lib/server/meeting-recovery.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/meeting-runner.ts src/lib/server/meeting-runner-remote.test.ts
git commit -m "feat(meetings): host loop summons remote attendees; failures pause the meeting"
```

---

### Task 13: `bin/landsraad.js` — bind loopback by default

**Files:**
- Modify: `src/` n/a — `bin/landsraad.js:92`

The production server must bind `127.0.0.1` so the summon endpoint is never network-reachable. adapter-node honors `HOST`. This is a one-line default that a user can still override (e.g. `HOST=0.0.0.0` to view the UI from another device — the loopback caller gate in Task 10 still blocks cross-machine summons).

- [ ] **Step 1: Edit the env construction**

In `bin/landsraad.js`, find (line ~92):

```js
  const env = { ...process.env, LANDSRAAD_PKG_ROOT: repoRoot };
```

Replace with:

```js
  const env = { ...process.env, LANDSRAAD_PKG_ROOT: repoRoot };
  // Bind loopback by default so the no-auth summon endpoint (/api/meeting/turn) is never
  // network-reachable. A user may still override with HOST=0.0.0.0 to view the UI remotely;
  // the loopback caller gate on /api/meeting/turn still blocks cross-machine summons.
  if (!env.HOST) env.HOST = '127.0.0.1';
```

- [ ] **Step 2: Manual verification (no unit test — this is the spawn entrypoint)**

```bash
npm run build
node bin/landsraad.js
```

Expected: the "Listening on …" line shows `127.0.0.1` (or `localhost` after the browser-open rewrite). Confirm the browser still opens to a working UI. Then `Ctrl+C`.

Confirm the override still works:

```bash
# PowerShell:  $env:HOST='0.0.0.0'; node bin/landsraad.js
HOST=0.0.0.0 node bin/landsraad.js
```

Expected: binds `0.0.0.0`; the UI is reachable; a `curl` to `/api/meeting/turn` from a non-loopback address would 403 (cannot easily test cross-machine here — covered by the unit test in Task 10).

- [ ] **Step 3: Commit**

```bash
git add bin/landsraad.js
git commit -m "feat(cli): bind HOST=127.0.0.1 by default to gate the summon endpoint"
```

---

### Task 14: UI — `/meetings/new` remote attendee picker

**Files:**
- Modify: `src/routes/meetings/new/+page.server.ts`
- Modify: `src/routes/meetings/new/+page.svelte`
- Test: `src/routes/meetings/meetings-route.test.ts` (append a remote-attendee case)

The picker offers remote councillors from `GET`'d peers. Each remote checkbox carries a JSON blob (`council_slug`, `councillor_slug`, `cwd`, `label`) so the action can reconstruct the `RemoteAttendee` without a second lookup. Chair stays local-only (already the case — the chair `<select>` is fed from `data.councillors`).

- [ ] **Step 1: Write the failing test**

Append to `src/routes/meetings/meetings-route.test.ts`. The action must accept `remote` form fields and create a meeting whose `remote_attendees` is populated. Because `startMeeting` validates remote reachability, mock `resolvePeerPort` for this test:

```ts
import { vi } from 'vitest';
vi.mock('$lib/server/peers', async (orig) => {
  const actual = (await orig()) as object;
  return { ...actual, resolvePeerPort: vi.fn(async () => 10192), listPeers: vi.fn(async () => []) };
});

// ... inside describe('/meetings/new'):
it('parses remote attendees from the form', async () => {
  const remote = JSON.stringify({ council_slug: 'ops', councillor_slug: 'gurney', cwd: '/ops', label: 'Gurney' });
  const request = new Request('http://x/', {
    method: 'POST',
    body: formData({
      title: 'Cross', topic: 'sync', chair: 'leto', attendees: ['leto'], remote: [remote], window_k: '2'
    })
  });
  try {
    await actions.default({ request } as Parameters<typeof actions.default>[0]);
  } catch { /* redirect */ }
  const all = await listMeetings();
  const m = all.find((x) => x.title === 'Cross')!;
  expect(m.remote_attendees).toEqual([{ council_slug: 'ops', councillor_slug: 'gurney', cwd: '/ops', label: 'Gurney' }]);
});
```

> The `vi.mock` must be at the top of the test file (hoisted). If the file already mocks modules, merge; otherwise add the block at the top after imports. Note the existing tests in this file don't create remotes, so `resolvePeerPort` is simply unused by them.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/routes/meetings/meetings-route.test.ts`
Expected: FAIL — `remote_attendees` is `[]`/undefined because the action ignores `remote` fields.

- [ ] **Step 3a: Edit `+page.server.ts`**

```ts
import type { Actions, PageServerLoad } from './$types';
import { fail, redirect } from '@sveltejs/kit';
import { listCouncillors } from '$lib/server/councillors';
import { startMeeting } from '$lib/server/meeting-runner';
import { listPeers } from '$lib/server/peers';
import { councilRoot } from '$lib/server/paths';
import { MEETING_WINDOW_K_DEFAULT } from '$lib/server/config';
import type { RemoteAttendee } from '$lib/types';

export const load: PageServerLoad = async () => {
  return {
    councillors: await listCouncillors(),
    peers: await listPeers({ selfCwd: councilRoot() }),
    defaultWindowK: MEETING_WINDOW_K_DEFAULT
  };
};

export const actions: Actions = {
  default: async ({ request }) => {
    const form = await request.formData();
    const title = String(form.get('title') ?? '').trim();
    const topic = String(form.get('topic') ?? '');
    const chair = String(form.get('chair') ?? '').trim();
    const attendees = form.getAll('attendees').map(String).filter(Boolean);
    const remote_attendees: RemoteAttendee[] = [];
    for (const raw of form.getAll('remote').map(String).filter(Boolean)) {
      try {
        const r = JSON.parse(raw) as RemoteAttendee;
        if (r.council_slug && r.councillor_slug && r.cwd) remote_attendees.push(r);
      } catch {
        // ignore malformed remote entries
      }
    }
    const windowK =
      Number.parseInt(String(form.get('window_k') ?? ''), 10) || MEETING_WINDOW_K_DEFAULT;

    if (!title) return fail(400, { error: 'Title is required.' });
    if (!chair) return fail(400, { error: 'Chair is required.' });
    if (!attendees.includes(chair)) attendees.push(chair);

    let meetingId: string;
    try {
      const m = await startMeeting({
        title,
        topic,
        chair_slug: chair,
        attendees,
        remote_attendees,
        window_k: windowK
      });
      meetingId = m.id;
    } catch (err) {
      return fail(400, { error: err instanceof Error ? err.message : String(err) });
    }

    throw redirect(303, `/meetings/${meetingId}`);
  }
};
```

- [ ] **Step 3b: Edit `+page.svelte`**

Add a "Remote councils" fieldset after the existing local attendees fieldset (after line 38, before the Window K label):

```svelte
  {#if data.peers.length > 0}
    <fieldset class="attendees">
      <legend>Remote councils</legend>
      {#each data.peers as p (p.cwd)}
        <p class="peer-head">{p.name} <span class="role">{p.cwd}</span></p>
        {#each p.councillors as rc (rc.slug)}
          <label class="check">
            <input
              type="checkbox"
              name="remote"
              value={JSON.stringify({ council_slug: p.council_slug, councillor_slug: rc.slug, cwd: p.cwd, label: rc.label })}
              disabled={rc.busy}
            />
            <span>{rc.label}</span>
            <span class="role">{rc.adapter}{rc.busy ? ' · busy' : ''}</span>
          </label>
        {/each}
      {/each}
    </fieldset>
  {:else}
    <p class="role">No other councils are running.</p>
  {/if}
```

Add a small style for `.peer-head` inside the `<style>` block:

```css
  .peer-head { margin: 0.4rem 0 0.1rem; font-weight: 600; }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/routes/meetings/meetings-route.test.ts`
Expected: PASS (existing + new case).

Run: `npm run check`
Expected: no new type errors.

- [ ] **Step 5: Smoke + commit**

Smoke (optional but recommended): `npm run dev`, open `/meetings/new`, confirm the "No other councils are running." line renders (no peers in a single dev instance).

```bash
git add src/routes/meetings/new src/routes/meetings/meetings-route.test.ts
git commit -m "feat(ui): /meetings/new remote attendee picker"
```

---

### Task 15: UI — `/meetings/[id]` remote chips + offline indicator

**Files:**
- Modify: `src/routes/meetings/[id]/+page.server.ts`
- Modify: `src/routes/meetings/[id]/+page.svelte`
- Test: `src/routes/meetings/[id]/meeting-detail.test.ts` (append)

Remote speakers (transcript headers + "waiting on") render as `<council> › <slug>` with a remote badge. The load computes which remote attendees are currently offline (peer not in the live registry) so the UI can mark them `(offline)`.

- [ ] **Step 1: Write the failing test**

Append to `src/routes/meetings/[id]/meeting-detail.test.ts`. The load must return an `offlineRemotes` set/array. Mock `resolvePeerPort` to report the peer offline:

```ts
import { vi } from 'vitest';
vi.mock('$lib/server/peers', async (orig) => {
  const actual = (await orig()) as object;
  return { ...actual, resolvePeerPort: vi.fn(async () => null) };
});

it('reports offline remote attendees in load data', async () => {
  const { createMeeting } = await import('$lib/server/meetings');
  const m = await createMeeting({
    title: 'S', topic: 't', chair_slug: 'leto', attendees: ['leto'], window_k: 2,
    remote_attendees: [{ council_slug: 'ops', councillor_slug: 'gurney', cwd: '/ops', label: 'Gurney' }]
  });
  const { load } = await import('./+page.server');
  const data = await load({ params: { id: m.id } } as Parameters<typeof load>[0]);
  expect(data.offlineRemotes).toContain('ops:gurney');
});
```

> Match the existing file's `beforeEach` setup (council + `leto`). The mock returns `null` so the single remote attendee is reported offline.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/routes/meetings/[id]/meeting-detail.test.ts`
Expected: FAIL — `offlineRemotes` not in load data.

- [ ] **Step 3a: Edit `+page.server.ts` load**

Add imports and compute `offlineRemotes`:

```ts
import { resolvePeerPort } from '$lib/server/peers';
import { remoteToken } from '$lib/server/meetings';
```

Extend the `load` return (compute before the `return`):

```ts
  const offlineRemotes: string[] = [];
  for (const r of meeting.remote_attendees ?? []) {
    if ((await resolvePeerPort(r.cwd)) === null) offlineRemotes.push(remoteToken(r));
  }
  return {
    meeting,
    topic: await readTopic(params.id),
    transcript: await readTranscript(params.id),
    summary: await readSummary(params.id),
    synthesis: meeting.status === 'ended' ? await readSynthesis(params.id) : '',
    events: await readMeetingEvents(params.id),
    offlineRemotes
  };
```

- [ ] **Step 3b: Edit `+page.svelte`**

Add helpers in the `<script>` block (after `const m = $derived(data.meeting);`):

```ts
  const isRemote = (token: string) => token.includes(':');
  const prettySpeaker = (token: string) =>
    isRemote(token) ? token.replace(':', ' › ') : token;
  const offline = $derived(new Set<string>(data.offlineRemotes ?? []));
```

In the header line (line ~67), replace the attendees span with one that also lists remotes + offline markers:

```svelte
  <span>attendees: {m.attendees.join(', ')}{#if m.remote_attendees?.length}, {m.remote_attendees.map((r) => `${r.council_slug} › ${r.councillor_slug}${offline.has(`${r.council_slug}:${r.councillor_slug}`) ? ' (offline)' : ''}`).join(', ')}{/if}</span> ·
```

In the transcript turn header (line ~131), render remote speakers as a chip:

```svelte
          <span class="turn-speaker" class:remote={isRemote(t.speaker)}>{prettySpeaker(t.speaker)}</span>
```

In `computeNext` "waiting on" labels, prettify the token. Replace the two `meeting.remaining_this_round[0]` returns with `prettySpeaker(meeting.remaining_this_round[0])`.

Add styles in `<style>`:

```css
  .turn-speaker.remote {
    background: rgba(106, 166, 255, 0.12);
    border: 1px solid var(--accent, #6aa6ff);
    border-radius: 4px;
    padding: 0 0.4em;
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/routes/meetings/[id]/meeting-detail.test.ts`
Expected: PASS.

Run: `npm run check`
Expected: no new type errors.

- [ ] **Step 5: Commit**

```bash
git add src/routes/meetings/[id]
git commit -m "feat(ui): /meetings/[id] remote speaker chips + offline indicator"
```

---

### Task 16: Docs + OpenAPI

**Files:**
- Modify: `SPECIFICATION.md`
- Modify: `docs/architecture.md`
- Modify: `docs/data-model.md`
- Modify: `README.md`
- Modify: `src/routes/api/openapi.json/+server.ts`

- [ ] **Step 1: `SPECIFICATION.md`** — add to the Meeting concept section:

> A meeting may include **remote attendees** — councillors belonging to other councils running on the same machine. When a remote attendee's turn comes up, the host summons it over a loopback-only HTTP API (`POST /api/meeting/turn`); the peer runs that councillor with its own persona, memory, adapter, and cwd, and returns the turn text. The host owns the transcript, chair, synthesis, and reflection; the peer only logs participation. Discovery uses the running-instance registry (`/api/instances` → `/api/council` → `/api/peers`). Servers bind `127.0.0.1` and the summon endpoint rejects non-loopback callers, so cross-machine summons are refused.

Add to the API/adapter table the three endpoints: `GET /api/council`, `GET /api/peers`, `POST /api/meeting/turn` (loopback-only).

- [ ] **Step 2: `docs/architecture.md`** — add to the module-boundaries list:

```
- `src/lib/server/peers.ts` — discover peer councils (instances ⨯ `/api/council`); resolve a peer's live port by durable `cwd`.
- `src/lib/server/meeting-remote.ts` — `summonRemoteTurn()`: POST `/api/meeting/turn`, map busy/unreachable/turn_failed.
- `src/lib/server/meeting-prompt.ts` — pure turn-prompt composer shared by the peer summon handler.
- `src/lib/server/participation.ts` — `meetings-incoming.jsonl` peer audit log.
- `src/lib/server/net.ts` — `isLoopbackAddress()` for the summon caller gate.
- `src/routes/api/council`, `src/routes/api/peers`, `src/routes/api/meeting/turn` — cross-council endpoints.
```

- [ ] **Step 3: `docs/data-model.md`** — document the split attendee representation (locals in `attendees: string[]`, remotes in `remote_attendees: RemoteAttendee[]`, `remaining_this_round` holds tokens where a remote token is `<council_slug>:<councillor_slug>`), the back-compat default (`remote_attendees` → `[]` on read), and the `meetings-incoming.jsonl` record shape (`{ ts, host_council, meeting_id, councillor_slug, duration_ms, exit_code }`).

- [ ] **Step 4: `README.md`** — under "Running instance registry", add a short "Cross-council meetings" subsection:

> Multiple councils running at once on the same machine can hold a **cross-council meeting**: when you create a meeting, the New Meeting page lists councillors from other running councils under "Remote councils". A remote attendee runs on its own council (its persona, memory, and adapter); your council orchestrates the meeting and owns the transcript. Summons are loopback-only — the server binds `127.0.0.1` and refuses cross-machine summon requests.

- [ ] **Step 5: `openapi.json/+server.ts`** — add path entries for `/api/council`, `/api/peers`, `/api/meeting/turn`. Open the file first to match its existing structure; add minimal schemas consistent with the responses defined in Tasks 3, 5, and 10.

- [ ] **Step 6: Type-check, test, commit**

```bash
npm run check
npm test
git add SPECIFICATION.md docs/architecture.md docs/data-model.md README.md src/routes/api/openapi.json
git commit -m "docs: cross-council meetings — spec, architecture, data model, README, OpenAPI"
```

---

## Final verification

- [ ] Run the full suite: `npm test` — all green.
- [ ] `npm run check` — no type errors.
- [ ] Two-instance smoke (manual): in two folders each with a council, run `npx landsraad` (after `npm run build`), create councillors in both, then from one council's `/meetings/new` confirm the other council's councillors appear under "Remote councils", start a meeting including a remote attendee, take a director turn, and confirm the remote turn lands in the transcript as a `<council> › <slug>` chip and a `meetings-incoming.jsonl` line appears in the peer's folder.

---

## Self-review notes (planner)

- **Spec coverage:** `/api/council` (T3), `peers.ts` (T4), `/api/peers` (T5), per-turn remote lock kind (T6), participation log (T7), prompt composer (T8), `summonRemoteTurn` + DTO (T9), `/api/meeting/turn` loopback gate + run + log + release (T10), AttendeeRef/back-compat (T11), host loop branch + pause reasons + resume (T12), HOST=127.0.0.1 (T13), `/meetings/new` picker + chair-stays-local (T14), `/meetings/[id]` chips + offline (T15), docs + OpenAPI + memory index (token in transcript header drives `meeting_turn` embedding with `councillor_slug=null`, handled in T11) (T16). Failure table → T12 tests. Create-time reachability rejection → T12 `startMeeting`.
- **Deviation flagged:** spec's `attendees: AttendeeRef[]` is implemented as the split representation (locals `string[]` + `remote_attendees`); rationale documented at the top of this plan. Intent (local+remote, token, back-compat) preserved; existing tests/UI unchanged.
- **Type consistency:** `RemoteAttendee` fields (`council_slug`, `councillor_slug`, `cwd`, `label`), `remoteToken` (`a:b`), `MeetingContextDTO` (`recent_turns`, `speaker_instruction`), `RemoteTurnResult` reasons (`unreachable`/`busy`/`turn_failed`), pause reasons (`remote_unreachable:<c>`, `remote_busy:<c>:<s>`, `remote_turn_failed:<c>:<s>`) used identically across T9/T10/T12.
- **Resolved (was an open assumption):** `runAdapter` returns `{ transcript, output, exit_code, durationMs, timedOut, aborted }` — verified against `src/lib/server/adapters/runAdapter.ts`. T10 uses `result.output` for text and `result.durationMs` for elapsed (camelCase, distinct from the wire field `duration_ms`).
