import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const upsertCalls: Array<{ kind: string; ref_id: string; chunk_idx?: number }> = [];

vi.mock('./indexer', async () => {
  return {
    indexUpsert: vi.fn(async (args: { kind: string; ref_id: string; chunk_idx?: number }) => {
      upsertCalls.push({ kind: args.kind, ref_id: args.ref_id, chunk_idx: args.chunk_idx });
    }),
    indexDelete: vi.fn()
  };
});

import { createMeeting, appendTranscriptBlock, writeSummary, writeSynthesis } from './meetings';
import { createCouncil } from './councils';
import { createCouncillor } from './councillors';

describe('meeting indexing hooks', () => {
  beforeEach(async () => {
    upsertCalls.length = 0;
    process.env.LANDSRAAD_COUNCIL_ROOT = mkdtempSync(join(tmpdir(), 'landsraad-mi-'));
    await createCouncil({ name: 'T', description: '' });
    await createCouncillor({ name: 'Leto', role: 'duke', routing_hint: '', adapter: 'mock:local', persona: '' });
  });

  it('createMeeting upserts meeting_topic', async () => {
    const m = await createMeeting({ title: 'S', topic: 'topic body', chair_slug: 'leto', attendees: ['leto'], window_k: 2 });
    expect(upsertCalls.some((c) => c.kind === 'meeting_topic' && c.ref_id === m.id)).toBe(true);
  });

  it('appendTranscriptBlock upserts meeting_turn with chunk_idx', async () => {
    const m = await createMeeting({ title: 'S', topic: 't', chair_slug: 'leto', attendees: ['leto'], window_k: 2 });
    upsertCalls.length = 0; // clear createMeeting's upsert
    await appendTranscriptBlock(m.id, { turnIndex: 1, speaker: 'director', at: '2026-05-28T00:00:00Z', body: 'hello' });
    expect(upsertCalls.some((c) => c.kind === 'meeting_turn' && c.chunk_idx === 1)).toBe(true);
  });

  it('writeSummary upserts meeting_summary; writeSynthesis upserts meeting_synthesis', async () => {
    const m = await createMeeting({ title: 'S', topic: 't', chair_slug: 'leto', attendees: ['leto'], window_k: 2 });
    upsertCalls.length = 0; // clear createMeeting's upsert
    await writeSummary(m.id, 'sum');
    await writeSynthesis(m.id, 'synth');
    expect(upsertCalls.some((c) => c.kind === 'meeting_summary')).toBe(true);
    expect(upsertCalls.some((c) => c.kind === 'meeting_synthesis')).toBe(true);
  });
});
