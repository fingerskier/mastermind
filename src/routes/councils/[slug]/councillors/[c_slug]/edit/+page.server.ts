import { error, fail, redirect } from '@sveltejs/kit';
import { readCouncillor, updateCouncillor } from '$lib/server/councillors';
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
  default: async ({ request, params }) => {
    const form = await request.formData();
    const name = String(form.get('name') ?? '').trim();
    const role = String(form.get('role') ?? '').trim();
    const adapter = String(form.get('adapter') ?? '').trim();
    const persona = String(form.get('persona') ?? '');

    if (!name) return fail(400, { name, role, adapter, persona, error: 'Name is required.' });
    if (!role) return fail(400, { name, role, adapter, persona, error: 'Role is required.' });

    try {
      await updateCouncillor(params.slug, params.c_slug, { name, role, adapter, persona });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update councillor.';
      return fail(400, { name, role, adapter, persona, error: message });
    }
    redirect(303, `/councils/${params.slug}/councillors/${params.c_slug}`);
  }
};
