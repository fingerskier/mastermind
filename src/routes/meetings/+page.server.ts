import type { PageServerLoad } from './$types';
import { listMeetings } from '$lib/server/meetings';

export const load: PageServerLoad = async () => {
  return { meetings: await listMeetings() };
};
