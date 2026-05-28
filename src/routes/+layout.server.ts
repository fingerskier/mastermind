import { hasCouncil, readCouncil } from '$lib/server/councils';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async () => {
  if (!hasCouncil()) return { councilName: null };
  try {
    const council = await readCouncil();
    return { councilName: council.name };
  } catch {
    return { councilName: null };
  }
};
