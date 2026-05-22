import { error, fail, redirect } from '@sveltejs/kit';
import { hasCouncil, readCouncilWithCouncillors } from '$lib/server/councils';
import { createJob } from '$lib/server/jobs';
import { startJobInBackground } from '$lib/server/runner';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
  if (!hasCouncil()) error(404, 'No council in this directory');
  return { council: await readCouncilWithCouncillors() };
};

export const actions: Actions = {
  default: async ({ request }) => {
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

    if (councillor_slug === '__all__') {
      const council = await readCouncilWithCouncillors();
      if (council.councillors.length === 0) {
        return fail(400, { error: 'No councillors to assign.', title, brief, councillor_slug });
      }
      const now = new Date();
      const created: string[] = [];
      try {
        for (let i = 0; i < council.councillors.length; i++) {
          const cl = council.councillors[i];
          const stamp = new Date(now.getTime() + i);
          const job = await createJob(
            { title, brief, councillor_slug: cl.slug },
            stamp
          );
          created.push(job.id);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to create job.';
        return fail(400, { error: message, title, brief, councillor_slug });
      }
      if (start_now) for (const id of created) startJobInBackground(id);
      redirect(303, '/');
    }

    let jobId: string;
    try {
      const job = await createJob({ title, brief, councillor_slug });
      jobId = job.id;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create job.';
      return fail(400, { error: message, title, brief, councillor_slug });
    }

    if (start_now) {
      startJobInBackground(jobId);
    }
    redirect(303, `/jobs/${jobId}`);
  }
};
