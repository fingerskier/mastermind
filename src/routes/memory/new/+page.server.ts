import { error, fail, redirect } from '@sveltejs/kit';
import { hasCouncil, readCouncil } from '$lib/server/councils';
import { createNote } from '$lib/server/memory';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
  if (!hasCouncil()) error(404, 'No council in this directory');
  return { council: await readCouncil() };
};

export const actions: Actions = {
  default: async ({ request }) => {
    const form = await request.formData();
    const title = String(form.get('title') ?? '').trim();
    const body = String(form.get('body') ?? '');
    if (!title) return fail(400, { error: 'Title is required.', title, body });

    let slug: string;
    try {
      slug = (await createNote({ title, body })).slug;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create note.';
      return fail(400, { error: message, title, body });
    }
    redirect(303, `/memory/${slug}`);
  }
};
