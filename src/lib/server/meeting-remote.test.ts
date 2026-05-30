import { describe, it, expect } from 'vitest';
import { summonRemoteTurn, type MeetingContextDTO } from './meeting-remote';

const ctx: MeetingContextDTO = {
  title: 'Sync', topic: 't', summary: '', recent_turns: [], speaker_instruction: 'You are leto. Speak now.'
};
const base = {
  cwd: '/peerA', councillor_slug: 'leto', meeting_id: 'm1', host_council: 'eng', context: ctx
};

describe('summonRemoteTurn', () => {
  it('returns ok with text on a 200 {ok:true} body', async () => {
    const r = await summonRemoteTurn(base, {
      resolvePort: async () => 10192,
      fetchImpl: (async () =>
        new Response(JSON.stringify({ ok: true, text: 'hello', duration_ms: 12 }), { status: 200 })) as unknown as typeof fetch
    });
    expect(r).toEqual({ ok: true, text: 'hello', duration_ms: 12 });
  });

  it('maps a missing port to unreachable', async () => {
    const r = await summonRemoteTurn(base, { resolvePort: async () => null, fetchImpl: (async () => { throw new Error('x'); }) as unknown as typeof fetch });
    expect(r).toMatchObject({ ok: false, reason: 'unreachable' });
  });

  it('maps a connection error to unreachable', async () => {
    const r = await summonRemoteTurn(base, {
      resolvePort: async () => 10192,
      fetchImpl: (async () => { throw new Error('ECONNREFUSED'); }) as unknown as typeof fetch
    });
    expect(r).toMatchObject({ ok: false, reason: 'unreachable' });
  });

  it('maps HTTP 409 to busy', async () => {
    const r = await summonRemoteTurn(base, {
      resolvePort: async () => 10192,
      fetchImpl: (async () => new Response(JSON.stringify({ error: 'busy' }), { status: 409 })) as unknown as typeof fetch
    });
    expect(r).toMatchObject({ ok: false, reason: 'busy' });
  });

  it('maps a {ok:false} body to turn_failed', async () => {
    const r = await summonRemoteTurn(base, {
      resolvePort: async () => 10192,
      fetchImpl: (async () =>
        new Response(JSON.stringify({ ok: false, exit_code: 2, detail: 'boom' }), { status: 200 })) as unknown as typeof fetch
    });
    expect(r).toMatchObject({ ok: false, reason: 'turn_failed', detail: 'boom' });
  });
});
