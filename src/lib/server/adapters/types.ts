import type { Readable } from 'node:stream';

export interface AdapterInvocation {
  prompt: string;
  cwd: string;
  signal?: AbortSignal;
}

export interface AdapterResult {
  exit_code: number;
  stdout: string;
  stderr: string;
}

export interface Adapter {
  readonly id: string;
  invoke(args: AdapterInvocation): AsyncIterable<AdapterChunk> & PromiseLike<AdapterResult>;
}

export interface AdapterChunk {
  stream: 'stdout' | 'stderr';
  text: string;
}

export interface AdapterRunStreams {
  chunks: AsyncIterable<AdapterChunk>;
  result: Promise<AdapterResult>;
}

export type SpawnLike = (
  command: string,
  args: string[],
  options: { cwd: string; env: NodeJS.ProcessEnv; signal?: AbortSignal }
) => {
  stdout: Readable | null;
  stderr: Readable | null;
  stdin: { write(text: string): void; end(): void } | null;
  on(event: 'exit', listener: (code: number | null) => void): void;
  on(event: 'error', listener: (err: Error) => void): void;
  kill(signal?: NodeJS.Signals): boolean;
};
