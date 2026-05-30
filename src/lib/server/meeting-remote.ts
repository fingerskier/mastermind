import { resolvePeerPort } from './peers';
import { MEETING_TURN_TIMEOUT_MS } from './config';

export interface MeetingContextDTO {
  title: string;
  topic: string;
  summary: string;
  recent_turns: string[];
  speaker_instruction: string;
}

export interface RemoteTurnInput {
  cwd: string; // durable peer key; port re-resolved here
  councillor_slug: string;
  meeting_id: string;
  host_council: string;
  context: MeetingContextDTO;
  signal?: AbortSignal;
}

export type RemoteTurnResult =
  | { ok: true; text: string; duration_ms: number }
  | { ok: false; reason: 'unreachable' | 'busy' | 'turn_failed'; detail: string };

interface SummonDeps {
  resolvePort?: (cwd: string) => Promise<number | null>;
  fetchImpl?: typeof fetch;
}

export async function summonRemoteTurn(
  input: RemoteTurnInput,
  deps: SummonDeps = {}
): Promise<RemoteTurnResult> {
  const resolvePort = deps.resolvePort ?? resolvePeerPort;
  const fetchImpl = deps.fetchImpl ?? fetch;

  const port = await resolvePort(input.cwd);
  if (port === null) {
    return { ok: false, reason: 'unreachable', detail: `no live instance at ${input.cwd}` };
  }

  let res: Response;
  try {
    res = await fetchImpl(`http://127.0.0.1:${port}/api/meeting/turn`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        meeting_id: input.meeting_id,
        host_council: input.host_council,
        councillor_slug: input.councillor_slug,
        context: input.context
      }),
      signal: input.signal ?? AbortSignal.timeout(MEETING_TURN_TIMEOUT_MS)
    });
  } catch (err) {
    return { ok: false, reason: 'unreachable', detail: err instanceof Error ? err.message : String(err) };
  }

  if (res.status === 409) {
    return { ok: false, reason: 'busy', detail: `councillor ${input.councillor_slug} busy on peer` };
  }
  if (!res.ok) {
    return { ok: false, reason: 'turn_failed', detail: `peer returned HTTP ${res.status}` };
  }

  const body = (await res.json().catch(() => null)) as
    | { ok: true; text: string; duration_ms: number }
    | { ok: false; exit_code?: number; detail?: string }
    | null;

  if (!body) return { ok: false, reason: 'turn_failed', detail: 'unparseable peer response' };
  if (body.ok) return { ok: true, text: body.text, duration_ms: body.duration_ms };
  return { ok: false, reason: 'turn_failed', detail: body.detail ?? `exit ${body.exit_code ?? '?'}` };
}
