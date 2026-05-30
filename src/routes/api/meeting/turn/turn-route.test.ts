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
