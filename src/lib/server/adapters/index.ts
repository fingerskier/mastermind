import type { AdapterRunStreams } from './types';
import { createMockAdapter } from './mock';
import { effectiveModel, getCliConfig, listCliAdapterIds, parseAdapterId, runCliAdapter } from './cli';

/** Options for {@link resolveAdapter}. */
export interface ResolveAdapterOpts {
  /**
   * Model id to use when the adapter string does not pin one with `?model=`.
   * Meeting call sites pass `LANDSRAAD_MEETING_MODEL` here so a host can run a
   * lighter model for every meeting turn without editing each councillor.
   */
  modelDefault?: string;
}

export interface ResolvedAdapter {
  id: string;
  kind: 'mock' | 'cli';
  run(args: { prompt: string; cwd: string; signal?: AbortSignal }): AdapterRunStreams;
}

export function resolveAdapter(adapterId: string, opts?: ResolveAdapterOpts): ResolvedAdapter | null {
  if (!adapterId) return null;
  const { base } = parseAdapterId(adapterId);
  if (base === 'mock:local') {
    const m = createMockAdapter();
    return { id: m.id, kind: 'mock', run: m.run };
  }
  const cli = getCliConfig(base);
  if (cli) {
    const model = effectiveModel(adapterId, opts?.modelDefault);
    return {
      id: adapterId,
      kind: 'cli',
      run: (args) => runCliAdapter(cli, { ...args, model })
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
    note: 'Requires the official xAI `grok` CLI on PATH.',
    command: 'grok',
    install: 'See https://x.ai/cli',
    docsUrl: 'https://x.ai/cli',
    blurb: 'Official xAI Grok agent CLI. Authenticate with `grok login` (use `grok login --device-auth` for headless environments).'
  },
  {
    id: 'cli:qwen',
    label: 'Qwen Code',
    available: true,
    note: 'Requires `qwen` on PATH.',
    command: 'qwen',
    install: 'npm install -g @qwen-code/qwen-code',
    docsUrl: 'https://github.com/QwenLM/qwen-code',
    blurb: 'Alibaba’s open-source terminal coding agent (a gemini-cli fork). After install, run `qwen` once to authenticate.'
  },
  {
    id: 'cli:vibe',
    label: 'Mistral Vibe',
    available: true,
    note: 'Requires `vibe` on PATH.',
    command: 'vibe',
    install: 'uv tool install mistral-vibe',
    docsUrl: 'https://docs.mistral.ai/mistral-vibe/introduction',
    blurb: 'Mistral’s terminal coding agent. After install, run `vibe` once to sign in; piped prompts run in auto-approve mode.'
  },
  {
    id: 'cli:aider',
    label: 'Aider',
    available: true,
    note: 'Requires `aider` on PATH and an LLM API key in the environment.',
    command: 'aider',
    install: 'python -m pip install aider-install && aider-install',
    docsUrl: 'https://aider.chat/docs/scripting.html',
    blurb: 'AI pair programmer. Set your model’s API key (e.g. OPENAI_API_KEY / ANTHROPIC_API_KEY); each turn runs as `aider --message … --yes --no-auto-commits`.'
  },
  {
    id: 'cli:warp',
    label: 'Warp (Oz CLI)',
    available: true,
    note: 'Requires the Warp `oz` CLI on PATH.',
    command: 'oz',
    install: 'brew install --cask oz',
    docsUrl: 'https://docs.warp.dev/reference/cli/',
    blurb: 'Warp’s headless agent. Authenticate with `oz login` (or set WARP_API_KEY for headless environments); each turn runs as `oz agent run --prompt …`.'
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
