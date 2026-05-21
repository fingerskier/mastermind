import { listCouncils } from '$lib/server/councils';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
  const councils = await listCouncils();
  return { councils };
};
