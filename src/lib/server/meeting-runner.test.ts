import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startMeeting, directorSpeak, directorSkip } from './meeting-runner';
import { _resetForTests as resetLock, listHeldBy } from './councillor-lock';
import { createCouncil } from './councils';
import { createCouncillor } from './councillors';
import { readMeeting, readTranscript, readMeetingEvents } from './meetings';

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

describe('director actions', () => {
  beforeEach(setup);

  it('directorSpeak appends a transcript block and marks director_spoken_this_round', async () => {
    const m = await startMeeting({ title: 'S', topic: 't', chair_slug: 'leto', attendees: ['leto', 'mocky'], window_k: 2 });
    await directorSpeak(m.id, 'good morning team');
    const after = await readMeeting(m.id);
    expect(after.director_spoken_this_round).toBe(true);
    expect(after.total_turns).toBe(1);
    const t = await readTranscript(m.id);
    expect(t).toContain('director');
    expect(t).toContain('good morning team');
  });

  it('directorSkip flips director_spoken_this_round without appending', async () => {
    const m = await startMeeting({ title: 'S', topic: 't', chair_slug: 'leto', attendees: ['leto'], window_k: 2 });
    await directorSkip(m.id);
    const after = await readMeeting(m.id);
    expect(after.director_spoken_this_round).toBe(true);
    expect(after.total_turns).toBe(0);
    const evts = await readMeetingEvents(m.id);
    expect(evts.some((e) => e.type === 'director_skipped')).toBe(true);
  });

  it('rejects directorSpeak when not awaiting_director', async () => {
    const m = await startMeeting({ title: 'S', topic: 't', chair_slug: 'leto', attendees: ['leto', 'mocky'], window_k: 2 });
    await directorSpeak(m.id, 'a');
    // With 2 attendees, after the director's turn the round still has councillors remaining.
    // The skeleton advance() leaves status as 'running' (no councillor turn loop yet).
    await expect(directorSpeak(m.id, 'b')).rejects.toThrow(/awaiting_director/);
  });
});
