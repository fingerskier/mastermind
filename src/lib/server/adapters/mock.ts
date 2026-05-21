import type { Adapter, AdapterChunk, AdapterResult, AdapterRunStreams } from './types';

export interface MockAdapterOptions {
  delayMs?: number;
  failWith?: string;
}

export function createMockAdapter(opts: MockAdapterOptions = {}): Adapter & {
  run(input: { prompt: string; cwd: string; signal?: AbortSignal }): AdapterRunStreams;
} {
  const delayMs = opts.delayMs ?? 5;

  function run({ prompt, signal }: { prompt: string; cwd: string; signal?: AbortSignal }): AdapterRunStreams {
    const chunks: AdapterChunk[] = [];
    const lines = [
      '[mock:local]',
      `received ${prompt.length} chars`,
      'echo:',
      prompt.split('\n').slice(0, 5).join('\n'),
      '---',
      'done'
    ];
    for (const line of lines) chunks.push({ stream: 'stdout', text: line + '\n' });

    const result = (async (): Promise<AdapterResult> => {
      if (signal?.aborted) return { exit_code: 130, stdout: '', stderr: 'aborted before start\n' };
      if (delayMs > 0) {
        await new Promise<void>((resolve, reject) => {
          const t = setTimeout(resolve, delayMs);
          if (signal) {
            const onAbort = () => {
              clearTimeout(t);
              reject(new Error('aborted'));
            };
            if (signal.aborted) onAbort();
            else signal.addEventListener('abort', onAbort, { once: true });
          }
        }).catch(() => {
          // swallow; we handle via result below
        });
      }
      if (signal?.aborted) {
        return { exit_code: 130, stdout: '', stderr: 'aborted\n' };
      }
      if (opts.failWith) {
        return { exit_code: 1, stdout: '', stderr: opts.failWith + '\n' };
      }
      const stdout = chunks.map((c) => c.text).join('');
      return { exit_code: 0, stdout, stderr: '' };
    })();

    async function* iter(): AsyncIterable<AdapterChunk> {
      for (const c of chunks) yield c;
    }

    return { chunks: iter(), result };
  }

  return {
    id: 'mock:local',
    invoke() {
      throw new Error('Use run() for the mock adapter.');
    },
    run
  };
}
