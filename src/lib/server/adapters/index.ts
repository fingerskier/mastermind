import type { AdapterRunStreams } from './types';
import { createMockAdapter } from './mock';
import { getCliConfig, listCliAdapterIds, runCliAdapter } from './cli';

export interface ResolvedAdapter {
  id: string;
  kind: 'mock' | 'cli';
  run(args: { prompt: string; cwd: string; signal?: AbortSignal }): AdapterRunStreams;
}

export function resolveAdapter(adapterId: string): ResolvedAdapter | null {
  if (!adapterId) return null;
  if (adapterId === 'mock:local') {
    const m = createMockAdapter();
    return { id: m.id, kind: 'mock', run: m.run };
  }
  const cli = getCliConfig(adapterId);
  if (cli) {
    return {
      id: cli.id,
      kind: 'cli',
      run: (args) => runCliAdapter(cli, args)
    };
  }
  return null;
}

export function listKnownAdapterIds(): string[] {
  return ['mock:local', ...listCliAdapterIds()];
}

export { createMockAdapter };
export type { AdapterRunStreams } from './types';
