export const MEMORY_TOPK_SHARED = 8;
export const MEMORY_TOPK_PRIVATE = 8;
export const MEMORY_CHAR_BUDGET = 12000;

function envInt(name: string, fallback: number): number {
  const v = process.env[name];
  if (!v) return fallback;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
}

export const MEETING_WINDOW_K_DEFAULT = envInt('LANDSRAAD_MEETING_WINDOW_K', 4);
export const MEETING_TURN_TIMEOUT_MS = envInt('LANDSRAAD_MEETING_TURN_TIMEOUT_MS', 300_000);
export const MEETING_SUMMARY_TIMEOUT_MS = envInt('LANDSRAAD_MEETING_SUMMARY_TIMEOUT_MS', 300_000);
export const PEER_DISCOVERY_TIMEOUT_MS = envInt('LANDSRAAD_PEER_DISCOVERY_TIMEOUT_MS', 2_000);
