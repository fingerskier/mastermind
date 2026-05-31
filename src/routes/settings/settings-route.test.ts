import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { env } from 'node:process';
import { isHttpError } from '@sveltejs/kit';
import { load, actions } from './+page.server';
import { createCouncil } from '$lib/server/councils';
import { readCouncilEnv } from '$lib/server/env-file';

let tmpRoot: string;
let prevEnv: string | undefined;

beforeEach(() => {
  prevEnv = env.LANDSRAAD_COUNCIL_ROOT;
  tmpRoot = mkdtempSync(join(tmpdir(), 'landsraad-settings-'));
  env.LANDSRAAD_COUNCIL_ROOT = tmpRoot;
});

afterEach(() => {
  rmSync(tmpRoot, { recursive: true, force: true });
  if (prevEnv === undefined) delete env.LANDSRAAD_COUNCIL_ROOT;
  else env.LANDSRAAD_COUNCIL_ROOT = prevEnv;
});

function formData(pairs: { key: string; value: string }[]): FormData {
  const f = new FormData();
  for (const p of pairs) {
    f.append('key', p.key);
    f.append('value', p.value);
  }
  return f;
}

describe('/settings', () => {
  it('load 404s when no council exists', async () => {
    try {
      await (load as () => Promise<unknown>)();
      throw new Error('expected 404');
    } catch (err) {
      expect(isHttpError(err)).toBe(true);
      expect((err as { status: number }).status).toBe(404);
    }
  });

  it('load returns the council env pairs', async () => {
    await createCouncil({ name: 'T', description: '' });
    await actions.default({
      request: new Request('http://x/', { method: 'POST', body: formData([{ key: 'A', value: '1' }]) })
    } as Parameters<typeof actions.default>[0]);
    const result = (await (load as () => Promise<{ pairs: unknown }>)()) as {
      pairs: { key: string; value: string }[];
    };
    expect(result.pairs).toEqual([{ key: 'A', value: '1' }]);
  });

  it('default action writes the .env from parallel form arrays', async () => {
    await createCouncil({ name: 'T', description: '' });
    const result = await actions.default({
      request: new Request('http://x/', {
        method: 'POST',
        body: formData([
          { key: 'OPENAI_API_KEY', value: 'sk-1' },
          { key: 'MODEL', value: 'gpt-4o' }
        ])
      })
    } as Parameters<typeof actions.default>[0]);
    expect((result as { saved: boolean }).saved).toBe(true);
    expect(readCouncilEnv()).toEqual([
      { key: 'OPENAI_API_KEY', value: 'sk-1' },
      { key: 'MODEL', value: 'gpt-4o' }
    ]);
  });

  it('bad key returns fail(400) echoing the submitted pairs', async () => {
    await createCouncil({ name: 'T', description: '' });
    const result = (await actions.default({
      request: new Request('http://x/', { method: 'POST', body: formData([{ key: 'bad key', value: '1' }]) })
    } as Parameters<typeof actions.default>[0])) as {
      status: number;
      data: { error: string; pairs: { key: string; value: string }[] };
    };
    expect(result.status).toBe(400);
    expect(result.data.error).toMatch(/bad key/);
    expect(result.data.pairs).toEqual([{ key: 'bad key', value: '1' }]);
    // Nothing was written.
    expect(readCouncilEnv()).toEqual([]);
  });
});
