import { readCouncillor } from './councillors';
import { councilDir } from './paths';
import { assembleMemoryContext } from './memory';
import {
  appendEvent,
  appendTranscript,
  currentJobForCouncillor,
  readInput,
  readJob,
  setStatus,
  writeInput,
  writeOutput
} from './jobs';
import { resolveAdapter, type ResolvedAdapter } from './adapters';
import type { Job } from '$lib/types';

interface ActiveRun {
  jobId: string;
  controller: AbortController;
  promise: Promise<Job>;
}

const active = new Map<string, ActiveRun>();

function runKey(councilSlug: string, councillorSlug: string): string {
  return `${councilSlug}/${councillorSlug}`;
}

export function currentRuns(): Array<{ council: string; councillor: string; jobId: string }> {
  return Array.from(active.entries()).map(([key, run]) => {
    const [council, councillor] = key.split('/');
    return { council, councillor, jobId: run.jobId };
  });
}

export function isRunning(councilSlug: string, councillorSlug: string): boolean {
  return active.has(runKey(councilSlug, councillorSlug));
}

export async function cancelJob(councilSlug: string, jobId: string): Promise<void> {
  for (const [key, run] of active.entries()) {
    if (run.jobId === jobId && key.startsWith(`${councilSlug}/`)) {
      run.controller.abort();
      return;
    }
  }
}

export interface RunOptions {
  adapterOverride?: ResolvedAdapter;
}

async function buildPrompt(councilSlug: string, job: Job, personaBody: string): Promise<string> {
  const memCtx = await assembleMemoryContext(councilSlug);
  const sections: string[] = [];
  if (personaBody.trim()) sections.push(`# Persona\n\n${personaBody.trim()}`);
  if (memCtx) sections.push(memCtx);
  sections.push(`# Task: ${job.title}\n\n${job.brief.trim()}`);
  return sections.join('\n\n') + '\n';
}

export async function runJobNow(
  councilSlug: string,
  jobId: string,
  opts: RunOptions = {}
): Promise<Job> {
  const job = await readJob(councilSlug, jobId);
  if (job.status !== 'queued') {
    throw new Error(`Job ${jobId} is not queued (status: ${job.status}).`);
  }

  const councillor = await readCouncillor(councilSlug, job.councillor_slug);
  const key = runKey(councilSlug, councillor.slug);
  if (active.has(key)) {
    throw new Error(`Councillor "${councillor.slug}" already has an active job.`);
  }

  const adapter = opts.adapterOverride ?? resolveAdapter(councillor.adapter);
  if (!adapter) {
    const err = `Unknown adapter "${councillor.adapter}" for councillor "${councillor.slug}".`;
    await setStatus(councilSlug, jobId, 'failed', {
      finished_at: new Date().toISOString(),
      error: err
    });
    throw new Error(err);
  }

  const controller = new AbortController();
  const prompt = await buildPrompt(councilSlug, job, councillor.persona);
  await writeInput(councilSlug, jobId, prompt);

  const promise = (async (): Promise<Job> => {
    try {
      await setStatus(councilSlug, jobId, 'running', {
        started_at: new Date().toISOString()
      });

      const streams = adapter.run({
        prompt,
        cwd: councilDir(councilSlug),
        signal: controller.signal
      });

      for await (const chunk of streams.chunks) {
        if (controller.signal.aborted) break;
        const prefix = chunk.stream === 'stderr' ? '[stderr] ' : '';
        await appendTranscript(councilSlug, jobId, prefix + chunk.text);
      }

      const result = await streams.result;

      if (controller.signal.aborted) {
        return await setStatus(councilSlug, jobId, 'cancelled', {
          finished_at: new Date().toISOString(),
          exit_code: result.exit_code,
          error: 'cancelled by user'
        });
      }

      await writeOutput(councilSlug, jobId, result.stdout);
      if (result.stderr) {
        await appendTranscript(councilSlug, jobId, `\n[stderr]\n${result.stderr}`);
      }

      if (result.exit_code === 0) {
        return await setStatus(councilSlug, jobId, 'succeeded', {
          finished_at: new Date().toISOString(),
          exit_code: 0
        });
      }
      return await setStatus(councilSlug, jobId, 'failed', {
        finished_at: new Date().toISOString(),
        exit_code: result.exit_code,
        error: result.stderr || `exit ${result.exit_code}`
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await appendEvent(councilSlug, jobId, {
        at: new Date().toISOString(),
        type: 'stderr',
        message
      });
      return await setStatus(councilSlug, jobId, 'failed', {
        finished_at: new Date().toISOString(),
        error: message
      });
    } finally {
      active.delete(key);
    }
  })();

  active.set(key, { jobId, controller, promise });
  return promise;
}

export function startJobInBackground(councilSlug: string, jobId: string, opts: RunOptions = {}): void {
  runJobNow(councilSlug, jobId, opts).catch(() => {
    // errors already captured in job state
  });
}

export async function kickScheduler(councilSlug: string): Promise<void> {
  const { listCouncillors } = await import('./councillors');
  const councillors = await listCouncillors(councilSlug);
  for (const c of councillors) {
    if (isRunning(councilSlug, c.slug)) continue;
    const next = await currentJobForCouncillor(councilSlug, c.slug);
    if (next && next.status === 'queued') {
      startJobInBackground(councilSlug, next.id);
    }
  }
}

// re-export for convenience
export { readInput };
