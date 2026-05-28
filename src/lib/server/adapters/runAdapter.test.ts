import { describe, it, expect } from 'vitest';
import { runAdapter } from './runAdapter';
import { resolveAdapter } from './index';

describe('runAdapter', () => {
  it('runs the mock:local adapter and returns transcript + output + exit_code', async () => {
    const adapter = resolveAdapter('mock:local')!;
    const result = await runAdapter({
      adapter,
      prompt: 'hello',
      cwd: process.cwd(),
      timeoutMs: 30_000
    });
    expect(result.exit_code).toBe(0);
    expect(result.output.length).toBeGreaterThan(0);
    expect(result.transcript.length).toBeGreaterThan(0);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('streams chunks via onStdout', async () => {
    const adapter = resolveAdapter('mock:local')!;
    const seen: string[] = [];
    await runAdapter({
      adapter,
      prompt: 'hi',
      cwd: process.cwd(),
      timeoutMs: 30_000,
      onStdout: (c) => seen.push(c)
    });
    expect(seen.join('')).not.toBe('');
  });

  it('aborts when the signal aborts', async () => {
    const adapter = resolveAdapter('mock:local')!;
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 1);
    const result = await runAdapter({
      adapter,
      prompt: 'hi',
      cwd: process.cwd(),
      timeoutMs: 30_000,
      abortSignal: controller.signal
    });
    expect(result.exit_code).not.toBe(0);
  });

  it('times out when the adapter exceeds timeoutMs', async () => {
    const adapter = resolveAdapter('mock:local')!;
    const result = await runAdapter({
      adapter,
      prompt: 'hi',
      cwd: process.cwd(),
      timeoutMs: 0
    });
    expect(result.exit_code).not.toBe(0);
  });
});
