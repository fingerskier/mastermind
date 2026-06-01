import { error, fail, redirect } from '@sveltejs/kit';
import { hasCouncil } from '$lib/server/councils';
import { listCouncillors } from '$lib/server/councillors';
import { listJobProposals, readJobProposal, setJobProposalDecision } from '$lib/server/proposals';
import { createJob } from '$lib/server/jobs';
import { startJobInBackground } from '$lib/server/runner';
import type { Actions, PageServerLoad } from './$types';

type StatusFilter = 'pending' | 'approved' | 'rejected' | 'all';

function parseStatusFilter(raw: string | null): StatusFilter {
  if (raw === 'all' || raw === 'approved' || raw === 'rejected') return raw;
  return 'pending';
}

export const load: PageServerLoad = async ({ url }) => {
  if (!hasCouncil()) error(404, 'No council in this directory');
  const status = parseStatusFilter(url.searchParams.get('status'));
  const [all, councillors] = await Promise.all([
    listJobProposals({ status: 'all' }),
    listCouncillors()
  ]);
  const counts = {
    pending: all.filter((p) => p.status === 'pending').length,
    approved: all.filter((p) => p.status === 'approved').length,
    rejected: all.filter((p) => p.status === 'rejected').length,
    all: all.length
  };
  const filtered = status === 'all' ? all : all.filter((p) => p.status === status);
  const knownSlugs = new Set(councillors.map((c) => c.slug));
  const decorated = filtered.map((p) => ({
    ...p,
    target_unknown:
      p.target_councillor !== null &&
      p.target_councillor !== 'all' &&
      !knownSlugs.has(p.target_councillor)
  }));
  return { proposals: decorated, status, councillors, counts };
};

export const actions: Actions = {
  approve: async ({ request }) => {
    const form = await request.formData();
    const id = String(form.get('id') ?? '');
    const start_now = form.get('start_now') === 'on';
    if (!id) return fail(400, { error: 'Missing proposal id.' });

    const proposal = await readJobProposal(id).catch(() => null);
    if (!proposal) return fail(404, { error: `Proposal ${id} not found.` });
    if (proposal.status !== 'pending') {
      return fail(400, { error: `Proposal ${id} already ${proposal.status}.` });
    }

    const known = await listCouncillors();
    const knownSlugs = new Set(known.map((c) => c.slug));
    const targets: string[] = [];
    if (proposal.target_councillor === 'all') {
      for (const c of known) targets.push(c.slug);
    } else if (proposal.target_councillor) {
      if (!knownSlugs.has(proposal.target_councillor)) {
        const overrideSlug = String(form.get('reassign_to') ?? '').trim();
        if (!overrideSlug || !knownSlugs.has(overrideSlug)) {
          return fail(400, {
            error: `Target councillor "${proposal.target_councillor}" not found — pick one and retry.`
          });
        }
        targets.push(overrideSlug);
      } else {
        targets.push(proposal.target_councillor);
      }
    } else {
      const overrideSlug = String(form.get('reassign_to') ?? '').trim();
      if (!overrideSlug || !knownSlugs.has(overrideSlug)) {
        return fail(400, { error: 'Unassigned proposal — pick a councillor before approving.' });
      }
      targets.push(overrideSlug);
    }

    const now = new Date();
    const createdIds: string[] = [];
    for (let i = 0; i < targets.length; i++) {
      const job = await createJob(
        { title: proposal.title, brief: proposal.brief, councillor_slug: targets[i] },
        new Date(now.getTime() + i)
      );
      createdIds.push(job.id);
    }
    await setJobProposalDecision(id, { status: 'approved', resulting_job_ids: createdIds });
    if (start_now) for (const jid of createdIds) startJobInBackground(jid);
    redirect(303, '/proposals');
  },
  reject: async ({ request }) => {
    const form = await request.formData();
    const id = String(form.get('id') ?? '');
    const reason = String(form.get('reason') ?? '').trim() || undefined;
    if (!id) return fail(400, { error: 'Missing proposal id.' });
    const proposal = await readJobProposal(id).catch(() => null);
    if (!proposal) return fail(404, { error: `Proposal ${id} not found.` });
    if (proposal.status !== 'pending') {
      return fail(400, { error: `Proposal ${id} already ${proposal.status}.` });
    }
    await setJobProposalDecision(id, { status: 'rejected', reason });
    redirect(303, '/proposals');
  }
};
