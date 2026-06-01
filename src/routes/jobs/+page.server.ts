import { redirect } from '@sveltejs/kit';
import { hasCouncil, readCouncilWithCouncillors } from '$lib/server/councils';
import { listJobs } from '$lib/server/jobs';
import type { JobStatus } from '$lib/types';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
  if (!hasCouncil()) throw redirect(303, '/');

  const [council, jobs] = await Promise.all([readCouncilWithCouncillors(), listJobs()]);
  const names: Record<string, string> = {};
  for (const c of council.councillors) names[c.slug] = c.name;

  const counts: Record<JobStatus, number> = {
    queued: 0, running: 0, succeeded: 0, failed: 0, cancelled: 0
  };
  for (const j of jobs) counts[j.status]++;

  return {
    jobs: jobs.map((j) => ({
      id: j.id,
      title: j.title,
      status: j.status,
      councillor_slug: j.councillor_slug,
      councillor_name: names[j.councillor_slug] ?? j.councillor_slug,
      created_at: j.created_at,
      from_schedule: Boolean(j.spawned_by_schedule_id)
    })),
    counts,
    total: jobs.length
  };
};
