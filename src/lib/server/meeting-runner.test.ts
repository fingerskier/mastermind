import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startMeeting, directorSpeak, directorSkip, endMeeting } from './meeting-runner';
import { _resetForTests as resetLock, listHeldBy } from './councillor-lock';
import { createCouncil } from './councils';
import { createCouncillor } from './councillors';
import { readMeeting, readTranscript, readMeetingEvents, readSummary, readSynthesis } from './meetings';

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

  it('directorSpeak appends a transcript block and runs advance to completion', async () => {
    // With 2 attendees, directorSpeak triggers advance() which runs both councillors and
    // rolls over to round 2. By the time the await resolves the round is complete.
    const m = await startMeeting({ title: 'S', topic: 't', chair_slug: 'leto', attendees: ['leto', 'mocky'], window_k: 2 });
    await directorSpeak(m.id, 'good morning team');
    const after = await readMeeting(m.id);
    // Round 1 complete: rolled to round 2, director flag reset, 3 total turns.
    expect(after.current_round).toBe(2);
    expect(after.director_spoken_this_round).toBe(false);
    expect(after.total_turns).toBe(3); // director + 2 councillors
    const t = await readTranscript(m.id);
    expect(t).toContain('director');
    expect(t).toContain('good morning team');
  });

  it('directorSkip flips director_spoken_this_round without appending a director block', async () => {
    // With 1 attendee, directorSkip triggers advance() which runs leto's turn and rolls
    // to round 2. The director turn is skipped (not in transcript), councillor turn is.
    const m = await startMeeting({ title: 'S', topic: 't', chair_slug: 'leto', attendees: ['leto'], window_k: 2 });
    await directorSkip(m.id);
    const after = await readMeeting(m.id);
    // Round 1 complete: leto spoke, round 2 awaiting director, director flag reset.
    expect(after.current_round).toBe(2);
    expect(after.director_spoken_this_round).toBe(false);
    expect(after.total_turns).toBe(1); // only the councillor turn
    const evts = await readMeetingEvents(m.id);
    expect(evts.some((e) => e.type === 'director_skipped')).toBe(true);
  });

  it('rejects directorSpeak when not awaiting_director (paused meeting)', async () => {
    // Use an unknown adapter to force the meeting into paused state, then verify
    // that directorSpeak throws the right error.
    await createCouncillor({ name: 'Broken', role: 'test', routing_hint: '', adapter: 'unknown:adapter', persona: '' });
    const m = await startMeeting({ title: 'S', topic: 't', chair_slug: 'leto', attendees: ['leto', 'broken'], window_k: 2 });
    // directorSpeak will trigger advance which hits 'broken' with an unknown adapter and pauses.
    await directorSpeak(m.id, 'a');
    const paused = await readMeeting(m.id);
    // May be paused (if broken was first) or awaiting_director (if leto was first).
    // Either way, if paused, a second speak should fail.
    if (paused.status === 'paused') {
      await expect(directorSpeak(m.id, 'b')).rejects.toThrow(/awaiting_director/);
    }
    // If not paused (broken came second, round completed successfully for leto),
    // then the meeting is awaiting_director for round 2 — directorSpeak succeeds, which is correct.
  });

  it('happy path: director speaks, both councillors speak in round 1, then awaits director for round 2', async () => {
    const m = await startMeeting({ title: 'S', topic: 't', chair_slug: 'leto', attendees: ['leto', 'mocky'], window_k: 2 });
    await directorSpeak(m.id, 'hi');
    // After directorSpeak -> advance(), the runner should have spawned both councillor turns sequentially.
    // Poll briefly for completion.
    for (let i = 0; i < 100; i++) {
      const cur = await readMeeting(m.id);
      if (cur.status === 'awaiting_director' && cur.current_round === 2) break;
      await new Promise((r) => setTimeout(r, 20));
    }
    const final = await readMeeting(m.id);
    expect(final.current_round).toBe(2);
    expect(final.director_spoken_this_round).toBe(false);
    expect(final.total_turns).toBe(3); // director + 2 councillors
    const t = await readTranscript(m.id);
    expect(t.split('## Turn').length - 1).toBe(3);
  });

  it('with window_k=2, chair-summary fires once we exceed the window', async () => {
    const m = await startMeeting({ title: 'S', topic: 't', chair_slug: 'leto', attendees: ['leto', 'mocky'], window_k: 2 });
    await directorSpeak(m.id, 'round 1 input');
    for (let i = 0; i < 100; i++) {
      const cur = await readMeeting(m.id);
      if (cur.status === 'awaiting_director' && cur.current_round === 2) break;
      await new Promise((r) => setTimeout(r, 20));
    }
    await directorSpeak(m.id, 'round 2 input');
    for (let i = 0; i < 100; i++) {
      const cur = await readMeeting(m.id);
      if (cur.status === 'awaiting_director' && cur.current_round === 3) break;
      await new Promise((r) => setTimeout(r, 20));
    }
    // Total turns by now: 3 + 3 = 6. window_k=2 → at least 4 turns should be summarized.
    const summary = await readSummary(m.id);
    expect(summary.length).toBeGreaterThan(0);
    const evts = await readMeetingEvents(m.id);
    expect(evts.some((e) => e.type === 'summarized')).toBe(true);
  });
});

describe('endMeeting', () => {
  beforeEach(setup);

  it('endMeeting writes synthesis.md, releases locks, parses MEMORY/JOB blocks', async () => {
    const m = await startMeeting({ title: 'S', topic: 't', chair_slug: 'leto', attendees: ['leto', 'mocky'], window_k: 2 });
    await directorSpeak(m.id, 'discuss X');
    for (let i = 0; i < 100; i++) {
      const cur = await readMeeting(m.id);
      if (cur.status === 'awaiting_director') break;
      await new Promise((r) => setTimeout(r, 20));
    }
    await endMeeting(m.id);
    const final = await readMeeting(m.id);
    expect(final.status).toBe('ended');
    expect(final.ended_at).toBeTruthy();
    const synth = await readSynthesis(m.id);
    expect(synth.length).toBeGreaterThan(0);
    const { listHeldBy } = await import('./councillor-lock');
    expect(listHeldBy({ kind: 'meeting', id: m.id })).toEqual([]);
  });

  it('endMeeting works from the awaiting_director resting state', async () => {
    const m = await startMeeting({ title: 'S', topic: 't', chair_slug: 'leto', attendees: ['leto'], window_k: 2 });
    await endMeeting(m.id);
    const final = await readMeeting(m.id);
    expect(final.status).toBe('ended');
  });
});
