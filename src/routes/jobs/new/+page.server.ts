import { error, fail, redirect } from '@sveltejs/kit';
import { hasCouncil, readCouncilWithCouncillors } from '$lib/server/councils';
import { createJob } from '$lib/server/jobs';
import { startJobInBackground } from '$lib/server/runner';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url }) => {
  if (!hasCouncil()) error(404, 'No council in this directory');
  const council = await readCouncilWithCouncillors();
  const forParam = url.searchParams.get('for') ?? '';
  const validSlugs = new Set(council.councillors.map(c => c.slug));
  let preselect: string[];
  if (forParam === '__all__') {
    preselect = council.councillors.map(c => c.slug);
  } else if (forParam && validSlugs.has(forParam)) {
    preselect = [forParam];
  } else {
    preselect = [];
  }
  return { council, preselect };
};

export const actions: Actions = {
  default: async ({ request }) => {
    const form = await request.formData();
    const title = String(form.get('title') ?? '').trim();
    const brief = String(form.get('brief') ?? '').trim();
    const slugs = form
      .getAll('councillor_slugs')
      .map(v => String(v).trim())
      .filter(Boolean);
    const start_now = form.get('start_now') === 'on';

    if (!title || !brief || slugs.length === 0) {
      return fail(400, {
        error: 'Title, brief, and at least one councillor are required.',
        title,
        brief,
        councillor_slugs: slugs
      });
    }

    const council = await readCouncilWithCouncillors();
    const validSlugs = new Set(council.councillors.map(c => c.slug));
    const unknown = slugs.filter(s => !validSlugs.has(s));
    if (unknown.length > 0) {
      return fail(400, {
        error: `Unknown councillor${unknown.length === 1 ? '' : 's'}: ${unknown.join(', ')}`,
        title,
        brief,
        councillor_slugs: slugs
      });
    }

    const uniqueSlugs = Array.from(new Set(slugs));
    const now = new Date();
    const created: string[] = [];
    try {
      for (let i = 0; i < uniqueSlugs.length; i++) {
        const stamp = new Date(now.getTime() + i);
        const job = await createJob(
          { title, brief, councillor_slug: uniqueSlugs[i] },
          stamp
        );
        created.push(job.id);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create job.';
      return fail(400, { error: message, title, brief, councillor_slugs: slugs });
    }

    if (start_now) for (const id of created) startJobInBackground(id);

    if (created.length === 1) redirect(303, `/jobs/${created[0]}`);
    redirect(303, '/');
  }
};
