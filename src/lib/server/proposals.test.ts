import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { env } from 'node:process';
import {
  createJobProposal,
  listJobProposals,
  listProposalsForSourceJob,
  readJobProposal,
  setJobProposalDecision
} from './proposals';

let tmp: string;
let prevEnv: string | undefined;

beforeEach(() => {
  prevEnv = env.LANDSRAAD_COUNCIL_ROOT;
  tmp = mkdtempSync(join(tmpdir(), 'proposals-'));
  env.LANDSRAAD_COUNCIL_ROOT = tmp;
});
afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
  if (prevEnv === undefined) delete env.LANDSRAAD_COUNCIL_ROOT;
  else env.LANDSRAAD_COUNCIL_ROOT = prevEnv;
});

describe('proposals: createJobProposal', () => {
  it('creates a file under proposals/jobs and returns a pending proposal', async () => {
    const p = await createJobProposal({
      proposed_by: 'cfo',
      source_job_id: 'job-1',
      title: 'Follow up on cash',
      brief: 'check Q3 numbers',
      target_councillor: 'cto',
      priority: 'normal'
    });
    expect(p.status).toBe('pending');
    expect(p.id).toMatch(/follow-up-on-cash$/);
    const round = await readJobProposal(p.id);
    expect(round.title).toBe('Follow up on cash');
    expect(round.target_councillor).toBe('cto');
  });

  it('disambiguates simultaneous creates by suffixing', async () => {
    const fixedDate = new Date('2026-05-23T17:00:00.000Z');
    const a = await createJobProposal(
      {
        proposed_by: 'cfo',
        source_job_id: 'j1',
        title: 'Same',
        brief: 'b1',
        target_councillor: null,
        priority: 'normal'
      },
      fixedDate
    );
    const b = await createJobProposal(
      {
        proposed_by: 'cfo',
        source_job_id: 'j1',
        title: 'Same',
        brief: 'b2',
        target_councillor: null,
        priority: 'normal'
      },
      fixedDate
    );
    expect(a.id).not.toBe(b.id);
    const both = await listJobProposals({ status: 'all' });
    expect(both.map((x) => x.id).sort()).toEqual([a.id, b.id].sort());
  });

  it('throws when title is blank', async () => {
    await expect(
      createJobProposal({
        proposed_by: 'cfo',
        source_job_id: 'j',
        title: '   ',
        brief: 'b',
        target_councillor: null,
        priority: 'normal'
      })
    ).rejects.toThrow();
  });
});

describe('proposals: listJobProposals filters by status', () => {
  it('returns only pending by default', async () => {
    const p = await createJobProposal({
      proposed_by: 'cfo',
      source_job_id: 'j',
      title: 'T',
      brief: 'b',
      target_councillor: null,
      priority: 'normal'
    });
    await setJobProposalDecision(p.id, { status: 'approved', resulting_job_ids: ['x'] });
    const pending = await listJobProposals({ status: 'pending' });
    expect(pending).toHaveLength(0);
    const all = await listJobProposals({ status: 'all' });
    expect(all).toHaveLength(1);
  });

  it('returns empty array when proposals dir does not exist', async () => {
    expect(await listJobProposals({ status: 'pending' })).toEqual([]);
  });
});

describe('proposals: setJobProposalDecision', () => {
  it('records decided_at and resulting_job_ids on approve', async () => {
    const p = await createJobProposal({
      proposed_by: 'cfo',
      source_job_id: 'j',
      title: 'T',
      brief: 'b',
      target_councillor: 'cto',
      priority: 'normal'
    });
    const out = await setJobProposalDecision(p.id, {
      status: 'approved',
      resulting_job_ids: ['new-job-1']
    });
    expect(out.status).toBe('approved');
    expect(out.resulting_job_ids).toEqual(['new-job-1']);
    expect(out.decided_at).toBeDefined();
    expect(out.decided_by).toBe('user');
  });

  it('records reason on reject', async () => {
    const p = await createJobProposal({
      proposed_by: 'cfo',
      source_job_id: 'j',
      title: 'T',
      brief: 'b',
      target_councillor: null,
      priority: 'normal'
    });
    const out = await setJobProposalDecision(p.id, { status: 'rejected', reason: 'duplicate' });
    expect(out.reason).toBe('duplicate');
    expect(out.status).toBe('rejected');
  });
});

describe('proposals: listProposalsForSourceJob', () => {
  it('returns proposals matching source_job_id regardless of status', async () => {
    const a = await createJobProposal({
      proposed_by: 'cfo',
      source_job_id: 'source-1',
      title: 'A',
      brief: 'b',
      target_councillor: null,
      priority: 'normal'
    });
    await createJobProposal({
      proposed_by: 'cfo',
      source_job_id: 'source-other',
      title: 'B',
      brief: 'b',
      target_councillor: null,
      priority: 'normal'
    });
    await setJobProposalDecision(a.id, { status: 'rejected' });
    const out = await listProposalsForSourceJob('source-1');
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe(a.id);
  });
});
