import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('./councillors', () => ({ listCouncillors: vi.fn() }));

import { listCouncillors } from './councillors';
import { buildRosterSection } from './roster';

const mockList = vi.mocked(listCouncillors);

beforeEach(() => mockList.mockReset());

describe('buildRosterSection', () => {
  it('returns header + one line per councillor', async () => {
    mockList.mockResolvedValue([
      { slug: 'cfo', name: 'Vivian Park', role: 'finance', routing_hint: '', adapter: '', persona: '', reflect: true, created_at: '' },
      { slug: 'cto', name: 'Rao Sato', role: 'engineering', routing_hint: '', adapter: '', persona: '', reflect: true, created_at: '' }
    ]);
    const out = await buildRosterSection();
    expect(out).toBe('# Council roster\n\ncfo — Vivian Park — finance\ncto — Rao Sato — engineering');
  });

  it('emits header alone when only one councillor exists', async () => {
    mockList.mockResolvedValue([
      { slug: 'solo', name: 'Solo', role: 'all', routing_hint: '', adapter: '', persona: '', reflect: true, created_at: '' }
    ]);
    const out = await buildRosterSection();
    expect(out).toBe('# Council roster\n\nsolo — Solo — all');
  });

  it('renders an em-dash placeholder when role is empty', async () => {
    mockList.mockResolvedValue([
      { slug: 'x', name: 'X', role: '', routing_hint: '', adapter: '', persona: '', reflect: true, created_at: '' }
    ]);
    const out = await buildRosterSection();
    expect(out).toBe('# Council roster\n\nx — X — —');
  });

  it('appends routing_hint when present', async () => {
    mockList.mockResolvedValue([
      { slug: 'a', name: 'A', role: 'impl', routing_hint: 'code + schema', adapter: '', persona: '', reflect: true, created_at: '' },
      { slug: 'b', name: 'B', role: 'crit', routing_hint: '', adapter: '', persona: '', reflect: true, created_at: '' }
    ]);
    const out = await buildRosterSection();
    expect(out).toBe('# Council roster\n\na — A — impl — code + schema\nb — B — crit');
  });

  it('returns empty string when no councillors exist', async () => {
    mockList.mockResolvedValue([]);
    expect(await buildRosterSection()).toBe('');
  });
});
