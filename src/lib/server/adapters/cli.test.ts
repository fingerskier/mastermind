import { describe, expect, it } from 'vitest';
import { getCliConfig } from './cli';

describe('cli adapter configs', () => {
  it('codex exec is invoked with --skip-git-repo-check so non-git council dirs work', () => {
    const cfg = getCliConfig('cli:codex');
    expect(cfg).not.toBeNull();
    const args = cfg!.args('prompt');
    expect(args).toContain('--skip-git-repo-check');
    expect(args[0]).toBe('exec');
  });

  it('claude CLI uses -p print mode', () => {
    const cfg = getCliConfig('cli:claude');
    expect(cfg).not.toBeNull();
    expect(cfg!.args('prompt')).toEqual(['-p']);
  });

  it('gemini CLI runs headless via piped stdin', () => {
    const cfg = getCliConfig('cli:gemini');
    expect(cfg).not.toBeNull();
    expect(cfg!.command).toBe('gemini');
    expect(cfg!.stdinMode).toBe('pipe');
  });

  it('grok CLI runs single-turn headless via --single (official xAI CLI)', () => {
    const cfg = getCliConfig('cli:grok');
    expect(cfg).not.toBeNull();
    expect(cfg!.command).toBe('grok');
    expect(cfg!.stdinMode).toBe('arg');
    expect(cfg!.args('hello world')).toEqual(['--single', 'hello world']);
  });

  it('qwen CLI runs headless via piped stdin', () => {
    const cfg = getCliConfig('cli:qwen');
    expect(cfg).not.toBeNull();
    expect(cfg!.command).toBe('qwen');
    expect(cfg!.stdinMode).toBe('pipe');
  });

  it('vibe CLI (Mistral) runs non-interactively via piped stdin', () => {
    const cfg = getCliConfig('cli:vibe');
    expect(cfg).not.toBeNull();
    expect(cfg!.command).toBe('vibe');
    expect(cfg!.stdinMode).toBe('pipe');
  });

  it('aider runs a single message then exits, with confirmations and auto-commits disabled', () => {
    const cfg = getCliConfig('cli:aider');
    expect(cfg).not.toBeNull();
    expect(cfg!.command).toBe('aider');
    expect(cfg!.stdinMode).toBe('arg');
    expect(cfg!.args('hello world')).toEqual([
      '--message',
      'hello world',
      '--yes',
      '--no-auto-commits'
    ]);
  });

  it('warp uses the Oz CLI to run an agent headlessly', () => {
    const cfg = getCliConfig('cli:warp');
    expect(cfg).not.toBeNull();
    expect(cfg!.command).toBe('oz');
    expect(cfg!.stdinMode).toBe('arg');
    expect(cfg!.args('hello world')).toEqual(['agent', 'run', '--prompt', 'hello world']);
  });
});
