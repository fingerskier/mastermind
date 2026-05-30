import { appendFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Meeting, MeetingEvent, MeetingStatus, RemoteAttendee } from '$lib/types';
import { meetingDir, meetingIdFor, meetingsDir } from './paths';
import { hasCouncil } from './councils';
import { readCouncillor } from './councillors';
import { indexUpsert } from './indexer';

const MEETING_FILE = 'meeting.json';
const TOPIC_FILE = 'topic.md';
const TRANSCRIPT_FILE = 'transcript.md';
const SUMMARY_FILE = 'summary.md';
const SYNTHESIS_FILE = 'synthesis.md';
const EVENTS_FILE = 'events.jsonl';

export interface NewMeetingInput {
  title: string;
  topic: string;
  chair_slug: string;
  attendees: string[];
  remote_attendees?: RemoteAttendee[];
  window_k: number;
}

export function remoteToken(r: RemoteAttendee): string {
  return `${r.council_slug}:${r.councillor_slug}`;
}

function shuffle<T>(input: T[], rng: () => number = Math.random): T[] {
  const a = input.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export async function createMeeting(
  input: NewMeetingInput,
  now: Date = new Date(),
  rng: () => number = Math.random
): Promise<Meeting> {
  if (!hasCouncil()) throw new Error('No council exists in the current directory.');
  if (!input.title.trim()) throw new Error('Meeting title is required.');
  if (input.attendees.length === 0) throw new Error('At least one attendee is required.');
  if (!input.attendees.includes(input.chair_slug)) {
    throw new Error(`Chair "${input.chair_slug}" must be one of the attendees.`);
  }
  for (const slug of input.attendees) {
    await readCouncillor(slug).catch(() => {
      throw new Error(`Attendee "${slug}" is not a councillor.`);
    });
  }

  const id = meetingIdFor(input.title, now);
  const dir = meetingDir(id);
  if (existsSync(dir)) throw new Error(`Meeting "${id}" already exists.`);

  const remotes = input.remote_attendees ?? [];
  const allTokens = [...input.attendees, ...remotes.map(remoteToken)];

  const meeting: Meeting = {
    id,
    title: input.title.trim(),
    chair_slug: input.chair_slug,
    attendees: input.attendees.slice(),
    remote_attendees: remotes.slice(),
    status: 'awaiting_director',
    window_k: input.window_k,
    started_at: now.toISOString(),
    ended_at: null,
    current_round: 1,
    remaining_this_round: shuffle(allTokens, rng),
    director_spoken_this_round: false,
    last_summarized_turn: 0,
    total_turns: 0
  };

  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, MEETING_FILE), JSON.stringify(meeting, null, 2) + '\n', 'utf8');
  await writeFile(join(dir, TOPIC_FILE), input.topic, 'utf8');
  await writeFile(join(dir, TRANSCRIPT_FILE), '', 'utf8');
  await writeFile(join(dir, SUMMARY_FILE), '', 'utf8');
  await appendMeetingEvent(id, { at: now.toISOString(), type: 'created' });
  await appendMeetingEvent(id, { at: now.toISOString(), type: 'awaiting_director' });
  await indexUpsert({
    kind: 'meeting_topic',
    ref_id: meeting.id,
    text: input.topic,
    source_path: join(dir, TOPIC_FILE),
    source_mtime: meeting.started_at,
    title: meeting.title,
    councillor_slug: null
  });
  return meeting;
}

export async function readMeeting(id: string): Promise<Meeting> {
  const raw = await readFile(join(meetingDir(id), MEETING_FILE), 'utf8');
  const m = JSON.parse(raw) as Meeting;
  if (!m.remote_attendees) m.remote_attendees = [];
  return m;
}

export async function writeMeeting(m: Meeting): Promise<void> {
  await writeFile(join(meetingDir(m.id), MEETING_FILE), JSON.stringify(m, null, 2) + '\n', 'utf8');
}

export async function listMeetings(filter?: { status?: MeetingStatus | MeetingStatus[] }): Promise<Meeting[]> {
  const dir = meetingsDir();
  if (!existsSync(dir)) return [];
  const entries = await readdir(dir, { withFileTypes: true });
  const out: Meeting[] = [];
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const m = await readMeeting(e.name).catch(() => null);
    if (!m) continue;
    if (filter?.status) {
      const set = Array.isArray(filter.status) ? new Set(filter.status) : new Set([filter.status]);
      if (!set.has(m.status)) continue;
    }
    out.push(m);
  }
  out.sort((a, b) => b.id.localeCompare(a.id));
  return out;
}

