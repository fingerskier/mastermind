import { describe, it, expect } from 'vitest';
import { composeRemoteTurnPrompt } from './meeting-prompt';

describe('composeRemoteTurnPrompt', () => {
  it('orders persona, memory, then the meeting block', () => {
    const out = composeRemoteTurnPrompt({
      persona: 'You are Leto.',
      memCtx: '# Shared council memory\n\n### note\n\nbody',
      title: 'Sync',
      topic: 'What next?',
      summary: 'Earlier we discussed X.',
      recentTurns: ['## Turn 3 — director — t\n\nhi'],
      speakerInstruction: 'You are leto. Speak now.'
    });
    expect(out.indexOf('You are Leto.')).toBeLessThan(out.indexOf('Shared council memory'));
    expect(out.indexOf('Shared council memory')).toBeLessThan(out.indexOf('# Meeting: Sync'));
    expect(out).toContain('## Summary of earlier turns');
    expect(out).toContain('Earlier we discussed X.');
    expect(out).toContain('## Topic');
    expect(out).toContain('You are leto. Speak now.');
  });

  it('omits empty persona, memory, and summary sections', () => {
    const out = composeRemoteTurnPrompt({
      persona: '',
      memCtx: '',
      title: 'Sync',
      topic: '',
      summary: '',
      recentTurns: [],
      speakerInstruction: 'You are leto. Speak now.'
    });
    expect(out).not.toContain('# Persona');
    expect(out).not.toContain('## Summary of earlier turns');
    expect(out).toContain('(no topic)');
    expect(out).toContain('(no turns yet)');
  });
});
