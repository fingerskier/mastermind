import { json } from '@sveltejs/kit';
import { readInstances } from '$lib/server/instances';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
  const instances = await readInstances();
  return json({ instances });
};
