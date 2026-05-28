import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { applyReflectionBlocks } from './reflection';
import { createCouncil } from './councils';
import { createCouncillor } from './councillors';

describe('applyReflectionBlocks', () => {
  beforeEach(async () => {
    process.env.LANDSRAAD_COUNCIL_ROOT = mkdtempSync(join(tmpdir(), 'landsraad-refl-'));
    await createCouncil({ name: 'T', description: '' });
    await createCouncillor({ name: 'Leto', role: 'duke', routing_hint: '', adapter: 'mock:local', persona: '' });
  });

  it('writes private + shared memories and creates job proposals', async () => {
    const text = `
<<MEMORY title="lesson-1">>
note body
<</MEMORY>>
<<MEMORY title="public-thing" scope="shared">>
shared body
<</MEMORY>>
<<JOB title="follow up" councillor="leto" priority="high">>
go look at X
<</JOB>>
`;
    const result = await applyReflectionBlocks({
      text,
      sourceCouncillorSlug: 'leto',
      sourceKind: 'meeting',
      sourceId: 'mtg-1'
    });
    expect(result.memorySlugs).toHaveLength(1);
    expect(result.sharedMemorySlugs).toHaveLength(1);
    expect(result.proposalIds).toHaveLength(1);
  });
});
