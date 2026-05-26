import { error, fail, redirect } from '@sveltejs/kit';
import { hasCouncil } from '$lib/server/councils';
import {
  deleteSchedule,
  readSchedule,
  readScheduleEvents,
  setEnabled
} from '$lib/server/schedules';
import { previewNext } from '$lib/server/cron';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
  if (!hasCouncil()) error(404, 'No council in this directory');
  const schedule = await readSchedule(params.id).catch(() => null);
  if (!schedule) error(404, `Schedule "${params.id}" not found`);
  const events = (await readScheduleEvents(params.id)).slice(-20).reverse();
  const upcoming =
    schedule.kind === 'recurring' && schedule.cron
      ? previewNext(schedule.cron, 3, new Date())
      : schedule.kind === 'once' && schedule.fire_at
        ? [schedule.fire_at]
        : [];
  return { schedule, events, upcoming };
};

export const actions: Actions = {
  toggle: async ({ params, request }) => {
    const form = await request.formData();
    const enabled = String(form.get('enabled') ?? '') === 'true';
    try {
      await setEnabled(params.id, enabled);
    } catch (err) {
      return fail(400, { error: err instanceof Error ? err.message : 'toggle failed' });
    }
    return { ok: true };
  },
  delete: async ({ params }) => {
    await deleteSchedule(params.id);
    redirect(303, '/schedules');
  }
};