export async function appendMeetingEvent(id: string, event: MeetingEvent): Promise<void> {
  await appendFile(join(meetingDir(id), EVENTS_FILE), JSON.stringify(event) + '\n', 'utf8');
}

export async function readMeetingEvents(id: string): Promise<MeetingEvent[]> {
  const file = join(meetingDir(id), EVENTS_FILE);
  if (!existsSync(file)) return [];
  const raw = await readFile(file, 'utf8');
  return raw.split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l) as MeetingEvent);
}

export interface TranscriptBlock {
  turnIndex: number;
  speaker: string;
  at: string;
  body: string;
}

export async function appendTranscriptBlock(id: string, block: TranscriptBlock): Promise<void> {
  const file = join(meetingDir(id), TRANSCRIPT_FILE);
  const text = `\n## Turn ${block.turnIndex} — ${block.speaker} — ${block.at}\n\n${block.body.trim()}\n`;
  await appendFile(file, text, 'utf8');
  const meta = await readMeeting(id).catch(() => null);
  await indexUpsert({
    kind: 'meeting_turn',
    ref_id: id,
    chunk_idx: block.turnIndex,
    text: block.body,
    source_path: file,
    source_mtime: block.at,
    title: `${meta?.title ?? id} · turn ${block.turnIndex} · ${block.speaker}`,
    councillor_slug: block.speaker === 'director' || block.speaker.includes(':') ? null : block.speaker
  });
}

export async function readTranscript(id: string): Promise<string> {
  return readFile(join(meetingDir(id), TRANSCRIPT_FILE), 'utf8').catch(() => '');
}

export async function readTopic(id: string): Promise<string> {
  return readFile(join(meetingDir(id), TOPIC_FILE), 'utf8').catch(() => '');
}

export async function writeSummary(id: string, body: string): Promise<void> {
  await writeFile(join(meetingDir(id), SUMMARY_FILE), body, 'utf8');
  const meta = await readMeeting(id).catch(() => null);
  await indexUpsert({
    kind: 'meeting_summary',
    ref_id: id,
    text: body,
    source_path: join(meetingDir(id), SUMMARY_FILE),
    source_mtime: new Date().toISOString(),
    title: `${meta?.title ?? id} · summary`,
    councillor_slug: meta?.chair_slug ?? null
  });
}

export async function readSummary(id: string): Promise<string> {
  return readFile(join(meetingDir(id), SUMMARY_FILE), 'utf8').catch(() => '');
}

export async function writeSynthesis(id: string, body: string): Promise<void> {
  await writeFile(join(meetingDir(id), SYNTHESIS_FILE), body, 'utf8');
  const meta = await readMeeting(id).catch(() => null);
  await indexUpsert({
    kind: 'meeting_synthesis',
    ref_id: id,
    text: body,
    source_path: join(meetingDir(id), SYNTHESIS_FILE),
    source_mtime: new Date().toISOString(),
    title: `${meta?.title ?? id} · synthesis`,
    councillor_slug: meta?.chair_slug ?? null
  });
}

export async function readSynthesis(id: string): Promise<string> {
  return readFile(join(meetingDir(id), SYNTHESIS_FILE), 'utf8').catch(() => '');
}

export interface ParsedTurn {
  turnIndex: number;
  speaker: string;
  at: string;
  body: string;
}

const TURN_HEADER_RE = /^## Turn (\d+) — ([^—]+) — (\S+)\s*$/m;

export function parseTranscript(text: string): ParsedTurn[] {
  if (!text.trim()) return [];
  const sections = text.split(/^## Turn /m).slice(1).map((s) => '## Turn ' + s);
  const out: ParsedTurn[] = [];
  for (const sec of sections) {
    const m = TURN_HEADER_RE.exec(sec);
    if (!m) continue;
    const idx = Number.parseInt(m[1], 10);
    const speaker = m[2].trim();
    const at = m[3].trim();
    const body = sec.split('\n').slice(2).join('\n').trim();
    out.push({ turnIndex: idx, speaker, at, body });
  }
  return out;
}

export function lastKTurns(text: string, k: number): ParsedTurn[] {
  const all = parseTranscript(text);
  return all.slice(-k);
}
