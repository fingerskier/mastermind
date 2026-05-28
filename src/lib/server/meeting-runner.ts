import { tryAcquire, release as releaseLock } from './councillor-lock';
import { createMeeting, type NewMeetingInput } from './meetings';
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
