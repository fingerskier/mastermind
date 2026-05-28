import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startMeeting } from './meeting-runner';
import { _resetForTests as resetLock, listHeldBy } from './councillor-lock';
import { createCouncil } from './councils';
import { createCouncillor } from './councillors';
import { readMeeting } from './meetings';

async function setup() {
  process.env.LANDSRAAD_COUNCIL_ROOT = mkdtempSync(join(tmpdir(), 'landsraad-mr-'));
  resetLock();
  await createCouncil({ name: 'T', description: '' });
  await createCouncillor({ name: 'Leto', role: 'duke', routing_hint: '', adapter: 'mock:local', persona: '' });
  await createCouncillor({ name: 'Mocky', role: 'sidekick', routing_hint: '', adapter: 'mock:local', persona: '' });
}

describe('meeting-runner startMeeting', () => {
  beforeEach(setup);

  it('acquires locks for all attendees and parks in awaiting_director', async () => {
    const m = await startMeeting({
      title: 'S',
      topic: 't',
      chair_slug: 'leto',
      attendees: ['leto', 'mocky'],
      window_k: 2
    });
    expect(m.status).toBe('awaiting_director');
    expect(listHeldBy({ kind: 'meeting', id: m.id }).sort()).toEqual(['leto', 'mocky']);
    const persisted = await readMeeting(m.id);
    expect(persisted.status).toBe('awaiting_director');
  });

  it('fails if any attendee is already busy', async () => {
    const { tryAcquire } = await import('./councillor-lock');
    tryAcquire('leto', { kind: 'job', id: 'J1' });
    await expect(
      startMeeting({
        title: 'S',
        topic: 't',
        chair_slug: 'leto',
        attendees: ['leto', 'mocky'],
        window_k: 2
      })
    ).rejects.toThrow(/leto/);
    // Mocky should not have been left locked
    expect(listHeldBy({ kind: 'meeting', id: 'x' })).toEqual([]);
  });
});
