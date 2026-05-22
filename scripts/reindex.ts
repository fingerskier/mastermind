import { existsSync } from 'node:fs';
import { readdir, readFile, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const TARGET_REL = process.argv[2];
if (!TARGET_REL) {
  console.error('Usage: npm run reindex -- <council-root>');
  process.exit(1);
}
const TARGET = resolve(process.cwd(), TARGET_REL);
process.env.LANDSRAAD_COUNCIL_ROOT = TARGET;

const { listCouncillors } = await import('../src/lib/server/councillors');
const { listJobs } = await import('../src/lib/server/jobs');
const { listNotes } = await import('../src/lib/server/memory');
const { councilRoot, councillorDir, jobDir, memoryDir } = await import('../src/lib/server/paths');
const { closeAll, indexUpsert, setEmbedder } = await import('../src/lib/server/indexer');
const { xenovaEmbedder } = await import('../src/lib/server/embedder-xenova');
import type { ChunkKind } from '../src/lib/server/embeddings';

interface Target {
  kind: ChunkKind;
  ref_id: string;
  path: string;
  title: string | null;
  councillor_slug: string | null;
}

async function fileMtime(path: string): Promise<string> {
  return (await stat(path)).mtime.toISOString();
}

async function collectMemory(): Promise<Target[]> {
  const notes = await listNotes();
  return notes.map((n) => ({
    kind: 'memory',
    ref_id: n.slug,
    path: join(memoryDir(), `${n.slug}.md`),
    title: n.title,
    councillor_slug: null
  }));
}

async function collectPersonas(): Promise<Target[]> {
  const cs = await listCouncillors();
  const targets: Target[] = [];
  for (const c of cs) {
    const p = join(councillorDir(c.slug), 'persona.md');
    if (existsSync(p)) {
      targets.push({ kind: 'persona', ref_id: c.slug, path: p, title: c.name, councillor_slug: c.slug });
    }
  }
  return targets;
}

async function collectJobs(): Promise<Target[]> {
  const jobs = await listJobs();
  const targets: Target[] = [];
  const kinds: Array<{ kind: ChunkKind; file: string }> = [
    { kind: 'job_input', file: 'input.md' },
    { kind: 'job_output', file: 'output.md' },
    { kind: 'transcript', file: 'transcript.md' }
  ];
  for (const j of jobs) {
    for (const { kind, file } of kinds) {
      const p = join(jobDir(j.id), file);
      if (!existsSync(p)) continue;
      const sz = (await stat(p)).size;
      if (sz === 0) continue;
      targets.push({ kind, ref_id: j.id, path: p, title: j.title, councillor_slug: j.councillor_slug });
    }
  }
  return targets;
}

async function reindex(): Promise<void> {
  if (!existsSync(councilRoot())) {
    console.error(`Council root not found at ${councilRoot()}`);
    process.exit(1);
  }

  console.log(`Reindexing council at ${councilRoot()}`);
  setEmbedder(xenovaEmbedder());

  const targets = [...(await collectMemory()), ...(await collectPersonas()), ...(await collectJobs())];
  console.log(`  ${targets.length} document(s) to consider`);

  let indexed = 0;
  let skipped = 0;
  for (const t of targets) {
    const text = await readFile(t.path, 'utf8');
    if (!text.trim()) {
      skipped++;
      continue;
    }
    const mtime = await fileMtime(t.path);
    await indexUpsert({
      kind: t.kind,
      ref_id: t.ref_id,
      text,
      source_path: t.path,
      source_mtime: mtime,
      title: t.title,
      councillor_slug: t.councillor_slug
    });
    indexed++;
    if (indexed % 10 === 0) console.log(`  ${indexed}/${targets.length}`);
  }

  closeAll();
  console.log(`Done. Indexed ${indexed}, skipped ${skipped} (empty).`);
}

reindex().catch((err) => {
  console.error(err);
  process.exit(1);
});
