import { describe, expect, it } from 'vitest';
import { nextFire, previewNext, validateCron } from './cron';

describe('cron', () => {
  it('validateCron accepts a 5-field expression', () => {
    expect(validateCron('0 9 * * MON')).toBe(true);
    expect(validateCron('*/15 * * * *')).toBe(true);
    expect(validateCron('0 0 1 * *')).toBe(true);
  });

  it('validateCron rejects garbage', () => {
    expect(validateCron('bogus')).toBe(false);
    expect(validateCron('')).toBe(false);
    expect(validateCron('60 * * * *')).toBe(false);
  });

  it('validateCron rejects 6-field expressions', () => {
    expect(validateCron('0 0 9 * * MON')).toBe(false);
  });

  it('nextFire returns the next ISO UTC timestamp after the given moment', () => {
    const after = new Date('2026-05-26T08:30:00Z');
    const fire = nextFire('0 9 * * *', after);
    expect(fire).not.toBeNull();
    expect(new Date(fire!).getTime()).toBeGreaterThan(after.getTime());
    const fireDate = new Date(fire!);
    expect(fireDate.getUTCHours() === 9 || fireDate.getHours() === 9).toBe(true);
  });

  it('nextFire returns null for invalid cron', () => {
    expect(nextFire('garbage', new Date())).toBeNull();
  });

  it('previewNext returns N consecutive fires', () => {
    const after = new Date('2026-05-26T00:00:00Z');
    const fires = previewNext('*/15 * * * *', 3, after);
    expect(fires).toHaveLength(3);
    const ts = fires.map((s) => new Date(s).getTime());
    expect(ts[1] - ts[0]).toBe(15 * 60_000);
    expect(ts[2] - ts[1]).toBe(15 * 60_000);
  });

  it('previewNext returns [] for invalid cron', () => {
    expect(previewNext('bogus', 3, new Date())).toEqual([]);
  });
});
