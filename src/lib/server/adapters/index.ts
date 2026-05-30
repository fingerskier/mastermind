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
  /** Binary that must be on PATH (CLI adapters only). */
  command?: string;
  /** One-line install command (CLI adapters only). */
  install?: string;
  /** Documentation / setup link (CLI adapters only). */
  docsUrl?: string;
  /** Short description of how the adapter is used after install. */
  blurb?: string;
}

const KNOWN_ADAPTERS: KnownAdapter[] = [
  { id: 'mock:local', label: 'Mock (local echo)', available: true, note: 'Built-in echo adapter for testing.' },
  {
    id: 'cli:claude',
    label: 'Claude CLI (Claude Code)',
    available: true,
    note: 'Requires `claude` on PATH.',
    command: 'claude',
    install: 'npm install -g @anthropic-ai/claude-code',
    docsUrl: 'https://docs.claude.com/en/docs/claude-code/overview',
    blurb: 'Anthropic’s coding agent. After install, run `claude` once to sign in.'
  },
  {
    id: 'cli:codex',
    label: 'Codex CLI',
    available: true,
    note: 'Requires `codex` on PATH.',
    command: 'codex',
    install: 'npm install -g @openai/codex',
    docsUrl: 'https://github.com/openai/codex',
    blurb: 'OpenAI’s coding agent. After install, run `codex` once to sign in.'
  },
  {
    id: 'cli:gemini',
    label: 'Gemini CLI',
    available: true,
    note: 'Requires `gemini` on PATH.',
    command: 'gemini',
    install: 'npm install -g @google/gemini-cli',
    docsUrl: 'https://github.com/google-gemini/gemini-cli',
    blurb: 'Google’s coding agent. After install, run `gemini` once to authenticate.'
  },
  {
    id: 'cli:grok',
    label: 'Grok CLI (xAI)',
    available: true,
    note: 'Requires `grok` on PATH.',
    command: 'grok',
    install: 'npm install -g @vibe-kit/grok-cli',
    docsUrl: 'https://github.com/superagent-ai/grok-cli',
    blurb: 'xAI Grok agent. Needs an xAI API key (set `GROK_API_KEY` or run `grok` to configure).'
  },
  { id: 'sdk:claude', label: 'Claude SDK', available: false, note: 'Not yet implemented.' },
  { id: 'sdk:codex', label: 'Codex SDK', available: false, note: 'Not yet implemented.' }
];

export function listKnownAdapters(): KnownAdapter[] {
  return KNOWN_ADAPTERS.slice();
}

export interface InstallableAdapter {
  id: string;
  label: string;
  command: string;
  install: string;
  docsUrl: string;
  blurb?: string;
}

/** Available CLI adapters with everything the help page needs to explain install. */
export function listInstallableAdapters(): InstallableAdapter[] {
  return KNOWN_ADAPTERS.filter(
    (a): a is KnownAdapter & InstallableAdapter =>
      a.available && Boolean(a.command && a.install && a.docsUrl)
  ).map(({ id, label, command, install, docsUrl, blurb }) => ({
    id,
    label,
    command,
    install,
    docsUrl,
    blurb
  }));
}

export function getAdapterLabel(id: string): string {
  return KNOWN_ADAPTERS.find((a) => a.id === id)?.label ?? id;
}

export { createMockAdapter };
export type { AdapterRunStreams } from './types';
