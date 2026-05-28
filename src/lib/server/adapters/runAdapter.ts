import type { AdapterResult } from './types';
import type { ResolvedAdapter } from './index';

export interface RunAdapterOpts {
  adapter: ResolvedAdapter | { run: (args: { prompt: string; cwd: string; signal?: AbortSignal }) => { chunks: AsyncIterable<{ stream: 'stdout' | 'stderr'; text: string }>; result: Promise<AdapterResult> } };
  prompt: string;
  cwd: string;
  timeoutMs: number;
  onStdout?: (chunk: string) => void;
  onStderr?: (chunk: string) => void;
  abortSignal?: AbortSignal;
}

export interface RunAdapterResult {
  transcript: string;
  output: string;
  exit_code: number;
  durationMs: number;
  timedOut: boolean;
  aborted: boolean;
}

export async function runAdapter(opts: RunAdapterOpts): Promise<RunAdapterResult> {
  const started = Date.now();
  const localController = new AbortController();
  const onParentAbort = () => localController.abort();
  if (opts.abortSignal) {
    if (opts.abortSignal.aborted) localController.abort();
    else opts.abortSignal.addEventListener('abort', onParentAbort, { once: true });
  }
  let timedOut = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  if (opts.timeoutMs > 0) {
    timer = setTimeout(() => {
      timedOut = true;
      localController.abort();
    }, opts.timeoutMs);
  } else if (opts.timeoutMs === 0) {
    timedOut = true;
    localController.abort();
  }

  let transcript = '';
  let exit_code = -1;
  let aborted = false;
  try {
    const streams = (opts.adapter as { run: (a: { prompt: string; cwd: string; signal?: AbortSignal }) => { chunks: AsyncIterable<{ stream: 'stdout' | 'stderr'; text: string }>; result: Promise<AdapterResult> } }).run({
      prompt: opts.prompt,
      cwd: opts.cwd,
      signal: localController.signal
    });
    for await (const chunk of streams.chunks) {
      if (localController.signal.aborted) {
        aborted = true;
        break;
      }
      const prefix = chunk.stream === 'stderr' ? '[stderr] ' : '';
      transcript += prefix + chunk.text;
      if (chunk.stream === 'stdout') opts.onStdout?.(chunk.text);
      else opts.onStderr?.(chunk.text);
    }
    const result = await streams.result;
    exit_code = result.exit_code;
    if (result.stderr) transcript += `\n[stderr]\n${result.stderr}`;
    return {
      transcript,
      output: result.stdout,
      exit_code: result.exit_code,
      durationMs: Date.now() - started,
      timedOut,
      aborted
    };
  } catch (err) {
    return {
      transcript: transcript || (err instanceof Error ? err.message : String(err)),
      output: '',
      exit_code,
      durationMs: Date.now() - started,
      timedOut,
      aborted
    };
  } finally {
    if (timer) clearTimeout(timer);
    if (opts.abortSignal) opts.abortSignal.removeEventListener('abort', onParentAbort);
  }
}
