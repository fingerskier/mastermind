import { listInstallableAdapters } from '$lib/server/adapters';
import pkg from '../../../package.json' with { type: 'json' };
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = () => {
  return {
    adapters: listInstallableAdapters(),
    version: pkg.version
  };
};
