import { listCouncillors } from './councillors';

export async function buildRosterSection(): Promise<string> {
  const all = await listCouncillors();
  if (all.length === 0) return '';
  const lines = all.map((c) => `${c.slug} — ${c.name} — ${c.role || '—'}`);
  return `# Council roster\n\n${lines.join('\n')}`;
}
