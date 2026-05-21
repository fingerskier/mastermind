import { fail, redirect } from '@sveltejs/kit';
import { createCouncil } from '$lib/server/councils';
import type { Actions } from './$types';

export const actions: Actions = {
  default: async ({ request }) => {
    const form = await request.formData();
    const name = String(form.get('name') ?? '').trim();
    const description = String(form.get('description') ?? '').trim();
    const template = String(form.get('template') ?? '').trim() || null;

    if (!name) return fail(400, { name, description, template, error: 'Name is required.' });

    let slug: string;
    try {
      const council = await createCouncil({ name, description, template });
      slug = council.slug;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create council.';
      return fail(400, { name, description, template, error: message });
    }
    redirect(303, `/councils/${slug}`);
  }
};
