import { hasEmbedder, indexSearch } from './indexer';
import { listNotes } from './memory';
import { listPrivateNotes } from './memory_private';
import { MEMORY_CHAR_BUDGET, MEMORY_TOPK_PRIVATE, MEMORY_TOPK_SHARED } from './config';

interface Entry {
  title: string;
  slug: string;
  body: string;
  similarity: number;
}

function formatSection(header: string, entries: Entry[]): string {
  if (entries.length === 0) return '';
  const blocks = entries.map((e) => `### ${e.title} (${e.slug})\n\n${e.body.trim()}`);
  return [`# ${header}`, ...blocks].join('\n\n');
}

function applyBudget(shared: Entry[], priv: Entry[], budget: number): { shared: Entry[]; priv: Entry[] } {
  let s = [...shared];
  let p = [...priv];
  const size = (e: Entry) => e.title.length + e.body.length + 16;
  let total = () => s.reduce((a, e) => a + size(e), 0) + p.reduce((a, e) => a + size(e), 0);
  while (total() > budget && (s.length || p.length)) {
    const sLow = s.length ? s[s.length - 1].similarity : Infinity;
    const pLow = p.length ? p[p.length - 1].similarity : Infinity;
    if (sLow <= pLow && s.length) s.pop();
    else if (p.length) p.pop();
    else s.pop();
  }
  return { shared: s, priv: p };
}

async function fallback(councillorSlug: string): Promise<string> {
  const shared = await listNotes();
  const priv = await listPrivateNotes(councillorSlug);
  const sharedEntries: Entry[] = shared.map((n) => ({
    title: n.title,
    slug: n.slug,
    body: n.body,
    similarity: 0
  }));
  const privEntries: Entry[] = priv.map((n) => ({
    title: n.title,
    slug: n.slug,
    body: n.body,
    similarity: 0
  }));
  const parts = [
    formatSection('Shared council memory', sharedEntries),
    formatSection('Your memory', privEntries)
  ].filter(Boolean);
  return parts.join('\n\n');
}

export async function assembleContextFor(councillorSlug: string, brief: string): Promise<string> {
  if (!hasEmbedder()) return fallback(councillorSlug);

  const sharedHits = await indexSearch(brief, { kinds: ['memory'], k: MEMORY_TOPK_SHARED });
  const privateHits = await indexSearch(brief, {
    kinds: ['memory_private'],
    k: MEMORY_TOPK_PRIVATE,
    councillor_slug: councillorSlug
  });

  const sharedEntries: Entry[] = sharedHits.map((h) => ({
    title: h.title ?? h.ref_id,
    slug: h.ref_id,
    body: h.text,
    similarity: h.similarity
  }));
  const privEntries: Entry[] = privateHits.map((h) => ({
    title: h.title ?? h.ref_id,
    slug: h.ref_id.includes('/') ? h.ref_id.split('/')[1] : h.ref_id,
    body: h.text,
    similarity: h.similarity
  }));

  if (sharedEntries.length === 0 && privEntries.length === 0) {
    return fallback(councillorSlug);
  }

  const { shared, priv } = applyBudget(sharedEntries, privEntries, MEMORY_CHAR_BUDGET);
  const parts = [
    formatSection('Shared council memory', shared),
    formatSection('Your memory', priv)
  ].filter(Boolean);
  return parts.join('\n\n');
}
