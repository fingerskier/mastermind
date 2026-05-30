import { json } from '@sveltejs/kit';
import { listPeers } from '$lib/server/peers';
import { councilRoot } from '$lib/server/paths';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
  const peers = await listPeers({ selfCwd: councilRoot() });
  return json({ peers });
};
