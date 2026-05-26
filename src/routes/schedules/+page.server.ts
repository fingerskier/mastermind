import { error, fail } from '@sveltejs/kit';
import { hasCouncil } from '$lib/server/councils';
import { deleteSchedule, listSchedules, setEnabled } from '$lib/server/schedules';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
  if (!hasCouncil()) error(404, 'No council in this directory');
  const schedules = await listSchedules();
  return { schedules };
};

export const actions: Actions = {
  toggle: async ({ request }) => {
    const form = await request.formData();
    const id = String(form.get('id') ?? '');
    const enabled = String(form.get('enabled') ?? '') === 'true';
    if (!id) return fail(400, { error: 'id is required' });
    try {
      await setEnabled(id, enabled);
    } catch (err) {
      return fail(400, { error: err instanceof Error ? err.message : 'toggle failed' });
    }
    return { ok: true };
  },
  delete: async ({ request }) => {
    const form = await request.formData();
    const id = String(form.get('id') ?? '');
    if (!id) return fail(400, { error: 'id is required' });
    await deleteSchedule(id);
    return { ok: true };
  }
};
