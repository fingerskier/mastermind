import { fail, redirect } from '@sveltejs/kit';
import { createCouncillor } from '$lib/server/councillors';
import { listKnownAdapters } from '$lib/server/adapters';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
  return { adapters: listKnownAdapters() };
};

export const actions: Actions = {
  default: async ({ request }) => {
    const form = await request.formData();
    const name = String(form.get('name') ?? '').trim();
    const role = String(form.get('role') ?? '').trim();
    const routing_hint = String(form.get('routing_hint') ?? '').trim();
    const adapter = String(form.get('adapter') ?? '').trim();
    const persona = String(form.get('persona') ?? '');

    if (!name) return fail(400, { name, role, routing_hint, adapter, persona, error: 'Name is required.' });
    if (!role) return fail(400, { name, role, routing_hint, adapter, persona, error: 'Role is required.' });

    let cSlug: string;
    try {
      const c = await createCouncillor({ name, role, routing_hint, adapter, persona });
      cSlug = c.slug;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create councillor.';
      return fail(400, { name, role, routing_hint, adapter, persona, error: message });
    }
    redirect(303, `/councillors/${cSlug}`);
  }
};
