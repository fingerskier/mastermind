import { spawn } from 'node:child_process';
import type { AdapterChunk, AdapterResult, AdapterRunStreams } from './types';

export interface CliArgsOpts {
  /** Optional model id, e.g. from a `cli:claude?model=claude-haiku-4-5` adapter string. */
  model?: string;
}

export interface CliAdapterConfig {
  id: string;
  command: string;
  args: (prompt: string, opts?: CliArgsOpts) => string[];
  stdinMode: 'arg' | 'pipe';
}

const REGISTRY: Record<string, CliAdapterConfig> = {
  'cli:claude': {
    id: 'cli:claude',
    command: 'claude',
    args: (_prompt, opts) => (opts?.model?.trim() ? ['-p', '--model', opts.model.trim()] : ['-p']),
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
  },
  'cli:qwen': {
    id: 'cli:qwen',
    command: 'qwen',
    // Qwen Code (gemini-cli fork): a piped stdin runs headless, printing the
    // reply to stdout and exiting. Equivalent to `qwen -p "<prompt>"`.
    args: () => [],
    stdinMode: 'pipe'
  },
  'cli:vibe': {
    id: 'cli:vibe',
    command: 'vibe',
    // Mistral Vibe: piping a prompt via stdin runs in programmatic (auto-approve)
    // mode without entering the interactive chat loop.
    args: () => [],
    stdinMode: 'pipe'
  },
  'cli:aider': {
    id: 'cli:aider',
    command: 'aider',
    // Aider scripting: `--message` sends one message, processes the reply, then
    // exits. `--yes` skips confirmations and `--no-auto-commits` leaves git alone.
    args: (prompt) => ['--message', prompt, '--yes', '--no-auto-commits'],
    stdinMode: 'arg'
  },
  'cli:warp': {
    id: 'cli:warp',
    command: 'oz',
    // Warp's headless agent runs through the Oz CLI: `oz agent run --prompt`
    // executes locally and prints results to stdout.
    args: (prompt) => ['agent', 'run', '--prompt', prompt],
    stdinMode: 'arg'
  }
};

export interface ParsedAdapterId {
  /** The bare adapter id with any `?query` stripped, e.g. `cli:claude`. */
  base: string;
  /** Key/value pairs from a `?k=v&k2=v2` suffix. Empty when no query is present. */
  params: Record<string, string>;
}

/**
 * Split an adapter string into its base id and optional `?query` params.
 * Lets a councillor pin a model per-adapter, e.g. `cli:claude?model=claude-haiku-4-5`,
 * so meetings can run a lighter model than the councillor's default jobs.
 */
export function parseAdapterId(adapterId: string): ParsedAdapterId {
  const qIdx = adapterId.indexOf('?');
  if (qIdx === -1) return { base: adapterId, params: {} };
  const base = adapterId.slice(0, qIdx);
  const params: Record<string, string> = {};
  for (const seg of adapterId.slice(qIdx + 1).split('&')) {
    if (!seg) continue;
    const eq = seg.indexOf('=');
    const key = eq === -1 ? seg : seg.slice(0, eq);
    const val = eq === -1 ? '' : seg.slice(eq + 1);
    if (key) params[decodeURIComponent(key)] = decodeURIComponent(val);
  }
  return { base, params };
}

/**
 * Resolve the model id for a CLI adapter turn. A per-councillor `?model=` pin
 * wins; otherwise the caller's `modelDefault` (e.g. the host-wide
 * `LANDSRAAD_MEETING_MODEL`) applies. Returns undefined when neither is set,
 * so the CLI runs on its own default model.
 */
export function effectiveModel(adapterId: string, modelDefault?: string): string | undefined {
  const { params } = parseAdapterId(adapterId);
  return params.model?.trim() || modelDefault?.trim() || undefined;
}

export function getCliConfig(adapterId: string): CliAdapterConfig | null {
  return REGISTRY[adapterId] ?? null;
}

export function listCliAdapterIds(): string[] {
  return Object.keys(REGISTRY);
}

export function runCliAdapter(
  config: CliAdapterConfig,
  args: { prompt: string; cwd: string; signal?: AbortSignal; env?: NodeJS.ProcessEnv; model?: string }
): AdapterRunStreams {
  const child = spawn(config.command, config.args(args.prompt, { model: args.model }), {
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
