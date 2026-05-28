import { describe, it, expect } from 'vitest';
import { meetingDir, meetingIdFor, meetingsDir } from './paths';

describe('meeting paths', () => {
  it('meetingIdFor produces timestamp-slug ids', () => {
    const id = meetingIdFor('Strategy session', new Date('2026-05-28T14:00:00Z'));
    expect(id).toMatch(/^2026-05-28T14-00-00-000Z-strategy-session$/);
  });
  it('meetingDir is meetingsDir + id', () => {
    const id = 'fake-id';
    expect(meetingDir(id).endsWith(id)).toBe(true);
    expect(meetingDir(id).includes('meetings')).toBe(true);
  });
});
