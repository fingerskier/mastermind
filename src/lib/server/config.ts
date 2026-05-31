export const MEMORY_TOPK_SHARED = 8;
export const MEMORY_TOPK_PRIVATE = 8;
export const MEMORY_CHAR_BUDGET = 12000;

function envInt(name: string, fallback: number): number {
  const v = process.env[name];
  if (!v) return fallback;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
}

function envStr(name: string, fallback: string): string {
  const v = process.env[name];
  return v && v.trim() ? v : fallback;
}

export const MEETING_WINDOW_K_DEFAULT = envInt('LANDSRAAD_MEETING_WINDOW_K', 4);
export const MEETING_TURN_TIMEOUT_MS = envInt('LANDSRAAD_MEETING_TURN_TIMEOUT_MS', 300_000);
export const MEETING_SUMMARY_TIMEOUT_MS = envInt('LANDSRAAD_MEETING_SUMMARY_TIMEOUT_MS', 300_000);
export const PEER_DISCOVERY_TIMEOUT_MS = envInt('LANDSRAAD_PEER_DISCOVERY_TIMEOUT_MS', 2_000);

/**
 * Appended to every meeting turn's speaker instruction. Empty by default.
 * Set e.g. `LANDSRAAD_MEETING_TURN_NUDGE="Be terse — 1-3 sentences."` to ask
 * councillors for shorter responses during meetings. Chair-side only — one
 * knob governs the whole meeting, including remote peers.
 */
export const MEETING_TURN_NUDGE = envStr('LANDSRAAD_MEETING_TURN_NUDGE', '');

/**
 * Host-wide model override for meeting turns. Empty by default. When set (e.g.
 * `LANDSRAAD_MEETING_MODEL=haiku`), every meeting LLM call this server runs —
 * attendee turns, rolling summaries, and the closing synthesis — uses this
 * model instead of the CLI's default, letting an operator run cheap/fast
 * meetings without editing each councillor. A per-councillor `?model=` pin in
 * the adapter string still wins. Per-process: each participating server reads
 * its own value, so it also governs the turns it serves as a remote peer.
 */
export const MEETING_MODEL = envStr('LANDSRAAD_MEETING_MODEL', '');
