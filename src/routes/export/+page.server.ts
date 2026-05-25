import { error } from '@sveltejs/kit';
import { hasCouncil } from '$lib/server/councils';
import { listCouncillors } from '$lib/server/councillors';
import { listNotes } from '$lib/server/memory';
import { listJobs } from '$lib/server/jobs';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
  if (!hasCouncil()) throw error(404, 'No council in this directory.');
  const [councillors, notes, jobs] = await Promise.all([
    listCouncillors(),
    listNotes(),
    listJobs()
  ]);
  return {
    councillors,
    notes,
    queuedJobs: jobs.filter((j) => j.status === 'queued')
  };
};
