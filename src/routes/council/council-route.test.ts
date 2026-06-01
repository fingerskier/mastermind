import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { env } from 'node:process';
import { isHttpError, isRedirect } from '@sveltejs/kit';
import { load, actions } from './+page.server';
import { createCouncil, readCouncil, hasCouncil } from '$lib/server/councils';
import { createCouncillor, listCouncillors } from '$lib/server/councillors';
import { readCouncilEnv, writeCouncilEnv } from '$lib/server/env-file';

let tmpRoot: string;
let prevEnv: string | undefined;

beforeEach(() => {
  prevEnv = env.LANDSRAAD_COUNCIL_ROOT;
  tmpRoot = mkdtempSync(join(tmpdir(), 'landsraad-council-'));
  env.LANDSRAAD_COUNCIL_ROOT = tmpRoot;
});

afterEach(() => {
  rmSync(tmpRoot, { recursive: true, force: true });
  if (prevEnv === undefined) delete env.LANDSRAAD_COUNCIL_ROOT;
  else env.LANDSRAAD_COUNCIL_ROOT = prevEnv;
});

function post(fields: Record<string, string[]>) {
  const fd = new FormData();
  for (const [k, values] of Object.entries(fields)) for (const v of values) fd.append(k, v);
  return {
    request: new Request('http://x/', { method: 'POST', body: fd })
  } as Parameters<typeof actions.identity>[0];
}

describe('/council route', () => {
  it('loads council and env pairs', async () => {
    await createCouncil({ name: 'C', description: 'd' });
    await writeCouncilEnv([{ key: 'X', value: '1' }]);
    const data = (await (load as () => Promise<{ council: { name: string }; pairs: unknown[] }>)());
    expect(data.council.name).toBe('C');
    expect(data.pairs).toContainEqual({ key: 'X', value: '1' });
  });

  it('404s when no council exists', async () => {
    try {
      await (load as () => Promise<unknown>)();
      throw new Error('expected 404');
    } catch (err) {
      expect(isHttpError(err)).toBe(true);
      expect((err as { status: number }).status).toBe(404);
    }
  });

  it('identity action updates name/description/template', async () => {
    await createCouncil({ name: 'Old', description: '' });
    const result = await actions.identity(post({ name: ['New'], description: ['hi'], template: ['demo'] }));
    expect((result as { identitySaved: boolean }).identitySaved).toBe(true);
    const c = await readCouncil();
    expect(c.name).toBe('New');
    expect(c.description).toBe('hi');
    expect(c.template).toBe('demo');
  });

  it('identity action rejects empty name', async () => {
    await createCouncil({ name: 'Keep', description: '' });
    const result = (await actions.identity(post({ name: [''], description: [''], template: [''] }))) as {
      status: number;
      data: { error: string };
    };
    expect(result.status).toBe(400);
    expect(result.data.error).toMatch(/name/i);
    expect((await readCouncil()).name).toBe('Keep');
  });

  it('env action round-trips pairs', async () => {
    await createCouncil({ name: 'C', description: '' });
    const result = await actions.env(post({ key: ['API_KEY'], value: ['secret'] }));
    expect((result as { envSaved: boolean }).envSaved).toBe(true);
    expect(readCouncilEnv()).toContainEqual({ key: 'API_KEY', value: 'secret' });
  });

  it('deleteCouncillor action removes a councillor', async () => {
    await createCouncil({ name: 'C', description: '' });
    await createCouncillor({ name: 'Alice', role: 'CFO', routing_hint: '', adapter: '', persona: '' });
    await actions.deleteCouncillor(post({ slug: ['alice'] }));
    expect((await listCouncillors()).find((c) => c.slug === 'alice')).toBeUndefined();
  });

  it('deleteCouncil action wipes data and redirects to /', async () => {
    await createCouncil({ name: 'C', description: '' });
    try {
      await actions.deleteCouncil(post({}));
      throw new Error('expected redirect');
    } catch (err) {
      expect(isRedirect(err)).toBe(true);
      expect((err as { status: number; location: string }).status).toBe(303);
      expect((err as { location: string }).location).toBe('/');
    }
    expect(hasCouncil()).toBe(false);
  });
});
