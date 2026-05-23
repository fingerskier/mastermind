import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { JobProposal, JobProposalStatus } from '$lib/types';
import { jobProposalsDir, slugify } from './paths';

const EXT = '.json';

export interface NewJobProposalInput {
  proposed_by: string;
  source_job_id: string;
  title: string;
  brief: string;
  target_councillor: string | null;
  priority: 'low' | 'normal' | 'high';
}

function proposalFile(id: string): string {
  return join(jobProposalsDir(), `${id}${EXT}`);
}

function timestampPart(now: Date): string {
  return now.toISOString().replace(/[:.]/g, '-');
}

function resolveAvailableId(base: string): string {
  let candidate = base;
  let n = 2;
  while (existsSync(proposalFile(candidate))) {
    candidate = `${base}-${n}`;
    n++;
  }
  return candidate;
}

export async function createJobProposal(
  input: NewJobProposalInput,
  now: Date = new Date()
): Promise<JobProposal> {
  const title = input.title.trim();
  if (!title) throw new Error('Proposal title is required.');
  const brief = input.brief.trim();
  if (!brief) throw new Error('Proposal brief is required.');
  await mkdir(jobProposalsDir(), { recursive: true });
  const baseId = `${timestampPart(now)}-${slugify(title)}`;
  const id = resolveAvailableId(baseId);
  const proposal: JobProposal = {
    id,
    kind: 'job',
    proposed_by: input.proposed_by,
    source_job_id: input.source_job_id,
    title,
    brief,
    target_councillor: input.target_councillor,
    priority: input.priority,
    status: 'pending',
    created_at: now.toISOString()
  };
  await writeFile(proposalFile(id), JSON.stringify(proposal, null, 2) + '\n', 'utf8');
  return proposal;
}

export async function readJobProposal(id: string): Promise<JobProposal> {
  const raw = await readFile(proposalFile(id), 'utf8');
  return JSON.parse(raw) as JobProposal;
}

export interface ListProposalsOptions {
  status?: JobProposalStatus | 'all';
}

export async function listJobProposals(opts: ListProposalsOptions = {}): Promise<JobProposal[]> {
  const dir = jobProposalsDir();
  if (!existsSync(dir)) return [];
  const status = opts.status ?? 'pending';
  const entries = await readdir(dir, { withFileTypes: true });
  const out: JobProposal[] = [];
  for (const e of entries) {
    if (!e.isFile() || !e.name.endsWith(EXT)) continue;
    const id = e.name.slice(0, -EXT.length);
    const p = await readJobProposal(id).catch(() => null);
    if (!p) continue;
    if (status === 'all' || p.status === status) out.push(p);
  }
  out.sort((a, b) => b.id.localeCompare(a.id));
  return out;
}

export interface ProposalDecisionInput {
  status: 'approved' | 'rejected';
  reason?: string;
  resulting_job_ids?: string[];
}

export async function setJobProposalDecision(
  id: string,
  decision: ProposalDecisionInput
): Promise<JobProposal> {
  const current = await readJobProposal(id);
  const next: JobProposal = {
    ...current,
    status: decision.status,
    decided_at: new Date().toISOString(),
    decided_by: 'user',
    ...(decision.reason !== undefined ? { reason: decision.reason } : {}),
    ...(decision.resulting_job_ids ? { resulting_job_ids: decision.resulting_job_ids } : {})
  };
  await writeFile(proposalFile(id), JSON.stringify(next, null, 2) + '\n', 'utf8');
  return next;
}

export async function listProposalsForSourceJob(sourceJobId: string): Promise<JobProposal[]> {
  const all = await listJobProposals({ status: 'all' });
  return all.filter((p) => p.source_job_id === sourceJobId);
}
