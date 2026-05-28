import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { recoverMeetings, startMeeting } from './meeting-runner';
import { createCouncil } from './councils';
import { createCouncillor } from './councillors';
import { readMeeting, writeMeeting } from './meetings';

describe('recoverMeetings', () => {
  beforeEach(async () => {
    process.env.LANDSRAAD_COUNCIL_ROOT = mkdtempSync(join(tmpdir(), 'landsraad-rec-'));
    await createCouncil({ name: 'T', description: '' });
    await createCouncillor({ name: 'Leto', role: 'duke', routing_hint: '', adapter: 'mock:local', persona: '' });
  });

  it('flips non-terminal meetings to failed and clears locks', async () => {
    const m = await startMeeting({ title: 'S', topic: 't', chair_slug: 'leto', attendees: ['leto'], window_k: 2 });
    const cur = await readMeeting(m.id);
    cur.status = 'running';
    await writeMeeting(cur);
    const { _resetForTests } = await import('./councillor-lock');
    _resetForTests();
    await recoverMeetings();
    const after = await readMeeting(m.id);
    expect(after.status).toBe('failed');
  });
});
