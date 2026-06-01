import { redirect } from '@sveltejs/kit';
import { hasCouncil } from '$lib/server/councils';
import { listNotes } from '$lib/server/memory';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
  if (!hasCouncil()) throw redirect(303, '/');
  const notes = await listNotes();
  return { notes };
};
