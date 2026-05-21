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

export interface KnownAdapter {
  id: string;
  label: string;
  available: boolean;
  note?: string;
}

const KNOWN_ADAPTERS: KnownAdapter[] = [
  { id: 'mock:local', label: 'Mock (local echo)', available: true, note: 'Built-in echo adapter for testing.' },
  { id: 'cli:claude', label: 'Claude CLI', available: true, note: 'Requires `claude` on PATH.' },
  { id: 'cli:codex', label: 'Codex CLI', available: true, note: 'Requires `codex` on PATH.' },
  { id: 'sdk:claude', label: 'Claude SDK', available: false, note: 'Not yet implemented.' },
  { id: 'sdk:codex', label: 'Codex SDK', available: false, note: 'Not yet implemented.' }
];

export function listKnownAdapters(): KnownAdapter[] {
  return KNOWN_ADAPTERS.slice();
}

export function getAdapterLabel(id: string): string {
  return KNOWN_ADAPTERS.find((a) => a.id === id)?.label ?? id;
}

export { createMockAdapter };
export type { AdapterRunStreams } from './types';
