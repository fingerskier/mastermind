import { readInstances, type Instance } from './instances';
import { PEER_DISCOVERY_TIMEOUT_MS } from './config';

export interface PeerCouncillor {
  slug: string;
  /** Mirrors the `/api/council` wire field — the remote councillor's display name, distinct from local `Councillor.name`. */
  label: string;
  adapter: string;
  busy: boolean;
}

export interface Peer {
  council_slug: string;
  name: string;
  cwd: string;
  port: number;
  councillors: PeerCouncillor[];
}

interface ListPeersOpts {
  selfCwd: string;
  /** Override for tests. Defaults to the live registry. */
  instances?: Instance[];
  /** Override for tests. Defaults to global fetch. */
  fetchImpl?: typeof fetch;
}

async function fetchCouncil(
  port: number,
  fetchImpl: typeof fetch
): Promise<{ slug: string; name: string; councillors: PeerCouncillor[] } | null> {
  try {
    const res = await fetchImpl(`http://127.0.0.1:${port}/api/council`, {
      signal: AbortSignal.timeout(PEER_DISCOVERY_TIMEOUT_MS)
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { slug: string; name: string; councillors: PeerCouncillor[] };
    if (!body || typeof body.slug !== 'string' || !Array.isArray(body.councillors)) return null;
    return body;
  } catch {
    return null;
  }
}

export async function listPeers(opts: ListPeersOpts): Promise<Peer[]> {
  const instances = opts.instances ?? (await readInstances());
  const fetchImpl = opts.fetchImpl ?? fetch;
  const others = instances.filter((i) => i.cwd !== opts.selfCwd && typeof i.port === 'number');
  const results = await Promise.all(
    others.map(async (i) => {
      const council = await fetchCouncil(i.port as number, fetchImpl);
      if (!council) return null;
      return {
        council_slug: council.slug,
        name: council.name,
        cwd: i.cwd,
        port: i.port as number,
        councillors: council.councillors
      } satisfies Peer;
    })
  );
  return results.filter((p): p is Peer => p !== null);
}

/** Durable cwd → live port. null when the peer is no longer running. */
export async function resolvePeerPort(cwd: string, instances?: Instance[]): Promise<number | null> {
  const list = instances ?? (await readInstances());
  const hit = list.find((i) => i.cwd === cwd && typeof i.port === 'number');
  return hit ? (hit.port as number) : null;
}
