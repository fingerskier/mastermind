import { error, fail, redirect } from '@sveltejs/kit';
import { readCouncilWithCouncillors } from '$lib/server/councils';
import { createJob } from '$lib/server/jobs';
import { startJobInBackground } from '$lib/server/runner';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
  try {
    const council = await readCouncilWithCouncillors(params.slug);
    return { council };
  } catch {
    error(404, 'Council not found');
  }
};

export const actions: Actions = {
  default: async ({ params, request }) => {
    const form = await request.formData();
    const title = String(form.get('title') ?? '').trim();
    const brief = String(form.get('brief') ?? '').trim();
    const councillor_slug = String(form.get('councillor_slug') ?? '').trim();
    const start_now = form.get('start_now') === 'on';

    if (!title || !brief || !councillor_slug) {
      return fail(400, {
        error: 'Title, brief, and councillor are all required.',
        title,
        brief,
        councillor_slug
      });
    }

    let jobId: string;
    try {
      const job = await createJob(params.slug, { title, brief, councillor_slug });
      jobId = job.id;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create job.';
      return fail(400, { error: message, title, brief, councillor_slug });
    }

    if (start_now) {
      startJobInBackground(params.slug, jobId);
    }
    redirect(303, `/councils/${params.slug}/jobs/${jobId}`);
  }
};
