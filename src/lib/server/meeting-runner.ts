import { tryAcquire, release as releaseLock } from './councillor-lock';
import {
  appendMeetingEvent,
  appendTranscriptBlock,
  createMeeting,
  readMeeting,
  writeMeeting,
  readTopic,
  readSummary,
  writeSummary,
  readTranscript as readTx,
  parseTranscript,
  lastKTurns,
  type NewMeetingInput
} from './meetings';
import type { Meeting } from '$lib/types';
import { readCouncillor } from './councillors';
import { resolveAdapter } from './adapters';
import { runAdapter } from './adapters/runAdapter';
import { councilRoot } from './paths';
import { assembleContextFor } from './context';
import { MEETING_TURN_TIMEOUT_MS, MEETING_SUMMARY_TIMEOUT_MS } from './config';

const inFlight = new Map<string, AbortController>(); // key: meetingId

async function refreshSummaryIfNeeded(meetingId: string): Promise<void> {
  const m = await readMeeting(meetingId);
  const transcript = await readTx(meetingId);
  const turns = parseTranscript(transcript);
  const displacedEnd = turns.length - m.window_k;
  if (displacedEnd <= m.last_summarized_turn) return;
  const displaced = turns.filter(
    (t) => t.turnIndex > m.last_summarized_turn && t.turnIndex <= displacedEnd
  );
  if (displaced.length === 0) return;

  const chair = await readCouncillor(m.chair_slug);
  const adapter = resolveAdapter(chair.adapter);
  if (!adapter) return;

  const prior = await readSummary(meetingId);
  const block = displaced
    .map((t) => `## Turn ${t.turnIndex} — ${t.speaker} — ${t.at}\n\n${t.body}`)
    .join('\n\n');
  const prompt = [
    '# Rolling meeting summary',
    '',
    `You are the chair (${m.chair_slug}) summarizing displaced turns for future context.`,
    'Rewrite the summary so it covers everything below in 4-8 sentences. Preserve names, decisions, open threads.',
    '',
    '## Prior summary',
    '',
    prior.trim() || '(none)',
    '',
    '## New displaced turns',
    '',
    block,
    ''
  ].join('\n');

  const result = await runAdapter({
    adapter,
    prompt,
    cwd: councilRoot(),
    timeoutMs: MEETING_SUMMARY_TIMEOUT_MS
  });
  if (result.exit_code !== 0) {
    await appendMeetingEvent(meetingId, {
      at: new Date().toISOString(),
      type: 'turn_failed',
      message: `summary_failed: exit ${result.exit_code}`
    });
    return;
  }
  await writeSummary(meetingId, result.output.trim());
  const cur = await readMeeting(meetingId);
  cur.last_summarized_turn = displacedEnd;
  await writeMeeting(cur);
  await appendMeetingEvent(meetingId, {
    at: new Date().toISOString(),
    type: 'summarized'
  });
}

async function buildTurnPrompt(meetingId: string, speakerSlug: string): Promise<string> {
  const m = await readMeeting(meetingId);
  const councillor = await readCouncillor(speakerSlug);
  const topic = await readTopic(meetingId);
  const summary = await readSummary(meetingId);
  const transcript = await readTx(meetingId);
  const recent = lastKTurns(transcript, m.window_k)
    .map((t) => `## Turn ${t.turnIndex} — ${t.speaker} — ${t.at}\n\n${t.body}`)
    .join('\n\n');

  const memCtx = await assembleContextFor(speakerSlug, `${m.title}\n${topic}`);
  const sections: string[] = [];
  if (councillor.persona.trim()) sections.push(`# Persona\n\n${councillor.persona.trim()}`);
  if (memCtx) sections.push(memCtx);
  sections.push(
    [
      `# Meeting: ${m.title}`,
      '',
      `## Topic`,
      '',
      topic.trim() || '(no topic)',
      '',
      summary.trim() ? `## Summary of earlier turns\n\n${summary.trim()}\n` : '',
      `## Recent turns`,
      '',
      recent.trim() || '(no turns yet)',
      '',
      `You are ${speakerSlug}. Speak now.`
    ].join('\n')
  );
  return sections.join('\n\n') + '\n';
}

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

export async function advance(id: string): Promise<void> {
  if (inFlight.has(id)) return;
  let m = await readMeeting(id);
  if (m.status !== 'running') return;

  if (!m.director_spoken_this_round) {
    m.status = 'awaiting_director';
    await writeMeeting(m);
    await appendMeetingEvent(id, { at: new Date().toISOString(), type: 'awaiting_director' });
    return;
  }

  if (m.remaining_this_round.length === 0) {
    m.current_round += 1;
    const next = m.attendees.slice();
    for (let i = next.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [next[i], next[j]] = [next[j], next[i]];
    }
    m.remaining_this_round = next;
    m.director_spoken_this_round = false;
    m.status = 'awaiting_director';
    await writeMeeting(m);
    await appendMeetingEvent(id, { at: new Date().toISOString(), type: 'round_started' });
    await appendMeetingEvent(id, { at: new Date().toISOString(), type: 'awaiting_director' });
    return;
  }

  const speakerSlug = m.remaining_this_round.shift()!;
  await writeMeeting(m);
  await appendMeetingEvent(id, { at: new Date().toISOString(), type: 'turn_started', speaker: speakerSlug });

  await refreshSummaryIfNeeded(id);

  const councillor = await readCouncillor(speakerSlug);
  const adapter = resolveAdapter(councillor.adapter);
  if (!adapter) {
    const cur = await readMeeting(id);
    cur.status = 'paused';
    cur.pause_reason = `turn_failed: unknown adapter "${councillor.adapter}" for ${speakerSlug}`;
    await writeMeeting(cur);
    await appendMeetingEvent(id, { at: new Date().toISOString(), type: 'turn_failed', speaker: speakerSlug, message: cur.pause_reason });
    await appendMeetingEvent(id, { at: new Date().toISOString(), type: 'paused', message: cur.pause_reason });
    return;
  }

  const controller = new AbortController();
  inFlight.set(id, controller);
  try {
    const prompt = await buildTurnPrompt(id, speakerSlug);
    const result = await runAdapter({
      adapter,
      prompt,
      cwd: councilRoot(),
      timeoutMs: MEETING_TURN_TIMEOUT_MS,
      abortSignal: controller.signal
    });

    if (controller.signal.aborted) {
      // Cancelled mid-turn; the cancel handler (Task 13) sets the meeting status. Just bail.
      return;
    }

    if (result.exit_code !== 0) {
      const cur = await readMeeting(id);
      cur.status = 'paused';
      cur.pause_reason = result.timedOut ? 'turn_timeout' : `turn_failed: exit ${result.exit_code}`;
      cur.remaining_this_round.unshift(speakerSlug); // resume retries them
      await writeMeeting(cur);
      await appendMeetingEvent(id, { at: new Date().toISOString(), type: 'turn_failed', speaker: speakerSlug, message: cur.pause_reason });
      await appendMeetingEvent(id, { at: new Date().toISOString(), type: 'paused', message: cur.pause_reason });
      return;
    }

    const cur = await readMeeting(id);
    cur.total_turns += 1;
    await appendTranscriptBlock(id, {
      turnIndex: cur.total_turns,
      speaker: speakerSlug,
      at: new Date().toISOString(),
      body: result.output
    });
    await writeMeeting(cur);
    await appendMeetingEvent(id, { at: new Date().toISOString(), type: 'turn_finished', speaker: speakerSlug, turn_index: cur.total_turns });
  } finally {
    inFlight.delete(id);
  }

  await advance(id);
}
