import { error, fail, redirect } from '@sveltejs/kit';
import { deleteCouncil, readCouncilWithCouncillors } from '$lib/server/councils';
import { listJobs } from '$lib/server/jobs';
import { listNotes } from '$lib/server/memory';
import { currentRuns } from '$lib/server/runner';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
  try {
    const council = await readCouncilWithCouncillors(params.slug);
    const [jobs, notes] = await Promise.all([
      listJobs(params.slug),
      listNotes(params.slug)
    ]);
    const running = currentRuns()
      .filter((r) => r.council === params.slug)
      .map((r) => ({ councillor: r.councillor, jobId: r.jobId }));
    return { council, jobs, notes, running };
  } catch {
    error(404, 'Council not found');
  }
};

export const actions: Actions = {
  delete: async ({ params }) => {
    try {
      await deleteCouncil(params.slug);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete council.';
      return fail(500, { error: message });
    }
    redirect(303, '/');
  }
};
