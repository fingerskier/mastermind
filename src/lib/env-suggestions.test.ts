import { describe, it, expect } from 'vitest';
import {
  ENV_KEY_SUGGESTIONS,
  findEnvSuggestion,
  startsInCustomMode
} from './env-suggestions';

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

  it('exposes lite/medium/heavy as the known values for MEETING_MODEL', () => {
    expect(findEnvSuggestion('LANDSRAAD_MEETING_MODEL')?.values).toEqual([
      'lite',
      'medium',
      'heavy'
    ]);
  });
});

describe('findEnvSuggestion', () => {
  it('returns the suggestion for a known key', () => {
    expect(findEnvSuggestion('ANTHROPIC_API_KEY')?.key).toBe('ANTHROPIC_API_KEY');
  });

  it('returns undefined for an unknown or blank key', () => {
    expect(findEnvSuggestion('NOPE_NOT_A_KEY')).toBeUndefined();
    expect(findEnvSuggestion('')).toBeUndefined();
  });

  it('ignores surrounding whitespace on the looked-up key', () => {
    expect(findEnvSuggestion('  LANDSRAAD_MEETING_MODEL  ')?.key).toBe('LANDSRAAD_MEETING_MODEL');
  });
});

describe('startsInCustomMode', () => {
  const tiers = ['lite', 'medium', 'heavy'];

  it('is false when the value is one of the enum values', () => {
    expect(startsInCustomMode('medium', tiers)).toBe(false);
  });

  it('is false for a blank value (use the select, default first option)', () => {
    expect(startsInCustomMode('', tiers)).toBe(false);
  });

  it('is true when a non-empty value is not in the enum (a literal from disk)', () => {
    expect(startsInCustomMode('claude-opus-4-8', tiers)).toBe(true);
  });

  it('is false when the key has no known enum values', () => {
    expect(startsInCustomMode('sk-whatever', undefined)).toBe(false);
  });
});
