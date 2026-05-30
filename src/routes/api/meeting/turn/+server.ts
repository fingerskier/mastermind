import { json } from '@sveltejs/kit';
import { isLoopbackAddress } from '$lib/server/net';
import { readCouncillor } from '$lib/server/councillors';
import { tryAcquire, release } from '$lib/server/councillor-lock';
import { resolveAdapter } from '$lib/server/adapters';
import { runAdapter } from '$lib/server/adapters/runAdapter';
import { assembleContextFor } from '$lib/server/context';
import { composeRemoteTurnPrompt } from '$lib/server/meeting-prompt';
import { appendIncomingParticipation } from '$lib/server/participation';
import { councilRoot } from '$lib/server/paths';
import { MEETING_TURN_TIMEOUT_MS } from '$lib/server/config';
import type { MeetingContextDTO } from '$lib/server/meeting-remote';
import type { RequestHandler } from './$types';

interface TurnRequest {
  meeting_id: string;
  host_council: string;
  councillor_slug: string;
  context: MeetingContextDTO;
}

export const POST: RequestHandler = async ({ request, getClientAddress }) => {
  if (!isLoopbackAddress(getClientAddress())) {
    return json({ error: 'forbidden: non-loopback caller' }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as TurnRequest | null;
  if (!body || !body.councillor_slug || !body.meeting_id || !body.host_council || !body.context) {
    return json({ error: 'bad request' }, { status: 400 });
  }
  // Reject path-traversal / oversized identifiers before they touch the filesystem or audit log.
  const SLUG_RE = /^[a-z0-9-]{1,64}$/;       // councillor slug = slugify() output
  const ID_RE = /^[a-z0-9:._-]{1,128}$/;     // meeting id / host council slug
  if (!SLUG_RE.test(body.councillor_slug) || !ID_RE.test(body.meeting_id) || !ID_RE.test(body.host_council)) {
    return json({ error: 'bad request' }, { status: 400 });
  }

  const councillor = await readCouncillor(body.councillor_slug).catch(() => null);
  if (!councillor) {
    return json({ error: `unknown councillor "${body.councillor_slug}"` }, { status: 404 });
  }

  const holder = { kind: 'remote-meeting' as const, id: body.meeting_id, host: body.host_council };
  if (!tryAcquire(body.councillor_slug, holder)) {
    return json({ error: 'busy' }, { status: 409 });
  }

  try {
    const adapter = resolveAdapter(councillor.adapter);
    if (!adapter) {
      console.error('meeting/turn: unknown adapter', councillor.adapter);
      return json({ ok: false, exit_code: -1, detail: `unknown adapter "${councillor.adapter}"` }, { status: 200 });
    }

    const ctx = body.context;
    const memQuery = `${ctx.title}\n${ctx.topic}\n${ctx.recent_turns.at(-1) ?? ''}`;
    const memCtx = await assembleContextFor(body.councillor_slug, memQuery);
    const prompt = composeRemoteTurnPrompt({
      persona: councillor.persona,
      memCtx,
      title: ctx.title,
      topic: ctx.topic,
      summary: ctx.summary,
      recentTurns: ctx.recent_turns,
      speakerInstruction: ctx.speaker_instruction
    });

    const result = await runAdapter({
      adapter,
      prompt,
      cwd: councilRoot(),
      timeoutMs: MEETING_TURN_TIMEOUT_MS
    });

    await appendIncomingParticipation({
      ts: new Date().toISOString(),
      host_council: body.host_council,
      meeting_id: body.meeting_id,
      councillor_slug: body.councillor_slug,
      duration_ms: result.durationMs,
      exit_code: result.exit_code
    }).catch((e) => console.error('meeting/turn: participation log write failed', e));

    if (result.exit_code !== 0) {
      return json(
        { ok: false, exit_code: result.exit_code, detail: result.timedOut ? 'turn_timeout' : `exit ${result.exit_code}` },
        { status: 200 }
      );
    }
    return json({ ok: true, text: result.output, duration_ms: result.durationMs }, { status: 200 });
  } finally {
    release(body.councillor_slug, holder);
  }
};
