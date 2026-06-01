/**
 * Suggested env keys for the per-council `.env` editor (`/council`).
 *
 * Two groups: provider API keys (the conventional name each platform reads —
 * adapters pick these up from the inherited environment) and Landsraad's own
 * behavior globals (kept in sync with `src/lib/server/config.ts`). Pure static
 * data — safe to ship to the browser for the `<datalist>`.
 */
export interface EnvKeySuggestion {
  key: string;
  description: string;
  /**
   * Known acceptable values, when the key takes one of a small set (e.g. the
   * `lite`/`medium`/`heavy` tiers). The settings editor offers these in a
   * `<select>` plus a `Custom…` escape hatch for other values. Omit for
   * free-form keys (API keys, numeric timeouts, prose nudges).
   */
  values?: string[];
}

export const ENV_KEY_SUGGESTIONS: EnvKeySuggestion[] = [
  // Provider API keys (conventional env var per platform).
  { key: 'ANTHROPIC_API_KEY', description: 'Anthropic — Claude (cli:claude, aider)' },
  { key: 'OPENAI_API_KEY', description: 'OpenAI — GPT/Codex (cli:codex, aider)' },
  { key: 'XAI_API_KEY', description: 'xAI (X) — Grok (cli:grok)' },
  { key: 'GEMINI_API_KEY', description: 'Google — Gemini (cli:gemini)' },
  { key: 'GOOGLE_API_KEY', description: 'Google — alternative Gemini key name' },
  { key: 'MISTRAL_API_KEY', description: 'Mistral — Vibe (cli:vibe)' },
  { key: 'DASHSCOPE_API_KEY', description: 'Alibaba — Qwen / DashScope (cli:qwen)' },
  { key: 'WARP_API_KEY', description: 'Warp — Oz CLI headless auth (cli:warp)' },

  // Landsraad behavior globals (mirror config.ts).
  {
    key: 'LANDSRAAD_MEETING_TURN_NUDGE',
    description: 'Text appended to every meeting turn — e.g. "Be terse — 1-3 sentences."'
  },
  {
    key: 'LANDSRAAD_MEETING_MODEL',
    description:
      'Model for all meeting turns. Use a tier — "lite"/"medium"/"heavy" — mapped per adapter, or a literal model id. A councillor ?model= pin still wins.',
    values: ['lite', 'medium', 'heavy']
  },
  { key: 'LANDSRAAD_MEETING_WINDOW_K', description: 'Recent turns shown per meeting turn (default 4)' },
  {
    key: 'LANDSRAAD_MEETING_TURN_TIMEOUT_MS',
    description: 'Per-turn adapter timeout in ms (default 300000)'
  },
  {
    key: 'LANDSRAAD_MEETING_SUMMARY_TIMEOUT_MS',
    description: 'Chair-summary timeout in ms (default 300000)'
  },
  {
    key: 'LANDSRAAD_PEER_DISCOVERY_TIMEOUT_MS',
    description: 'Cross-council peer discovery timeout in ms (default 2000)'
  }
];

/** Look up a suggestion by exact key (trimmed). Undefined for unknown keys. */
export function findEnvSuggestion(key: string): EnvKeySuggestion | undefined {
  const k = key.trim();
  if (!k) return undefined;
  return ENV_KEY_SUGGESTIONS.find((s) => s.key === k);
}

/**
 * Whether the value editor should open in free-text ("custom") mode rather than
 * the enum `<select>`. True only when the key has known `values` and the current
 * value is a non-empty literal outside that set — e.g. a model id loaded from a
 * `.env` that predates the tier aliases. A blank value uses the select.
 */
export function startsInCustomMode(value: string, values: string[] | undefined): boolean {
  if (!values || values.length === 0) return false;
  if (!value) return false;
  return !values.includes(value);
}
