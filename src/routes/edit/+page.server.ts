import { error, fail, redirect } from '@sveltejs/kit';
import { hasCouncil, readCouncil, updateCouncil } from '$lib/server/councils';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
  if (!hasCouncil()) error(404, 'No council in this directory');
  return { council: await readCouncil() };
};

export const actions: Actions = {
  default: async ({ request }) => {
    const form = await request.formData();
    const name = String(form.get('name') ?? '').trim();
    const description = String(form.get('description') ?? '').trim();
    const template = String(form.get('template') ?? '').trim() || null;

    if (!name) return fail(400, { name, description, template, error: 'Name is required.' });

    try {
      await updateCouncil({ name, description, template });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update council.';
      return fail(400, { name, description, template, error: message });
    }
    redirect(303, '/');
  }
};
