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

  it('grok CLI passes the prompt as the --prompt argument value', () => {
    const cfg = getCliConfig('cli:grok');
    expect(cfg).not.toBeNull();
    expect(cfg!.command).toBe('grok');
    expect(cfg!.stdinMode).toBe('arg');
    expect(cfg!.args('hello world')).toEqual(['--prompt', 'hello world']);
  });
});
