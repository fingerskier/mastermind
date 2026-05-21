import { error, fail, redirect } from '@sveltejs/kit';
import { deleteCouncil, readCouncilWithCouncillors } from '$lib/server/councils';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
  try {
    const council = await readCouncilWithCouncillors(params.slug);
    return { council };
  } catch {
    error(404, 'Council not found');
  }
};

export const actions: Actions = {
  delete: async ({ params }) => {
    try {
      await deleteCouncil(params.slug);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete council.';
      return fail(500, { error: message });
    }
    redirect(303, '/');
  }
};
