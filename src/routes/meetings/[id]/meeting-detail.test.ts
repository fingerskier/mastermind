import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { actions, load } from './+page.server';
import { createCouncil } from '$lib/server/councils';
import { createCouncillor } from '$lib/server/councillors';
import { startMeeting } from '$lib/server/meeting-runner';
import { readMeeting } from '$lib/server/meetings';

vi.mock('$lib/server/peers', async (orig) => {
  const actual = (await orig()) as object;
  return { ...actual, resolvePeerPort: vi.fn(async () => null) };
});

describe('/meetings/[id] actions', () => {
  beforeEach(async () => {
    process.env.LANDSRAAD_COUNCIL_ROOT = mkdtempSync(join(tmpdir(), 'landsraad-md-'));
    const { _resetForTests } = await import('$lib/server/councillor-lock');
    _resetForTests();
    await createCouncil({ name: 'T', description: '' });
    await createCouncillor({ name: 'Leto', role: 'duke', routing_hint: '', adapter: 'mock:local', persona: '' });
  });

  it('speak appends a director turn', async () => {
    const m = await startMeeting({ title: 'S', topic: 't', chair_slug: 'leto', attendees: ['leto'], window_k: 2 });
    const form = new FormData();
    form.append('body', 'hello team');
    await actions.speak({
      request: new Request('http://x/', { method: 'POST', body: form }),
      params: { id: m.id }
    } as Parameters<typeof actions.speak>[0]);
    const after = await readMeeting(m.id);
    // After directorSpeak + advance, the director turn is recorded and the round
    // completes (mock adapter resolves quickly), so total_turns >= 1.
    expect(after.total_turns).toBeGreaterThanOrEqual(1);
  });

  it('end transitions to ended', async () => {
    const m = await startMeeting({ title: 'S', topic: 't', chair_slug: 'leto', attendees: ['leto'], window_k: 2 });
    await actions.end({ params: { id: m.id } } as Parameters<typeof actions.end>[0]);
    const after = await readMeeting(m.id);
    expect(after.status).toBe('ended');
  });

  it('cancel transitions to cancelled', async () => {
    const m = await startMeeting({ title: 'S', topic: 't', chair_slug: 'leto', attendees: ['leto'], window_k: 2 });
    await actions.cancel({ params: { id: m.id } } as Parameters<typeof actions.cancel>[0]);
    const after = await readMeeting(m.id);
    expect(after.status).toBe('cancelled');
  });

  it('load returns meeting + topic', async () => {
    const m = await startMeeting({ title: 'S', topic: 'hello topic', chair_slug: 'leto', attendees: ['leto'], window_k: 2 });
    const data = await load({ params: { id: m.id } } as Parameters<typeof load>[0]) as Awaited<ReturnType<typeof load>>;
    expect((data as { meeting: { id: string }; topic: string }).meeting.id).toBe(m.id);
    expect((data as { meeting: { id: string }; topic: string }).topic).toBe('hello topic');
  });

  it('reports offline remote attendees in load data', async () => {
    const { createMeeting } = await import('$lib/server/meetings');
    const m = await createMeeting({
      title: 'S', topic: 't', chair_slug: 'leto', attendees: ['leto'], window_k: 2,
      remote_attendees: [{ council_slug: 'ops', councillor_slug: 'gurney', cwd: '/ops', label: 'Gurney' }]
    });
    const { load: loadFn } = await import('./+page.server');
    const data = await loadFn({ params: { id: m.id } } as Parameters<typeof load>[0]);
    expect((data as { offlineRemotes: string[] }).offlineRemotes).toContain('ops:gurney');
  });
});
