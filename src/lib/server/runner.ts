import { readCouncillor } from './councillors';
import { councilRoot } from './paths';
import { assembleContextFor } from './context';
import {
  appendEvent,
  appendTranscript,
  currentJobForCouncillor,
  readInput,
  readJob,
  readOutput,
  readTranscript,
  setStatus,
  writeInput,
  writeJob,
  writeOutput
} from './jobs';
import { resolveAdapter, type ResolvedAdapter } from './adapters';
import { buildReflectionPrompt, parseJobBlocks, parseMemoryBlocks } from './reflection';
import { createPrivateNote } from './memory_private';
import { createJobProposal } from './proposals';
import type { Job } from '$lib/types';

interface ActiveRun {
  jobId: string;
  controller: AbortController;
  promise: Promise<Job>;
}

const active = new Map<string, ActiveRun>();

export function currentRuns(): Array<{ councillor: string; jobId: string }> {
  return Array.from(active.entries()).map(([councillor, run]) => ({
    councillor,
    jobId: run.jobId
  }));
}

export function isRunning(councillorSlug: string): boolean {
  return active.has(councillorSlug);
}

export async function cancelJob(jobId: string): Promise<void> {
  for (const [key, run] of active.entries()) {
    if (run.jobId === jobId) {
      run.controller.abort();
      return;
    }
    void key;
  }
}

export interface RunOptions {
  adapterOverride?: ResolvedAdapter;
}

async function reflectAfterSuccess(
  job: Job,
  councillor: { slug: string; reflect: boolean },
  adapter: ResolvedAdapter,
  signal: AbortSignal
): Promise<void> {
  if (!councillor.reflect) return;
  const transcript = await readTranscript(job.id).catch(() => '');
  const output = await readOutput(job.id).catch(() => '');
  const prompt = buildReflectionPrompt({
    title: job.title,
    brief: job.brief,
    transcript,
    output
  });

  let reflectionOut = '';
  try {
    const streams = adapter.run({ prompt, cwd: councilRoot(), signal });
    for await (const _chunk of streams.chunks) void _chunk;
    const result = await streams.result;
    if (result.exit_code !== 0) {
      await appendEvent(job.id, {
        at: new Date().toISOString(),
        type: 'reflection_failed',
        message: result.stderr || `exit ${result.exit_code}`
      });
      return;
    }
    reflectionOut = result.stdout;
  } catch (err) {
    await appendEvent(job.id, {
      at: new Date().toISOString(),
      type: 'reflection_failed',
      message: err instanceof Error ? err.message : String(err)
    });
    return;
  }

  const blocks = parseMemoryBlocks(reflectionOut);
  const slugs: string[] = [];
  for (const b of blocks) {
    try {
      const note = await createPrivateNote(councillor.slug, { title: b.title, body: b.body });
      slugs.push(note.slug);
    } catch (err) {
      await appendEvent(job.id, {
        at: new Date().toISOString(),
        type: 'reflection_failed',
        message: `note "${b.title}" failed: ${err instanceof Error ? err.message : String(err)}`
      });
    }
  }

  await appendEvent(job.id, {
    at: new Date().toISOString(),
    type: 'reflected',
    message: `wrote ${slugs.length} memor${slugs.length === 1 ? 'y' : 'ies'}`
  });

  const persisted = await readJob(job.id);
  await writeJob({ ...persisted, memory_slugs: slugs });

  const jobBlocks = parseJobBlocks(reflectionOut);
  for (const jb of jobBlocks) {
    try {
      const p = await createJobProposal({
        proposed_by: councillor.slug,
        source_job_id: job.id,
        title: jb.title,
        brief: jb.brief,
        target_councillor: jb.councillor,
        priority: jb.priority
      });
      await appendEvent(job.id, {
        at: new Date().toISOString(),
        type: 'proposed_job',
        message: `proposal ${p.id} (target: ${jb.councillor ?? 'unassigned'})`
      });
    } catch (err) {
      await appendEvent(job.id, {
        at: new Date().toISOString(),
        type: 'reflection_failed',
        message: `job proposal "${jb.title}" failed: ${err instanceof Error ? err.message : String(err)}`
      });
    }
  }
}

