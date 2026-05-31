import { describe, it, expect } from 'vitest';
import { load } from './+page.server';
import type { InstallableAdapter } from '$lib/server/adapters';

function run(): { adapters: InstallableAdapter[]; version: string } {
  return load({} as never) as { adapters: InstallableAdapter[]; version: string };
}

describe('help route load', () => {
  it('exposes the installable CLI adapters', () => {
    const data = run();
    const ids = data.adapters.map((a) => a.id).sort();
    expect(ids).toEqual([
      'cli:aider',
      'cli:claude',
      'cli:codex',
      'cli:gemini',
      'cli:grok',
      'cli:qwen'
    ]);
    for (const a of data.adapters) {
      expect(a.install).toBeTruthy();
      expect(a.docsUrl).toMatch(/^https:\/\//);
    }
  });

  it('surfaces a trust/auth caveat for the directory-scoped CLIs', () => {
    const data = run();
    const byId = new Map(data.adapters.map((a) => [a.id, a]));
    for (const id of ['cli:codex', 'cli:gemini', 'cli:qwen']) {
      expect(byId.get(id)?.caveat).toMatch(/trust|auth/i);
    }
  });

  it('reports the app version', () => {
    const data = run();
    expect(data.version).toMatch(/\d+\.\d+/);
  });
});
