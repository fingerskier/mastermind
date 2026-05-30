import type { Actions, PageServerLoad } from './$types';
import { fail, redirect } from '@sveltejs/kit';
import { listCouncillors } from '$lib/server/councillors';
import { startMeeting } from '$lib/server/meeting-runner';
import { MEETING_WINDOW_K_DEFAULT } from '$lib/server/config';
import { listPeers } from '$lib/server/peers';
import { councilRoot } from '$lib/server/paths';
import type { RemoteAttendee } from '$lib/types';

export const load: PageServerLoad = async () => {
  return {
    councillors: await listCouncillors(),
    defaultWindowK: MEETING_WINDOW_K_DEFAULT,
    peers: await listPeers({ selfCwd: councilRoot() })
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

    const remote_attendees: RemoteAttendee[] = [];
    for (const raw of form.getAll('remote').map(String).filter(Boolean)) {
      try {
        const r = JSON.parse(raw) as RemoteAttendee;
        if (r.council_slug && r.councillor_slug && r.cwd) {
          remote_attendees.push({
            council_slug: String(r.council_slug),
            councillor_slug: String(r.councillor_slug),
            cwd: String(r.cwd),
            label: String(r.label ?? '')
          });
        }
      } catch { /* ignore malformed remote entries */ }
    }

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
        window_k: windowK,
        remote_attendees
      });
      meetingId = m.id;
    } catch (err) {
      return fail(400, { error: err instanceof Error ? err.message : String(err) });
    }

    throw redirect(303, `/meetings/${meetingId}`);
  }
};
