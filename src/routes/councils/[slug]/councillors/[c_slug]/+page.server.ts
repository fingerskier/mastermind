import { error, fail, redirect } from '@sveltejs/kit';
import { deleteCouncillor, readCouncillor } from '$lib/server/councillors';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
  try {
    const councillor = await readCouncillor(params.slug, params.c_slug);
    return { councillor };
  } catch {
    error(404, 'Councillor not found');
  }
};

export const actions: Actions = {
  delete: async ({ params }) => {
    try {
      await deleteCouncillor(params.slug, params.c_slug);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete councillor.';
      return fail(500, { error: message });
    }
    redirect(303, `/councils/${params.slug}`);
  }
};
