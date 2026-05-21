import { error, fail, redirect } from '@sveltejs/kit';
import { readCouncil } from '$lib/server/councils';
import { readJob, readEvents, readInput, readOutput, readTranscript } from '$lib/server/jobs';
import { cancelJob, isRunning, startJobInBackground } from '$lib/server/runner';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
  try {
    const [council, job, events, input, transcript, output] = await Promise.all([
      readCouncil(params.slug),
      readJob(params.slug, params.jid),
      readEvents(params.slug, params.jid),
      readInput(params.slug, params.jid),
      readTranscript(params.slug, params.jid),
      readOutput(params.slug, params.jid)
    ]);
    return { council, job, events, input, transcript, output };
  } catch {
    error(404, 'Job not found');
  }
};

export const actions: Actions = {
  start: async ({ params }) => {
    const job = await readJob(params.slug, params.jid).catch(() => null);
    if (!job) return fail(404, { error: 'Job not found' });
    if (job.status !== 'queued') return fail(400, { error: `Job is ${job.status}.` });
    startJobInBackground(params.slug, params.jid);
    redirect(303, `/councils/${params.slug}/jobs/${params.jid}`);
  },
  cancel: async ({ params }) => {
    if (!isRunning(params.slug, (await readJob(params.slug, params.jid)).councillor_slug)) {
      return fail(400, { error: 'Job is not running.' });
    }
    await cancelJob(params.slug, params.jid);
    redirect(303, `/councils/${params.slug}/jobs/${params.jid}`);
  }
};
