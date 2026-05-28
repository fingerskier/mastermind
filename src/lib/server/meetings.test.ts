import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createMeeting,
  readMeeting,
  writeMeeting,
  listMeetings,
  appendMeetingEvent,
  readMeetingEvents,
  appendTranscriptBlock,
  readTranscript,
  writeSummary,
  readSummary,
  writeSynthesis,
  readTopic
} from './meetings';
import { createCouncil } from './councils';
import { createCouncillor } from './councillors';

function tempCouncil(): string {
  const d = mkdtempSync(join(tmpdir(), 'landsraad-mtg-'));
  process.env.LANDSRAAD_COUNCIL_ROOT = d;
  return d;
}

describe('meetings', () => {
  beforeEach(async () => {
    tempCouncil();
    await createCouncil({ name: 'Test', description: '' });
    await createCouncillor({ name: 'Leto', role: 'duke', routing_hint: '', adapter: 'mock:local', persona: '' });
    await createCouncillor({ name: 'Mocky', role: 'sidekick', routing_hint: '', adapter: 'mock:local', persona: '' });
  });

  it('createMeeting persists meeting.json + topic.md + empty transcript/summary', async () => {
    const m = await createMeeting({
      title: 'Strategy',
      topic: 'What is our Q3 focus?',
      chair_slug: 'leto',
      attendees: ['leto', 'mocky'],
      window_k: 2
    });
    expect(m.id).toMatch(/strategy$/);
    expect(m.status).toBe('awaiting_director');
    expect(m.current_round).toBe(1);
    expect(m.remaining_this_round.sort()).toEqual(['leto', 'mocky']);
    expect(m.director_spoken_this_round).toBe(false);
    expect(await readTopic(m.id)).toBe('What is our Q3 focus?');
    expect(await readSummary(m.id)).toBe('');
  });

  it('rejects creation when chair is not in attendees', async () => {
    await expect(
      createMeeting({ title: 'Bad', topic: 'x', chair_slug: 'leto', attendees: ['mocky'], window_k: 2 })
    ).rejects.toThrow(/chair/i);
  });

  it('rejects creation when an attendee is unknown', async () => {
    await expect(
      createMeeting({ title: 'Bad', topic: 'x', chair_slug: 'leto', attendees: ['leto', 'ghost'], window_k: 2 })
    ).rejects.toThrow(/ghost/);
  });

  it('appends transcript blocks and events', async () => {
    const m = await createMeeting({ title: 'S', topic: 't', chair_slug: 'leto', attendees: ['leto'], window_k: 2 });
    await appendTranscriptBlock(m.id, { turnIndex: 1, speaker: 'director', at: '2026-05-28T00:00:00.000Z', body: 'hi all' });
    await appendTranscriptBlock(m.id, { turnIndex: 2, speaker: 'leto', at: '2026-05-28T00:01:00.000Z', body: 'replied' });
    const t = await readTranscript(m.id);
    expect(t).toContain('## Turn 1 — director');
    expect(t).toContain('## Turn 2 — leto');
    await appendMeetingEvent(m.id, { at: '2026-05-28T00:02:00.000Z', type: 'turn_finished', speaker: 'leto', turn_index: 2 });
    const events = await readMeetingEvents(m.id);
    expect(events.find((e) => e.type === 'turn_finished')?.speaker).toBe('leto');
  });

  it('writeSummary + writeSynthesis persist their files', async () => {
    const m = await createMeeting({ title: 'S', topic: 't', chair_slug: 'leto', attendees: ['leto'], window_k: 2 });
    await writeSummary(m.id, 'rolling summary');
    expect(await readSummary(m.id)).toBe('rolling summary');
    await writeSynthesis(m.id, 'final synth');
  });

  it('listMeetings returns newest-first', async () => {
    await createMeeting({ title: 'A', topic: 't', chair_slug: 'leto', attendees: ['leto'], window_k: 2 }, new Date('2026-05-28T00:00:00Z'));
    await new Promise((r) => setTimeout(r, 10));
    await createMeeting({ title: 'B', topic: 't', chair_slug: 'leto', attendees: ['leto'], window_k: 2 }, new Date('2026-05-28T00:01:00Z'));
    const all = await listMeetings();
    expect(all[0].title).toBe('B');
    expect(all[1].title).toBe('A');
  });
});
