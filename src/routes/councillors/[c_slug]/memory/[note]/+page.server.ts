import { error, fail, redirect } from '@sveltejs/kit';
import { deletePrivateNote, readPrivateNote, updatePrivateNote } from '$lib/server/memory_private';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
  try {
    const note = await readPrivateNote(params.c_slug, params.note);
    return { note, c_slug: params.c_slug };
  } catch {
    error(404, 'Memory not found');
  }
};

export const actions: Actions = {
  save: async ({ params, request }) => {
    const form = await request.formData();
    const body = String(form.get('body') ?? '');
    try {
      await updatePrivateNote(params.c_slug, params.note, body);
    } catch (err) {
      return fail(400, { error: err instanceof Error ? err.message : 'Save failed.' });
    }
    return { saved: true };
  },
  delete: async ({ params }) => {
    await deletePrivateNote(params.c_slug, params.note);
    redirect(303, `/councillors/${params.c_slug}`);
  }
};
