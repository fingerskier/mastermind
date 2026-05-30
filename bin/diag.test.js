import { describe, it, expect } from 'vitest';
import { formatStartupDiag } from './diag.js';

const base = {
  councilName: 'My Council',
  cwd: 'C:\\work\\my-council',
  configPath: 'C:\\work\\my-council\\council.json',
  configExists: true,
  port: 10191,
  url: 'http://localhost:10191',
  pid: 4242,
  node: 'v20.11.0',
  version: '0.1.0'
};

describe('formatStartupDiag', () => {
  it('renders a header with the version', () => {
    const lines = formatStartupDiag(base);
    expect(lines[0]).toBe('Landsraad v0.1.0');
  });

  it('includes council name, root, config, port, url, pid and node', () => {
    const out = formatStartupDiag(base).join('\n');
    expect(out).toContain('My Council');
    expect(out).toContain('C:\\work\\my-council');
    expect(out).toContain('council.json');
    expect(out).toContain('10191');
    expect(out).toContain('http://localhost:10191');
    expect(out).toContain('4242');
    expect(out).toContain('v20.11.0');
  });

  it('shows (unnamed) when there is no council name', () => {
    const out = formatStartupDiag({ ...base, councilName: null }).join('\n');
    expect(out).toContain('(unnamed)');
  });

  it('flags a missing council.json', () => {
    const out = formatStartupDiag({ ...base, configExists: false }).join('\n');
    expect(out).toContain('council.json (missing)');
  });

  it('omits port and url rows when not provided', () => {
    const out = formatStartupDiag({
      ...base,
      port: null,
      url: undefined
    }).join('\n');
    expect(out).not.toContain('Port');
    expect(out).not.toContain('URL');
  });

  it('aligns labels by padding to the widest', () => {
    const lines = formatStartupDiag(base);
    // Every value column should start at the same offset.
    const valueOffsets = lines
      .slice(1)
      .map((l) => l.indexOf(l.trim().split(/\s{2,}/)[1]));
    expect(new Set(valueOffsets).size).toBe(1);
  });
});
