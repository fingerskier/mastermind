import { describe, it, expect, beforeEach } from 'vitest';
import {
  tryAcquire,
  release,
  current,
  listHeldBy,
  _resetForTests
} from './councillor-lock';

describe('councillor-lock', () => {
  beforeEach(() => _resetForTests());

  it('acquires a free slug', () => {
    expect(tryAcquire('leto', { kind: 'job', id: 'J1' })).toBe(true);
    expect(current('leto')).toEqual({ kind: 'job', id: 'J1' });
  });

  it('refuses to acquire a held slug', () => {
    tryAcquire('leto', { kind: 'job', id: 'J1' });
    expect(tryAcquire('leto', { kind: 'meeting', id: 'M1' })).toBe(false);
    expect(current('leto')).toEqual({ kind: 'job', id: 'J1' });
  });

  it('releases only when the holder matches', () => {
    tryAcquire('leto', { kind: 'job', id: 'J1' });
    release('leto', { kind: 'job', id: 'J2' });
    expect(current('leto')).toEqual({ kind: 'job', id: 'J1' });
    release('leto', { kind: 'job', id: 'J1' });
    expect(current('leto')).toBeNull();
  });

  it('lists all slugs held by a holder', () => {
    tryAcquire('a', { kind: 'meeting', id: 'M1' });
    tryAcquire('b', { kind: 'meeting', id: 'M1' });
    tryAcquire('c', { kind: 'job', id: 'J1' });
    expect(listHeldBy({ kind: 'meeting', id: 'M1' }).sort()).toEqual(['a', 'b']);
  });
});
