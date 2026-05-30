import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('$lib/server/peers', () => ({
  listPeers: vi.fn(async () => [
    { council_slug: 'a', name: 'A', cwd: '/a', port: 10192, councillors: [] }
  ])
}));

describe('GET /api/peers', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns the aggregated peer list', async () => {
    const { GET } = await import('./+server');
    const res = await GET({} as Parameters<typeof GET>[0]);
    const body = await res.json();
    expect(body.peers).toHaveLength(1);
    expect(body.peers[0].council_slug).toBe('a');
  });
});
