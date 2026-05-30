import { json } from '@sveltejs/kit';
import { readCouncil } from '$lib/server/councils';
import { listCouncillors } from '$lib/server/councillors';
import { current } from '$lib/server/councillor-lock';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
  const council = await readCouncil();
  const councillors = (await listCouncillors()).map((c) => ({
    slug: c.slug,
    label: c.name,
    adapter: c.adapter,
    busy: current(c.slug) !== null
  }));
  return json({ slug: council.slug, name: council.name, councillors });
};
