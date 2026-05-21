import { describe, expect, it } from 'vitest';
import { createMockAdapter } from './mock';

async function collect(stream: AsyncIterable<unknown>): Promise<unknown[]> {
  const out: unknown[] = [];
  for await (const item of stream) out.push(item);
  return out;
}

describe('mock adapter', () => {
  it('streams chunks then resolves with exit 0', async () => {
    const a = createMockAdapter({ delayMs: 1 });
    const { chunks, result } = a.run({ prompt: 'hello world', cwd: process.cwd() });
    const collected = await collect(chunks);
    expect(collected.length).toBeGreaterThan(0);
    const r = await result;
    expect(r.exit_code).toBe(0);
    expect(r.stdout).toContain('echo:');
  });

  it('reports failure when configured', async () => {
    const a = createMockAdapter({ delayMs: 1, failWith: 'boom' });
    const { result } = a.run({ prompt: 'x', cwd: process.cwd() });
    const r = await result;
    expect(r.exit_code).toBe(1);
    expect(r.stderr).toContain('boom');
  });

  it('cancels on abort signal', async () => {
    const ac = new AbortController();
    const a = createMockAdapter({ delayMs: 50 });
    const { result } = a.run({ prompt: 'x', cwd: process.cwd(), signal: ac.signal });
    ac.abort();
    const r = await result;
    expect(r.exit_code).toBe(130);
  });
});
