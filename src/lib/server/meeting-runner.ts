import { tryAcquire, release as releaseLock } from './councillor-lock';
import {
  appendMeetingEvent,
  appendTranscriptBlock,
  createMeeting,
  listMeetings,
  readMeeting,
  writeMeeting,
  readTopic,
  readSummary,
  writeSummary,
  readTranscript as readTx,
  parseTranscript,
  lastKTurns,
  remoteToken,
  type NewMeetingInput
} from './meetings';
import type { Meeting, RemoteAttendee } from '$lib/types';
import { readCouncillor } from './councillors';
import { readCouncil } from './councils';
import { summonRemoteTurn } from './meeting-remote';
import { resolvePeerPort } from './peers';
import { resolveAdapter } from './adapters';
import { runAdapter } from './adapters/runAdapter';
import { councilRoot } from './paths';
import { assembleContextFor } from './context';
import { MEETING_TURN_TIMEOUT_MS, MEETING_SUMMARY_TIMEOUT_MS } from './config';
import { buildSpeakerInstruction } from './meeting-prompt';
import { applyReflectionBlocks } from './reflection';
import { writeSynthesis } from './meetings';

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
      buildSpeakerInstruction(speakerSlug)
    ].join('\n')
  );
  return sections.join('\n\n') + '\n';
}

