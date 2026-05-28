import type { Actions, PageServerLoad } from './$types';
import { error, fail } from '@sveltejs/kit';
import {
  readMeeting,
  readMeetingEvents,
  readTopic,
  readTranscript,
  readSummary,
  readSynthesis
} from '$lib/server/meetings';
import {
  directorSpeak,
  directorSkip,
  endMeeting,
  cancelMeeting,
  resumeMeeting
} from '$lib/server/meeting-runner';

export const load: PageServerLoad = async ({ params }) => {
  const meeting = await readMeeting(params.id).catch(() => null);
  if (!meeting) throw error(404, 'Meeting not found');
  return {
    meeting,
    topic: await readTopic(params.id),
    transcript: await readTranscript(params.id),
    summary: await readSummary(params.id),
    synthesis: meeting.status === 'ended' ? await readSynthesis(params.id) : '',
    events: await readMeetingEvents(params.id)
  };
};

export const actions: Actions = {
  speak: async ({ request, params }) => {
    const form = await request.formData();
    const body = String(form.get('body') ?? '');
    try {
      await directorSpeak(params.id!, body);
    } catch (err) {
      return fail(400, { error: err instanceof Error ? err.message : String(err) });
    }
    return { ok: true };
  },
  skip: async ({ params }) => {
    try {
      await directorSkip(params.id!);
    } catch (err) {
      return fail(400, { error: err instanceof Error ? err.message : String(err) });
    }
    return { ok: true };
  },
  end: async ({ params }) => {
    try {
      await endMeeting(params.id!);
    } catch (err) {
      return fail(400, { error: err instanceof Error ? err.message : String(err) });
    }
    return { ok: true };
  },
  cancel: async ({ params }) => {
    try {
      await cancelMeeting(params.id!);
    } catch (err) {
      return fail(400, { error: err instanceof Error ? err.message : String(err) });
    }
    return { ok: true };
  },
  resume: async ({ params }) => {
    try {
      await resumeMeeting(params.id!);
    } catch (err) {
      return fail(400, { error: err instanceof Error ? err.message : String(err) });
    }
    return { ok: true };
  }
};
