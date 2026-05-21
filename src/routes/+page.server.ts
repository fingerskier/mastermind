import { listCouncils } from '$lib/server/councils';
import { currentRuns } from '$lib/server/runner';
import { readJob } from '$lib/server/jobs';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
  const councils = await listCouncils();
  const runs = currentRuns();
  const activity = await Promise.all(
    runs.map(async (r) => {
      const job = await readJob(r.council, r.jobId).catch(() => null);
      return {
        council: r.council,
        councillor: r.councillor,
        jobId: r.jobId,
        title: job?.title ?? r.jobId,
        status: job?.status ?? 'running'
      };
    })
  );
  return { councils, activity };
};
