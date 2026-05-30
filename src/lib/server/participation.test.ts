import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { appendIncomingParticipation, readIncomingParticipation } from './participation';

describe('participation log', () => {
  beforeEach(() => {
    process.env.LANDSRAAD_COUNCIL_ROOT = mkdtempSync(join(tmpdir(), 'landsraad-part-'));
  });

  it('appends and reads back records', async () => {
    await appendIncomingParticipation({
      ts: '2026-05-30T00:00:00Z', host_council: 'eng', meeting_id: 'm1',
      councillor_slug: 'leto', duration_ms: 1234, exit_code: 0
    });
    await appendIncomingParticipation({
      ts: '2026-05-30T00:01:00Z', host_council: 'eng', meeting_id: 'm1',
      councillor_slug: 'leto', duration_ms: 50, exit_code: 1
    });
    const rows = await readIncomingParticipation();
    expect(rows).toHaveLength(2);
    expect(rows[0].councillor_slug).toBe('leto');
    expect(rows[1].exit_code).toBe(1);
  });

  it('returns [] when the log is missing', async () => {
    expect(await readIncomingParticipation()).toEqual([]);
  });
});
