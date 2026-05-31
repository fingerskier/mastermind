import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const summonMock = vi.fn();
vi.mock('./meeting-remote', () => ({ summonRemoteTurn: (...args: unknown[]) => summonMock(...args) }));
vi.mock('./peers', async (orig) => {
  const actual = (await orig()) as object;
  return { ...actual, resolvePeerPort: vi.fn(async () => 10192) };
});

import { startMeeting, directorSpeak, resumeMeeting, cancelMeeting } from './meeting-runner';
import { readMeeting, readTranscript, readMeetingEvents } from './meetings';
import { createCouncil, readCouncil } from './councils';
import { createCouncillor } from './councillors';

const remote = { council_slug: 'ops', councillor_slug: 'gurney', cwd: '/ops', label: 'Gurney' };

describe('cross-council meeting turns', () => {
  beforeEach(async () => {
    process.env.LANDSRAAD_COUNCIL_ROOT = mkdtempSync(join(tmpdir(), 'landsraad-mrr-'));
    const { _resetForTests } = await import('./councillor-lock');
    _resetForTests();
    summonMock.mockReset();
    await createCouncil({ name: 'Eng', description: '' });
    await createCouncillor({ name: 'Leto', role: 'duke', routing_hint: '', adapter: 'mock:local', persona: '' });
  });

  it('summons a remote attendee and appends its turn to the transcript', async () => {
    summonMock.mockResolvedValue({ ok: true, text: 'remote says hi', duration_ms: 5 });
    const m = await startMeeting({ title: 'S', topic: 't', chair_slug: 'leto', attendees: ['leto'], window_k: 2, remote_attendees: [remote] });
    await directorSpeak(m.id, 'kickoff');
    const tx = await readTranscript(m.id);
    expect(summonMock).toHaveBeenCalled();
    expect(tx).toContain('ops:gurney');
    expect(tx).toContain('remote says hi');
    const fresh = await readMeeting(m.id);
    expect(fresh.status).not.toBe('paused');
    const { slug } = await readCouncil();
    expect(summonMock).toHaveBeenCalledWith(expect.objectContaining({ host_council: slug }));
  });

  it('pauses with remote_unreachable when the peer is gone', async () => {
    summonMock.mockResolvedValue({ ok: false, reason: 'unreachable', detail: 'gone' });
    const m = await startMeeting({ title: 'S', topic: 't', chair_slug: 'leto', attendees: ['leto'], window_k: 2, remote_attendees: [remote] });
    await directorSpeak(m.id, 'kickoff');
    const fresh = await readMeeting(m.id);
    expect(fresh.status).toBe('paused');
    expect(fresh.pause_reason).toBe('remote_unreachable:ops');
    expect(fresh.remaining_this_round).toContain('ops:gurney');
  });

  it('records an abandoned remote turn when the meeting is cancelled mid-summon', async () => {
    // The host cancels the meeting while the remote turn is in flight: cancelMeeting
    // aborts the in-flight controller, and we only resolve the summon once that abort
    // lands so the runner reaches the post-summon aborted check deterministically.
    summonMock.mockImplementation((args: { meeting_id: string; signal: AbortSignal }) => {
      void cancelMeeting(args.meeting_id).catch(() => {});
      return new Promise((resolve) => {
        const done = () => resolve({ ok: true, text: 'too late to matter', duration_ms: 1 });
        if (args.signal.aborted) done();
        else args.signal.addEventListener('abort', done, { once: true });
      });
    });

    const m = await startMeeting({ title: 'S', topic: 't', chair_slug: 'leto', attendees: ['leto'], window_k: 2, remote_attendees: [remote] });
    await directorSpeak(m.id, 'kickoff');

    const tx = await readTranscript(m.id);
    expect(tx).not.toContain('too late to matter'); // abandoned turn is never appended

    const events = await readMeetingEvents(m.id);
    expect(events.some((e) => e.type === 'turn_failed' && e.message === 'aborted after remote summon')).toBe(true);
  });

  it('pauses with remote_busy on a 409 and remote_turn_failed on a failed turn', async () => {
    summonMock.mockResolvedValue({ ok: false, reason: 'busy', detail: 'busy' });
    const m = await startMeeting({ title: 'S', topic: 't', chair_slug: 'leto', attendees: ['leto'], window_k: 2, remote_attendees: [remote] });
    await directorSpeak(m.id, 'kickoff');
    expect((await readMeeting(m.id)).pause_reason).toBe('remote_busy:ops:gurney');

    summonMock.mockResolvedValue({ ok: false, reason: 'turn_failed', detail: 'boom' });
    await resumeMeeting(m.id);
    expect((await readMeeting(m.id)).pause_reason).toBe('remote_turn_failed:ops:gurney');
  });
});
