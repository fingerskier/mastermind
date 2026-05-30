import { describe, it, expect } from 'vitest';
import { listInstallableAdapters } from './index';

describe('listInstallableAdapters', () => {
  it('returns one entry per available CLI adapter', () => {
    const ids = listInstallableAdapters().map((a) => a.id).sort();
    expect(ids).toEqual(['cli:claude', 'cli:codex', 'cli:gemini', 'cli:grok']);
  });

  it('excludes mock and not-yet-implemented SDK adapters', () => {
    const ids = listInstallableAdapters().map((a) => a.id);
    expect(ids).not.toContain('mock:local');
    expect(ids).not.toContain('sdk:claude');
    expect(ids).not.toContain('sdk:codex');
  });

  it('gives every entry a binary, an npm install command, and an https docs link', () => {
    for (const a of listInstallableAdapters()) {
      expect(a.command, a.id).toBeTruthy();
      expect(a.install, a.id).toContain('npm install -g');
      expect(a.docsUrl, a.id).toMatch(/^https:\/\//);
      expect(a.label, a.id).toBeTruthy();
    }
  });
});
