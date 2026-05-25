import { describe, expect, it } from 'vitest';
import { listBundledTemplates } from './templates';

describe('listBundledTemplates', () => {
  it('returns the templates from example/', async () => {
    const list = await listBundledTemplates();
    const slugs = list.map((t) => t.slug).sort();
    expect(slugs).toEqual(
      ['c-suite', 'engineering', 'hedge-fund', 'landsraad', 'tech-writing'].sort()
    );
    const hedge = list.find((t) => t.slug === 'hedge-fund');
    expect(hedge).toBeDefined();
    expect(hedge!.name).toBe('Hedge Fund');
    expect(hedge!.source).toMatch(/[\\/]example[\\/]hedge-fund\.template\.json$/);
  });
});
