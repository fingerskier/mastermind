import { error, fail, redirect } from '@sveltejs/kit';
import { deleteCouncil, readCouncilWithCouncillors } from '$lib/server/councils';
import { listJobs, readOutputSlug } from '$lib/server/jobs';
import { listNotes } from '$lib/server/memory';
import { currentRuns } from '$lib/server/runner';
import type { Job } from '$lib/types';
import type { Actions, PageServerLoad } from './$types';

const RECENT_JOBS_PER_COUNCILLOR = 5;

export type RecentJob = Job & { slug?: string };

export const load: PageServerLoad = async ({ params }) => {
  try {
    const council = await readCouncilWithCouncillors(params.slug);
    const [jobs, notes] = await Promise.all([
      listJobs(params.slug),
      listNotes(params.slug)
    ]);
    const running = new Set(
      currentRuns().filter((r) => r.council === params.slug).map((r) => r.councillor)
    );
    const recentByCouncillor: Record<string, RecentJob[]> = {};
    for (const c of council.councillors) recentByCouncillor[c.slug] = [];
    for (const j of jobs) {
      const bucket = recentByCouncillor[j.councillor_slug];
      if (!bucket) continue;
      if (bucket.length < RECENT_JOBS_PER_COUNCILLOR) bucket.push(j);
    }
    await Promise.all(
      Object.values(recentByCouncillor).flat().map(async (j) => {
        if (j.status === 'succeeded') j.slug = await readOutputSlug(params.slug, j.id, 100);
      })
    );
    return { council, notes, recentByCouncillor, running: Array.from(running) };
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
