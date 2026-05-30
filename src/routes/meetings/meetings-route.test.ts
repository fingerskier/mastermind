import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { actions } from './new/+page.server';
import { createCouncil } from '$lib/server/councils';
import { createCouncillor } from '$lib/server/councillors';
import { listMeetings } from '$lib/server/meetings';

vi.mock('$lib/server/peers', async (orig) => {
  const actual = (await orig()) as object;
  return { ...actual, resolvePeerPort: vi.fn(async () => 10192), listPeers: vi.fn(async () => []) };
});

function formData(obj: Record<string, string | string[]>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(obj)) {
    if (Array.isArray(v)) for (const x of v) f.append(k, x);
    else f.append(k, v);
  }
  return f;
}

describe('/meetings/new', () => {
  beforeEach(async () => {
    process.env.LANDSRAAD_COUNCIL_ROOT = mkdtempSync(join(tmpdir(), 'landsraad-rt-'));
    const { _resetForTests } = await import('$lib/server/councillor-lock');
    _resetForTests();
    await createCouncil({ name: 'T', description: '' });
    await createCouncillor({ name: 'Leto', role: 'duke', routing_hint: '', adapter: 'mock:local', persona: '' });
    await createCouncillor({ name: 'Mocky', role: 'sidekick', routing_hint: '', adapter: 'mock:local', persona: '' });
  });

  it('default action starts a meeting and redirects', async () => {
    const request = new Request('http://x/', {
      method: 'POST',
      body: formData({
        title: 'Strategy',
        topic: 'What should we do?',
        chair: 'leto',
        attendees: ['leto', 'mocky'],
        window_k: '2'
      })
    });
    let redirected: string | null = null;
    try {
      await actions.default({ request } as Parameters<typeof actions.default>[0]);
    } catch (err) {
      redirected = (err as { location?: string }).location ?? null;
    }
    expect(redirected).toMatch(/^\/meetings\//);
    const all = await listMeetings();
    expect(all).toHaveLength(1);
    expect(all[0].title).toBe('Strategy');
  });

  it('parses remote attendees from the form', async () => {
    const remote = JSON.stringify({ council_slug: 'ops', councillor_slug: 'gurney', cwd: '/ops', label: 'Gurney' });
    const request = new Request('http://x/', {
      method: 'POST',
      body: formData({ title: 'Cross', topic: 'sync', chair: 'leto', attendees: ['leto'], remote: [remote], window_k: '2' })
    });
    try {
      await actions.default({ request } as Parameters<typeof actions.default>[0]);
    } catch { /* redirect throws */ }
    const all = await listMeetings();
    const m = all.find((x) => x.title === 'Cross')!;
    expect(m.remote_attendees).toEqual([{ council_slug: 'ops', councillor_slug: 'gurney', cwd: '/ops', label: 'Gurney' }]);
  });
});
