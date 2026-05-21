import { error, fail, redirect } from '@sveltejs/kit';
import { readCouncil } from '$lib/server/councils';
import { deleteNote, readNote, updateNote } from '$lib/server/memory';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
  try {
    const [council, note] = await Promise.all([
      readCouncil(params.slug),
      readNote(params.slug, params.note)
    ]);
    return { council, note };
  } catch {
    error(404, 'Note not found');
  }
};

export const actions: Actions = {
  save: async ({ params, request }) => {
    const form = await request.formData();
    const body = String(form.get('body') ?? '');
    try {
      await updateNote(params.slug, params.note, body);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save note.';
      return fail(400, { error: message });
    }
    return { saved: true };
  },
  delete: async ({ params }) => {
    await deleteNote(params.slug, params.note);
    redirect(303, `/councils/${params.slug}`);
  }
};
