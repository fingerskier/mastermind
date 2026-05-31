import { describe, expect, it } from 'vitest';
import { getCliConfig, parseAdapterId } from './cli';

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

  it('claude CLI injects --model when a model opt is supplied', () => {
    const cfg = getCliConfig('cli:claude');
    expect(cfg!.args('prompt', { model: 'claude-haiku-4-5' })).toEqual([
      '-p',
      '--model',
      'claude-haiku-4-5'
    ]);
  });

  it('claude CLI omits --model when the model opt is blank', () => {
    const cfg = getCliConfig('cli:claude');
    expect(cfg!.args('prompt', { model: '' })).toEqual(['-p']);
  });
});

describe('parseAdapterId', () => {
  it('splits a bare id into base with empty params', () => {
    expect(parseAdapterId('cli:claude')).toEqual({ base: 'cli:claude', params: {} });
  });

  it('parses a ?model= query suffix', () => {
    expect(parseAdapterId('cli:claude?model=claude-haiku-4-5')).toEqual({
      base: 'cli:claude',
      params: { model: 'claude-haiku-4-5' }
    });
  });

  it('parses multiple params and ignores empty segments', () => {
    expect(parseAdapterId('cli:codex?model=gpt-5-mini&foo=bar')).toEqual({
      base: 'cli:codex',
      params: { model: 'gpt-5-mini', foo: 'bar' }
    });
  });

  it('resolves getCliConfig against the parsed base', () => {
    const { base } = parseAdapterId('cli:claude?model=x');
    expect(getCliConfig(base)).not.toBeNull();
  });
});

describe('cli adapter configs (more)', () => {
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
