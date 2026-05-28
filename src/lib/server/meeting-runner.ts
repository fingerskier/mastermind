import { tryAcquire, release as releaseLock } from './councillor-lock';
import {
  appendMeetingEvent,
  appendTranscriptBlock,
  createMeeting,
  readMeeting,
  writeMeeting,
  type NewMeetingInput
} from './meetings';
import type { Meeting } from '$lib/types';

export async function startMeeting(input: NewMeetingInput, now: Date = new Date()): Promise<Meeting> {
  // Pre-flight: every attendee must be free. Use a probe holder we immediately release.
  const probe = { kind: 'meeting' as const, id: 'PROBE' };
  const busy: string[] = [];
  for (const slug of input.attendees) {
    if (!tryAcquire(slug, probe)) busy.push(slug);
  }
  for (const slug of input.attendees) releaseLock(slug, probe);
  if (busy.length > 0) {
    throw new Error(`Cannot start meeting: councillor(s) busy: ${busy.join(', ')}`);
  }

  const meeting = await createMeeting(input, now);
  for (const slug of meeting.attendees) {
    tryAcquire(slug, { kind: 'meeting', id: meeting.id });
  }
  return meeting;
}

export async function releaseMeetingLocks(meeting: Meeting): Promise<void> {
  for (const slug of meeting.attendees) {
    releaseLock(slug, { kind: 'meeting', id: meeting.id });
  }
}

export async function directorSpeak(id: string, body: string, now: Date = new Date()): Promise<void> {
  const m = await readMeeting(id);
  if (m.status !== 'awaiting_director') {
    throw new Error(`Meeting ${id} not awaiting_director (status=${m.status})`);
  }
  const trimmed = body.trim();
  if (!trimmed) throw new Error('Director message is empty.');
  m.total_turns += 1;
  await appendTranscriptBlock(id, {
    turnIndex: m.total_turns,
    speaker: 'director',
    at: now.toISOString(),
    body: trimmed
  });
  m.director_spoken_this_round = true;
  m.status = 'running';
  await writeMeeting(m);
  await appendMeetingEvent(id, {
    at: now.toISOString(),
    type: 'director_turn',
    speaker: 'director',
    turn_index: m.total_turns
  });
  await advance(id);
}

export async function directorSkip(id: string, now: Date = new Date()): Promise<void> {
  const m = await readMeeting(id);
  if (m.status !== 'awaiting_director') {
    throw new Error(`Meeting ${id} not awaiting_director (status=${m.status})`);
  }
  m.director_spoken_this_round = true;
  m.status = 'running';
  await writeMeeting(m);
  await appendMeetingEvent(id, { at: now.toISOString(), type: 'director_skipped' });
  await advance(id);
}

// Skeleton advance(): only handles end-of-round rollover. Real councillor-turn invocation
// is added in Task 10; do not implement it here.
export async function advance(id: string): Promise<void> {
  const m = await readMeeting(id);
  if (m.status !== 'running') return;
  if (m.remaining_this_round.length === 0) {
    m.current_round += 1;
    // randomize next round
    const next = m.attendees.slice();
    for (let i = next.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [next[i], next[j]] = [next[j], next[i]];
    }
    m.remaining_this_round = next;
    m.director_spoken_this_round = false;
    m.status = 'awaiting_director';
    await writeMeeting(m);
    await appendMeetingEvent(m.id, { at: new Date().toISOString(), type: 'round_started' });
    await appendMeetingEvent(m.id, { at: new Date().toISOString(), type: 'awaiting_director' });
    return;
  }
  // Otherwise: leave as 'running' for Task 10 to take over.
}
