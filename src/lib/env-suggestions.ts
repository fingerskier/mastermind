/**
 * Suggested env keys for the per-council `.env` editor (`/settings`).
 *
 * Two groups: provider API keys (the conventional name each platform reads —
 * adapters pick these up from the inherited environment) and Landsraad's own
 * behavior globals (kept in sync with `src/lib/server/config.ts`). Pure static
 * data — safe to ship to the browser for the `<datalist>`.
 */
export interface EnvKeySuggestion {
  key: string;
  description: string;
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
    description: 'Model for all meeting turns — e.g. "haiku". A councillor ?model= pin still wins.'
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
