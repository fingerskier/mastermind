/**
 * Cross-council meeting test harness (throwaway — not shipped).
 *
 * Drives ONE round-table meeting in-process as the host (council "alpha"),
 * summoning a remote attendee from council "beta" (which must already be running
 * as a real `npx landsraad` server so it registers in the instance registry and
 * serves /api/meeting/turn).
 *
 * Usage (from repo root):
 *   LANDSRAAD_MEETING_TURN_NUDGE="..." \
 *   vite-node scripts/xcouncil-test.ts -- <alpha-root> <beta-root> "<title>"
 *
 * The NUDGE env must be set BEFORE this runs because config.ts reads it at import.
 */
import { resolve } from 'node:path';

const ALPHA = resolve(process.cwd(), process.argv[2] ?? 'C:/dev/test/alpha');
const BETA = resolve(process.cwd(), process.argv[3] ?? 'C:/dev/test/beta');
const TITLE = process.argv[4] ?? 'Cross-council test';

process.env.LANDSRAAD_COUNCIL_ROOT = ALPHA;

const { startMeeting, directorSpeak, endMeeting } = await import('../src/lib/server/meeting-runner');
const { readMeeting, readTranscript, parseTranscript, readSynthesis, readMeetingEvents } =
  await import('../src/lib/server/meetings');
const { setEmbedder } = await import('../src/lib/server/indexer');
const { xenovaEmbedder } = await import('../src/lib/server/embedder-xenova');
const { MEETING_TURN_NUDGE } = await import('../src/lib/server/config');

setEmbedder(xenovaEmbedder());

const TOPIC = `Should Landsraad ship a built-in "lite model for meetings" toggle, or is the
existing per-turn brevity nudge enough? Give your sharpest one-take position.`;

const OPENING = `Team, quick round-table. Question on the table: for council MEETINGS specifically,
do we need a dedicated lite/cheap model, or does a brevity nudge already get us the
quick-turnaround we want? Sage, frame the tradeoff. Scout, gut-check it. Keep it tight.`;

function stats(body: string) {
  const chars = body.length;
  const words = body.trim().split(/\s+/).filter(Boolean).length;
  return { chars, words };
}

const t0 = Date.now();
const meeting = await startMeeting({
  title: TITLE,
  topic: TOPIC,
  chair_slug: 'sage',
  attendees: ['sage'],
  remote_attendees: [
    { council_slug: 'beta', councillor_slug: 'scout', cwd: BETA, label: 'Scout' }
  ],
  window_k: 6
});
console.log(`\n=== MEETING ${meeting.id} ===`);
console.log(`NUDGE = ${JSON.stringify(MEETING_TURN_NUDGE)}`);

const tSpeak = Date.now();
await directorSpeak(meeting.id, OPENING);
const speakMs = Date.now() - tSpeak;

const tEnd = Date.now();
await endMeeting(meeting.id);
const endMs = Date.now() - tEnd;

const m = await readMeeting(meeting.id);
const turns = parseTranscript(await readTranscript(meeting.id));
const synthesis = await readSynthesis(meeting.id);
const events = await readMeetingEvents(meeting.id);

// pair turn_started -> turn_finished for per-turn latency
const started: Record<string, string> = {};
const turnMs: Record<number, number> = {};
let lastStart: { speaker: string; at: string } | null = null;
for (const e of events) {
  if (e.type === 'turn_started') lastStart = { speaker: e.speaker!, at: e.at };
  if (e.type === 'turn_finished' && lastStart) {
    turnMs[e.turn_index!] = Date.parse(e.at) - Date.parse(lastStart.at);
    lastStart = null;
  }
}

console.log(`\nstatus=${m.status}  round=${m.current_round}  turns=${m.total_turns}`);
console.log(`director-speak round latency=${(speakMs / 1000).toFixed(1)}s  synthesis latency=${(endMs / 1000).toFixed(1)}s  total=${((Date.now() - t0) / 1000).toFixed(1)}s\n`);

for (const t of turns) {
  const { chars, words } = stats(t.body);
  const ms = turnMs[t.turnIndex];
  console.log(
    `  turn ${t.turnIndex}  ${t.speaker.padEnd(14)}  ${String(words).padStart(4)}w ${String(chars).padStart(5)}c${ms ? `  ${(ms / 1000).toFixed(1)}s` : ''}`
  );
}

const sy = stats(synthesis);
console.log(`\n  synthesis (sage)        ${String(sy.words).padStart(4)}w ${String(sy.chars).padStart(5)}c`);

console.log(`\n--- TRANSCRIPT ---`);
for (const t of turns) {
  console.log(`\n[turn ${t.turnIndex}] ${t.speaker}:\n${t.body}`);
}
console.log(`\n--- SYNTHESIS (sage) ---\n${synthesis}\n`);

process.exit(0);
