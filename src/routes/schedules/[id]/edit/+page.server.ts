import { error, fail, redirect } from '@sveltejs/kit';
import { hasCouncil, readCouncilWithCouncillors } from '$lib/server/councils';
import { readSchedule, updateSchedule } from '$lib/server/schedules';
import { validateCron } from '$lib/server/cron';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
  if (!hasCouncil()) error(404, 'No council in this directory');
  const schedule = await readSchedule(params.id).catch(() => null);
  if (!schedule) error(404, `Schedule "${params.id}" not found`);
  const council = await readCouncilWithCouncillors();
  return { schedule, council };
};

function parseFireAtLocal(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (isNaN(d.getTime())) return null;
  return d.toISOString();
}

export const actions: Actions = {
  default: async ({ params, request }) => {
    const form = await request.formData();
    const title = String(form.get('title') ?? '').trim();
    const brief = String(form.get('brief') ?? '').trim();
    const councillor_slug = String(form.get('councillor_slug') ?? '').trim();
    const kind = String(form.get('kind') ?? 'recurring') as 'once' | 'recurring';
    const cronRaw = String(form.get('cron') ?? '').trim();
    const fireAtRaw = String(form.get('fire_at') ?? '').trim();
    const enabled = form.get('enabled') === 'on';

    const formState = { title, brief, councillor_slug, kind, cron: cronRaw, fire_at: fireAtRaw, enabled };

    if (!title || !brief || !councillor_slug) {
      return fail(400, { ...formState, error: 'Title, brief, and councillor are required.' });
    }
    if (kind === 'recurring' && !validateCron(cronRaw)) {
      return fail(400, { ...formState, error: `Invalid cron expression: "${cronRaw}".` });
    }
    if (kind === 'once' && !parseFireAtLocal(fireAtRaw)) {
      return fail(400, { ...formState, error: 'A valid fire-at datetime is required.' });
    }
    try {
      await updateSchedule(params.id, {
        title,
        brief,
        councillor_slug,
        kind,
        cron: kind === 'recurring' ? cronRaw : null,
        fire_at: kind === 'once' ? parseFireAtLocal(fireAtRaw) : null,
        enabled
      });
      redirect(303, `/schedules/${params.id}`);
    } catch (err) {
      if (err instanceof Response) throw err;
      return fail(400, { ...formState, error: err instanceof Error ? err.message : 'Failed to update schedule.' });
    }
  }
};
