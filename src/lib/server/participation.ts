import { appendFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { meetingsIncomingFile } from './paths';

export interface IncomingParticipation {
  ts: string;
  host_council: string;
  meeting_id: string;
  councillor_slug: string;
  duration_ms: number;
  exit_code: number;
}

/** Append one summon audit record to <council-root>/meetings-incoming.jsonl. */
export async function appendIncomingParticipation(rec: IncomingParticipation): Promise<void> {
  await appendFile(meetingsIncomingFile(), JSON.stringify(rec) + '\n', 'utf8');
}

export async function readIncomingParticipation(): Promise<IncomingParticipation[]> {
  const file = meetingsIncomingFile();
  if (!existsSync(file)) return [];
  const raw = await readFile(file, 'utf8');
  return raw
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as IncomingParticipation);
}
