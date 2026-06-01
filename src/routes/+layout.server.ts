import { hasCouncil, readCouncil } from '$lib/server/councils';
import { listJobProposals } from '$lib/server/proposals';
import { listMeetings } from '$lib/server/meetings';
import { listJobs } from '$lib/server/jobs';
import type { LayoutServerLoad } from './$types';

export interface NavCounts {
  proposals: number;
  meetings: number;
  running: number;
  failed: number;
}

const EMPTY: NavCounts = { proposals: 0, meetings: 0, running: 0, failed: 0 };

export const load: LayoutServerLoad = async () => {
  if (!hasCouncil()) {
    return { hasCouncil: false, councilName: null, nav: EMPTY };
  }
  try {
    const [council, proposals, meetings, jobs] = await Promise.all([
      readCouncil(),
      listJobProposals({ status: 'pending' }),
      listMeetings({ status: ['running', 'awaiting_director', 'paused', 'synthesizing'] }),
      listJobs()
    ]);
    const nav: NavCounts = {
      proposals: proposals.length,
      meetings: meetings.length,
      running: jobs.filter((j) => j.status === 'running' || j.status === 'queued').length,
      failed: jobs.filter((j) => j.status === 'failed').length
    };
    return { hasCouncil: true, councilName: council.name, nav };
  } catch {
    return { hasCouncil: false, councilName: null, nav: EMPTY };
  }
};
