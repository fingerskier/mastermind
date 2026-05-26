import { error, fail, isRedirect, redirect } from '@sveltejs/kit';
import { hasCouncil, readCouncilWithCouncillors } from '$lib/server/councils';
import { createJob } from '$lib/server/jobs';
import { startJobInBackground } from '$lib/server/runner';
import { createSchedule } from '$lib/server/schedules';
import { validateCron } from '$lib/server/cron';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url }) => {
  if (!hasCouncil()) error(404, 'No council in this directory');
  const council = await readCouncilWithCouncillors();
  const forParam = url.searchParams.get('for') ?? '';
  const validSlugs = new Set(council.councillors.map(c => c.slug));
  let preselect: string[];
  if (forParam === '__all__') {
    preselect = council.councillors.map(c => c.slug);
  } else if (forParam && validSlugs.has(forParam)) {
    preselect = [forParam];
  } else {
    preselect = [];
  }
  return { council, preselect };
};

function parseFireAtLocal(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (isNaN(d.getTime())) return null;
  return d.toISOString();
}

export const actions: Actions = {
  default: async ({ request }) => {
    const form = await request.formData();
    const title = String(form.get('title') ?? '').trim();
    const brief = String(form.get('brief') ?? '').trim();
    const slugs = form
      .getAll('councillor_slugs')
      .map((v) => String(v).trim())
      .filter(Boolean);
    const start_now = form.get('start_now') === 'on';
    const save_as = String(form.get('save_as') ?? 'job') as 'job' | 'schedule';

    if (!title || !brief || slugs.length === 0) {
      return fail(400, {
        error: 'Title, brief, and at least one councillor are required.',
        title,
        brief,
        councillor_slugs: slugs,
        save_as,
        sched_cron: String(form.get('sched_cron') ?? ''),
        sched_fire_at: String(form.get('sched_fire_at') ?? '')
      });
    }

    const council = await readCouncilWithCouncillors();
    const validSlugs = new Set(council.councillors.map((c) => c.slug));
    const unknown = slugs.filter((s) => !validSlugs.has(s));
    if (unknown.length > 0) {
      return fail(400, {
        error: `Unknown councillor${unknown.length === 1 ? '' : 's'}: ${unknown.join(', ')}`,
        title,
        brief,
        councillor_slugs: slugs,
        save_as,
        sched_cron: String(form.get('sched_cron') ?? ''),
        sched_fire_at: String(form.get('sched_fire_at') ?? '')
      });
    }

    if (save_as === 'schedule') {
      if (slugs.length !== 1) {
        return fail(400, {
          error: 'Save as schedule requires exactly one councillor.',
          title, brief, councillor_slugs: slugs, save_as,
          sched_cron: String(form.get('sched_cron') ?? ''),
          sched_fire_at: String(form.get('sched_fire_at') ?? '')
        });
      }
      const kind = String(form.get('sched_kind') ?? 'recurring') as 'once' | 'recurring';
      const cronRaw = String(form.get('sched_cron') ?? '').trim();
      const fireAtRaw = String(form.get('sched_fire_at') ?? '').trim();
      const enabled = form.get('sched_enabled') === 'on';
      if (kind === 'recurring' && !validateCron(cronRaw)) {
        return fail(400, { error: `Invalid cron expression: "${cronRaw}".`, title, brief, councillor_slugs: slugs, save_as,
          sched_cron: cronRaw,
          sched_fire_at: String(form.get('sched_fire_at') ?? '') });
      }
      if (kind === 'once' && !parseFireAtLocal(fireAtRaw)) {
        return fail(400, { error: 'A valid fire-at datetime is required.', title, brief, councillor_slugs: slugs, save_as,
          sched_cron: String(form.get('sched_cron') ?? ''),
          sched_fire_at: fireAtRaw });
      }
      try {
        const s = await createSchedule({
          title,
          brief,
          councillor_slug: slugs[0],
          kind,
          cron: kind === 'recurring' ? cronRaw : null,
          fire_at: kind === 'once' ? parseFireAtLocal(fireAtRaw) : null,
          enabled
        });
        redirect(303, `/schedules/${s.id}`);
      } catch (err) {
        if (isRedirect(err)) throw err;
        return fail(400, { error: err instanceof Error ? err.message : 'Failed to create schedule.', title, brief, councillor_slugs: slugs, save_as,
          sched_cron: String(form.get('sched_cron') ?? ''),
          sched_fire_at: String(form.get('sched_fire_at') ?? '') });
      }
    }

    const uniqueSlugs = Array.from(new Set(slugs));
    const now = new Date();
    const created: string[] = [];
    try {
      for (let i = 0; i < uniqueSlugs.length; i++) {
        const stamp = new Date(now.getTime() + i);
        const job = await createJob(
          { title, brief, councillor_slug: uniqueSlugs[i] },
          stamp
        );
        created.push(job.id);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create job.';
      return fail(400, { error: message, title, brief, councillor_slugs: slugs, save_as,
        sched_cron: String(form.get('sched_cron') ?? ''),
        sched_fire_at: String(form.get('sched_fire_at') ?? '') });
    }

    if (start_now) for (const id of created) startJobInBackground(id);

    if (created.length === 1) redirect(303, `/jobs/${created[0]}`);
    redirect(303, '/');
  }
};
