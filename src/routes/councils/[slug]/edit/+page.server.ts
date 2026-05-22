import { error, fail, redirect } from '@sveltejs/kit';
import { readCouncil, updateCouncil } from '$lib/server/councils';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
  try {
    const council = await readCouncil(params.slug);
    return { council };
  } catch {
    error(404, 'Council not found');
  }
};

export const actions: Actions = {
  default: async ({ request, params }) => {
    const form = await request.formData();
    const name = String(form.get('name') ?? '').trim();
    const description = String(form.get('description') ?? '').trim();
    const template = String(form.get('template') ?? '').trim() || null;

    if (!name) return fail(400, { name, description, template, error: 'Name is required.' });

    try {
      await updateCouncil(params.slug, { name, description, template });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update council.';
      return fail(400, { name, description, template, error: message });
    }
    redirect(303, `/councils/${params.slug}`);
  }
};
