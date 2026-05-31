import { spawn } from 'node:child_process';
import type { AdapterChunk, AdapterResult, AdapterRunStreams } from './types';

export interface CliAdapterConfig {
  id: string;
  command: string;
  args: (prompt: string) => string[];
  stdinMode: 'arg' | 'pipe';
}

const REGISTRY: Record<string, CliAdapterConfig> = {
  'cli:claude': {
    id: 'cli:claude',
    command: 'claude',
    args: () => ['-p'],
    stdinMode: 'pipe'
  },
  'cli:codex': {
    id: 'cli:codex',
    command: 'codex',
    args: () => ['exec', '--skip-git-repo-check', '-'],
    stdinMode: 'pipe'
  },
  'cli:gemini': {
    id: 'cli:gemini',
    command: 'gemini',
    args: () => [],
    stdinMode: 'pipe'
  },
  'cli:grok': {
    id: 'cli:grok',
    command: 'grok',
    // Official xAI Grok CLI (https://x.ai/cli): `--single <PROMPT>` runs a
    // single-turn headless request, prints the response to stdout, and exits.
    args: (prompt) => ['--single', prompt],
    stdinMode: 'arg'
  }
};

export function getCliConfig(adapterId: string): CliAdapterConfig | null {
  return REGISTRY[adapterId] ?? null;
}

export function listCliAdapterIds(): string[] {
  return Object.keys(REGISTRY);
}

export function runCliAdapter(
  config: CliAdapterConfig,
  args: { prompt: string; cwd: string; signal?: AbortSignal; env?: NodeJS.ProcessEnv }
): AdapterRunStreams {
  const child = spawn(config.command, config.args(args.prompt), {
    cwd: args.cwd,
    env: args.env ?? process.env,
    shell: process.platform === 'win32',
    signal: args.signal
  });

  if (config.stdinMode === 'pipe' && child.stdin) {
    child.stdin.write(args.prompt);
    child.stdin.end();
  }

  let stdoutBuf = '';
  let stderrBuf = '';
  const pending: AdapterChunk[] = [];
  let resolveNext: ((value: IteratorResult<AdapterChunk>) => void) | null = null;
  let done = false;

  function push(chunk: AdapterChunk) {
    if (resolveNext) {
      const r = resolveNext;
      resolveNext = null;
      r({ value: chunk, done: false });
    } else {
      pending.push(chunk);
    }
  }

  child.stdout?.on('data', (data: Buffer) => {
    const text = data.toString('utf8');
    stdoutBuf += text;
    push({ stream: 'stdout', text });
  });
  child.stderr?.on('data', (data: Buffer) => {
    const text = data.toString('utf8');
    stderrBuf += text;
    push({ stream: 'stderr', text });
  });

  const result = new Promise<AdapterResult>((resolve, reject) => {
    child.on('error', (err) => {
      done = true;
      if (resolveNext) {
        const r = resolveNext;
        resolveNext = null;
        r({ value: undefined as unknown as AdapterChunk, done: true });
      }
      reject(err);
    });
    child.on('exit', (code) => {
      done = true;
      if (resolveNext) {
        const r = resolveNext;
        resolveNext = null;
        r({ value: undefined as unknown as AdapterChunk, done: true });
      }
      resolve({ exit_code: code ?? 0, stdout: stdoutBuf, stderr: stderrBuf });
    });
  });

  const chunks: AsyncIterable<AdapterChunk> = {
    [Symbol.asyncIterator]() {
      return {
        next(): Promise<IteratorResult<AdapterChunk>> {
          if (pending.length > 0) {
            return Promise.resolve({ value: pending.shift()!, done: false });
          }
          if (done) return Promise.resolve({ value: undefined as unknown as AdapterChunk, done: true });
          return new Promise<IteratorResult<AdapterChunk>>((r) => (resolveNext = r));
        }
      };
    }
  };

  return { chunks, result };
}