async function buildPrompt(job: Job, personaBody: string): Promise<string> {
  const memCtx = await assembleContextFor(job.councillor_slug, job.brief);
  const sections: string[] = [];
  if (personaBody.trim()) sections.push(`# Persona\n\n${personaBody.trim()}`);
  if (memCtx) sections.push(memCtx);
  sections.push(`# Task: ${job.title}\n\n${job.brief.trim()}`);
  return sections.join('\n\n') + '\n';
}

export async function runJobNow(jobId: string, opts: RunOptions = {}): Promise<Job> {
  const job = await readJob(jobId);
  if (job.status !== 'queued') {
    throw new Error(`Job ${jobId} is not queued (status: ${job.status}).`);
  }

  const councillor = await readCouncillor(job.councillor_slug);
  if (active.has(councillor.slug)) {
    throw new Error(`Councillor "${councillor.slug}" already has an active job.`);
  }

  const adapter = opts.adapterOverride ?? resolveAdapter(councillor.adapter);
  if (!adapter) {
    const err = `Unknown adapter "${councillor.adapter}" for councillor "${councillor.slug}".`;
    await setStatus(jobId, 'failed', {
      finished_at: new Date().toISOString(),
      error: err
    });
    throw new Error(err);
  }

  const controller = new AbortController();
  const prompt = await buildPrompt(job, councillor.persona);
  await writeInput(jobId, prompt);

  const promise = (async (): Promise<Job> => {
    try {
      await setStatus(jobId, 'running', {
        started_at: new Date().toISOString()
      });

      const streams = adapter.run({
        prompt,
        cwd: councilRoot(),
        signal: controller.signal
      });

      for await (const chunk of streams.chunks) {
        if (controller.signal.aborted) break;
        const prefix = chunk.stream === 'stderr' ? '[stderr] ' : '';
        await appendTranscript(jobId, prefix + chunk.text);
      }

      const result = await streams.result;

      if (controller.signal.aborted) {
        return await setStatus(jobId, 'cancelled', {
          finished_at: new Date().toISOString(),
          exit_code: result.exit_code,
          error: 'cancelled by user'
        });
      }

      await writeOutput(jobId, result.stdout);
      if (result.stderr) {
        await appendTranscript(jobId, `\n[stderr]\n${result.stderr}`);
      }

      if (result.exit_code === 0) {
        const succeeded = await setStatus(jobId, 'succeeded', {
          finished_at: new Date().toISOString(),
          exit_code: 0
        });
        try {
          await reflectAfterSuccess(succeeded, councillor, adapter, controller.signal);
        } catch (err) {
          await appendEvent(jobId, {
            at: new Date().toISOString(),
            type: 'reflection_failed',
            message: err instanceof Error ? err.message : String(err)
          });
        }
        return await readJob(jobId);
      }
      return await setStatus(jobId, 'failed', {
        finished_at: new Date().toISOString(),
        exit_code: result.exit_code,
        error: result.stderr || `exit ${result.exit_code}`
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await appendEvent(jobId, {
        at: new Date().toISOString(),
        type: 'stderr',
        message
      });
      return await setStatus(jobId, 'failed', {
        finished_at: new Date().toISOString(),
        error: message
      });
    } finally {
      active.delete(councillor.slug);
    }
  })();

  active.set(councillor.slug, { jobId, controller, promise });
  return promise;
}

export function startJobInBackground(jobId: string, opts: RunOptions = {}): void {
  runJobNow(jobId, opts).catch(() => {
    // errors already captured in job state
  });
}

export async function kickScheduler(): Promise<void> {
  const { listCouncillors } = await import('./councillors');
  const councillors = await listCouncillors();
  for (const c of councillors) {
    if (isRunning(c.slug)) continue;
    const next = await currentJobForCouncillor(c.slug);
    if (next && next.status === 'queued') {
      startJobInBackground(next.id);
    }
  }
}

export { readInput };
