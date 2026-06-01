import { fail } from '@sveltejs/kit';
import {
  createCouncil,
  hasCouncil,
  readCouncilWithCouncillors
} from '$lib/server/councils';
import { listJobs } from '$lib/server/jobs';
import { listNotes } from '$lib/server/memory';
import { listJobProposals } from '$lib/server/proposals';
import { currentRuns } from '$lib/server/runner';
import { scheduleSummary } from '$lib/server/scheduler';
import { listMeetings } from '$lib/server/meetings';
import { councilRoot } from '$lib/server/paths';
import type { Job } from '$lib/types';
import type { Actions, PageServerLoad } from './$types';

const RECENT_JOBS_PER_COUNCILLOR = 5;

export const load: PageServerLoad = async () => {
  if (!hasCouncil()) {
    return { hasCouncil: false as const, cwd: councilRoot() };
  }
  const council = await readCouncilWithCouncillors();
  const [jobs, notes, pendingProposals, schedules, meetings] = await Promise.all([
    listJobs(),
    listNotes(),
    listJobProposals({ status: 'pending' }),
    scheduleSummary(),
    listMeetings()
  ]);
  const activeMeetingsCount = meetings.filter(
    (m) => !['ended', 'cancelled', 'failed'].includes(m.status)
  ).length;
  const running = new Set(currentRuns().map((r) => r.councillor));
  const recentByCouncillor: Record<string, Job[]> = {};
  const perCouncillor: Record<string, { running: number; queued: number; failed: number }> = {};
  for (const c of council.councillors) {
    recentByCouncillor[c.slug] = [];
    perCouncillor[c.slug] = { running: 0, queued: 0, failed: 0 };
  }
  const stats = { running: 0, queued: 0, failed: 0, succeeded: 0 };
  for (const j of jobs) {
    if (j.status in stats) stats[j.status as keyof typeof stats]++;
    const pc = perCouncillor[j.councillor_slug];
    if (pc) {
      if (j.status === 'running') pc.running++;
      else if (j.status === 'queued') pc.queued++;
      else if (j.status === 'failed') pc.failed++;
    }
    const bucket = recentByCouncillor[j.councillor_slug];
    if (!bucket) continue;
    if (bucket.length < RECENT_JOBS_PER_COUNCILLOR) bucket.push(j);
  }

  // The active meeting (if any) for the command-center strip.
  const activeMeeting = meetings.find((m) => !['ended', 'cancelled', 'failed'].includes(m.status)) ?? null;

  return {
    hasCouncil: true as const,
    council,
    notes,
    recentByCouncillor,
    perCouncillor,
    stats,
    running: Array.from(running),
    pendingProposalCount: pendingProposals.length,
    schedules,
    meetingsTotal: meetings.length,
    activeMeetings: activeMeetingsCount,
    activeMeeting: activeMeeting
      ? { id: activeMeeting.id, title: activeMeeting.title, status: activeMeeting.status }
      : null
  };
};

export const actions: Actions = {
  create: async ({ request }) => {
    const form = await request.formData();
    const name = String(form.get('name') ?? '').trim();
    const description = String(form.get('description') ?? '').trim();

    if (!name) return fail(400, { name, description, error: 'Name is required.' });

    try {
      await createCouncil({ name, description, template: null });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create council.';
      return fail(400, { name, description, error: message });
    }
    return { created: true };
  }
};
