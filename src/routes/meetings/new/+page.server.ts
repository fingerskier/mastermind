import type { Actions, PageServerLoad } from './$types';
import { fail, redirect } from '@sveltejs/kit';
import { listCouncillors } from '$lib/server/councillors';
import { startMeeting } from '$lib/server/meeting-runner';
import { MEETING_WINDOW_K_DEFAULT } from '$lib/server/config';

export const load: PageServerLoad = async () => {
  return {
    councillors: await listCouncillors(),
    defaultWindowK: MEETING_WINDOW_K_DEFAULT
  };
};

export const actions: Actions = {
  default: async ({ request }) => {
    const form = await request.formData();
    const title = String(form.get('title') ?? '').trim();
    const topic = String(form.get('topic') ?? '');
    const chair = String(form.get('chair') ?? '').trim();
    const attendees = form.getAll('attendees').map(String).filter(Boolean);
    const windowK =
      Number.parseInt(String(form.get('window_k') ?? ''), 10) || MEETING_WINDOW_K_DEFAULT;

    if (!title) return fail(400, { error: 'Title is required.' });
    if (!chair) return fail(400, { error: 'Chair is required.' });
    if (!attendees.includes(chair)) attendees.push(chair);

    let meetingId: string;
    try {
      const m = await startMeeting({
        title,
        topic,
        chair_slug: chair,
        attendees,
        window_k: windowK
      });
      meetingId = m.id;
    } catch (err) {
      return fail(400, { error: err instanceof Error ? err.message : String(err) });
    }

    throw redirect(303, `/meetings/${meetingId}`);
  }
};