export async function startMeeting(input: NewMeetingInput, now: Date = new Date()): Promise<Meeting> {
  // Pre-flight: validate remotes are reachable.
  for (const r of input.remote_attendees ?? []) {
    const port = await resolvePeerPort(r.cwd);
    if (port === null) throw new Error(`Cannot start meeting: remote council at ${r.cwd} (${r.label}) is not running.`);
  }

  // Pre-flight: every local attendee must be free. Use a probe holder we immediately release.
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

function findRemote(m: Meeting, token: string): RemoteAttendee | undefined {
  return (m.remote_attendees ?? []).find((r) => remoteToken(r) === token);
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
    const next = [...m.attendees, ...(m.remote_attendees ?? []).map(remoteToken)];
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

  const remote = findRemote(m, speakerSlug);
  if (remote) {
    // ── Remote attendee path ──────────────────────────────────────────────────
    const controller = new AbortController();
    inFlight.set(id, controller);
    try {
      const after = await readMeeting(id);
      const topic = await readTopic(id);
      const summary = await readSummary(id);
      const transcript = await readTx(id);
      const recent_turns = lastKTurns(transcript, after.window_k).map(
        (t) => `## Turn ${t.turnIndex} — ${t.speaker} — ${t.at}\n\n${t.body}`
      );

      const hostCouncil = await readCouncil();
      const result = await summonRemoteTurn({
        cwd: remote.cwd,
        councillor_slug: remote.councillor_slug,
        meeting_id: id,
        host_council: hostCouncil.slug,
        context: {
          title: after.title,
          topic,
          summary,
          recent_turns,
          speaker_instruction: buildSpeakerInstruction(remote.councillor_slug)
        },
        signal: controller.signal
      });

      if (controller.signal.aborted) {
        // The host cancelled/ended the meeting while this remote turn was in flight.
        // It is intentionally NOT re-queued (cancel/end is terminal), but record it so
        // the timeline shows the remote summon was dropped rather than silently vanishing.
        await appendMeetingEvent(id, {
          at: new Date().toISOString(),
          type: 'turn_failed',
          speaker: speakerSlug,
          message: 'aborted after remote summon'
        });
        return;
      }

      if (!result.ok) {
        const { council_slug, councillor_slug } = remote;
        const pause_reason =
          result.reason === 'unreachable'
            ? `remote_unreachable:${council_slug}`
            : result.reason === 'busy'
              ? `remote_busy:${council_slug}:${councillor_slug}`
              : `remote_turn_failed:${council_slug}:${councillor_slug}`;
        const cur = await readMeeting(id);
        cur.status = 'paused';
        cur.pause_reason = pause_reason;
        cur.remaining_this_round.unshift(speakerSlug);
        await writeMeeting(cur);
        await appendMeetingEvent(id, { at: new Date().toISOString(), type: 'turn_failed', speaker: speakerSlug, message: pause_reason });
        await appendMeetingEvent(id, { at: new Date().toISOString(), type: 'paused', message: pause_reason });
        return;
      }

      const cur = await readMeeting(id);
      cur.total_turns += 1;
      const at = new Date().toISOString();
      await appendTranscriptBlock(id, {
        turnIndex: cur.total_turns,
        speaker: speakerSlug,
        at,
        body: result.text
      });
      await writeMeeting(cur);
      await appendMeetingEvent(id, { at, type: 'turn_finished', speaker: speakerSlug, turn_index: cur.total_turns });
    } finally {
      inFlight.delete(id);
    }

    await advance(id);
    return;
  }

  // ── Local attendee path ───────────────────────────────────────────────────
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

export async function cancelMeeting(id: string, now: Date = new Date()): Promise<void> {
  const cur = await readMeeting(id);
  if (cur.status === 'ended' || cur.status === 'cancelled' || cur.status === 'failed') return;
  const inflight = inFlight.get(id);
  if (inflight) inflight.abort();
  for (let i = 0; i < 50 && inFlight.has(id); i++) await new Promise((r) => setTimeout(r, 20));
  const fresh = await readMeeting(id);
  fresh.status = 'cancelled';
  fresh.ended_at = now.toISOString();
  fresh.pause_reason = undefined;
  await writeMeeting(fresh);
  await appendMeetingEvent(id, { at: now.toISOString(), type: 'cancelled' });
  await releaseMeetingLocks(fresh);
}

export async function resumeMeeting(id: string, now: Date = new Date()): Promise<void> {
  const cur = await readMeeting(id);
  if (cur.status !== 'paused') return;
  cur.status = 'running';
  cur.pause_reason = undefined;
  await writeMeeting(cur);
  await appendMeetingEvent(id, { at: now.toISOString(), type: 'resumed' });
  await advance(id);
}

export async function recoverMeetings(now: Date = new Date()): Promise<void> {
  const all = await listMeetings();
  for (const m of all) {
    if (m.status === 'ended' || m.status === 'cancelled' || m.status === 'failed') continue;
    const fresh: typeof m = {
      ...m,
      status: 'failed',
      ended_at: now.toISOString(),
      pause_reason: `crashed_during=${m.status}`
    };
    await writeMeeting(fresh);
    await appendMeetingEvent(m.id, {
      at: now.toISOString(),
      type: 'crashed',
      message: `crashed_during=${m.status}`
    });
    // Release any in-memory locks held by this meeting.
    await releaseMeetingLocks(fresh);
  }
}

export async function endMeeting(id: string, now: Date = new Date()): Promise<void> {
  const cur = await readMeeting(id);
  if (cur.status === 'ended' || cur.status === 'cancelled' || cur.status === 'failed') return;
  if (cur.status === 'synthesizing') return;

  // If a turn is in flight, abort and wait briefly for it to settle.
  const inflight = inFlight.get(id);
  if (inflight) inflight.abort();
  for (let i = 0; i < 50 && inFlight.has(id); i++) await new Promise((r) => setTimeout(r, 20));

  const synthesizing = await readMeeting(id);
  synthesizing.status = 'synthesizing';
  await writeMeeting(synthesizing);
  await appendMeetingEvent(id, { at: now.toISOString(), type: 'synthesizing' });

  const chair = await readCouncillor(synthesizing.chair_slug);
  const adapter = resolveAdapter(chair.adapter);
  const topic = await readTopic(id);
  const summary = await readSummary(id);
  const transcript = await readTx(id);
  const recent = lastKTurns(transcript, synthesizing.window_k)
    .map((t) => `## Turn ${t.turnIndex} — ${t.speaker} — ${t.at}\n\n${t.body}`)
    .join('\n\n');

  const prompt = [
    '# Meeting synthesis',
    '',
    `You are ${synthesizing.chair_slug} (chair). The director has ended the meeting. Write a concise synthesis — decisions, open threads, action items.`,
    '',
    'You may emit zero or more memory blocks:',
    '',
    '<<MEMORY title="short slug-friendly title">>',
    'body — why worth remembering',
    '<</MEMORY>>',
    '',
    'Use scope="shared" on the opening tag for council-wide memory:',
    '',
    '<<MEMORY title="..." scope="shared">>...<</MEMORY>>',
    '',
    'You may also propose zero or more follow-up jobs:',
    '',
    '<<JOB title="..." councillor="optional-slug" priority="normal">>',
    'brief',
    '<</JOB>>',
    '',
    '## Topic',
    '',
    topic.trim() || '(empty)',
    '',
    '## Rolling summary',
    '',
    summary.trim() || '(none)',
    '',
    '## Recent turns',
    '',
    recent || '(no turns)',
    ''
  ].join('\n');

  let synthesisText = '';
  let failed = false;
  if (!adapter) {
    failed = true;
  } else {
    const result = await runAdapter({
      adapter,
      prompt,
      cwd: councilRoot(),
      timeoutMs: MEETING_SUMMARY_TIMEOUT_MS
    });
    if (result.exit_code !== 0) failed = true;
    else synthesisText = result.output;
  }

  if (failed) {
    const c = await readMeeting(id);
    c.status = 'failed';
    c.ended_at = now.toISOString();
    await writeMeeting(c);
    await appendMeetingEvent(id, { at: now.toISOString(), type: 'crashed', message: 'synthesis adapter failed' });
    await releaseMeetingLocks(c);
    return;
  }

  await writeSynthesis(id, synthesisText);
  await appendMeetingEvent(id, { at: now.toISOString(), type: 'synthesized' });

  const apply = await applyReflectionBlocks({
    text: synthesisText,
    sourceCouncillorSlug: synthesizing.chair_slug,
    sourceKind: 'meeting',
    sourceId: id
  });
  await appendMeetingEvent(id, {
    at: now.toISOString(),
    type: 'proposals_parsed',
    message: `mem=${apply.memorySlugs.length} shared=${apply.sharedMemorySlugs.length} proposals=${apply.proposalIds.length}`
  });

  const ended = await readMeeting(id);
  ended.status = 'ended';
  ended.ended_at = now.toISOString();
  ended.memory_slugs = apply.memorySlugs;
  ended.shared_memory_slugs = apply.sharedMemorySlugs;
  ended.proposed_jobs = apply.proposalIds;
  await writeMeeting(ended);
  await appendMeetingEvent(id, { at: now.toISOString(), type: 'ended' });
  await releaseMeetingLocks(ended);
}
