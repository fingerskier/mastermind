import { fail } from '@sveltejs/kit';
import {
  createCouncil,
  deleteCouncilData,
  hasCouncil,
  readCouncilWithCouncillors
} from '$lib/server/councils';
import { listJobs, readOutputSlug } from '$lib/server/jobs';
import { listNotes } from '$lib/server/memory';
import { currentRuns } from '$lib/server/runner';
import { councilRoot } from '$lib/server/paths';
import type { Job } from '$lib/types';
import type { Actions, PageServerLoad } from './$types';

const RECENT_JOBS_PER_COUNCILLOR = 5;

export type RecentJob = Job & { slug?: string };

export const load: PageServerLoad = async () => {
  if (!hasCouncil()) {
    return { hasCouncil: false as const, cwd: councilRoot() };
  }
  const council = await readCouncilWithCouncillors();
  const [jobs, notes] = await Promise.all([listJobs(), listNotes()]);
  const running = new Set(currentRuns().map((r) => r.councillor));
  const recentByCouncillor: Record<string, RecentJob[]> = {};
  for (const c of council.councillors) recentByCouncillor[c.slug] = [];
  for (const j of jobs) {
    const bucket = recentByCouncillor[j.councillor_slug];
    if (!bucket) continue;
    if (bucket.length < RECENT_JOBS_PER_COUNCILLOR) bucket.push(j);
  }
  await Promise.all(
    Object.values(recentByCouncillor)
      .flat()
      .map(async (j) => {
        if (j.status === 'succeeded') j.slug = await readOutputSlug(j.id, 100);
      })
  );
  return {
    hasCouncil: true as const,
    council,
    notes,
    recentByCouncillor,
    running: Array.from(running)
  };
};

export const actions: Actions = {
  create: async ({ request }) => {
    const form = await request.formData();
    const name = String(form.get('name') ?? '').trim();
    const description = String(form.get('description') ?? '').trim();
    const template = String(form.get('template') ?? '').trim() || null;

    if (!name) return fail(400, { name, description, template, error: 'Name is required.' });

    try {
      await createCouncil({ name, description, template });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create council.';
      return fail(400, { name, description, template, error: message });
    }
    return { created: true };
  },
  delete: async () => {
    try {
      await deleteCouncilData();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete council data.';
      return fail(500, { error: message });
    }
    return { deleted: true };
  }
};
