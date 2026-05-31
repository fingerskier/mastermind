import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { env } from 'node:process';

import {
  readCouncilEnv,
  writeCouncilEnv,
  ensureCouncilGitignore,
  loadCouncilEnvIntoProcess
} from './env-file';
import { councilEnvFile } from './paths';

let tmpRoot: string;
let prevEnv: string | undefined;

beforeEach(() => {
  prevEnv = env.LANDSRAAD_COUNCIL_ROOT;
  tmpRoot = mkdtempSync(join(tmpdir(), 'landsraad-env-'));
  env.LANDSRAAD_COUNCIL_ROOT = tmpRoot;
});

afterEach(() => {
  rmSync(tmpRoot, { recursive: true, force: true });
  if (prevEnv === undefined) delete env.LANDSRAAD_COUNCIL_ROOT;
  else env.LANDSRAAD_COUNCIL_ROOT = prevEnv;
});

function envPath(): string {
  return join(tmpRoot, '.env');
}

describe('readCouncilEnv', () => {
  it('returns [] when the file is missing', () => {
    expect(readCouncilEnv()).toEqual([]);
  });

  it('skips blank lines and comments, preserving order', () => {
    writeFileSync(
      envPath(),
      ['# a comment', '', '  # indented comment', 'A=1', 'B=2', '   ', 'C=3'].join('\n')
    );
    expect(readCouncilEnv()).toEqual([
      { key: 'A', value: '1' },
      { key: 'B', value: '2' },
      { key: 'C', value: '3' }
    ]);
  });

  it('splits on the first = and trims the key', () => {
    writeFileSync(envPath(), '  DATABASE_URL  =postgres://u:p@h/db?x=1\n');
    expect(readCouncilEnv()).toEqual([{ key: 'DATABASE_URL', value: 'postgres://u:p@h/db?x=1' }]);
  });

  it('strips one layer of matching surrounding quotes', () => {
    writeFileSync(envPath(), ['A="hello world"', "B='single'", 'C="unbalanced'].join('\n'));
    expect(readCouncilEnv()).toEqual([
      { key: 'A', value: 'hello world' },
      { key: 'B', value: 'single' },
      { key: 'C', value: '"unbalanced' }
    ]);
  });

  it('skips lines with an empty or invalid key', () => {
    writeFileSync(envPath(), ['=novalue', '  =x', 'GOOD=1'].join('\n'));
    expect(readCouncilEnv()).toEqual([{ key: 'GOOD', value: '1' }]);
  });
});

describe('writeCouncilEnv', () => {
  it('round-trips through read', async () => {
    await writeCouncilEnv([
      { key: 'OPENAI_API_KEY', value: 'sk-abc' },
      { key: 'MODEL', value: 'gpt-4o' }
    ]);
    expect(readCouncilEnv()).toEqual([
      { key: 'OPENAI_API_KEY', value: 'sk-abc' },
      { key: 'MODEL', value: 'gpt-4o' }
    ]);
  });

  it('drops rows where both key and value are empty', async () => {
    await writeCouncilEnv([
      { key: '', value: '' },
      { key: 'A', value: '1' },
      { key: '  ', value: '' }
    ]);
    expect(readCouncilEnv()).toEqual([{ key: 'A', value: '1' }]);
  });

  it('quotes values containing whitespace, # or quotes and round-trips them', async () => {
    await writeCouncilEnv([
      { key: 'SPACED', value: 'a b' },
      { key: 'HASH', value: 'a#b' },
      { key: 'QUOTED', value: 'say "hi"' }
    ]);
    const raw = readFileSync(envPath(), 'utf8');
    expect(raw).toContain('SPACED="a b"');
    expect(raw).toContain('QUOTED="say \\"hi\\""');
    expect(readCouncilEnv()).toEqual([
      { key: 'SPACED', value: 'a b' },
      { key: 'HASH', value: 'a#b' },
      { key: 'QUOTED', value: 'say "hi"' }
    ]);
  });

  it('rejects invalid keys with a named error', async () => {
    await expect(writeCouncilEnv([{ key: 'bad key', value: '1' }])).rejects.toThrow(/bad key/);
    await expect(writeCouncilEnv([{ key: '1abc', value: '1' }])).rejects.toThrow(/1abc/);
  });

  it('rejects values containing a newline', async () => {
    await expect(writeCouncilEnv([{ key: 'A', value: 'line1\nline2' }])).rejects.toThrow(/newline/i);
  });

  it('ensures the council .gitignore contains .env', async () => {
    await writeCouncilEnv([{ key: 'A', value: '1' }]);
    expect(readFileSync(join(tmpRoot, '.gitignore'), 'utf8')).toMatch(/^\.env$/m);
  });
});

describe('ensureCouncilGitignore', () => {
  it('creates .gitignore with .env when absent', async () => {
    await ensureCouncilGitignore();
    expect(readFileSync(join(tmpRoot, '.gitignore'), 'utf8')).toMatch(/^\.env$/m);
  });

  it('appends .env when missing from an existing file', async () => {
    writeFileSync(join(tmpRoot, '.gitignore'), 'node_modules\n');
    await ensureCouncilGitignore();
    const raw = readFileSync(join(tmpRoot, '.gitignore'), 'utf8');
    expect(raw).toMatch(/^node_modules$/m);
    expect(raw).toMatch(/^\.env$/m);
  });

  it('is a no-op when .env is already present', async () => {
    writeFileSync(join(tmpRoot, '.gitignore'), '.env\nfoo\n');
    await ensureCouncilGitignore();
    expect(readFileSync(join(tmpRoot, '.gitignore'), 'utf8')).toBe('.env\nfoo\n');
  });
});

describe('loadCouncilEnvIntoProcess', () => {
  it('sets vars into process.env and overrides inherited values', () => {
    env.LANDSRAAD_TEST_VAR = 'inherited';
    writeFileSync(envPath(), 'LANDSRAAD_TEST_VAR=fromfile\nLANDSRAAD_TEST_NEW=new\n');
    try {
      loadCouncilEnvIntoProcess();
      expect(env.LANDSRAAD_TEST_VAR).toBe('fromfile');
      expect(env.LANDSRAAD_TEST_NEW).toBe('new');
    } finally {
      delete env.LANDSRAAD_TEST_VAR;
      delete env.LANDSRAAD_TEST_NEW;
    }
  });

  it('never throws when the file is missing', () => {
    expect(councilEnvFile()).toBe(envPath());
    expect(existsSync(envPath())).toBe(false);
    expect(() => loadCouncilEnvIntoProcess()).not.toThrow();
  });
});
