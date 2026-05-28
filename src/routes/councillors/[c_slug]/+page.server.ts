import { error, fail, redirect } from '@sveltejs/kit';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { deleteCouncillor, listCouncillors, readCouncillor, updateCouncillor } from '$lib/server/councillors';
import { listKnownAdapters } from '$lib/server/adapters';
import { listPrivateNotes } from '$lib/server/memory_private';
import { councillorDir } from '$lib/server/paths';
import { openInDefaultEditor } from '$lib/server/open_editor';
import { listJobProposals, readJobProposal, setJobProposalDecision } from '$lib/server/proposals';
import { createJob } from '$lib/server/jobs';
import { startJobInBackground } from '$lib/server/runner';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
  let councillor;
  try {
    councillor = await readCouncillor(params.c_slug);
  } catch {
    error(404, 'Councillor not found');
  }
  const [memories, allPending] = await Promise.all([
    listPrivateNotes(params.c_slug),
    listJobProposals({ status: 'pending' })
  ]);
  const proposals = allPending.filter(
    (p) => p.target_councillor === params.c_slug || p.target_councillor === 'all'
  );
  return { councillor, adapters: listKnownAdapters(), memories, proposals };
};

export const actions: Actions = {
  delete: async ({ params }) => {
    try {
      await deleteCouncillor(params.c_slug);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete councillor.';
      return fail(500, { error: message });
    }
    redirect(303, '/');
  },
  setAdapter: async ({ params, request }) => {
    const form = await request.formData();
    const adapter = String(form.get('adapter') ?? '').trim();
    const known = listKnownAdapters();
    const match = known.find((a) => a.id === adapter);
    if (adapter && !match) {
      return fail(400, { error: `Unknown adapter "${adapter}".` });
    }
    if (match && !match.available) {
      return fail(400, { error: `Adapter "${match.label}" is not available yet.` });
    }
    try {
      await updateCouncillor(params.c_slug, { adapter });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update adapter.';
      return fail(400, { error: message });
    }
    return { adapterSaved: true };
  },
  approveProposal: async ({ params, request }) => {
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
    } else if (proposal.target_councillor && knownSlugs.has(proposal.target_councillor)) {
      targets.push(proposal.target_councillor);
    } else {
      return fail(400, {
        error: `Proposal not targeted at this councillor; approve from /proposals.`
      });
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
    redirect(303, `/councillors/${params.c_slug}`);
  },
  rejectProposal: async ({ params, request }) => {
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
    redirect(303, `/councillors/${params.c_slug}`);
  },
  openPersona: async ({ params }) => {
    const personaPath = join(councillorDir(params.c_slug), 'persona.md');
    if (!existsSync(personaPath)) {
      return fail(404, { error: 'persona.md not found for this councillor.' });
    }
    try {
      openInDefaultEditor(personaPath);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to open persona in editor.';
      return fail(500, { error: message });
    }
    return { personaOpened: true };
  }
};
