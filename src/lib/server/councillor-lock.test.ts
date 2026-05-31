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

describe('councillor-lock remote-meeting holder', () => {
  beforeEach(() => _resetForTests());

  it('acquires and releases a remote-meeting hold', () => {
    const holder = { kind: 'remote-meeting' as const, id: 'm1', host: 'eng-council' };
    expect(tryAcquire('leto', holder)).toBe(true);
    expect(tryAcquire('leto', { kind: 'meeting', id: 'm2' })).toBe(false); // busy
    expect(current('leto')).toEqual(holder);
    release('leto', { kind: 'remote-meeting', id: 'm1', host: 'eng-council' });
    expect(current('leto')).toBeNull();
  });

  it('does not release a remote-meeting hold for a different host with a colliding id', () => {
    const holder = { kind: 'remote-meeting' as const, id: 'm1', host: 'eng-council' };
    tryAcquire('leto', holder);
    // A different host with the same meeting id must not free this slot.
    release('leto', { kind: 'remote-meeting', id: 'm1', host: 'ops-council' });
    expect(current('leto')).toEqual(holder);
    release('leto', { kind: 'remote-meeting', id: 'm1', host: 'eng-council' });
    expect(current('leto')).toBeNull();
  });
});
