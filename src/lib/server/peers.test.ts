import { describe, it, expect } from 'vitest';
import { listPeers, resolvePeerPort } from './peers';
import type { Instance } from './instances';

const inst = (cwd: string, port: number): Instance => ({
  pid: 1, port, cwd, startedAt: '2026-05-30T00:00:00Z'
});

describe('listPeers', () => {
  it('aggregates instances ⨯ /api/council, excludes self, drops unreachable', async () => {
    const instances: Instance[] = [
      inst('/me', 10191),     // self — excluded
      inst('/peerA', 10192),  // reachable
      inst('/peerB', 10193)   // unreachable
    ];
    const fetchImpl = (async (url: string) => {
      if (url.includes('10192')) {
        return new Response(
          JSON.stringify({
            slug: 'a-council',
            name: 'A Council',
            councillors: [{ slug: 'leto', label: 'Leto', adapter: 'cli:claude', busy: false }]
          }),
          { status: 200 }
        );
      }
      throw new Error('connection refused');
    }) as unknown as typeof fetch;

    const peers = await listPeers({ selfCwd: '/me', instances, fetchImpl });
    expect(peers).toHaveLength(1);
    expect(peers[0]).toMatchObject({
      council_slug: 'a-council',
      name: 'A Council',
      cwd: '/peerA',
      port: 10192
    });
    expect(peers[0].councillors[0].slug).toBe('leto');
  });

  it('drops instances with a null port', async () => {
    const instances: Instance[] = [{ pid: 2, port: null, cwd: '/x', startedAt: 'x' }];
    const fetchImpl = (async () => { throw new Error('should not fetch'); }) as unknown as typeof fetch;
    expect(await listPeers({ selfCwd: '/me', instances, fetchImpl })).toEqual([]);
  });
});

describe('resolvePeerPort', () => {
  it('returns the live port for a cwd', async () => {
    const instances: Instance[] = [inst('/peerA', 10192)];
    expect(await resolvePeerPort('/peerA', instances)).toBe(10192);
  });
  it('returns null when the cwd is no longer running', async () => {
    expect(await resolvePeerPort('/gone', [])).toBeNull();
  });
  it('returns null when the matching instance has a null port', async () => {
    expect(await resolvePeerPort('/p', [{ pid: 3, port: null, cwd: '/p', startedAt: 'x' }])).toBeNull();
  });
});
