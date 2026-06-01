import { error, fail, redirect } from '@sveltejs/kit';
import {
  hasCouncil,
  readCouncilWithCouncillors,
  updateCouncil,
  deleteCouncilData
} from '$lib/server/councils';
import { deleteCouncillor } from '$lib/server/councillors';
import { readCouncilEnv, writeCouncilEnv, type EnvPair } from '$lib/server/env-file';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
  if (!hasCouncil()) error(404, 'No council in this directory');
  return { council: await readCouncilWithCouncillors(), pairs: readCouncilEnv() };
};

export const actions: Actions = {
  identity: async ({ request }) => {
    const form = await request.formData();
    const name = String(form.get('name') ?? '').trim();
    const description = String(form.get('description') ?? '').trim();
    const template = String(form.get('template') ?? '').trim() || null;

    if (!name) return fail(400, { name, description, template, error: 'Name is required.' });
    try {
      await updateCouncil({ name, description, template });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update council.';
      return fail(400, { name, description, template, error: message });
    }
    return { identitySaved: true };
  },

  env: async ({ request }) => {
    const form = await request.formData();
    const keys = form.getAll('key').map(String);
    const values = form.getAll('value').map(String);
    const pairs: EnvPair[] = keys.map((key, i) => ({ key, value: values[i] ?? '' }));
    try {
      await writeCouncilEnv(pairs);
    } catch (err) {
      return fail(400, { pairs, error: err instanceof Error ? err.message : 'Failed to save.' });
    }
    return { envSaved: true, pairs: readCouncilEnv() };
  },

  deleteCouncillor: async ({ request }) => {
    const form = await request.formData();
    const slug = String(form.get('slug') ?? '').trim();
    try {
      await deleteCouncillor(slug);
    } catch (err) {
      return fail(400, { error: err instanceof Error ? err.message : 'Failed to delete councillor.' });
    }
    return { councillorDeleted: slug };
  },

  deleteCouncil: async () => {
    try {
      await deleteCouncilData();
    } catch (err) {
      return fail(500, { error: err instanceof Error ? err.message : 'Failed to delete council data.' });
    }
    redirect(303, '/');
  }
};
