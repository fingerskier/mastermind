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
import { runAdapter } from './adapters/runAdapter';
import { buildReflectionPrompt, parseJobBlocks, parseMemoryBlocks } from './reflection';
import { createPrivateNote } from './memory_private';
import { createSharedNoteAutoSuffix } from './memory';
import { createJobProposal } from './proposals';
import {
  tryAcquire,
  release as releaseLock,
  current as lockCurrent
} from './councillor-lock';
import type { Job } from '$lib/types';

interface ActiveRun {
  jobId: string;
  councillorSlug: string;
  controller: AbortController;
  promise: Promise<Job>;
}

// keyed by jobId (not councillor slug)
const runs = new Map<string, ActiveRun>();
const pendingCancels = new Set<string>();

export function currentRuns(): Array<{ councillor: string; jobId: string }> {
  const out: Array<{ councillor: string; jobId: string }> = [];
  for (const run of runs.values()) out.push({ councillor: run.councillorSlug, jobId: run.jobId });
  return out;
}

export function isRunning(councillorSlug: string): boolean {
  const h = lockCurrent(councillorSlug);
  return h?.kind === 'job';
}

export async function cancelJob(jobId: string): Promise<void> {
  const run = runs.get(jobId);
  if (run) {
    run.controller.abort();
    return;
  }
  // Job not yet registered (setup awaits still pending) — mark for cancellation on start.
  pendingCancels.add(jobId);
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
  const privateSlugs: string[] = [];
  const sharedSlugs: string[] = [];
  for (const b of blocks) {
    try {
      if (b.scope === 'shared') {
        const note = await createSharedNoteAutoSuffix({ title: b.title, body: b.body });
        sharedSlugs.push(note.slug);
      } else {
        const note = await createPrivateNote(councillor.slug, { title: b.title, body: b.body });
        privateSlugs.push(note.slug);
      }
    } catch (err) {
      await appendEvent(job.id, {
        at: new Date().toISOString(),
        type: 'reflection_failed',
        message: `note "${b.title}" failed: ${err instanceof Error ? err.message : String(err)}`
      });
    }
  }

  const totalWritten = privateSlugs.length + sharedSlugs.length;
  await appendEvent(job.id, {
    at: new Date().toISOString(),
    type: 'reflected',
    message: `wrote ${totalWritten} memor${totalWritten === 1 ? 'y' : 'ies'}`
  });

  const persisted = await readJob(job.id);
  await writeJob({
    ...persisted,
    memory_slugs: privateSlugs,
    shared_memory_slugs: sharedSlugs
  });

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
  if (!tryAcquire(councillor.slug, { kind: 'job', id: jobId })) {
    throw new Error(`Councillor "${councillor.slug}" already has an active job.`);
  }

  const adapter = opts.adapterOverride ?? resolveAdapter(councillor.adapter);
  if (!adapter) {
    const err = `Unknown adapter "${councillor.adapter}" for councillor "${councillor.slug}".`;
    releaseLock(councillor.slug, { kind: 'job', id: jobId });
    await setStatus(jobId, 'failed', {
      finished_at: new Date().toISOString(),
      error: err
    });
    throw new Error(err);
  }

  const controller = new AbortController();
  if (pendingCancels.delete(jobId)) {
    controller.abort();
  }
  const prompt = await buildPrompt(job, councillor.persona);
  await writeInput(jobId, prompt);

  const promise = (async (): Promise<Job> => {
    try {
      await setStatus(jobId, 'running', {
        started_at: new Date().toISOString()
      });

      // stderrAccum collects streamed stderr chunks (for adapters that stream stderr).
      // Note: some adapters (e.g. mock with failWith) only provide stderr in result.stderr,
      // not as streamed chunks — those will be captured from adapterResult.transcript below.
      let stderrAccum = '';
      const adapterResult = await runAdapter({
        adapter,
        prompt,
        cwd: councilRoot(),
        timeoutMs: -1, // no timeout for jobs in v0
        abortSignal: controller.signal,
        onStdout: (text) => { void appendTranscript(jobId, text); },
        onStderr: (text) => {
          stderrAccum += text;
          void appendTranscript(jobId, '[stderr] ' + text);
        }
      });

      // If onStderr received nothing but the transcript has a final stderr block
      // (appended by runAdapter from result.stderr), extract it for the error field.
      if (!stderrAccum) {
        const sep = '\n[stderr]\n';
        const idx = adapterResult.transcript.lastIndexOf(sep);
        if (idx !== -1) stderrAccum = adapterResult.transcript.slice(idx + sep.length);
      }

      if (controller.signal.aborted) {
        return await setStatus(jobId, 'cancelled', {
          finished_at: new Date().toISOString(),
          exit_code: adapterResult.exit_code,
          error: 'cancelled by user'
        });
      }

      await writeOutput(jobId, adapterResult.output);
      // runAdapter already appended final stderr via the onStderr callback line-by-line,
      // and also appended "\n[stderr]\n<stderr>" to its internal transcript field.
      // The original runner appended a final "\n[stderr]\n<stderr>" block to the transcript
      // file when result.stderr was non-empty. To preserve that behavior, we replicate it here
      // using the same data runAdapter read from result.stderr (exposed via adapterResult).
      // However, since onStderr already streamed those lines, we omit the duplicate to keep
      // the transcript consistent with what tests expect (streamed lines only, no double-append).

      if (adapterResult.exit_code === 0) {
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
        exit_code: adapterResult.exit_code,
        error: stderrAccum || `exit ${adapterResult.exit_code}`
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
      releaseLock(councillor.slug, { kind: 'job', id: jobId });
      runs.delete(jobId);
      pendingCancels.delete(jobId);
    }
  })();

  runs.set(jobId, { jobId, councillorSlug: councillor.slug, controller, promise });
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
