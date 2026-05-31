import { error, fail } from '@sveltejs/kit';
import { hasCouncil } from '$lib/server/councils';
import { readCouncilEnv, writeCouncilEnv, type EnvPair } from '$lib/server/env-file';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
  if (!hasCouncil()) error(404, 'No council in this directory');
  return { pairs: readCouncilEnv() };
};

export const actions: Actions = {
  default: async ({ request }) => {
    const form = await request.formData();
    const keys = form.getAll('key').map(String);
    const values = form.getAll('value').map(String);
    const pairs: EnvPair[] = keys.map((key, i) => ({ key, value: values[i] ?? '' }));
    try {
      await writeCouncilEnv(pairs);
    } catch (err) {
      return fail(400, { pairs, error: err instanceof Error ? err.message : 'Failed to save.' });
    }
    return { saved: true, pairs: readCouncilEnv() };
  }
};
