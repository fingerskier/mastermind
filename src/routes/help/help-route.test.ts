import { describe, it, expect } from 'vitest';
import { load } from './+page.server';

describe('help route load', () => {
  it('exposes the installable CLI adapters', () => {
    const data = load({} as never);
    const ids = data.adapters.map((a) => a.id).sort();
    expect(ids).toEqual(['cli:claude', 'cli:codex', 'cli:gemini', 'cli:grok']);
    for (const a of data.adapters) {
      expect(a.install).toContain('npm install -g');
      expect(a.docsUrl).toMatch(/^https:\/\//);
    }
  });

  it('reports the app version', () => {
    const data = load({} as never);
    expect(data.version).toMatch(/\d+\.\d+/);
  });
});
