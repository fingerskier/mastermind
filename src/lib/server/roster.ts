import { listCouncillors } from './councillors';

export async function buildRosterSection(): Promise<string> {
  const all = await listCouncillors();
  if (all.length === 0) return '';
  const lines = all.map((c) => {
    const base = `${c.slug} — ${c.name} — ${c.role || '—'}`;
    return c.routing_hint ? `${base} — ${c.routing_hint}` : base;
  });
  return `# Council roster\n\n${lines.join('\n')}`;
}
