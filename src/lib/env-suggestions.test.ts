import { describe, it, expect } from 'vitest';
import { ENV_KEY_SUGGESTIONS } from './env-suggestions';

const KEY_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

describe('ENV_KEY_SUGGESTIONS', () => {
  it('every key is a valid env identifier', () => {
    for (const s of ENV_KEY_SUGGESTIONS) {
      expect(s.key, s.key).toMatch(KEY_RE);
      expect(s.description.trim().length).toBeGreaterThan(0);
    }
  });

  it('has no duplicate keys', () => {
    const keys = ENV_KEY_SUGGESTIONS.map((s) => s.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('includes the major provider API keys', () => {
    const keys = new Set(ENV_KEY_SUGGESTIONS.map((s) => s.key));
    for (const k of [
      'ANTHROPIC_API_KEY',
      'OPENAI_API_KEY',
      'XAI_API_KEY',
      'GEMINI_API_KEY',
      'MISTRAL_API_KEY',
      'WARP_API_KEY'
    ]) {
      expect(keys.has(k), k).toBe(true);
    }
  });

  it('includes the built-in Landsraad globals (drift guard for config.ts)', () => {
    const keys = new Set(ENV_KEY_SUGGESTIONS.map((s) => s.key));
    for (const k of [
      'LANDSRAAD_MEETING_TURN_NUDGE',
      'LANDSRAAD_MEETING_MODEL',
      'LANDSRAAD_MEETING_WINDOW_K',
      'LANDSRAAD_MEETING_TURN_TIMEOUT_MS',
      'LANDSRAAD_MEETING_SUMMARY_TIMEOUT_MS',
      'LANDSRAAD_PEER_DISCOVERY_TIMEOUT_MS'
    ]) {
      expect(keys.has(k), k).toBe(true);
    }
  });
});
