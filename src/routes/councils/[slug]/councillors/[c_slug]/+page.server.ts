import { error, fail, redirect } from '@sveltejs/kit';
import { deleteCouncillor, readCouncillor, updateCouncillor } from '$lib/server/councillors';
import { listKnownAdapters } from '$lib/server/adapters';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
  try {
    const councillor = await readCouncillor(params.slug, params.c_slug);
    return { councillor, adapters: listKnownAdapters() };
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
  },
  setAdapter: async ({ params, request }) => {
    const form = await request.formData();
    const adapter = String(form.get('adapter') ?? '').trim();
    const known = listKnownAdapters();
    const match = known.find((a) => a.id === adapter);
    if (adapter && !match) {
      return fail(400, { error: `Unknown adapter "${adapter}".` });
    }
    if (match && !match.available) {
      return fail(400, { error: `Adapter "${match.label}" is not available yet.` });
    }
    try {
      await updateCouncillor(params.slug, params.c_slug, { adapter });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update adapter.';
      return fail(400, { error: message });
    }
    return { adapterSaved: true };
  }
};
