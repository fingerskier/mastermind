import { error, fail, redirect } from '@sveltejs/kit';
import { readCouncil } from '$lib/server/councils';
import { readJob, readEvents, readInput, readOutput, readTranscript, rerunJob } from '$lib/server/jobs';
import { listProposalsForSourceJob } from '$lib/server/proposals';
import { cancelJob, isRunning, startJobInBackground } from '$lib/server/runner';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
  try {
    const [council, job, events, input, transcript, output, proposals] = await Promise.all([
      readCouncil(),
      readJob(params.jid),
      readEvents(params.jid),
      readInput(params.jid),
      readTranscript(params.jid),
      readOutput(params.jid),
      listProposalsForSourceJob(params.jid)
    ]);
    return { council, job, events, input, transcript, output, proposals };
  } catch {
    error(404, 'Job not found');
  }
};

export const actions: Actions = {
  start: async ({ params }) => {
    const job = await readJob(params.jid).catch(() => null);
    if (!job) return fail(404, { error: 'Job not found' });
    if (job.status !== 'queued') return fail(400, { error: `Job is ${job.status}.` });
    startJobInBackground(params.jid);
    redirect(303, `/jobs/${params.jid}`);
  },
  cancel: async ({ params }) => {
    const job = await readJob(params.jid);
    if (!isRunning(job.councillor_slug)) {
      return fail(400, { error: 'Job is not running.' });
    }
    await cancelJob(params.jid);
    redirect(303, `/jobs/${params.jid}`);
  },
  rerun: async ({ params, request }) => {
    const source = await readJob(params.jid).catch(() => null);
    if (!source) return fail(404, { error: 'Job not found' });
    if (source.status === 'queued' || source.status === 'running') {
      return fail(400, { error: `Job is ${source.status}; cancel or wait before re-running.` });
    }

    const form = await request.formData();
    const start_now = form.get('start_now') !== 'off';

    let newId: string;
    try {
      const clone = await rerunJob(params.jid);
      newId = clone.id;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to re-run job.';
      return fail(400, { error: message });
    }

    if (start_now) startJobInBackground(newId);
    redirect(303, `/jobs/${newId}`);
  }
};
